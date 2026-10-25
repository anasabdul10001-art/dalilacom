import { route } from "../lib/asyncRoute";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { getSettings } from "../services/settings.service";
import { adjustBalance, creditsForShamCash, normalizeReference, SHAM_CASH, shamCashConfigured, verifyShamCashTransfer, verifyUsdtTransfer } from "../services/wallet.service";

/** Said when a transaction number was already submitted (by anyone): a number is accepted once. */
const DUPLICATE_TOPUP = "هذا الطلب موجود سابقًا — رقم العملية مستخدم من قبل";

export const walletRouter = Router();

walletRouter.get("/", requireAuth, route(async (req, res) => {
  const settings = await getSettings();
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
  const transactions = await prisma.walletTransaction.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ balance: wallet?.balance ?? 0, creditName: settings.creditName, transactions });
}));

// How the user can pay: the platform's USDT address and local wallet accounts, exactly as the super admin set them.
walletRouter.get("/methods", requireAuth, route(async (_req, res) => {
  const s = await getSettings();
  res.json({
    creditName: s.creditName,
    creditsPerUsd: s.creditsPerUsd,
    usdtTrc20Address: s.payment.usdtTrc20Address || null,
    localWallets: s.payment.localWallets.map((w) => ({ ...w, auto: w.key === SHAM_CASH && shamCashConfigured() })), // auto: the transfer is checked and credited at once
    sypPerUsd: s.payment.sypPerUsd,
  });
}));

const topUpSchema = z.object({
  method: z.string().min(2),
  reference: z.string().trim().min(4).max(128),
  amountClaimed: z.number().positive().optional(),
});

walletRouter.post("/topups", requireAuth, route(async (req, res) => {
  const parsed = topUpSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { method, reference, amountClaimed } = parsed.data;
  const userId = req.user!.id;
  const settings = await getSettings();

  try {
    if (method === "USDT_TRC20") {
      const address = settings.payment.usdtTrc20Address;
      if (!address) return sendError(res, 503, "SERVICE_UNAVAILABLE", "الشحن بـ USDT غير مفعّل حاليًا");
      if (!/^[0-9a-fA-F]{64}$/.test(reference)) {
        return sendError(res, 400, "BAD_REQUEST", "رقم العملية (txid) لازم يكون 64 خانة");
      }
      const check = await verifyUsdtTransfer(reference.toLowerCase(), address);
      if (!check.ok) {
        return check.reason === "NOT_FOUND"
          ? sendError(res, 404, "NOT_FOUND", "ما لقينا هالتحويل لعنوان المنصة — تأكد من الـ txid أو استنى شوي لحد ما يتأكد بالشبكة")
          : sendError(res, 502, "BAD_GATEWAY", "تعذّر الاتصال بالشبكة للتحقق، جرّب بعد شوي");
      }
      const credits = Math.floor(check.usdAmount * settings.creditsPerUsd);
      if (credits <= 0) return sendError(res, 400, "BAD_REQUEST", "المبلغ صغير جدًا");

      const request = await prisma.$transaction(async (tx) => {
        const created = await tx.topUpRequest.create({
          data: {
            userId,
            method,
            reference: reference.toLowerCase(),
            amountClaimed: check.usdAmount,
            amountCredits: credits,
            status: "APPROVED",
            verifiedBy: "AUTO",
          },
        });
        await adjustBalance(tx, userId, credits, "TOPUP", `usdt:${created.reference}`);
        return created;
      });
      return res.status(201).json(request);
    }

    if (!settings.payment.localWallets.some((w) => w.key === method)) {
      return sendError(res, 400, "BAD_REQUEST", "طريقة دفع غير معروفة");
    }
    if (!amountClaimed) return sendError(res, 400, "BAD_REQUEST", "دخّل المبلغ اللي دفعته");

    // A transaction number is taken once, whatever the way it was written and whichever method it came with: asking again is refused.
    const number = normalizeReference(reference);
    if (await prisma.topUpRequest.findFirst({ where: { OR: [{ reference: number }, { reference }] }, select: { id: true } })) {
      return sendError(res, 409, "CONFLICT", DUPLICATE_TOPUP);
    }

    if (method === SHAM_CASH && shamCashConfigured()) {
      const check = await verifyShamCashTransfer(number);
      if (!check.ok && check.reason === "NOT_FOUND") {
        // not taken: the transfer may simply not be visible yet, so the same number can be tried again
        return sendError(res, 404, "NOT_FOUND", "ما لقينا هالحوالة على حسابنا بشام كاش — تأكد من الرقم أو جرّب بعد دقيقة");
      }
      const credits = check.ok ? creditsForShamCash(check.amount, check.currency, settings.creditsPerUsd, settings.payment.sypPerUsd) : null;
      const amountMatches = check.ok && check.amount !== undefined && Math.abs(check.amount - amountClaimed) <= Math.max(0.01, check.amount * 0.01);
      if (check.ok && credits && credits > 0 && amountMatches) {
        const approved = await prisma.$transaction(async (tx) => {
          const created = await tx.topUpRequest.create({
            data: { userId, method, reference: number, amountClaimed: check.amount, amountCredits: credits, status: "APPROVED", verifiedBy: "AUTO" },
          });
          await adjustBalance(tx, userId, credits, "TOPUP", `shamcash:${number}`);
          return created;
        });
        return res.status(201).json(approved);
      }
      // the transfer exists but cannot be credited by itself (amount unknown or different from what was typed, unknown currency, provider down)
      const note = !check.ok ? "تعذّر التحقق الآلي من شام كاش" : "الحوالة موجودة لكن المبلغ أو العملة تحتاج مراجعة";
      const pending = await prisma.topUpRequest.create({ data: { userId, method, reference: number, amountClaimed, status: "PENDING", note } });
      return res.status(201).json(pending);
    }

    const request = await prisma.topUpRequest.create({
      data: { userId, method, reference: method === SHAM_CASH ? number : reference, amountClaimed, status: "PENDING" },
    });
    return res.status(201).json(request);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return sendError(res, 409, "CONFLICT", DUPLICATE_TOPUP);
    }
    throw err;
  }
}));

walletRouter.get("/topups", requireAuth, route(async (req, res) => {
  const list = await prisma.topUpRequest.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json(list);
}));

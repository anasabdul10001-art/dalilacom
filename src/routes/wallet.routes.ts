import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { getSettings } from "../services/settings.service";
import { adjustBalance, verifyUsdtTransfer } from "../services/wallet.service";

export const walletRouter = Router();

walletRouter.get("/", requireAuth, async (req, res) => {
  const settings = await getSettings();
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
  const transactions = await prisma.walletTransaction.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ balance: wallet?.balance ?? 0, creditName: settings.creditName, transactions });
});

// How the user can pay: the platform's USDT address and local wallet accounts, exactly as the super admin set them.
walletRouter.get("/methods", requireAuth, async (_req, res) => {
  const s = await getSettings();
  res.json({
    creditName: s.creditName,
    creditsPerUsd: s.creditsPerUsd,
    usdtTrc20Address: s.payment.usdtTrc20Address || null,
    localWallets: s.payment.localWallets,
  });
});

const topUpSchema = z.object({
  method: z.string().min(2),
  reference: z.string().trim().min(4).max(128),
  amountClaimed: z.number().positive().optional(),
});

walletRouter.post("/topups", requireAuth, async (req, res) => {
  const parsed = topUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { method, reference, amountClaimed } = parsed.data;
  const userId = req.user!.id;
  const settings = await getSettings();

  try {
    if (method === "USDT_TRC20") {
      const address = settings.payment.usdtTrc20Address;
      if (!address) return res.status(503).json({ error: "الشحن بـ USDT غير مفعّل حاليًا" });
      if (!/^[0-9a-fA-F]{64}$/.test(reference)) {
        return res.status(400).json({ error: "رقم العملية (txid) لازم يكون 64 خانة" });
      }
      const check = await verifyUsdtTransfer(reference.toLowerCase(), address);
      if (!check.ok) {
        return check.reason === "NOT_FOUND"
          ? res.status(404).json({ error: "ما لقينا هالتحويل لعنوان المنصة — تأكد من الـ txid أو استنى شوي لحد ما يتأكد بالشبكة" })
          : res.status(502).json({ error: "تعذّر الاتصال بالشبكة للتحقق، جرّب بعد شوي" });
      }
      const credits = Math.floor(check.usdAmount * settings.creditsPerUsd);
      if (credits <= 0) return res.status(400).json({ error: "المبلغ صغير جدًا" });

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
      return res.status(400).json({ error: "طريقة دفع غير معروفة" });
    }
    if (!amountClaimed) return res.status(400).json({ error: "دخّل المبلغ اللي دفعته" });
    const request = await prisma.topUpRequest.create({
      data: { userId, method, reference, amountClaimed, status: "PENDING" },
    });
    return res.status(201).json(request);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "رقم العملية هاد مستخدم من قبل" });
    }
    throw err;
  }
});

walletRouter.get("/topups", requireAuth, async (req, res) => {
  const list = await prisma.topUpRequest.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json(list);
});

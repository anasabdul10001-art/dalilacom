import { Router } from "express";
import { z } from "zod";
import { ChannelDriver, Prisma, Role, TopUpStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSettings, saveSettings } from "../services/settings.service";
import { adjustBalance, InsufficientBalanceError } from "../services/wallet.service";
import { aiProviderStatus } from "../services/ai.service";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.ADMIN));

/* ---------------- platform settings (pricing, trial, credit, payment accounts) ---------------- */

const settingsSchema = z.object({
  creditName: z.string().min(1).max(40).optional(),
  creditsPerUsd: z.number().positive().optional(),
  responder: z
    .object({
      priceCustomer: z.number().int().nonnegative(),
      priceMerchant: z.number().int().nonnegative(),
      periodDays: z.number().int().positive(),
      trialDays: z.number().int().nonnegative(),
      monthlyAiReplyLimit: z.number().int().nonnegative(),
    })
    .partial()
    .optional(),
  payment: z
    .object({
      usdtTrc20Address: z.string().trim().regex(/^(T[1-9A-HJ-NP-Za-km-z]{33})?$/, "عنوان TRON غير صالح").optional(),
      localWallets: z
        .array(
          z.object({
            key: z.string().regex(/^[A-Z0-9_]{2,30}$/),
            label: z.string().min(1),
            accountNumber: z.string().min(1),
            instructions: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

adminRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

adminRouter.put("/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const keys = parsed.data.payment?.localWallets?.map((w) => w.key) ?? [];
  if (new Set(keys).size !== keys.length || keys.includes("USDT_TRC20")) {
    return sendError(res, 400, "BAD_REQUEST", "مفاتيح المحافظ لازم تكون فريدة ومو USDT_TRC20");
  }
  res.json(await saveSettings(parsed.data as any));
});

/* ---------------- social channels (super admin can add new ones without code) ---------------- */

const channelSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,30}$/),
  name: z.string().min(1).max(60),
  driver: z.nativeEnum(ChannelDriver),
  isEnabled: z.boolean().default(true),
});

adminRouter.get("/channels", async (_req, res) => {
  res.json(await prisma.socialChannel.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { connections: true } } } }));
});

adminRouter.post("/channels", async (req, res) => {
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.status(201).json(await prisma.socialChannel.create({ data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return sendError(res, 409, "CONFLICT", "في قناة بنفس المفتاح");
    }
    throw err;
  }
});

adminRouter.patch("/channels/:id", async (req, res) => {
  const parsed = channelSchema.pick({ name: true, isEnabled: true }).partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.socialChannel.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Channel not found");
  res.json(await prisma.socialChannel.update({ where: { id: existing.id }, data: parsed.data }));
});

/* ---------------- top-up requests (local wallets are confirmed by hand) ---------------- */

adminRouter.get("/topups", async (req, res) => {
  const status = z.nativeEnum(TopUpStatus).optional().safeParse(req.query.status);
  res.json(
    await prisma.topUpRequest.findMany({
      where: status.success && status.data ? { status: status.data } : {},
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
});

adminRouter.post("/topups/:id/approve", async (req, res) => {
  const parsed = z.object({ amountCredits: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.topUpRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return { code: 404 as const };
    if (request.status !== "PENDING") return { code: 409 as const };
    // Conditional update makes a double-click / two admins approving the same request credit only once.
    const claimed = await tx.topUpRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "APPROVED", verifiedBy: "ADMIN", amountCredits: parsed.data.amountCredits },
    });
    if (claimed.count === 0) return { code: 409 as const };
    await adjustBalance(tx, request.userId, parsed.data.amountCredits, "TOPUP", `${request.method}:${request.reference}`);
    return { code: 200 as const };
  });
  if (result.code === 404) return sendError(res, 404, "NOT_FOUND", "Request not found");
  if (result.code === 409) return sendError(res, 409, "CONFLICT", "الطلب انعالج من قبل");
  res.json({ id: req.params.id, status: "APPROVED" });
});

adminRouter.post("/topups/:id/reject", async (req, res) => {
  const parsed = z.object({ note: z.string().min(1).max(300) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const claimed = await prisma.topUpRequest.updateMany({
    where: { id: req.params.id, status: "PENDING" },
    data: { status: "REJECTED", verifiedBy: "ADMIN", note: parsed.data.note },
  });
  if (claimed.count === 0) return sendError(res, 409, "CONFLICT", "الطلب غير موجود أو انعالج من قبل");
  res.json({ id: req.params.id, status: "REJECTED" });
});

/* ---------------- manual wallet adjustment & subscriptions overview ---------------- */

adminRouter.post("/wallet/adjust", async (req, res) => {
  const parsed = z
    .object({ userEmail: z.string().email(), amount: z.number().int().refine((n) => n !== 0), note: z.string().max(200).optional() })
    .safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const user = await prisma.user.findUnique({ where: { email: parsed.data.userEmail } });
  if (!user) return sendError(res, 404, "NOT_FOUND", "No user with that email");
  try {
    const balance = await prisma.$transaction((tx) => adjustBalance(tx, user.id, parsed.data.amount, "ADJUSTMENT", parsed.data.note));
    res.json({ userId: user.id, balance });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return sendError(res, 409, "CONFLICT", "الرصيد ما بيكفي للخصم");
    throw err;
  }
});

adminRouter.get("/responder/subscriptions", async (_req, res) => {
  res.json(
    await prisma.responderSubscription.findMany({
      where: { status: { not: "OFF" } },
      include: { user: { select: { email: true, fullName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
});

/* ---------------- AI provider check (booleans only — proves which provider the server would use) ---------------- */

adminRouter.get("/ai-status", (_req, res) => {
  res.json(aiProviderStatus());
});

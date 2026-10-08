import { DEFAULT_LANGUAGE } from "../lib/languages";
import { translateText } from "../i18n";
import { pushStatus, sendPushToUser } from "../services/push.service";
import { Router } from "express";
import { z } from "zod";
import { ChannelDriver, Prisma, Role, TopUpStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSettings, saveSettings } from "../services/settings.service";
import { adjustBalance, InsufficientBalanceError } from "../services/wallet.service";
import { aiProviderStatus, aiTotals, aiUsage } from "../services/ai.service";

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
  broadcasts: z
    .object({
      merchantDefaultMonthly: z.number().int().nonnegative().max(100000),
      maxRadiusKm: z.number().positive().max(20000),
      merchantMaxAudience: z.number().int().positive().max(1000000),
      pricePerAnnouncement: z.number().int().nonnegative().max(10000000),
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

/* ---------------- accounts: who is who, and switching one off ---------------- */

const usersQuerySchema = z.object({ q: z.string().trim().max(80).optional(), role: z.nativeEnum(Role).optional() });

adminRouter.get("/users", async (req, res) => {
  const parsed = usersQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { q, role } = parsed.data;
  const users = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(q
        ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : {}),
    },
    select: { id: true, email: true, fullName: true, phone: true, role: true, isDisabled: true, isEmailVerified: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(users);
});

// Switching an account off (or back on) ends its sessions. An admin can't switch off their own account, so at least one
// enabled admin always remains (whoever is making the request).
adminRouter.patch("/users/:id", async (req, res) => {
  const parsed = z.object({ isDisabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, isDisabled: true } });
  if (!target) return sendError(res, 404, "NOT_FOUND", "User not found");
  if (parsed.data.isDisabled) {
    if (target.id === req.user!.id) return sendError(res, 409, "CONFLICT", "You cannot disable your own account");
  }
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isDisabled: parsed.data.isDisabled, ...(parsed.data.isDisabled ? { tokenVersion: { increment: 1 } } : {}) },
    select: { id: true, isDisabled: true },
  });
  res.json(updated);
});

/* ---------------- a shop's plan decides how many announcements it may send ---------------- */

adminRouter.put("/merchants/:id/plan", async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid().nullable() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  if (parsed.data.planId) {
    const plan = await prisma.servicePlan.findUnique({ where: { id: parsed.data.planId }, select: { service: true, isActive: true } });
    if (!plan || plan.service !== "MERCHANT_ACCOUNT") return sendError(res, 400, "BAD_REQUEST", "Choose one of the merchant plans");
  }
  const updated = await prisma.merchantProfile.update({ where: { id: merchant.id }, data: { planId: parsed.data.planId }, select: { id: true, planId: true } });
  res.json(updated);
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
    const { balance, transactionId } = await prisma.$transaction((tx) =>
      adjustBalance(tx, user.id, parsed.data.amount, "ADJUSTMENT", parsed.data.note),
    );
    res.json({ userId: user.id, balance, transactionId });
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

/* ---------------- AI provider check (booleans + counters only — no keys, no message text) ---------------- */

/* ---------------- push notifications: is Firebase set up, and does a message reach this admin's phone? ---------------- */

adminRouter.get("/push-status", async (_req, res) => {
  res.json(await pushStatus());
});

adminRouter.post("/push-test", async (req, res) => {
  const devices = await prisma.deviceToken.count({ where: { userId: req.user!.id } });
  if (!devices) {
    return sendError(res, 409, "NO_DEVICE", "ما في جهاز مسجّل لحسابك — سجّل دخولك بتطبيق أندرويد (النسخة الجديدة) بهالحساب أول.");
  }
  const errors: string[] = [];
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { language: true } });
  const lang = me?.language ?? DEFAULT_LANGUAGE;
  const title = translateText("إشعار تجريبي من دليلكم 🔔", lang);
  const body = translateText("إذا وصلك هذا الإشعار فالإشعارات شغّالة.", lang);
  const delivered = await sendPushToUser(req.user!.id, { title, body, data: { type: "TEST" } }, errors);
  res.json({ devices, delivered, errors });
});

adminRouter.get("/ai-status", async (_req, res) => {
  res.json({
    ...aiProviderStatus(),
    usage: aiUsage(), // this process, exact
    usageTotals: await aiTotals(), // durable, survives deploys; null if the database is unreachable
  });
});

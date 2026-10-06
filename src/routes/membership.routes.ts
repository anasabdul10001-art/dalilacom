import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { Role } from "@prisma/client";
import { notifyExpiringMembership } from "../services/notification.service";
import { adjustBalance, InsufficientBalanceError } from "../services/wallet.service";
import { getSettings } from "../services/settings.service";

export const membershipRouter = Router();

// Public: list plans a customer can subscribe to
membershipRouter.get("/plans", async (_req, res) => {
  const plans = await prisma.membershipPlan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" },
  });
  res.json(plans);
});

// Admin only, used to seed/manage plans until the real admin dashboard exists
const createPlanSchema = z.object({
  name: z.string().min(2),
  durationDays: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("EUR"),
  // What the wallet is debited on subscribe. Null/omitted on a priced plan means "not priced in
  // credits yet", and subscribing is refused until the admin sets it.
  priceCredits: z.number().int().nonnegative().nullable().optional(),
});

membershipRouter.post("/plans", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }
  const plan = await prisma.membershipPlan.create({ data: parsed.data });
  res.status(201).json(plan);
});

// Admin: every plan including inactive ones, for the admin dashboard (section 24/60)
membershipRouter.get("/plans/all", requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  const plans = await prisma.membershipPlan.findMany({ orderBy: { priceCents: "asc" } });
  res.json(plans);
});

const updatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  durationDays: z.number().int().positive().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  priceCredits: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

membershipRouter.patch("/plans/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }
  const existing = await prisma.membershipPlan.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return sendError(res, 404, "NOT_FOUND", "Plan not found");
  }
  const plan = await prisma.membershipPlan.update({ where: { id: existing.id }, data: parsed.data });
  res.json(plan);
});

function generateMemberNumber(): string {
  // 10-digit numeric member number, e.g. DLK-3849201573
  const n = crypto.randomInt(1_000_000_000, 9_999_999_999);
  return `DLK-${n}`;
}

membershipRouter.post("/subscribe", requireAuth, async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan || !plan.isActive) {
    return sendError(res, 404, "NOT_FOUND", "Plan not found");
  }

  const existingActive = await prisma.membership.findFirst({
    where: { userId: req.user!.id, status: "ACTIVE" },
  });
  if (existingActive) {
    return sendError(res, 409, "CONFLICT", "User already has an active membership");
  }

  // A plan that costs money must also say what it costs in wallet credits (section 51/60). Refusing
  // is deliberate: converting `currency` to credits would invent an exchange rate nobody configured.
  // A plan priced 0 is free and activates directly, which is how sections 24/61 allow 0 pricing.
  const charge = plan.priceCents > 0 ? plan.priceCredits : 0;
  if (charge === null || charge === undefined) {
    const { creditName } = await getSettings();
    return sendError(
      res,
      409,
      "PLAN_PRICING_NOT_CONFIGURED",
      `سعر هذه الباقة غير مضبوط بعد — لازم الأدمن يحدد سعرها بوحدة ${creditName}.`,
    );
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  let membership;
  let walletBalance: number | null = null;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Charging happens inside the same transaction as the membership, so a membership can never
      // exist without the payment that bought it — and a debit can never survive a failed create.
      const paid =
        charge > 0 ? await adjustBalance(tx, req.user!.id, -charge, "MEMBERSHIP", `membership:${plan.name}`) : null;

      const created = await tx.membership.create({
        data: {
          userId: req.user!.id,
          planId: plan.id,
          memberNumber: generateMemberNumber(),
          qrSecret: crypto.randomBytes(32).toString("hex"),
          startDate,
          endDate,
          creditsPaid: charge,
          paidTransactionId: paid?.transactionId ?? null,
        },
      });
      return { created, balance: paid?.balance ?? null };
    });
    membership = result.created;
    walletBalance = result.balance;
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return sendError(
        res,
        409,
        "INSUFFICIENT_BALANCE",
        `رصيدك ${err.balance} والاشتراك بدو ${err.needed}. اشحن محفظتك أولًا.`,
        { balance: err.balance, needed: err.needed },
      );
    }
    throw err;
  }

  res.status(201).json({
    id: membership.id,
    memberNumber: membership.memberNumber,
    status: membership.status,
    startDate: membership.startDate,
    endDate: membership.endDate,
    creditsPaid: membership.creditsPaid,
    paidTransactionId: membership.paidTransactionId,
    walletBalance,
  });
});

membershipRouter.get("/me", requireAuth, async (req, res) => {
  const membership = await prisma.membership.findFirst({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  if (!membership) {
    return sendError(res, 404, "NOT_FOUND", "No membership found");
  }

  const isExpired = membership.endDate.getTime() < Date.now();

  // Checking the card is a natural moment to warn about a nearby end date (section 13). Lazily
  // produced because this deployment has no scheduler; de-duplicated to once a day in the service.
  if (!isExpired) await notifyExpiringMembership(req.user!.id).catch(() => null);

  res.json({
    memberNumber: membership.memberNumber,
    status: isExpired ? "EXPIRED" : membership.status,
    startDate: membership.startDate,
    endDate: membership.endDate,
    creditsPaid: membership.creditsPaid,
    plan: { name: membership.plan.name, durationDays: membership.plan.durationDays },
  });
});

import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { Role } from "@prisma/client";

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

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  const membership = await prisma.membership.create({
    data: {
      userId: req.user!.id,
      planId: plan.id,
      memberNumber: generateMemberNumber(),
      qrSecret: crypto.randomBytes(32).toString("hex"),
      startDate,
      endDate,
    },
  });

  res.status(201).json({
    id: membership.id,
    memberNumber: membership.memberNumber,
    status: membership.status,
    startDate: membership.startDate,
    endDate: membership.endDate,
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
  res.json({
    memberNumber: membership.memberNumber,
    status: isExpired ? "EXPIRED" : membership.status,
    startDate: membership.startDate,
    endDate: membership.endDate,
    plan: { name: membership.plan.name, durationDays: membership.plan.durationDays },
  });
});

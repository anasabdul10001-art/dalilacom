import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { hrInviteRateLimiter } from "../middleware/rateLimit";
import * as staff from "../services/businessStaff.service";

export const businessStaffRouter = Router();
businessStaffRouter.use(requireAuth);

// ---- the staff member's side (no plan needed: the owner's plan covers them)
businessStaffRouter.get("/workplaces", route(async (req, res) => res.json(await staff.workplaces(req.user!.id))));
businessStaffRouter.post("/accept", hrInviteRateLimiter, route(async (req, res) => {
  const parsed = z.object({ code: z.string().trim().min(10).max(80) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await staff.acceptInvite(req.user!.id, parsed.data.code));
}));
businessStaffRouter.get("/me/:staffId/commissions", route(async (req, res) => res.json(await staff.myCommissions(req.user!.id, req.params.staffId))));

// ---- the owner's side: needs the accounting plan (the staff work inside the accounting)
businessStaffRouter.use(route(async (req, res, next) => {
  const active = await prisma.platformSubscription.findFirst({ where: { userId: req.user!.id, status: "ACTIVE", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }], plan: { service: "ACCOUNTING" } }, select: { id: true } });
  if (!active) return sendError(res, 402, "ACCOUNTING_PLAN_REQUIRED", "موظفو النشاط بيشتغلوا داخل المحاسبة، وهي تحتاج باقة فعّالة أو فترة تجربة.");
  next();
}));

const roleEnum = z.enum(["CASHIER", "STOCK", "ASSISTANT", "MANAGER"]);
const rate = z.number().int().min(0).max(staff.MAX_RATE_BP);
const pay = z.number().int().min(0).max(2_000_000_000);

businessStaffRouter.get("/", route(async (req, res) => res.json(await staff.listStaff(req.user!.id))));
businessStaffRouter.post("/", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80), role: roleEnum, salesRateBp: rate.optional(), fixedPayCents: pay.optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await staff.createStaff(req.user!.id, parsed.data));
}));
businessStaffRouter.patch("/:id", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80).optional(), role: roleEnum.optional(), salesRateBp: rate.optional(), fixedPayCents: pay.optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await staff.updateStaff(req.user!.id, req.params.id, parsed.data);
  res.json({ ok: true });
}));
businessStaffRouter.delete("/:id", route(async (req, res) => { await staff.removeStaff(req.user!.id, req.params.id); res.json({ ok: true }); }));
businessStaffRouter.post("/:id/invite", route(async (req, res) => res.json(await staff.inviteStaff(req.user!.id, req.params.id))));

businessStaffRouter.get("/commissions/overview", route(async (req, res) => res.json(await staff.commissionOverview(req.user!.id))));
businessStaffRouter.post("/:id/commissions/pay", route(async (req, res) => {
  const parsed = z.object({ currency: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await staff.payCommissions(req.user!.id, req.params.id, parsed.data.currency, req.user!.id));
}));

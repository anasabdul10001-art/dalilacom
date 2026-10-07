import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { verifyAuthToken } from "../utils/jwt";
import { resolveLanguage } from "../lib/languages";
import { Role, ServiceKind } from "@prisma/client";
import {
  deletePlan,
  deleteTaxRate,
  getCatalog,
  listPlansForAdmin,
  listTaxRates,
  PlanInUseError,
  replaceFeatures,
  replacePrices,
  upsertTaxRate,
} from "../services/plan.service";

export const planRouter = Router();

/**
 * Prices depend on the customer's country (section 64), but the pricing page is public: a guest with
 * no token still gets the plan list, resolved from the `?country=` they pass. When a token is present
 * the account's own country wins.
 */
async function countryFor(req: { headers: Record<string, unknown>; query: Record<string, unknown> }): Promise<string | null> {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    try {
      const payload = verifyAuthToken(header.slice("Bearer ".length));
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { countryCode: true } });
      if (user?.countryCode) return user.countryCode;
    } catch {
      /* invalid token: fall through to the query parameter instead of failing a public read */
    }
  }
  const query = req.query.country;
  return typeof query === "string" && query.length === 2 ? query : null;
}

// Public: the whole pricing page in one call (sections 24/60).
planRouter.get("/catalog", async (req, res) => {
  res.json(await getCatalog(await countryFor(req as never), resolveLanguage(req)));
});

/* ---------------- admin: plans, specifications, country prices, tax rates ---------------- */

const planBody = {
  service: z.nativeEnum(ServiceKind),
  name: z.string().min(2),
  description: z.string().max(500).nullable().optional(),
  durationDays: z.number().int().positive(),
  trialDays: z.number().int().nonnegative().default(0),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("EUR"),
  priceCredits: z.number().int().nonnegative().nullable().optional(),
  monthlyBroadcastLimit: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
};

planRouter.get("/admin", requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  res.json(await listPlansForAdmin());
});

planRouter.post("/", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = z.object(planBody).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await prisma.servicePlan.create({ data: parsed.data }));
});

const updatePlanBody = z.object({
  name: z.string().min(2).optional(),
  description: z.string().max(500).nullable().optional(),
  durationDays: z.number().int().positive().optional(),
  trialDays: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  priceCredits: z.number().int().nonnegative().nullable().optional(),
  monthlyBroadcastLimit: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

planRouter.patch("/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = updatePlanBody.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.servicePlan.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة");
  res.json(await prisma.servicePlan.update({ where: { id: existing.id }, data: parsed.data }));
});

planRouter.delete("/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  try {
    await deletePlan(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    if (err instanceof PlanInUseError) {
      return sendError(res, 409, "PLAN_IN_USE", `ما بنقدر نحذف باقة عندها ${err.memberships} عضوية — عطّلها بدل الحذف`);
    }
    throw err;
  }
});

planRouter.put("/:id/features", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = z
    .object({ features: z.array(z.object({ text: z.string().min(1).max(200), included: z.boolean().default(true) })).max(40) })
    .safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.servicePlan.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة");
  res.json(await replaceFeatures(existing.id, parsed.data.features));
});

planRouter.put("/:id/prices", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = z
    .object({
      prices: z
        .array(
          z.object({
            countryId: z.string().uuid(),
            priceCredits: z.number().int().nonnegative(),
            cashAmountCents: z.number().int().nonnegative().nullable().optional(),
            currencyCode: z.string().length(3).nullable().optional(),
            isActive: z.boolean().optional(),
          }),
        )
        .max(300),
    })
    .safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.servicePlan.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة");
  const duplicates = new Set(parsed.data.prices.map((p) => p.countryId)).size !== parsed.data.prices.length;
  if (duplicates) return sendError(res, 400, "BAD_REQUEST", "كل بلد مرة وحدة بس");
  res.json(await replacePrices(existing.id, parsed.data.prices));
});

planRouter.get("/tax-rates", requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  res.json(await listTaxRates());
});

planRouter.put("/tax-rates", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = z
    .object({
      countryId: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(60),
      // Basis points so the arithmetic stays integer: 1900 = 19.00% (max 100%).
      percentBps: z.number().int().min(0).max(10000),
    })
    .safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await upsertTaxRate(parsed.data));
});

planRouter.delete("/tax-rates/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  await deleteTaxRate(req.params.id);
  res.json({ deleted: true });
});

import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendValidationError } from "../lib/apiError";
import { hrConnectRateLimiter, hrLinkCodeRateLimiter, hrSyncRateLimiter } from "../middleware/rateLimit";
import { MAX_ENTRY_CENTS, applyPayrollState, connectHrLink, createHrLinkCode, hrLinkStatus, revokeHrLink, revokeHrLinkById, verifyHrRequest } from "../services/hrLink.service";

/** The account owner's side: mounted under /accounting/hr-link, behind sign-in and the accounting plan. */
export const hrLinkRouter = Router();

hrLinkRouter.get("/", route(async (req, res) => res.json(await hrLinkStatus(req.user!.id))));

// The code is shown once, here; it cannot be read again later.
hrLinkRouter.post("/code", hrLinkCodeRateLimiter, route(async (req, res) => res.status(201).json(await createHrLinkCode(req.user!.id))));

hrLinkRouter.delete("/", route(async (req, res) => res.json({ revoked: await revokeHrLink(req.user!.id) })));

/** The HR server's side: no signed-in person here, every call proves itself with the link code or the link's signature. */
export const hrIntegrationRouter = Router();

hrIntegrationRouter.post("/connect", hrConnectRateLimiter, route(async (req, res) => {
  const parsed = z.object({ code: z.string().min(20).max(80), companyName: z.string().trim().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await connectHrLink(parsed.data.code, parsed.data.companyName));
}));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime()));
// Totals only. Unknown fields are refused, so employee names or single salaries cannot ride along even by mistake.
const payrollSchema = z.strictObject({
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  revision: z.number().int().positive().max(2_000_000_000),
  state: z.enum(["PAID", "REVERTED"]),
  periodStart: day,
  periodEnd: day,
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
  totalCents: z.number().int().nonnegative().max(MAX_ENTRY_CENTS),
  employeeCount: z.number().int().nonnegative().max(1_000_000),
});

hrIntegrationRouter.post("/payroll", hrSyncRateLimiter, route(async (req, res) => {
  const link = await verifyHrRequest(req);
  const parsed = payrollSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await applyPayrollState(link, parsed.data));
}));

hrIntegrationRouter.post("/disconnect", hrSyncRateLimiter, route(async (req, res) => {
  const link = await verifyHrRequest(req);
  await revokeHrLinkById(link.id);
  res.json({ revoked: true });
}));

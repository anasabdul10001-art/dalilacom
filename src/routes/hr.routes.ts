import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { hrInviteRateLimiter } from "../middleware/rateLimit";
import { requireHrManager } from "../services/hrAccess.service";
import * as core from "../services/hrCore.service";

export const hrRouter = Router();
hrRouter.use(requireAuth);

const currencyCode = z.string().regex(/^[A-Za-z]{3}$/);
const money = z.number().int().nonnegative().max(9_000_000_000);

// ---- what the HR tab shows this account (no plan needed: it also tells who can start a company)
hrRouter.get("/overview", route(async (req, res) => res.json(await core.overview(req.user!.id))));

// ---- "my job": any account linked to an employee record (added in the next steps), and the invitations that lead there
hrRouter.get("/me/invitations", route(async (req, res) => res.json(await core.myInvitations(req.user!.id))));
hrRouter.post("/me/invitations/:id/accept", hrInviteRateLimiter, route(async (req, res) => res.json(await core.acceptById(req.user!.id, req.params.id))));
hrRouter.post("/me/accept", hrInviteRateLimiter, route(async (req, res) => {
  const parsed = z.object({ code: z.string().trim().min(10).max(60) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await core.acceptByCode(req.user!.id, parsed.data.code));
}));

// ---- the company itself
hrRouter.post("/company", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), currency: currencyCode.optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await core.createCompany(req.user!.id, parsed.data));
}));

// ---- everything below is for the owner and the HR people, and needs the owner's active plan
const manage = Router();
hrRouter.use(route(async (req, res, next) => requireHrManager(req, res, next)), manage);

manage.get("/company", route(async (req, res) => res.json(req.hr!.company)));
manage.patch("/company", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120).optional(), timezone: z.string().trim().min(1).max(60).optional(), workingDays: z.array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).min(1).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await core.updateCompany(req.hr!, parsed.data));
}));

manage.get("/departments", route(async (req, res) => res.json(await core.listDepartments(req.hr!.company.id))));
manage.post("/departments", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), managerId: z.string().uuid().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await core.createDepartment(req.hr!.company.id, parsed.data));
}));
manage.patch("/departments/:id", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80).optional(), managerId: z.string().uuid().nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await core.updateDepartment(req.hr!.company.id, req.params.id, parsed.data));
}));
manage.delete("/departments/:id", route(async (req, res) => {
  await core.deleteDepartment(req.hr!.company.id, req.params.id);
  res.json({ deleted: true });
}));

const employeeSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(160).nullable().optional(),
  position: z.string().trim().max(80).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  role: z.enum(["HR", "MANAGER", "EMPLOYEE"]).optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  baseSalary: money.nullable().optional(),
  employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
});

manage.get("/employees", route(async (req, res) => {
  res.json(await core.listEmployees(req.hr!, { departmentId: typeof req.query.departmentId === "string" ? req.query.departmentId : undefined, status: typeof req.query.status === "string" ? req.query.status : undefined }));
}));
manage.post("/employees", route(async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await core.createEmployee(req.hr!, parsed.data));
}));
manage.get("/employees/:id", route(async (req, res) => res.json(await core.getEmployee(req.hr!, req.params.id))));
manage.patch("/employees/:id", route(async (req, res) => {
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await core.updateEmployee(req.hr!, req.params.id, parsed.data));
}));
manage.post("/employees/:id/invite", hrInviteRateLimiter, route(async (req, res) => res.status(201).json(await core.inviteEmployee(req.hr!, req.params.id))));
manage.delete("/employees/:id/invite", route(async (req, res) => {
  await core.revokeInvite(req.hr!, req.params.id);
  res.json({ revoked: true });
}));
manage.post("/employees/:id/unlink", route(async (req, res) => {
  await core.unlinkEmployee(req.hr!, req.params.id);
  res.json({ unlinked: true });
}));

import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { hrInviteRateLimiter } from "../middleware/rateLimit";
import { requireHrEmployment, requireHrManager, requireHrTeam } from "../services/hrAccess.service";
import * as core from "../services/hrCore.service";
import * as time from "../services/hrTime.service";

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

// ---- "my job": the account's own employee record (every action is for the signed-in employee, never for a person named in the request)
const me = Router();
hrRouter.use("/me", route(async (req, res, next) => requireHrEmployment(req, res, next)), me);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const leaveRequestSchema = z.object({ leaveTypeId: z.string().uuid(), startDate: isoDay, endDate: isoDay, reason: z.string().trim().max(300).optional() });
const decisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().max(300).optional() });
const periodQuery = (req: { query: Record<string, unknown> }) => ({ from: typeof req.query.from === "string" ? req.query.from : undefined, to: typeof req.query.to === "string" ? req.query.to : undefined });
const statusQuery = (req: { query: Record<string, unknown> }) => (["PENDING_MANAGER", "PENDING_HR", "APPROVED", "REJECTED", "CANCELED"].includes(String(req.query.status)) ? (req.query.status as "APPROVED") : undefined);
const yearQuery = (req: { query: Record<string, unknown> }) => (Number(req.query.year) >= 2000 && Number(req.query.year) <= 2100 ? Number(req.query.year) : new Date().getUTCFullYear());

me.get("/", route(async (req, res) => res.json({ companyId: req.hrMe!.company.id, companyName: req.hrMe!.company.name, currency: req.hrMe!.company.currency, employee: { id: req.hrMe!.employee.id, role: req.hrMe!.employee.role, position: req.hrMe!.employee.position, status: req.hrMe!.employee.employmentStatus } })));
me.post("/check-in", route(async (req, res) => res.status(201).json(await time.checkIn(req.hrMe!))));
me.post("/check-out", route(async (req, res) => res.json(await time.checkOut(req.hrMe!))));
me.get("/attendance", route(async (req, res) => res.json(await time.myAttendance(req.hrMe!, periodQuery(req)))));
me.get("/leave-balances", route(async (req, res) => res.json(await time.listBalances(req.hrMe!.company.id, req.hrMe!.employee.id, yearQuery(req)))));
me.get("/leave-requests", route(async (req, res) => res.json(await time.myLeaveRequests(req.hrMe!))));
me.post("/leave-requests", route(async (req, res) => {
  const parsed = leaveRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await time.createLeaveRequest(req.hrMe!, parsed.data));
}));
me.post("/leave-requests/:id/cancel", route(async (req, res) => res.json(await time.cancelLeaveRequest(req.hrMe!, req.params.id))));

// ---- a manager: the people under them (direct reports and the departments they manage)
const team = Router();
hrRouter.use("/team", route(async (req, res, next) => requireHrEmployment(req, res, next)), route(async (req, res, next) => requireHrTeam(req, res, next)), team);
team.get("/employees", route(async (req, res) => res.json(await prisma.hrEmployee.findMany({ where: time.teamWhere(req.hrMe!.employee), select: { id: true, firstName: true, lastName: true, position: true, employmentStatus: true }, orderBy: { firstName: "asc" } }))));
team.get("/attendance", route(async (req, res) => res.json(await time.listAttendance(req.hrMe!.company.id, time.teamWhere(req.hrMe!.employee), { employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined, ...periodQuery(req) }))));
team.get("/leave-requests", route(async (req, res) => res.json(await time.listLeaveRequests(req.hrMe!.company.id, time.teamWhere(req.hrMe!.employee), statusQuery(req)))));
team.post("/leave-requests/:id/decision", route(async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await time.decideLeaveAsManager(req.hrMe!, req.params.id, parsed.data.decision, parsed.data.reason));
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

// ---- attendance
manage.get("/attendance", route(async (req, res) => res.json(await time.listAttendance(req.hr!.company.id, { companyId: req.hr!.company.id }, { employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined, ...periodQuery(req) }))));
manage.post("/attendance", route(async (req, res) => {
  const parsed = z.object({ employeeId: z.string().uuid(), checkIn: z.string().datetime(), checkOut: z.string().datetime().optional(), notes: z.string().trim().max(300).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await time.createManualAttendance(req.hr!, parsed.data));
}));
manage.patch("/attendance/:id", route(async (req, res) => {
  const parsed = z.object({ checkIn: z.string().datetime().optional(), checkOut: z.string().datetime().nullable().optional(), notes: z.string().trim().max(300).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await time.updateAttendance(req.hr!, req.params.id, parsed.data));
}));

// ---- leave
const leaveTypeSchema = z.object({ name: z.string().trim().min(1).max(60), defaultBalance: z.number().int().min(0).max(365), isPaid: z.boolean().optional() });
manage.get("/leave-types", route(async (req, res) => res.json(await time.listLeaveTypes(req.hr!.company.id))));
manage.post("/leave-types", route(async (req, res) => {
  const parsed = leaveTypeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await time.createLeaveType(req.hr!.company.id, parsed.data));
}));
manage.patch("/leave-types/:id", route(async (req, res) => {
  const parsed = leaveTypeSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await time.updateLeaveType(req.hr!.company.id, req.params.id, parsed.data));
}));
manage.get("/leave-balances", route(async (req, res) => {
  if (typeof req.query.employeeId !== "string") return res.status(400).json({ error: { code: "BAD_REQUEST", message: "employeeId is required" } });
  const found = await prisma.hrEmployee.findFirst({ where: { id: req.query.employeeId, companyId: req.hr!.company.id }, select: { id: true } });
  if (!found) return res.status(404).json({ error: { code: "NOT_FOUND", message: "الموظف غير موجود" } });
  res.json(await time.listBalances(req.hr!.company.id, found.id, yearQuery(req)));
}));
manage.put("/leave-balances", route(async (req, res) => {
  const parsed = z.object({ employeeId: z.string().uuid(), leaveTypeId: z.string().uuid(), year: z.number().int().min(2000).max(2100), balanceDays: z.number().min(0).max(365) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await time.adjustBalance(req.hr!.company.id, parsed.data));
}));
manage.get("/leave-requests", route(async (req, res) => res.json(await time.listLeaveRequests(req.hr!.company.id, { companyId: req.hr!.company.id }, statusQuery(req)))));
manage.post("/leave-requests/:id/decision", route(async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await time.decideLeaveAsManagement(req.hr!, req.params.id, parsed.data.decision, parsed.data.reason));
}));

import { HrCompany, HrEmployee, HrRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";

/** Who is acting inside a company: its owner, an employee with the HR role, or (for "my job") any linked employee. */
export type HrActor = { userId: string; company: HrCompany; isOwner: boolean; role: "OWNER" | HrManagerRole; employee: HrEmployee | null };
export type HrMe = { userId: string; company: HrCompany; employee: HrEmployee };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      hr?: HrActor;
      hrDevice?: import("@prisma/client").HrDevice & { company: HrCompany };
      hrMe?: HrMe;
    }
  }
}

/** The employee roles that run part of the company (the owner always runs all of it). */
export const HR_MANAGER_ROLES = ["HR", "ACCOUNTANT", "SECRETARY", "ATTENDANCE_SUPERVISOR"] as const satisfies readonly HrRole[];
export type HrManagerRole = (typeof HR_MANAGER_ROLES)[number];

/**
 * What each role may do in the management screens. HR does everything the owner does (but cannot hand out the roles);
 * the accountant owns money, the secretary owns people and paperwork, the attendance supervisor owns attendance and movement.
 * Salaries are visible only with "payroll".
 */
export type HrArea = "people" | "peopleEdit" | "attendance" | "attendanceEdit" | "leave" | "leaveEdit" | "payroll" | "tracking" | "devices" | "company";
const ALL_AREAS: HrArea[] = ["people", "peopleEdit", "attendance", "attendanceEdit", "leave", "leaveEdit", "payroll", "tracking", "devices", "company"];
const ROLE_AREAS: Record<HrManagerRole, HrArea[]> = {
  HR: ALL_AREAS,
  ACCOUNTANT: ["people", "attendance", "leave", "payroll", "tracking"],
  SECRETARY: ["people", "peopleEdit", "attendance", "attendanceEdit", "leave", "leaveEdit", "devices"],
  ATTENDANCE_SUPERVISOR: ["people", "attendance", "attendanceEdit", "leave", "tracking", "devices"],
};
export const areasOf = (actor: Pick<HrActor, "role">): HrArea[] => (actor.role === "OWNER" ? ALL_AREAS : ROLE_AREAS[actor.role]);
export const can = (actor: Pick<HrActor, "role">, area: HrArea) => areasOf(actor).includes(area);

/** Which area a management request needs (anything not listed here needs the whole company: owner or HR). */
export function areaFor(method: string, path: string): HrArea {
  const read = method === "GET";
  if (path === "/company") return read ? "people" : "company";
  if (path === "/attendance-code") return "attendance";
  if (path.startsWith("/device-requests") || /^\/employees\/[^/]+\/device$/.test(path)) return "devices";
  if (path.startsWith("/locations")) return "tracking";
  if (path.startsWith("/salary-components") || path.startsWith("/unified-summary") || path.startsWith("/payroll-runs") || path.startsWith("/advances") || /^\/employees\/[^/]+\/salary/.test(path)) return "payroll";
  if (path.startsWith("/departments") || path.startsWith("/employees")) return read ? "people" : "peopleEdit";
  if (path.startsWith("/attendance") || path.startsWith("/devices")) return read ? "attendance" : "attendanceEdit";
  if (path.startsWith("/leave-")) return read ? "leave" : "leaveEdit";
  return "company";
}

/** The HR plan (like accounting's): active or in its trial. */
export async function hasHrPlan(userId: string): Promise<boolean> {
  const active = await prisma.platformSubscription.findFirst({
    where: { userId, status: "ACTIVE", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }], plan: { service: "HR" } },
    select: { id: true },
  });
  return !!active;
}

/** The company an account runs: the one it owns, else the one where it is the HR person. */
export async function managedBy(userId: string): Promise<HrActor | null> {
  const owned = await prisma.hrCompany.findUnique({ where: { ownerId: userId } });
  if (owned) return { userId, company: owned, isOwner: true, role: "OWNER", employee: null };
  const hr = await prisma.hrEmployee.findFirst({ where: { userId, role: { in: [...HR_MANAGER_ROLES] }, employmentStatus: { not: "TERMINATED" } }, include: { company: true } });
  if (!hr) return null;
  const { company, ...employee } = hr;
  return { userId, company, isOwner: false, role: hr.role as HrManagerRole, employee };
}

/**
 * For the management routes: the owner (or an HR employee) of a company whose owner has an active HR plan.
 * The plan belongs to the owner, so it covers the whole company.
 */
export async function requireHrManager(req: Request, _res: Response, next: NextFunction) {
  const actor = await managedBy(req.user!.id);
  if (!actor) return next(new ApiError(403, "FORBIDDEN", "ليست لديك صلاحية على قسم الموارد البشرية"));
  if (!(await hasHrPlan(actor.company.ownerId))) return next(new ApiError(402, "HR_PLAN_REQUIRED", "قسم الموارد البشرية يحتاج باقة فعّالة أو فترة تجربة. افتح صفحة الباقات من حسابك."));
  const area = areaFor(req.method, req.path);
  if (!can(actor, area)) return next(new ApiError(403, "FORBIDDEN", "دورك لا يسمح بهذا الإجراء"));
  req.hr = actor;
  next();
}

/** For "my job": the account's own employee record (the company is named with ?company= when the person works for more than one). */
export async function requireHrEmployment(req: Request, _res: Response, next: NextFunction) {
  const wanted = typeof req.query.company === "string" ? req.query.company : undefined;
  const rows = await prisma.hrEmployee.findMany({ where: { userId: req.user!.id, ...(wanted ? { companyId: wanted } : {}) }, include: { company: true }, orderBy: { createdAt: "asc" }, take: 1 });
  if (!rows.length) return next(new ApiError(404, "NOT_FOUND", "ليست لديك وظيفة مرتبطة بحسابك"));
  const { company, ...employee } = rows[0];
  req.hrMe = { userId: req.user!.id, company, employee };
  next();
}

/** For the manager's pages: a linked employee who leads a team (the manager or HR role, or someone with people under them), in a company whose plan is active. */
export async function requireHrTeam(req: Request, _res: Response, next: NextFunction) {
  const me = req.hrMe!;
  if (!(await hasHrPlan(me.company.ownerId))) return next(new ApiError(402, "HR_PLAN_REQUIRED", "لم يفعّل صاحب النشاط قسم الموارد البشرية حاليًا"));
  const leads = me.employee.role !== "EMPLOYEE" || (await prisma.hrEmployee.count({ where: { companyId: me.company.id, OR: [{ managerId: me.employee.id }, { department: { managerId: me.employee.id } }] } })) > 0;
  if (!leads) return next(new ApiError(403, "FORBIDDEN", "ليست لديك صلاحية على قسم الموارد البشرية"));
  next();
}

/** Employees may act (check in, ask for leave...) only while the owner's plan is active; reading their own records is always open. */
export async function assertCompanyActive(company: HrCompany) {
  if (!(await hasHrPlan(company.ownerId))) throw new ApiError(402, "HR_PLAN_REQUIRED", "لم يفعّل صاحب النشاط قسم الموارد البشرية حاليًا");
}

export async function hrAudit(companyId: string, userId: string | null, action: string, entityType: string, entityId: string, metadata?: object) {
  await prisma.hrAuditLog.create({ data: { companyId, userId, action, entityType, entityId, metadata } });
}

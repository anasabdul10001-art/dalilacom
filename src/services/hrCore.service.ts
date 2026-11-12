import crypto from "crypto";
import { HrRole, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { marketOfUser } from "./viewerCountry.service";
import { emailService } from "./email.service";
import { notificationEmailHtml } from "./emailTemplates";
import { translateText } from "../i18n";
import { notify } from "./notification.service";
import { DEFAULT_LANGUAGE } from "../lib/languages";
import { HrActor, hasHrPlan, hrAudit, managedBy } from "./hrAccess.service";

const INVITE_DAYS = 7;
const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
const notFound = (what: string) => new ApiError(404, "NOT_FOUND", what);

// ---------------------------------------------------------------- overview (what the HR tab shows this account)

/**
 * What the HR section shows an account, decided only by real records (AGENTS.md): the management tools for the owner
 * of a company (or someone who can start one, with an active plan); "my job" only for an account linked to an employee
 * record; invitations only while one is waiting. Nothing is shown empty.
 */
export async function overview(userId: string) {
  const [actor, ownPlan, jobs, user] = await Promise.all([
    managedBy(userId),
    hasHrPlan(userId),
    prisma.hrEmployee.findMany({
      where: { userId },
      select: { id: true, role: true, position: true, employmentStatus: true, company: { select: { id: true, name: true, currency: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, isEmailVerified: true } }),
  ]);
  const invitations = user?.isEmailVerified ? await invitationsFor(user.email) : [];
  return {
    manage: actor ? { companyId: actor.company.id, companyName: actor.company.name, currency: actor.company.currency, role: actor.role, planActive: await hasHrPlan(actor.company.ownerId) } : null,
    canStart: !actor && ownPlan, // an owner with a plan who has not made the company yet
    jobs: jobs.map((j) => ({ employeeId: j.id, companyId: j.company.id, companyName: j.company.name, currency: j.company.currency, role: j.role, position: j.position, status: j.employmentStatus })),
    invitations: invitations.length,
  };
}

// ---------------------------------------------------------------- company

export async function createCompany(userId: string, input: { name: string; currency?: string }) {
  if (!(await hasHrPlan(userId))) throw new ApiError(402, "HR_PLAN_REQUIRED", "قسم الموارد البشرية يحتاج باقة فعّالة أو فترة تجربة. افتح صفحة الباقات من حسابك.");
  const currency = (input.currency ?? (await marketOfUser(userId))).toUpperCase();
  try {
    const company = await prisma.hrCompany.create({ data: { ownerId: userId, name: input.name, currency } });
    await hrAudit(company.id, userId, "company.create", "HrCompany", company.id);
    return company;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "CONFLICT", "عندك شركة موارد بشرية من قبل");
    throw err;
  }
}

export async function updateCompany(actor: HrActor, input: { name?: string; timezone?: string; workingDays?: string[] }) {
  return prisma.hrCompany.update({ where: { id: actor.company.id }, data: input });
}

// ---------------------------------------------------------------- departments

export const listDepartments = (companyId: string) =>
  prisma.hrDepartment.findMany({ where: { companyId }, include: { manager: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { employees: true } } }, orderBy: { name: "asc" } });

async function assertEmployeeIn(companyId: string, id: string) {
  if (!(await prisma.hrEmployee.findFirst({ where: { id, companyId }, select: { id: true } }))) throw new ApiError(400, "BAD_REQUEST", "الموظف غير موجود بهذه الشركة");
}
async function assertDepartmentIn(companyId: string, id: string) {
  const d = await prisma.hrDepartment.findFirst({ where: { id, companyId } });
  if (!d) throw notFound("القسم غير موجود");
  return d;
}

export async function createDepartment(companyId: string, input: { name: string; managerId?: string }) {
  if (input.managerId) await assertEmployeeIn(companyId, input.managerId);
  try {
    return await prisma.hrDepartment.create({ data: { companyId, name: input.name, managerId: input.managerId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "CONFLICT", "يوجد قسم بنفس الاسم");
    throw err;
  }
}

export async function updateDepartment(companyId: string, id: string, input: { name?: string; managerId?: string | null }) {
  await assertDepartmentIn(companyId, id);
  if (input.managerId) await assertEmployeeIn(companyId, input.managerId);
  return prisma.hrDepartment.update({ where: { id }, data: input });
}

export async function deleteDepartment(companyId: string, id: string) {
  await assertDepartmentIn(companyId, id);
  if (await prisma.hrEmployee.count({ where: { departmentId: id } })) throw new ApiError(409, "CONFLICT", "ما بتقدر تحذف قسم فيه موظفين");
  await prisma.hrDepartment.delete({ where: { id } });
}

// ---------------------------------------------------------------- employees

export type EmployeeInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  position?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  role?: HrRole;
  hireDate: string;
  baseSalary?: number | null;
  employmentStatus?: "ACTIVE" | "ON_LEAVE" | "TERMINATED";
};

const employeeSelect = {
  id: true, firstName: true, lastName: true, email: true, position: true, role: true, hireDate: true, employmentStatus: true, baseSalary: true, userId: true,
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  invite: { select: { expiresAt: true, acceptedAt: true } },
} satisfies Prisma.HrEmployeeSelect;

/** Only the owner hands out the HR role: someone with it cannot make more of themselves. */
function assertMayGrant(actor: HrActor, role?: HrRole) {
  if (role === "HR" && !actor.isOwner) throw new ApiError(403, "FORBIDDEN", "صاحب النشاط وحده بيعطي صلاحية الموارد البشرية");
}

export async function listEmployees(actor: HrActor, filters: { departmentId?: string; status?: string }) {
  const rows = await prisma.hrEmployee.findMany({
    where: { companyId: actor.company.id, ...(filters.departmentId ? { departmentId: filters.departmentId } : {}), ...(filters.status ? { employmentStatus: filters.status as "ACTIVE" } : {}) },
    select: employeeSelect,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map(withInviteState);
}

export async function getEmployee(actor: HrActor, id: string) {
  const row = await prisma.hrEmployee.findFirst({ where: { id, companyId: actor.company.id }, select: employeeSelect });
  if (!row) throw notFound("الموظف غير موجود");
  return withInviteState(row);
}

function withInviteState<T extends { userId: string | null; invite: { expiresAt: Date; acceptedAt: Date | null } | null }>(row: T) {
  const { invite, ...rest } = row;
  const linked = !!row.userId;
  const pending = !linked && !!invite && !invite.acceptedAt && invite.expiresAt > new Date();
  return { ...rest, linked, inviteState: linked ? "LINKED" : pending ? "PENDING" : "NONE" };
}

export async function createEmployee(actor: HrActor, input: EmployeeInput) {
  assertMayGrant(actor, input.role);
  const companyId = actor.company.id;
  if (input.departmentId) await assertDepartmentIn(companyId, input.departmentId);
  if (input.managerId) await assertEmployeeIn(companyId, input.managerId);
  const created = await prisma.hrEmployee.create({
    data: {
      companyId, firstName: input.firstName, lastName: input.lastName, email: input.email?.toLowerCase() ?? null, position: input.position, departmentId: input.departmentId,
      managerId: input.managerId, role: input.role ?? "EMPLOYEE", hireDate: new Date(input.hireDate), baseSalary: input.baseSalary ?? null,
    },
    select: { id: true },
  });
  await hrAudit(companyId, actor.userId, "employee.create", "HrEmployee", created.id);
  return getEmployee(actor, created.id);
}

export async function updateEmployee(actor: HrActor, id: string, input: Partial<EmployeeInput>) {
  const companyId = actor.company.id;
  const existing = await prisma.hrEmployee.findFirst({ where: { id, companyId } });
  if (!existing) throw notFound("الموظف غير موجود");
  if (input.role !== undefined && input.role !== existing.role) {
    assertMayGrant(actor, input.role);
    if (existing.role === "HR" && !actor.isOwner) throw new ApiError(403, "FORBIDDEN", "صاحب النشاط وحده بيعطي صلاحية الموارد البشرية");
  }
  if (input.departmentId) await assertDepartmentIn(companyId, input.departmentId);
  if (input.managerId) {
    if (input.managerId === id) throw new ApiError(400, "BAD_REQUEST", "الموظف ما بيكون مديره لنفسه");
    await assertEmployeeIn(companyId, input.managerId);
  }
  const { hireDate, email, ...rest } = input;
  await prisma.hrEmployee.update({ where: { id }, data: { ...rest, ...(email !== undefined ? { email: email ? email.toLowerCase() : null } : {}), ...(hireDate ? { hireDate: new Date(hireDate) } : {}) } });
  if (input.employmentStatus && input.employmentStatus !== existing.employmentStatus) {
    await hrAudit(companyId, actor.userId, "employee.status_change", "HrEmployee", id, { from: existing.employmentStatus, to: input.employmentStatus });
  }
  return getEmployee(actor, id);
}

// ---------------------------------------------------------------- invitations

/** A fresh invitation code (the earlier one stops working). Sent by email too when the employee has an address. */
export async function inviteEmployee(actor: HrActor, employeeId: string) {
  const employee = await prisma.hrEmployee.findFirst({ where: { id: employeeId, companyId: actor.company.id } });
  if (!employee) throw notFound("الموظف غير موجود");
  if (employee.userId) throw new ApiError(409, "CONFLICT", "الموظف مرتبط بحساب من قبل");
  if (employee.employmentStatus === "TERMINATED") throw new ApiError(409, "CONFLICT", "الموظف منتهية خدمته");
  const code = `hri_${crypto.randomBytes(18).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await prisma.hrInvite.upsert({
    where: { employeeId },
    create: { companyId: actor.company.id, employeeId, codeHash: sha256(code), expiresAt },
    update: { codeHash: sha256(code), expiresAt, acceptedAt: null },
  });
  await hrAudit(actor.company.id, actor.userId, "employee.invite", "HrEmployee", employeeId);
  const emailed = employee.email ? await sendInvite(employee.email, actor.company.name, code) : false;
  return { code, expiresAt, emailed };
}

async function sendInvite(email: string, companyName: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, language: true } });
  const lang = user?.language ?? DEFAULT_LANGUAGE;
  const title = translateText(`دعوة للعمل مع ${companyName}`, lang);
  const body = translateText(`دعاك صاحب «${companyName}» لتنضم كموظف على دليلكم. افتح قسم «وظيفتي» بحسابك وادخل رمز الدعوة: ${code}`, lang);
  try {
    await emailService.send({ to: email, subject: title, text: `${title}\n\n${body}`, html: notificationEmailHtml(lang, title, body) });
    if (user) await notify({ userId: user.id, type: "SYSTEM", title, body: translateText("افتح قسم «وظيفتي» لقبول الدعوة", lang), data: { hr: "invite" }, email: false });
    return true;
  } catch (err) {
    console.error("Failed to send the HR invitation email:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function revokeInvite(actor: HrActor, employeeId: string) {
  await prisma.hrInvite.deleteMany({ where: { employeeId, companyId: actor.company.id, acceptedAt: null } });
}

/** Cuts the link between an employee record and the account (the record and its history stay). */
export async function unlinkEmployee(actor: HrActor, employeeId: string) {
  const res = await prisma.hrEmployee.updateMany({ where: { id: employeeId, companyId: actor.company.id, userId: { not: null } }, data: { userId: null } });
  if (!res.count) throw notFound("الموظف غير مرتبط بحساب");
  await prisma.hrInvite.deleteMany({ where: { employeeId } });
  await hrAudit(actor.company.id, actor.userId, "employee.unlink", "HrEmployee", employeeId);
}

async function invitationsFor(email: string) {
  return prisma.hrInvite.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() }, employee: { email: email.toLowerCase(), userId: null, employmentStatus: { not: "TERMINATED" } } },
    select: { id: true, expiresAt: true, company: { select: { name: true } }, employee: { select: { position: true } } },
  });
}

/** Invitations waiting for this account: only for a verified email, since the email is what proves the invitation is theirs. */
export async function myInvitations(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isEmailVerified: true } });
  if (!user?.isEmailVerified) return [];
  return (await invitationsFor(user.email)).map((i) => ({ id: i.id, companyName: i.company.name, position: i.employee.position, expiresAt: i.expiresAt }));
}

async function link(userId: string, inviteId: string) {
  const invite = await prisma.hrInvite.findUnique({ where: { id: inviteId }, include: { employee: true, company: true } });
  const bad = () => new ApiError(400, "HR_INVITE_INVALID", "الدعوة غير صحيحة أو انتهت صلاحيتها");
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date() || invite.employee.userId || invite.employee.employmentStatus === "TERMINATED") throw bad();
  if (invite.company.ownerId === userId) throw new ApiError(409, "CONFLICT", "أنت صاحب هالشركة، ما بتنضم لها كموظف");
  try {
    // claimed only while nobody took the invitation meanwhile
    const claimed = await prisma.hrInvite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) throw bad();
    await prisma.hrEmployee.update({ where: { id: invite.employeeId }, data: { userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "CONFLICT", "حسابك مرتبط بموظف بهالشركة من قبل");
    throw err;
  }
  await hrAudit(invite.companyId, userId, "employee.accept", "HrEmployee", invite.employeeId);
  return { employeeId: invite.employeeId, companyId: invite.companyId, companyName: invite.company.name };
}

export async function acceptByCode(userId: string, code: string) {
  const invite = await prisma.hrInvite.findUnique({ where: { codeHash: sha256(code) }, select: { id: true } });
  if (!invite) throw new ApiError(400, "HR_INVITE_INVALID", "الدعوة غير صحيحة أو انتهت صلاحيتها");
  return link(userId, invite.id);
}

export async function acceptById(userId: string, inviteId: string) {
  const mine = await myInvitations(userId);
  if (!mine.some((i) => i.id === inviteId)) throw new ApiError(400, "HR_INVITE_INVALID", "الدعوة غير صحيحة أو انتهت صلاحيتها");
  return link(userId, inviteId);
}

import { HrCompany, HrEmployee, HrLeaveStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";
import { HrActor, HrMe, assertCompanyActive, hrAudit } from "./hrAccess.service";

const DAY_MS = 86_400_000;
const notFound = (what: string) => new ApiError(404, "NOT_FOUND", what);
const conflict = (what: string) => new ApiError(409, "CONFLICT", what);

/** A plain date (2026-03-10) is the whole day, counted at UTC midnight. */
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const inclusiveDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function range(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (from) f.gte = day(from);
  if (to) f.lte = new Date(day(to).getTime() + DAY_MS - 1); // the whole last day
  return f;
}

/** Everyone who works under this employee: direct reports and the people of departments they manage. */
export const teamWhere = (me: HrEmployee): Prisma.HrEmployeeWhereInput => ({ companyId: me.companyId, id: { not: me.id }, OR: [{ managerId: me.id }, { department: { managerId: me.id } }] });

// ---------------------------------------------------------------- who is told

async function approvers(company: HrCompany, stage: "PENDING_MANAGER" | "PENDING_HR", employee: { id: string; managerId: string | null; department: { managerId: string | null } | null }): Promise<string[]> {
  const ids = new Set<string>([company.ownerId]);
  if (stage === "PENDING_MANAGER") {
    const managerId = employee.managerId ?? employee.department?.managerId;
    if (managerId) {
      const m = await prisma.hrEmployee.findUnique({ where: { id: managerId }, select: { userId: true } });
      if (m?.userId) ids.add(m.userId);
    }
  } else {
    (await prisma.hrEmployee.findMany({ where: { companyId: company.id, role: "HR", employmentStatus: { not: "TERMINATED" }, userId: { not: null } }, select: { userId: true } })).forEach((h) => ids.add(h.userId!));
  }
  return [...ids];
}

async function tell(userIds: (string | null)[], title: string, body: string | undefined, data: Prisma.InputJsonValue) {
  for (const userId of new Set(userIds.filter((x): x is string => !!x))) {
    await notify({ userId, type: "SYSTEM", title, body, data, email: false }).catch((err) => console.error("HR notification failed", err));
  }
}

// ---------------------------------------------------------------- attendance

export async function checkIn(me: HrMe) {
  await assertCompanyActive(me.company);
  if (me.employee.employmentStatus === "TERMINATED") throw conflict("الموظف منتهية خدمته");
  try {
    return await prisma.hrAttendance.create({ data: { companyId: me.company.id, employeeId: me.employee.id, checkIn: new Date(), source: "MOBILE" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw conflict("سجّلت حضورك من قبل، سجّل انصرافك أول");
    throw err;
  }
}

export async function checkOut(me: HrMe) {
  await assertCompanyActive(me.company);
  // closed only while it is still open at this very moment
  const open = await prisma.hrAttendance.findFirst({ where: { employeeId: me.employee.id, checkOut: null }, orderBy: { checkIn: "desc" } });
  if (!open) throw conflict("ما في تسجيل حضور مفتوح");
  const closed = await prisma.hrAttendance.updateMany({ where: { id: open.id, checkOut: null }, data: { checkOut: new Date() } });
  if (closed.count !== 1) throw conflict("ما في تسجيل حضور مفتوح");
  return prisma.hrAttendance.findUniqueOrThrow({ where: { id: open.id } });
}

export const myAttendance = (me: HrMe, f: { from?: string; to?: string }) =>
  prisma.hrAttendance.findMany({ where: { employeeId: me.employee.id, checkIn: range(f.from, f.to) }, orderBy: { checkIn: "desc" }, take: 500 });

export function listAttendance(companyId: string, employees: Prisma.HrEmployeeWhereInput, f: { employeeId?: string; from?: string; to?: string }) {
  return prisma.hrAttendance.findMany({
    where: { companyId, employee: f.employeeId ? { AND: [employees, { id: f.employeeId }] } : employees, checkIn: range(f.from, f.to) },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { checkIn: "desc" },
    take: 1000,
  });
}

export async function createManualAttendance(actor: HrActor, input: { employeeId: string; checkIn: string; checkOut?: string; notes?: string }) {
  const companyId = actor.company.id;
  if (!(await prisma.hrEmployee.findFirst({ where: { id: input.employeeId, companyId }, select: { id: true } }))) throw notFound("الموظف غير موجود");
  const checkIn = new Date(input.checkIn);
  const checkOut = input.checkOut ? new Date(input.checkOut) : null;
  if (checkOut && checkOut <= checkIn) throw new ApiError(400, "BAD_REQUEST", "وقت الانصراف لازم يكون بعد الحضور");
  try {
    const record = await prisma.hrAttendance.create({ data: { companyId, employeeId: input.employeeId, checkIn, checkOut, source: "MANUAL", editedById: actor.userId, notes: input.notes } });
    await hrAudit(companyId, actor.userId, "attendance.manual_create", "HrAttendance", record.id, { employeeId: input.employeeId });
    return record;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw conflict("للموظف تسجيل حضور مفتوح، سكّره أول");
    throw err;
  }
}

export async function updateAttendance(actor: HrActor, id: string, input: { checkIn?: string; checkOut?: string | null; notes?: string | null }) {
  const companyId = actor.company.id;
  const existing = await prisma.hrAttendance.findFirst({ where: { id, companyId } });
  if (!existing) throw notFound("تسجيل الحضور غير موجود");
  const checkIn = input.checkIn ? new Date(input.checkIn) : existing.checkIn;
  const checkOut = input.checkOut === undefined ? existing.checkOut : input.checkOut ? new Date(input.checkOut) : null;
  if (checkOut && checkOut <= checkIn) throw new ApiError(400, "BAD_REQUEST", "وقت الانصراف لازم يكون بعد الحضور");
  try {
    const record = await prisma.hrAttendance.update({ where: { id }, data: { checkIn, checkOut, ...(input.notes !== undefined ? { notes: input.notes } : {}), editedById: actor.userId } });
    await hrAudit(companyId, actor.userId, "attendance.manual_edit", "HrAttendance", id, { before: { checkIn: existing.checkIn, checkOut: existing.checkOut }, changes: input });
    return record;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw conflict("للموظف تسجيل حضور مفتوح، سكّره أول");
    throw err;
  }
}

// ---------------------------------------------------------------- leave types and balances

export const listLeaveTypes = (companyId: string) => prisma.hrLeaveType.findMany({ where: { companyId }, orderBy: { name: "asc" } });

export async function createLeaveType(companyId: string, input: { name: string; defaultBalance: number; isPaid?: boolean }) {
  try {
    return await prisma.hrLeaveType.create({ data: { companyId, name: input.name, defaultBalance: input.defaultBalance, isPaid: input.isPaid ?? true } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw conflict("يوجد نوع إجازة بنفس الاسم");
    throw err;
  }
}

export async function updateLeaveType(companyId: string, id: string, input: Partial<{ name: string; defaultBalance: number; isPaid: boolean }>) {
  if (!(await prisma.hrLeaveType.findFirst({ where: { id, companyId }, select: { id: true } }))) throw notFound("نوع الإجازة غير موجود");
  return prisma.hrLeaveType.update({ where: { id }, data: input });
}

/** The first time an employee/type/year is touched, the balance starts at the type's yearly default. */
async function balanceRow(employeeId: string, leaveTypeId: string, year: number, defaultBalance: number) {
  return prisma.hrLeaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    create: { employeeId, leaveTypeId, year, balanceDays: defaultBalance },
    update: {},
  });
}

export async function listBalances(companyId: string, employeeId: string, year: number) {
  const types = await listLeaveTypes(companyId);
  return Promise.all(types.map(async (leaveType) => ({ leaveType, balanceDays: (await balanceRow(employeeId, leaveType.id, year, leaveType.defaultBalance)).balanceDays })));
}

export async function adjustBalance(companyId: string, input: { employeeId: string; leaveTypeId: string; year: number; balanceDays: number }) {
  if (!(await prisma.hrEmployee.findFirst({ where: { id: input.employeeId, companyId }, select: { id: true } }))) throw notFound("الموظف غير موجود");
  if (!(await prisma.hrLeaveType.findFirst({ where: { id: input.leaveTypeId, companyId }, select: { id: true } }))) throw notFound("نوع الإجازة غير موجود");
  const { employeeId, leaveTypeId, year, balanceDays } = input;
  return prisma.hrLeaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } }, create: { employeeId, leaveTypeId, year, balanceDays }, update: { balanceDays } });
}

// ---------------------------------------------------------------- leave requests

const requestInclude = { leaveType: true, employee: { select: { id: true, firstName: true, lastName: true, managerId: true, userId: true, department: { select: { managerId: true } } } } } satisfies Prisma.HrLeaveRequestInclude;

export async function createLeaveRequest(me: HrMe, input: { leaveTypeId: string; startDate: string; endDate: string; reason?: string }) {
  await assertCompanyActive(me.company);
  if (me.employee.employmentStatus === "TERMINATED") throw conflict("الموظف منتهية خدمته");
  const leaveType = await prisma.hrLeaveType.findFirst({ where: { id: input.leaveTypeId, companyId: me.company.id } });
  if (!leaveType) throw notFound("نوع الإجازة غير موجود");
  const startDate = day(input.startDate);
  const endDate = day(input.endDate);
  if (endDate < startDate) throw new ApiError(400, "BAD_REQUEST", "تاريخ النهاية لازم يكون بعد البداية");
  const days = inclusiveDays(startDate, endDate);
  const balance = await balanceRow(me.employee.id, leaveType.id, startDate.getUTCFullYear(), leaveType.defaultBalance);
  if (balance.balanceDays < days) throw new ApiError(409, "INSUFFICIENT_BALANCE", "رصيد الإجازة ما بيكفي");
  const overlapping = await prisma.hrLeaveRequest.findFirst({
    where: { employeeId: me.employee.id, status: { in: ["PENDING_MANAGER", "PENDING_HR", "APPROVED"] }, startDate: { lte: endDate }, endDate: { gte: startDate } },
    select: { id: true },
  });
  if (overlapping) throw conflict("هالطلب بيتقاطع مع إجازة ثانية");
  const dept = me.employee.departmentId ? await prisma.hrDepartment.findUnique({ where: { id: me.employee.departmentId }, select: { managerId: true } }) : null;
  const stage = me.employee.managerId || dept?.managerId ? "PENDING_MANAGER" : "PENDING_HR";
  const request = await prisma.hrLeaveRequest.create({
    data: { companyId: me.company.id, employeeId: me.employee.id, leaveTypeId: leaveType.id, startDate, endDate, reason: input.reason, status: stage },
    include: requestInclude,
  });
  await tell(await approvers(me.company, stage, { id: me.employee.id, managerId: me.employee.managerId, department: dept }), `طلب إجازة جديد من ${me.employee.firstName} ${me.employee.lastName}`, `${leaveType.name}: من ${fmt(startDate)} إلى ${fmt(endDate)}`, { hr: "leave", id: request.id });
  return request;
}

export const myLeaveRequests = (me: HrMe) => prisma.hrLeaveRequest.findMany({ where: { employeeId: me.employee.id }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 200 });

export const listLeaveRequests = (companyId: string, employees: Prisma.HrEmployeeWhereInput, status?: HrLeaveStatus) =>
  prisma.hrLeaveRequest.findMany({ where: { companyId, employee: employees, ...(status ? { status } : {}) }, include: requestInclude, orderBy: { createdAt: "desc" }, take: 300 });

export async function cancelLeaveRequest(me: HrMe, id: string) {
  const res = await prisma.hrLeaveRequest.updateMany({ where: { id, employeeId: me.employee.id, status: { in: ["PENDING_MANAGER", "PENDING_HR"] } }, data: { status: "CANCELED" } });
  if (!res.count) throw conflict("بتقدر تلغي الطلب وهو لسا بانتظار الموافقة بس");
  return prisma.hrLeaveRequest.findUniqueOrThrow({ where: { id }, include: { leaveType: true } });
}

/**
 * One decision on one stage. The request is claimed only while it is still at that stage, so two people answering
 * together cannot both go through; the balance is taken in the same transaction as the final approval and only
 * while it covers the days.
 */
async function decideStage(company: HrCompany, actingUserId: string, id: string, stage: "PENDING_MANAGER" | "PENDING_HR", decision: "APPROVE" | "REJECT", reason?: string) {
  const request = await prisma.hrLeaveRequest.findFirst({ where: { id, companyId: company.id }, include: requestInclude });
  if (!request) throw notFound("طلب الإجازة غير موجود");
  if (request.status !== stage) throw conflict("هذا الطلب مو بانتظار قرارك");
  const who = request.employee.userId;
  if (decision === "REJECT") {
    const res = await prisma.hrLeaveRequest.updateMany({ where: { id, status: stage }, data: { status: "REJECTED", rejectionReason: reason ?? null } });
    if (!res.count) throw conflict("هذا الطلب مو بانتظار قرارك");
    await tell([who], "تم رفض طلب إجازتك", reason, { hr: "leave", id });
  } else if (stage === "PENDING_MANAGER") {
    const res = await prisma.hrLeaveRequest.updateMany({ where: { id, status: stage }, data: { status: "PENDING_HR", managerApprovedBy: actingUserId, managerApprovedAt: new Date() } });
    if (!res.count) throw conflict("هذا الطلب مو بانتظار قرارك");
    await tell(await approvers(company, "PENDING_HR", request.employee), `وافق المدير على طلب إجازة ${request.employee.firstName} ${request.employee.lastName}`, "بانتظار الموافقة النهائية", { hr: "leave", id });
  } else {
    const days = inclusiveDays(request.startDate, request.endDate);
    const year = request.startDate.getUTCFullYear();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.hrLeaveRequest.updateMany({ where: { id, status: "PENDING_HR" }, data: { status: "APPROVED", hrApprovedBy: actingUserId, hrApprovedAt: new Date() } });
      if (claimed.count !== 1) throw conflict("هذا الطلب مو بانتظار قرارك");
      await tx.hrLeaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
        create: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year, balanceDays: request.leaveType.defaultBalance },
        update: {},
      });
      const taken = await tx.hrLeaveBalance.updateMany({ where: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year, balanceDays: { gte: days } }, data: { balanceDays: { decrement: days } } });
      if (taken.count !== 1) throw new ApiError(409, "INSUFFICIENT_BALANCE", "رصيد الإجازة ما بيكفي");
    });
    await tell([who], "تمت الموافقة على طلب إجازتك", undefined, { hr: "leave", id });
  }
  await hrAudit(company.id, actingUserId, `leave.${decision.toLowerCase()}`, "HrLeaveRequest", id, { stage });
  return prisma.hrLeaveRequest.findUniqueOrThrow({ where: { id }, include: { leaveType: true } });
}

/** The owner answers either stage; an HR person gives the final answer. */
export function decideLeaveAsManagement(actor: HrActor, id: string, decision: "APPROVE" | "REJECT", reason?: string) {
  return prisma.hrLeaveRequest.findFirst({ where: { id, companyId: actor.company.id }, select: { status: true } }).then((r) => {
    if (!r) throw notFound("طلب الإجازة غير موجود");
    if (r.status === "PENDING_MANAGER" && !actor.isOwner) throw new ApiError(403, "FORBIDDEN", "هالطلب بانتظار مدير الموظف");
    if (r.status !== "PENDING_MANAGER" && r.status !== "PENDING_HR") throw conflict("هذا الطلب مو بانتظار قرارك");
    return decideStage(actor.company, actor.userId, id, r.status, decision, reason);
  });
}

/** A manager answers the first stage for the people of their team only. */
export async function decideLeaveAsManager(me: HrMe, id: string, decision: "APPROVE" | "REJECT", reason?: string) {
  const inTeam = await prisma.hrLeaveRequest.findFirst({ where: { id, companyId: me.company.id, employee: teamWhere(me.employee) }, select: { id: true } });
  if (!inTeam) throw notFound("طلب الإجازة غير موجود");
  return decideStage(me.company, me.userId, id, "PENDING_MANAGER", decision, reason);
}

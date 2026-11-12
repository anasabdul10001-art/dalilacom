import { HrAdvanceInstallment, HrAdvanceStatus, HrCompany, HrComponentType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";
import { HrActor, HrMe, assertCompanyActive, hrAudit } from "./hrAccess.service";
import { teamWhere } from "./hrTime.service";

const notFound = (what: string) => new ApiError(404, "NOT_FOUND", what);
const conflict = (what: string) => new ApiError(409, "CONFLICT", what);

// ---------------------------------------------------------------- salary structure

export const listComponents = (companyId: string) => prisma.hrSalaryComponent.findMany({ where: { companyId }, orderBy: { name: "asc" } });

export const createComponent = (companyId: string, input: { name: string; type: HrComponentType; calcType?: "FIXED" | "PERCENTAGE_OF_BASE" }) =>
  prisma.hrSalaryComponent.create({ data: { companyId, name: input.name, type: input.type, calcType: input.calcType ?? "FIXED" } });

async function employeeIn(companyId: string, id: string) {
  const e = await prisma.hrEmployee.findFirst({ where: { id, companyId } });
  if (!e) throw notFound("الموظف غير موجود");
  return e;
}

export async function salaryStructure(companyId: string, employeeId: string) {
  const e = await employeeIn(companyId, employeeId);
  const components = await prisma.hrEmployeeComponent.findMany({ where: { employeeId }, include: { component: true } });
  return { baseSalary: e.baseSalary, components };
}

export async function setBaseSalary(actor: HrActor, employeeId: string, baseSalary: number) {
  await employeeIn(actor.company.id, employeeId);
  await prisma.hrEmployee.update({ where: { id: employeeId }, data: { baseSalary } });
  await hrAudit(actor.company.id, actor.userId, "salary.base_change", "HrEmployee", employeeId);
}

export async function setComponent(actor: HrActor, employeeId: string, input: { componentId: string; fixedAmount?: number; percentage?: number }) {
  const companyId = actor.company.id;
  await employeeIn(companyId, employeeId);
  const component = await prisma.hrSalaryComponent.findFirst({ where: { id: input.componentId, companyId } });
  if (!component) throw notFound("بند الراتب غير موجود");
  if (component.calcType === "FIXED" && input.fixedAmount === undefined) throw new ApiError(400, "BAD_REQUEST", "أدخل مبلغ البند");
  if (component.calcType === "PERCENTAGE_OF_BASE" && input.percentage === undefined) throw new ApiError(400, "BAD_REQUEST", "أدخل نسبة البند");
  const data = { fixedAmount: component.calcType === "FIXED" ? input.fixedAmount : null, percentage: component.calcType === "PERCENTAGE_OF_BASE" ? input.percentage : null };
  await prisma.hrEmployeeComponent.upsert({ where: { employeeId_componentId: { employeeId, componentId: component.id } }, create: { employeeId, componentId: component.id, ...data }, update: data });
  await hrAudit(companyId, actor.userId, "salary.component_change", "HrEmployee", employeeId, { componentId: component.id });
}

export async function removeComponent(actor: HrActor, employeeId: string, componentId: string) {
  await employeeIn(actor.company.id, employeeId);
  await prisma.hrEmployeeComponent.deleteMany({ where: { employeeId, componentId } });
  await hrAudit(actor.company.id, actor.userId, "salary.component_remove", "HrEmployee", employeeId, { componentId });
}

// ---------------------------------------------------------------- payroll runs

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_MS = 86_400_000;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
/** periodEnd is a calendar date; a check-in carries a time of day, so the bound is the end of that day. */
const endOfDay = (d: Date) => new Date(d.getTime() + DAY_MS - 1);

function workingDays(start: Date, end: Date, configured: unknown): Date[] {
  const set = new Set((Array.isArray(configured) ? (configured as string[]) : ["mon", "tue", "wed", "thu", "fri"]).map((x) => x.toLowerCase()));
  const days: Date[] = [];
  for (let c = new Date(start); c <= end; c = new Date(c.getTime() + DAY_MS)) if (set.has(DAY_KEYS[c.getUTCDay()])) days.push(c);
  return days;
}

export async function createRun(companyId: string, input: { periodStart: string; periodEnd: string }) {
  const periodStart = day(input.periodStart);
  const periodEnd = day(input.periodEnd);
  if (periodEnd < periodStart) throw new ApiError(400, "BAD_REQUEST", "نهاية الفترة لازم تكون بعد بدايتها");
  return prisma.hrPayrollRun.create({ data: { companyId, periodStart, periodEnd } });
}

/** The runs with their totals, so HR shows its own bottom line without needing accounting (cost = what the run costs the company, advances held back included). */
export async function listRuns(companyId: string) {
  const runs = await prisma.hrPayrollRun.findMany({ where: { companyId }, orderBy: { periodStart: "desc" }, take: 200 });
  if (runs.length === 0) return [];
  const slips = await prisma.hrPayslip.findMany({ where: { runId: { in: runs.map((r) => r.id) } }, select: { runId: true, grossPay: true, totalDeductions: true, netPay: true, breakdown: true } });
  const totals = new Map<string, { employees: number; grossPay: number; totalDeductions: number; netPay: number; cost: number }>();
  for (const s of slips) {
    const t = totals.get(s.runId) ?? { employees: 0, grossPay: 0, totalDeductions: 0, netPay: 0, cost: 0 };
    t.employees += 1; t.grossPay += s.grossPay; t.totalDeductions += s.totalDeductions; t.netPay += s.netPay; t.cost += s.netPay + advancePart(s.breakdown);
    totals.set(s.runId, t);
  }
  const none = { employees: 0, grossPay: 0, totalDeductions: 0, netPay: 0, cost: 0 };
  return runs.map((r) => ({ ...r, totals: totals.get(r.id) ?? none }));
}

export async function getRun(companyId: string, id: string) {
  const run = await prisma.hrPayrollRun.findFirst({ where: { id, companyId }, include: { payslips: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } } });
  if (!run) throw notFound("دورة الرواتب غير موجودة");
  return run;
}

/**
 * Works every payslip out first (reads only), then writes them all in ONE transaction that also claims the run
 * (DRAFT -> PROCESSED): a failure half-way leaves nothing, and two requests together cannot both process the run.
 * Pay never goes below zero: an advance installment is taken only while what is left of the pay covers it.
 */
export async function processRun(actor: HrActor, id: string) {
  const company = actor.company;
  const run = await prisma.hrPayrollRun.findFirst({ where: { id, companyId: company.id } });
  if (!run) throw notFound("دورة الرواتب غير موجودة");
  if (run.status !== "DRAFT") throw conflict("بتقدر تعالج دورة مسودّة بس");
  const days = workingDays(run.periodStart, run.periodEnd, company.workingDays);

  const employees = await prisma.hrEmployee.findMany({
    where: { companyId: company.id, employmentStatus: "ACTIVE", hireDate: { lte: run.periodEnd } },
    include: { components: { include: { component: true } } },
  });

  type Draft = { employeeId: string; gross: number; deductions: number; net: number; breakdown: Prisma.InputJsonValue; installmentIds: string[]; advanceIds: string[] };
  const drafts: Draft[] = [];
  // Days without a check-in are unpaid only where the company really keeps attendance: if nobody has a single check-in
  // in the period, every salary is paid in full (otherwise a company that does not track attendance would pay nothing)
  const attendanceKept = (await prisma.hrAttendance.count({ where: { companyId: company.id, checkIn: { gte: run.periodStart, lte: endOfDay(run.periodEnd) } } })) > 0;
  for (const emp of employees) {
    const base = emp.baseSalary ?? 0;
    const present = new Set((await prisma.hrAttendance.findMany({ where: { employeeId: emp.id, checkIn: { gte: run.periodStart, lte: endOfDay(run.periodEnd) } }, select: { checkIn: true } })).map((r) => dateKey(r.checkIn)));
    const leaves = await prisma.hrLeaveRequest.findMany({ where: { employeeId: emp.id, status: "APPROVED", startDate: { lte: run.periodEnd }, endDate: { gte: run.periodStart } }, include: { leaveType: true } });
    // a working day with no check-in and no paid leave is unpaid (this also pro-rates someone who joined mid-period)
    let unpaidDays = 0;
    for (const d of attendanceKept ? days : []) {
      if (present.has(dateKey(d))) continue;
      if (leaves.some((l) => l.leaveType.isPaid && d >= l.startDate && d <= l.endDate)) continue;
      unpaidDays += 1;
    }
    const dailyRate = days.length ? base / days.length : 0;
    const unpaidDeduction = Math.round(dailyRate * unpaidDays);

    let earnings = 0;
    let componentDeductions = 0;
    const lines: Array<{ name: string; type: HrComponentType; amount: number }> = [];
    for (const ec of emp.components) {
      const amount = ec.component.calcType === "PERCENTAGE_OF_BASE" ? Math.round(((ec.percentage ?? 0) / 100) * base) : ec.fixedAmount ?? 0;
      lines.push({ name: ec.component.name, type: ec.component.type, amount });
      if (ec.component.type === "EARNING") earnings += amount;
      else componentDeductions += amount;
    }
    const gross = base + earnings;

    const due: HrAdvanceInstallment[] = await prisma.hrAdvanceInstallment.findMany({
      where: { isPaid: false, dueDate: { lte: endOfDay(run.periodEnd) }, advance: { employeeId: emp.id, status: "APPROVED" } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    let room = Math.max(0, gross - componentDeductions - unpaidDeduction);
    const taken: HrAdvanceInstallment[] = [];
    const postponed: HrAdvanceInstallment[] = [];
    for (const i of due) {
      if (i.amount <= room) { taken.push(i); room -= i.amount; } else postponed.push(i);
    }
    const advanceDeduction = taken.reduce((s, i) => s + i.amount, 0);
    const raw = componentDeductions + unpaidDeduction + advanceDeduction;
    const net = Math.max(0, gross - raw);
    drafts.push({
      employeeId: emp.id, gross, deductions: gross - net, net,
      breakdown: {
        baseSalary: base, components: lines,
        unpaidAbsence: { workingDays: days.length, unpaidDays, dailyRate: Math.round(dailyRate), deduction: unpaidDeduction },
        advanceInstallments: taken.map((i) => ({ id: i.id, advanceId: i.advanceId, amount: i.amount })),
        postponedInstallments: postponed.map((i) => ({ id: i.id, advanceId: i.advanceId, amount: i.amount })),
        shortfall: Math.max(0, raw - gross),
      },
      installmentIds: taken.map((i) => i.id),
      advanceIds: [...new Set(taken.map((i) => i.advanceId))],
    });
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.hrPayrollRun.updateMany({ where: { id: run.id, companyId: company.id, status: "DRAFT" }, data: { status: "PROCESSED", runAt: new Date() } });
    if (claimed.count !== 1) throw conflict("بتقدر تعالج دورة مسودّة بس");
    for (const d of drafts) {
      await tx.hrPayslip.create({ data: { runId: run.id, employeeId: d.employeeId, grossPay: d.gross, totalDeductions: d.deductions, netPay: d.net, breakdown: d.breakdown } });
      if (!d.installmentIds.length) continue;
      const marked = await tx.hrAdvanceInstallment.updateMany({ where: { id: { in: d.installmentIds }, isPaid: false }, data: { isPaid: true, paidInRunId: run.id } });
      if (marked.count !== d.installmentIds.length) throw conflict("قسط سلفة انحسم من دورة ثانية");
      for (const advanceId of d.advanceIds) {
        if ((await tx.hrAdvanceInstallment.count({ where: { advanceId, isPaid: false } })) === 0) await tx.hrAdvance.update({ where: { id: advanceId }, data: { status: "REPAID" } });
      }
    }
    await tx.hrAuditLog.create({ data: { companyId: company.id, userId: actor.userId, action: "payroll.run", entityType: "HrPayrollRun", entityId: run.id, metadata: { employeeCount: drafts.length, totalNetPay: drafts.reduce((s, d) => s + d.net, 0) } } });
  }, { timeout: 120000, maxWait: 30000 });

  // told only once everything is saved; a failed notification must not undo a finished run
  for (const d of drafts) {
    const emp = employees.find((e) => e.id === d.employeeId);
    if (emp?.userId) await notify({ userId: emp.userId, type: "SYSTEM", title: "كشف راتبك جاهز", data: { hr: "payslip", runId: run.id }, email: false }).catch((err) => console.error("payslip notification failed", err));
  }
  return prisma.hrPayslip.findMany({ where: { runId: run.id } });
}

// ---------------------------------------------------------------- what a run costs, and the owner's accounting

function advancePart(breakdown: unknown): number {
  const items = (breakdown as { advanceInstallments?: unknown } | null)?.advanceInstallments;
  if (!Array.isArray(items)) return 0;
  return items.reduce((s: number, i) => s + (Number.isInteger((i as { amount?: unknown })?.amount) ? (i as { amount: number }).amount : 0), 0);
}

/**
 * What the run cost the business: what the employees were paid plus the advance installments held back from them. The
 * advance itself is not a cost (the cash left the box earlier), but each held-back installment is part of the salary.
 */
export function runCost(payslips: { netPay: number; breakdown: unknown }[]) {
  return payslips.reduce((s, p) => s + p.netPay + advancePart(p.breakdown), 0);
}

export const payrollSourceKey = (runId: string) => `hr-run:${runId}`;

async function bookExpense(tx: Prisma.TransactionClient, company: HrCompany, run: { id: string; periodStart: Date; periodEnd: Date }) {
  const payslips = await tx.hrPayslip.findMany({ where: { runId: run.id }, select: { netPay: true, breakdown: true } });
  const total = runCost(payslips);
  if (total <= 0) return 0;
  const sourceKey = payrollSourceKey(run.id);
  const fields = {
    amountCents: total, currency: company.currency,
    // the month that was worked, whenever it was paid; but never later than now, so a run paid before its period ends still shows in this month's figures
    occurredAt: new Date(Math.min(new Date(`${dateKey(run.periodEnd)}T12:00:00.000Z`).getTime(), Date.now())),
    description: `رواتب الفترة من ${dateKey(run.periodStart)} إلى ${dateKey(run.periodEnd)} · عدد الموظفين ${payslips.length}`,
  };
  await tx.accountingEntry.upsert({
    where: { userId_sourceKey: { userId: company.ownerId, sourceKey } },
    create: { ...fields, userId: company.ownerId, type: "EXPENSE", category: "رواتب", source: "PAYROLL", sourceKey },
    update: fields,
  });
  return total;
}

/** Paid: the run's cost becomes one expense in the owner's accounting, in the same transaction. */
export async function markPaid(actor: HrActor, id: string) {
  const run = await prisma.hrPayrollRun.findFirst({ where: { id, companyId: actor.company.id } });
  if (!run) throw notFound("دورة الرواتب غير موجودة");
  let booked = 0;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.hrPayrollRun.updateMany({ where: { id, status: "PROCESSED" }, data: { status: "PAID", paidAt: new Date() } });
    if (claimed.count !== 1) throw conflict("بتقدر تدفع دورة معالَجة بس");
    booked = await bookExpense(tx, actor.company, run);
    await tx.hrAuditLog.create({ data: { companyId: actor.company.id, userId: actor.userId, action: "payroll.paid", entityType: "HrPayrollRun", entityId: id } });
  });
  // expenseBooked tells the app whether an expense really reached the owner's accounting (a run that costs nothing books none)
  // the expense is always kept; it shows in accounting once the owner has an accounting plan
  const accountingActive = !!(await prisma.platformSubscription.findFirst({ where: { userId: actor.company.ownerId, status: "ACTIVE", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }], plan: { service: "ACCOUNTING" } }, select: { id: true } }));
  return { ...(await prisma.hrPayrollRun.findUniqueOrThrow({ where: { id } })), expenseBooked: booked > 0, accountingActive };
}

/** Takes a payment back (PAID -> PROCESSED): the expense it made is removed, in the same transaction. */
export async function revertPaid(actor: HrActor, id: string) {
  const run = await prisma.hrPayrollRun.findFirst({ where: { id, companyId: actor.company.id } });
  if (!run) throw notFound("دورة الرواتب غير موجودة");
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.hrPayrollRun.updateMany({ where: { id, status: "PAID" }, data: { status: "PROCESSED", paidAt: null } });
    if (claimed.count !== 1) throw conflict("بتقدر ترجّع دورة مدفوعة بس");
    await tx.accountingEntry.deleteMany({ where: { userId: actor.company.ownerId, sourceKey: payrollSourceKey(id), source: "PAYROLL" } });
    await tx.hrAuditLog.create({ data: { companyId: actor.company.id, userId: actor.userId, action: "payroll.revert_paid", entityType: "HrPayrollRun", entityId: id } });
  });
  return prisma.hrPayrollRun.findUniqueOrThrow({ where: { id } });
}

/** An employee's own payslips: only theirs, only for runs that were processed. */
export const myPayslips = (me: HrMe) =>
  prisma.hrPayslip.findMany({ where: { employeeId: me.employee.id }, include: { run: { select: { periodStart: true, periodEnd: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 120 });

export async function mySalary(me: HrMe) {
  const components = await prisma.hrEmployeeComponent.findMany({ where: { employeeId: me.employee.id }, include: { component: true } });
  return { baseSalary: me.employee.baseSalary, components };
}

// ---------------------------------------------------------------- advances

const advanceInclude = { installments: { orderBy: { dueDate: "asc" as const } }, employee: { select: { id: true, firstName: true, lastName: true, managerId: true, userId: true, department: { select: { managerId: true } } } } } satisfies Prisma.HrAdvanceInclude;
const OPEN: HrAdvanceStatus[] = ["PENDING_MANAGER", "PENDING_HR", "APPROVED"];

const withBalance = <T extends { amount: number; installments: { amount: number; isPaid: boolean }[] }>(a: T) => {
  const paid = a.installments.filter((i) => i.isPaid).reduce((s, i) => s + i.amount, 0);
  return { ...a, paidAmount: paid, remainingAmount: a.amount - paid };
};

async function advanceApprovers(company: HrCompany, stage: "PENDING_MANAGER" | "PENDING_HR", employee: { managerId: string | null; department: { managerId: string | null } | null }) {
  const ids = new Set<string>([company.ownerId]);
  if (stage === "PENDING_MANAGER") {
    const mid = employee.managerId ?? employee.department?.managerId;
    const m = mid ? await prisma.hrEmployee.findUnique({ where: { id: mid }, select: { userId: true } }) : null;
    if (m?.userId) ids.add(m.userId);
  } else {
    (await prisma.hrEmployee.findMany({ where: { companyId: company.id, role: "HR", employmentStatus: { not: "TERMINATED" }, userId: { not: null } }, select: { userId: true } })).forEach((h) => ids.add(h.userId!));
  }
  return [...ids];
}

async function tell(userIds: (string | null)[], title: string, body: string | undefined, data: Prisma.InputJsonValue) {
  for (const userId of new Set(userIds.filter((x): x is string => !!x))) await notify({ userId, type: "SYSTEM", title, body, data, email: false }).catch((err) => console.error("HR notification failed", err));
}

export async function createAdvance(me: HrMe, input: { amount: number; installmentsCount: number; reason?: string }) {
  await assertCompanyActive(me.company);
  if (me.employee.employmentStatus === "TERMINATED") throw conflict("الموظف منتهية خدمته");
  if (await prisma.hrAdvance.findFirst({ where: { employeeId: me.employee.id, status: { in: OPEN } }, select: { id: true } })) throw conflict("عندك سلفة قيد الطلب أو السداد");
  const dept = me.employee.departmentId ? await prisma.hrDepartment.findUnique({ where: { id: me.employee.departmentId }, select: { managerId: true } }) : null;
  const stage = me.employee.managerId || dept?.managerId ? "PENDING_MANAGER" : "PENDING_HR";
  const advance = await prisma.hrAdvance.create({ data: { companyId: me.company.id, employeeId: me.employee.id, amount: input.amount, installmentsCount: input.installmentsCount, reason: input.reason, status: stage }, include: advanceInclude });
  await tell(await advanceApprovers(me.company, stage, { managerId: me.employee.managerId, department: dept }), `طلب سلفة جديد من ${me.employee.firstName} ${me.employee.lastName}`, `${input.amount} بـ ${input.installmentsCount} دفعة`, { hr: "advance", id: advance.id });
  return withBalance(advance);
}

export async function myAdvances(me: HrMe) {
  return (await prisma.hrAdvance.findMany({ where: { employeeId: me.employee.id }, include: { installments: { orderBy: { dueDate: "asc" } } }, orderBy: { createdAt: "desc" }, take: 100 })).map(withBalance);
}

export async function listAdvances(companyId: string, employees: Prisma.HrEmployeeWhereInput, status?: HrAdvanceStatus) {
  return (await prisma.hrAdvance.findMany({ where: { companyId, employee: employees, ...(status ? { status } : {}) }, include: advanceInclude, orderBy: { createdAt: "desc" }, take: 300 })).map(withBalance);
}

function installments(advanceId: string, total: number, count: number, from: Date) {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => ({ advanceId, amount: i === count - 1 ? base + rest : base, dueDate: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i + 1, from.getUTCDate())) }));
}

async function decideAdvanceStage(company: HrCompany, id: string, stage: "PENDING_MANAGER" | "PENDING_HR", decision: "APPROVE" | "REJECT") {
  const advance = await prisma.hrAdvance.findFirst({ where: { id, companyId: company.id }, include: advanceInclude });
  if (!advance) throw notFound("طلب السلفة غير موجود");
  if (advance.status !== stage) throw conflict("هذا الطلب مو بانتظار قرارك");
  const who = advance.employee.userId;
  if (decision === "REJECT") {
    if (!(await prisma.hrAdvance.updateMany({ where: { id, status: stage }, data: { status: "REJECTED" } })).count) throw conflict("هذا الطلب مو بانتظار قرارك");
    await tell([who], "تم رفض طلب سلفتك", undefined, { hr: "advance", id });
  } else if (stage === "PENDING_MANAGER") {
    if (!(await prisma.hrAdvance.updateMany({ where: { id, status: stage }, data: { status: "PENDING_HR" } })).count) throw conflict("هذا الطلب مو بانتظار قرارك");
    await tell(await advanceApprovers(company, "PENDING_HR", advance.employee), `وافق المدير على طلب سلفة ${advance.employee.firstName} ${advance.employee.lastName}`, "بانتظار الموافقة النهائية", { hr: "advance", id });
  } else {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.hrAdvance.updateMany({ where: { id, status: "PENDING_HR" }, data: { status: "APPROVED" } });
      if (claimed.count !== 1) throw conflict("هذا الطلب مو بانتظار قرارك");
      await tx.hrAdvanceInstallment.createMany({ data: installments(id, advance.amount, advance.installmentsCount, new Date()) });
    });
    await tell([who], "تمت الموافقة على طلب سلفتك", undefined, { hr: "advance", id });
  }
  return withBalance(await prisma.hrAdvance.findUniqueOrThrow({ where: { id }, include: { installments: { orderBy: { dueDate: "asc" } } } }));
}

/** The owner answers either stage; an HR person gives the final answer. */
export async function decideAdvanceAsManagement(actor: HrActor, id: string, decision: "APPROVE" | "REJECT") {
  const a = await prisma.hrAdvance.findFirst({ where: { id, companyId: actor.company.id }, select: { status: true } });
  if (!a) throw notFound("طلب السلفة غير موجود");
  if (a.status === "PENDING_MANAGER" && !actor.isOwner) throw new ApiError(403, "FORBIDDEN", "هالطلب بانتظار مدير الموظف");
  if (a.status !== "PENDING_MANAGER" && a.status !== "PENDING_HR") throw conflict("هذا الطلب مو بانتظار قرارك");
  const result = await decideAdvanceStage(actor.company, id, a.status, decision);
  await hrAudit(actor.company.id, actor.userId, `advance.${decision.toLowerCase()}`, "HrAdvance", id, { stage: a.status });
  return result;
}

export async function decideAdvanceAsManager(me: HrMe, id: string, decision: "APPROVE" | "REJECT") {
  if (!(await prisma.hrAdvance.findFirst({ where: { id, companyId: me.company.id, employee: teamWhere(me.employee) }, select: { id: true } }))) throw notFound("طلب السلفة غير موجود");
  const result = await decideAdvanceStage(me.company, id, "PENDING_MANAGER", decision);
  await hrAudit(me.company.id, me.userId, `advance.${decision.toLowerCase()}`, "HrAdvance", id, { stage: "PENDING_MANAGER" });
  return result;
}

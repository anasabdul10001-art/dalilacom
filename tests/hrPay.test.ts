import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { account, company, hire, linkedEmployee } from "./hrHelpers";

afterAll(async () => {
  await prisma.$disconnect();
});

type Boss = Awaited<ReturnType<typeof company>>;
/** An employee written straight to the database, present on every working day of March 2026 unless told otherwise. */
async function staff(co: Boss, data: { baseSalary?: number; hireDate?: Date; attend?: boolean; firstName?: string } = {}) {
  const e = await prisma.hrEmployee.create({ data: { companyId: co.companyId, firstName: data.firstName ?? "Test", lastName: crypto.randomUUID().slice(0, 5), hireDate: data.hireDate ?? new Date("2020-01-01T00:00:00Z"), baseSalary: data.baseSalary ?? 100000 } });
  if (data.attend !== false) {
    const rows = [];
    for (let d = new Date("2026-03-01T00:00:00Z"); d <= new Date("2026-03-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) rows.push({ companyId: co.companyId, employeeId: e.id, checkIn: new Date(d.getTime() + 8 * 3600000), checkOut: new Date(d.getTime() + 16 * 3600000) });
    await prisma.hrAttendance.createMany({ data: rows });
  }
  return e;
}
const advanceFor = (co: Boss, employeeId: string, parts: number[]) =>
  prisma.hrAdvance.create({ data: { companyId: co.companyId, employeeId, amount: parts.reduce((a, b) => a + b, 0), installmentsCount: parts.length, status: "APPROVED", installments: { create: parts.map((amount) => ({ amount, dueDate: new Date("2026-03-15T00:00:00Z") })) } }, include: { installments: true } });
const newRun = async (co: { auth: object }, from = "2026-03-01", to = "2026-03-31") => (await request(app).post("/hr/payroll-runs").set(co.auth).send({ periodStart: from, periodEnd: to })).body.id as string;
const process = (who: { auth: object }, runId: string) => request(app).post(`/hr/payroll-runs/${runId}/process`).set(who.auth);
const pay = (who: { auth: object }, runId: string) => request(app).post(`/hr/payroll-runs/${runId}/mark-paid`).set(who.auth);
const revert = (who: { auth: object }, runId: string) => request(app).post(`/hr/payroll-runs/${runId}/revert-paid`).set(who.auth);
const expenses = (ownerId: string) => prisma.accountingEntry.findMany({ where: { userId: ownerId, source: "PAYROLL" } });

describe("HR payroll runs", () => {
  it("makes one payslip per active employee, pays full pay for full attendance and takes unpaid days off", async () => {
    const co = await company("pay1");
    const full = await staff(co, { baseSalary: 300000 });
    const absent = await staff(co, { baseSalary: 200000, attend: false });
    const gone = await staff(co);
    await prisma.hrEmployee.update({ where: { id: gone.id }, data: { employmentStatus: "TERMINATED" } });
    const runId = await newRun(co);
    const res = await process(co, runId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.find((p: { employeeId: string }) => p.employeeId === full.id).netPay).toBe(300000);
    expect(res.body.find((p: { employeeId: string }) => p.employeeId === absent.id).netPay).toBe(0); // every working day unpaid
    expect((await prisma.hrPayrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("PROCESSED");
    expect((await process(co, runId)).status).toBe(409); // a processed run cannot be processed again
  });

  it("a paid leave day is not unpaid; an unpaid one is; salary components add and take", async () => {
    const co = await company("pay2");
    const e = await staff(co, { baseSalary: 310000, attend: false });
    const rows = [];
    for (let d = new Date("2026-03-01T00:00:00Z"); d <= new Date("2026-03-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && d.getUTCDate() !== 2) rows.push({ companyId: co.companyId, employeeId: e.id, checkIn: new Date(d.getTime() + 8 * 3600000), checkOut: new Date(d.getTime() + 16 * 3600000) });
    await prisma.hrAttendance.createMany({ data: rows }); // absent on Monday the 2nd only
    const type = await prisma.hrLeaveType.create({ data: { companyId: co.companyId, name: "Paid", defaultBalance: 5, isPaid: true } });
    await prisma.hrLeaveRequest.create({ data: { companyId: co.companyId, employeeId: e.id, leaveTypeId: type.id, startDate: new Date("2026-03-02T00:00:00Z"), endDate: new Date("2026-03-02T00:00:00Z"), status: "APPROVED" } });
    const bonus = (await request(app).post("/hr/salary-components").set(co.auth).send({ name: "Bonus", type: "EARNING", calcType: "PERCENTAGE_OF_BASE" })).body;
    const tax = (await request(app).post("/hr/salary-components").set(co.auth).send({ name: "Insurance", type: "DEDUCTION" })).body;
    expect((await request(app).put(`/hr/employees/${e.id}/salary/components`).set(co.auth).send({ componentId: bonus.id })).status).toBe(400); // a percentage is needed
    expect((await request(app).put(`/hr/employees/${e.id}/salary/components`).set(co.auth).send({ componentId: bonus.id, percentage: 10 })).status).toBe(200);
    expect((await request(app).put(`/hr/employees/${e.id}/salary/components`).set(co.auth).send({ componentId: tax.id, fixedAmount: 5000 })).status).toBe(200);
    const slip = (await process(co, await newRun(co))).body[0];
    expect(slip).toMatchObject({ grossPay: 341000, totalDeductions: 5000, netPay: 336000 }); // the covered day costs nothing
    expect(slip.breakdown.unpaidAbsence.unpaidDays).toBe(0);
    expect((await request(app).delete(`/hr/employees/${e.id}/salary/components/${tax.id}`).set(co.auth)).body).toEqual({ removed: true });
  });

  it("running it at the same moment never doubles the payslips or the advance deductions", async () => {
    const co = await company("pay3");
    const e = await staff(co, { baseSalary: 500000 });
    await advanceFor(co, e.id, [20000]);
    const runId = await newRun(co);
    const results = await Promise.all([process(co, runId), process(co, runId), process(co, runId)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.hrPayslip.count({ where: { runId } })).toBe(1);
    expect(await prisma.hrAdvanceInstallment.count({ where: { paidInRunId: runId } })).toBe(1);
  });

  it("deducts a due installment once and closes the advance when its last one is paid; never goes below zero", async () => {
    const co = await company("pay4");
    const a = await staff(co, { baseSalary: 500000 });
    const adv = await advanceFor(co, a.id, [20000, 20000]);
    const slip = (await process(co, await newRun(co))).body[0];
    expect(slip.totalDeductions).toBe(40000);
    expect((await prisma.hrAdvance.findUniqueOrThrow({ where: { id: adv.id } })).status).toBe("REPAID");

    const b = await staff(co, { baseSalary: 100000 });
    const big = await advanceFor(co, b.id, [30000, 150000]);
    const run2 = await newRun(co, "2026-03-01", "2026-03-31");
    const slips = (await process(co, run2)).body;
    expect(slips.find((p: { employeeId: string }) => p.employeeId === b.id).netPay).toBe(70000);
    expect((await prisma.hrAdvanceInstallment.findMany({ where: { advanceId: big.id, isPaid: false } })).map((i) => i.amount)).toEqual([150000]); // waits for a later run
    expect((await prisma.hrAdvance.findUniqueOrThrow({ where: { id: big.id } })).status).toBe("APPROVED");
  });

  it("someone hired mid-period is paid only for the days since", async () => {
    const co = await company("pay5");
    const e = await staff(co, { baseSalary: 310000, hireDate: new Date("2026-03-16T00:00:00Z"), attend: false });
    await prisma.hrAttendance.createMany({ data: ["2026-03-16", "2026-03-17", "2026-03-18"].map((d) => ({ companyId: co.companyId, employeeId: e.id, checkIn: new Date(`${d}T08:00:00Z`), checkOut: new Date(`${d}T16:00:00Z`) })) });
    const net = (await process(co, await newRun(co))).body[0].netPay;
    expect(net).toBeGreaterThan(0);
    expect(net).toBeLessThan(310000);
  });

  it("a failure half-way leaves nothing behind: still a draft, and it can be processed again", async () => {
    const co = await company("pay6");
    const a = await staff(co, { baseSalary: 200000 });
    const b = await staff(co, { baseSalary: 200000 });
    const runId = await newRun(co);
    const real = prisma.hrAdvanceInstallment.findMany.bind(prisma.hrAdvanceInstallment);
    const spy = vi.spyOn(prisma.hrAdvanceInstallment, "findMany").mockImplementation(((args: { where?: { advance?: { employeeId?: string } } }) =>
      args?.where?.advance?.employeeId === b.id ? Promise.resolve([{ id: "taken-elsewhere", advanceId: "gone", amount: 100, dueDate: new Date("2026-03-10T00:00:00Z"), isPaid: false, paidInRunId: null }]) : real(args as never)) as never);
    const failed = await process(co, runId);
    spy.mockRestore();
    expect(failed.status).toBe(409);
    expect(await prisma.hrPayslip.count({ where: { runId } })).toBe(0);
    expect((await prisma.hrPayrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("DRAFT");
    const again = await process(co, runId);
    expect(again.status).toBe(200);
    expect(again.body).toHaveLength(2);
    expect(a.id).toBeTruthy();
  });
});

describe("HR payroll -> the owner's accounting", () => {
  it("paying books one payroll expense for the owner in the company currency, in the month worked; taking it back removes it", async () => {
    const co = await company("acc1", "SYP");
    await staff(co, { baseSalary: 500000 });
    const e2 = await staff(co, { baseSalary: 300000 });
    await advanceFor(co, e2.id, [20000]); // held back from the pay, still part of the salary cost
    const runId = await newRun(co);
    expect((await pay(co, runId)).status).toBe(409); // not processed yet
    await process(co, runId);
    expect(await expenses(co.id)).toHaveLength(0); // processed is not paid
    const paid = await pay(co, runId);
    expect(paid.body.status).toBe("PAID");
    const [entry] = await expenses(co.id);
    expect(entry).toMatchObject({ type: "EXPENSE", category: "رواتب", currency: "SYP", source: "PAYROLL", sourceKey: `hr-run:${runId}` });
    expect(Number(entry.amountCents)).toBe(800000);
    expect(entry.occurredAt.toISOString()).toBe("2026-03-31T12:00:00.000Z");
    expect(entry.description).toContain("عدد الموظفين 2");
    expect((await pay(co, runId)).status).toBe(409); // once
    expect(await expenses(co.id)).toHaveLength(1);

    expect((await revert(co, runId)).body.status).toBe("PROCESSED");
    expect(await expenses(co.id)).toHaveLength(0);
    expect((await revert(co, runId)).status).toBe(409);
    await pay(co, runId);
    expect(await expenses(co.id)).toHaveLength(1); // paid again: booked again, once
  });

  it("shows in the owner's accounting summary as the payroll cost, and cannot be edited or deleted there", async () => {
    const co = await company("acc2", "USD");
    const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
    await prisma.platformSubscription.create({ data: { userId: co.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
    await request(app).post("/accounting/entries").set(co.auth).send({ type: "INCOME", category: "Sales", description: "March sales", amountCents: 2_000_000, currency: "USD", occurredAt: "2026-03-10T10:00:00.000Z" });
    await staff(co, { baseSalary: 500000 });
    const runId = await newRun(co);
    await process(co, runId);
    await pay(co, runId);
    const summary = (await request(app).get("/accounting/summary").query({ from: "2026-03-01", to: "2026-03-31" }).set(co.auth)).body;
    expect(summary.totals).toEqual([{ currency: "USD", incomeCents: 2_000_000, expensesCents: 500000, netCents: 1_500_000, payrollCents: 500000 }]);
    const [entry] = await expenses(co.id);
    expect((await request(app).patch(`/accounting/entries/${entry.id}`).set(co.auth).send({ amountCents: 1 })).status).toBe(409);
    expect((await request(app).delete(`/accounting/entries/${entry.id}`).set(co.auth)).status).toBe(409);
    await revert(co, runId);
    expect((await request(app).get("/accounting/summary").query({ from: "2026-03-01", to: "2026-03-31" }).set(co.auth)).body.totals[0].payrollCents).toBeUndefined();
  });

  it("a company's total can be wider than 32 bits while each salary fits one", async () => {
    const co = await company("acc3", "SYP");
    for (let i = 0; i < 3; i++) await staff(co, { baseSalary: 1_500_000_000 });
    const runId = await newRun(co);
    await process(co, runId);
    await pay(co, runId);
    expect(Number((await expenses(co.id))[0].amountCents)).toBe(4_500_000_000);
    expect((await hire(co, { baseSalary: 3_000_000_000 })).status).toBe(400); // more than one salary column holds
  });

  it("only the owner takes a payment back; an HR person can run and pay", async () => {
    const co = await company("acc4");
    const hrPerson = await linkedEmployee(co, "acc4h", { role: "HR" });
    await staff(co, { baseSalary: 100000 });
    const runId = await newRun(hrPerson);
    expect((await process(hrPerson, runId)).status).toBe(200);
    expect((await pay(hrPerson, runId)).status).toBe(200);
    expect((await revert(hrPerson, runId)).status).toBe(403);
    expect((await revert(co, runId)).status).toBe(200);
  });

  it("keeps companies apart", async () => {
    const mine = await company("acc5");
    const other = await company("acc5o");
    await staff(mine);
    const runId = await newRun(mine);
    expect((await request(app).get(`/hr/payroll-runs/${runId}`).set(other.auth)).status).toBe(404);
    expect((await process(other, runId)).status).toBe(404);
    expect((await pay(other, runId)).status).toBe(404);
    expect((await revert(other, runId)).status).toBe(404);
    expect((await prisma.hrPayrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("DRAFT");
    expect((await request(app).get("/hr/payroll-runs").set(other.auth)).body).toHaveLength(0);
  });
});

describe("HR advances and payslips for the employee", () => {
  it("the employee asks, the chain approves, the installments add up and come off the next pay", async () => {
    const co = await company("adv1");
    const mgr = await linkedEmployee(co, "adv1m", { role: "MANAGER" });
    const hrPerson = await linkedEmployee(co, "adv1h", { role: "HR" });
    const w = await linkedEmployee(co, "adv1w", { managerId: mgr.employeeId, baseSalary: 500000 });
    // the first installment falls due next month, so the run covers next month (and a few days after it, for a day like the 31st)
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 5));
    const rows = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) rows.push({ companyId: co.companyId, employeeId: w.employeeId, checkIn: new Date(d.getTime() + 8 * 3600000), checkOut: new Date(d.getTime() + 16 * 3600000) });
    await prisma.hrAttendance.createMany({ data: rows });

    const asked = await request(app).post("/hr/me/advances").set(w.auth).send({ amount: 100000, installmentsCount: 3, reason: "rent" });
    expect(asked.status).toBe(201);
    expect(asked.body.status).toBe("PENDING_MANAGER");
    expect((await request(app).post("/hr/me/advances").set(w.auth).send({ amount: 5000, installmentsCount: 1 })).status).toBe(409); // one at a time
    expect((await request(app).post("/hr/me/advances").set(mgr.auth).send({ amount: -5, installmentsCount: 1 })).status).toBe(400);
    expect((await request(app).post("/hr/advances/" + asked.body.id + "/decision").set(hrPerson.auth).send({ decision: "APPROVE" })).status).toBe(403); // the manager's stage
    expect((await request(app).get("/hr/team/advances").set(mgr.auth)).body).toHaveLength(1);
    expect((await request(app).post(`/hr/team/advances/${asked.body.id}/decision`).set(mgr.auth).send({ decision: "APPROVE" })).body.status).toBe("PENDING_HR");
    const final = await Promise.all([request(app).post(`/hr/advances/${asked.body.id}/decision`).set(hrPerson.auth).send({ decision: "APPROVE" }), request(app).post(`/hr/advances/${asked.body.id}/decision`).set(co.auth).send({ decision: "APPROVE" })]);
    expect(final.map((r) => r.status).sort()).toEqual([200, 409]);
    const mine = (await request(app).get("/hr/me/advances").set(w.auth)).body[0];
    expect(mine.status).toBe("APPROVED");
    expect(mine.installments).toHaveLength(3);
    expect(mine.installments.reduce((s: number, i: { amount: number }) => s + i.amount, 0)).toBe(100000);
    expect(mine).toMatchObject({ paidAmount: 0, remainingAmount: 100000 });

    // the installments fall in the following months: a run for the period after covers the first
    const run = await newRun(co, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
    const slips = (await process(co, run)).body;
    const slip = slips.find((p: { employeeId: string }) => p.employeeId === w.employeeId);
    expect(slip.breakdown.advanceInstallments.length).toBeGreaterThan(0);
    expect(slip.netPay).toBeLessThan(500000); // the installment came off the pay
    expect(await prisma.notification.count({ where: { userId: w.id, title: "كشف راتبك جاهز" } })).toBe(1);
  });

  it("a rejected advance stays rejected; an employee sees only their own advances and payslips", async () => {
    const co = await company("adv2");
    const a = await linkedEmployee(co, "adv2a", { baseSalary: 200000 });
    const b = await linkedEmployee(co, "adv2b", { baseSalary: 200000 });
    const asked = (await request(app).post("/hr/me/advances").set(a.auth).send({ amount: 5000, installmentsCount: 1 })).body;
    expect((await request(app).post(`/hr/advances/${asked.id}/decision`).set(co.auth).send({ decision: "REJECT" })).body.status).toBe("REJECTED");
    expect((await request(app).post(`/hr/advances/${asked.id}/decision`).set(co.auth).send({ decision: "APPROVE" })).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: a.id, title: "تم رفض طلب سلفتك" } })).toBe(1);
    expect((await request(app).get("/hr/me/advances").set(b.auth)).body).toEqual([]);

    await process(co, await newRun(co));
    const mineA = (await request(app).get("/hr/me/payslips").set(a.auth)).body;
    expect(mineA).toHaveLength(1);
    expect(mineA[0].employeeId).toBe(a.employeeId);
    expect((await request(app).get("/hr/me/payslips").set(b.auth)).body.every((p: { employeeId: string }) => p.employeeId === b.employeeId)).toBe(true);
    expect((await request(app).get("/hr/me/salary").set(a.auth)).body.baseSalary).toBe(200000);
    // the owner's salary pages are not for an employee, and not for another company
    expect((await request(app).get(`/hr/employees/${b.employeeId}/salary`).set(a.auth)).status).toBe(403);
    const stranger = await company("adv2x");
    expect((await request(app).get(`/hr/employees/${a.employeeId}/salary`).set(stranger.auth)).status).toBe(404);
    expect((await account("adv2n")).id).toBeTruthy();
  });
});

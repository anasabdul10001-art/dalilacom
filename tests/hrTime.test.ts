import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { account, company, hire, linkedEmployee, owner } from "./hrHelpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const leaveType = async (o: { auth: object }, extra: Record<string, unknown> = {}) =>
  (await request(app).post("/hr/leave-types").set(o.auth).send({ name: `Annual ${Math.random().toString(36).slice(2, 6)}`, defaultBalance: 10, ...extra })).body as { id: string };
const ask = (w: { auth: object }, typeId: string, startDate: string, endDate: string, reason?: string) =>
  request(app).post("/hr/me/leave-requests").set(w.auth).send({ leaveTypeId: typeId, startDate, endDate, reason });
const decide = (who: { auth: object }, base: "/hr" | "/hr/team", id: string, decision: "APPROVE" | "REJECT", reason?: string) =>
  request(app).post(`${base}/leave-requests/${id}/decision`).set(who.auth).send({ decision, reason });
const inbox = async (userId: string) => (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map((n) => n.title);

describe("HR attendance", () => {
  it("an employee checks in and out for themselves only; one open check-in at a time, even together", async () => {
    const o = await company("hratt");
    const w = await linkedEmployee(o, "hrattw");
    const [a, b] = await Promise.all([request(app).post("/hr/me/check-in").set(w.auth), request(app).post("/hr/me/check-in").set(w.auth)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.hrAttendance.count({ where: { employeeId: w.employeeId, checkOut: null } })).toBe(1);
    expect((await request(app).post("/hr/me/check-out").set(w.auth)).body.checkOut).toBeTruthy();
    expect((await request(app).post("/hr/me/check-out").set(w.auth)).status).toBe(409); // nothing open
    expect((await request(app).post("/hr/me/check-in").set(w.auth)).status).toBe(201); // and a new day can start
    expect((await request(app).get("/hr/me/attendance").set(w.auth)).body).toHaveLength(2);
    // an account that is nobody's employee has no "my job"
    const nobody = await account("hrattn");
    expect((await request(app).post("/hr/me/check-in").set(nobody.auth)).status).toBe(404);
  });

  it("stops when the owner's plan ends, but the employee can still read their own records", async () => {
    const o = await company("hratt2");
    const w = await linkedEmployee(o, "hratt2w");
    await request(app).post("/hr/me/check-in").set(w.auth);
    await prisma.platformSubscription.updateMany({ where: { userId: o.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/hr/me/check-out").set(w.auth);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("HR_PLAN_REQUIRED");
    expect((await request(app).get("/hr/me/attendance").set(w.auth)).body).toHaveLength(1);
  });

  it("the owner adds and corrects records by hand, with a trail; wrong times are refused", async () => {
    const o = await company("hrattm");
    const emp = (await hire(o)).body;
    const made = await request(app).post("/hr/attendance").set(o.auth).send({ employeeId: emp.id, checkIn: "2026-03-02T08:00:00.000Z", checkOut: "2026-03-02T16:00:00.000Z", notes: "forgot" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ source: "MANUAL", editedById: o.id });
    expect((await request(app).post("/hr/attendance").set(o.auth).send({ employeeId: emp.id, checkIn: "2026-03-03T08:00:00.000Z", checkOut: "2026-03-03T07:00:00.000Z" })).status).toBe(400);
    const edited = await request(app).patch(`/hr/attendance/${made.body.id}`).set(o.auth).send({ checkOut: "2026-03-02T17:00:00.000Z" });
    expect(edited.body.checkOut).toBe("2026-03-02T17:00:00.000Z");
    expect(await prisma.hrAttendance.count({ where: { id: made.body.id } })).toBe(1);
    expect(await prisma.hrAuditLog.count({ where: { companyId: o.companyId, action: { startsWith: "attendance.manual" } } })).toBe(2);
    const list = (await request(app).get("/hr/attendance").query({ from: "2026-03-02", to: "2026-03-02" }).set(o.auth)).body;
    expect(list).toHaveLength(1); // a plain date includes the whole last day
    expect((await request(app).get("/hr/attendance").query({ from: "2026-04-01" }).set(o.auth)).body).toHaveLength(0);
  });
});

describe("HR leave", () => {
  it("goes employee -> manager -> HR, and the balance drops only at the final approval", async () => {
    const o = await company("hrlv");
    const type = await leaveType(o);
    const mgr = await linkedEmployee(o, "hrlvm", { role: "MANAGER", firstName: "Boss" });
    const worker = await linkedEmployee(o, "hrlvw", { managerId: mgr.employeeId });
    const hrPerson = await linkedEmployee(o, "hrlvh", { role: "HR" });

    const req = await ask(worker, type.id, "2026-03-02", "2026-03-04", "family");
    expect(req.status).toBe(201);
    expect(req.body.status).toBe("PENDING_MANAGER");
    expect(await inbox(mgr.id)).toContain(`طلب إجازة جديد من Salma Ali`); // the manager is told
    expect((await request(app).get("/hr/me/leave-balances").query({ year: 2026 }).set(worker.auth)).body[0].balanceDays).toBe(10);

    // the manager sees the team's requests; someone else does not
    expect((await request(app).get("/hr/team/leave-requests").set(mgr.auth)).body).toHaveLength(1);
    expect((await request(app).get("/hr/team/leave-requests").set(worker.auth)).status).toBe(403);
    expect((await decide(hrPerson, "/hr", req.body.id, "APPROVE")).status).toBe(403); // not the HR person's stage
    const first = await decide(mgr, "/hr/team", req.body.id, "APPROVE");
    expect(first.body.status).toBe("PENDING_HR");
    expect((await request(app).get("/hr/me/leave-balances").query({ year: 2026 }).set(worker.auth)).body[0].balanceDays).toBe(10);
    expect(await inbox(hrPerson.id)).toContain("وافق المدير على طلب إجازة Salma Ali");
    expect((await decide(mgr, "/hr/team", req.body.id, "APPROVE")).status).toBe(409); // no longer at the manager's stage

    const final = await decide(hrPerson, "/hr", req.body.id, "APPROVE");
    expect(final.body.status).toBe("APPROVED");
    expect((await request(app).get("/hr/me/leave-balances").query({ year: 2026 }).set(worker.auth)).body[0].balanceDays).toBe(7);
    expect(await inbox(worker.id)).toContain("تمت الموافقة على طلب إجازتك");
    expect((await decide(hrPerson, "/hr", req.body.id, "APPROVE")).status).toBe(409); // answered once
  });

  it("an employee without a manager goes straight to HR, and a rejection keeps the balance and gives the reason", async () => {
    const o = await company("hrlv2");
    const type = await leaveType(o);
    const worker = await linkedEmployee(o, "hrlv2w");
    const req = await ask(worker, type.id, "2026-05-10", "2026-05-11");
    expect(req.body.status).toBe("PENDING_HR");
    const owner_ = await decide(o, "/hr", req.body.id, "REJECT", "busy week");
    expect(owner_.body).toMatchObject({ status: "REJECTED", rejectionReason: "busy week" });
    expect((await request(app).get("/hr/me/leave-balances").query({ year: 2026 }).set(worker.auth)).body[0].balanceDays).toBe(10);
    expect(await inbox(worker.id)).toContain("تم رفض طلب إجازتك");
  });

  it("refuses too many days, an overlap, a backwards range, and lets the employee cancel only while pending", async () => {
    const o = await company("hrlv3");
    const type = await leaveType(o, { defaultBalance: 3 });
    const w = await linkedEmployee(o, "hrlv3w");
    expect((await ask(w, type.id, "2026-06-01", "2026-06-10")).body.error.code).toBe("INSUFFICIENT_BALANCE");
    expect((await ask(w, type.id, "2026-06-05", "2026-06-01")).status).toBe(400);
    const ok = await ask(w, type.id, "2026-06-01", "2026-06-02");
    expect(ok.status).toBe(201);
    expect((await ask(w, type.id, "2026-06-02", "2026-06-03")).status).toBe(409); // overlaps
    expect((await request(app).post(`/hr/me/leave-requests/${ok.body.id}/cancel`).set(w.auth)).body.status).toBe("CANCELED");
    expect((await request(app).post(`/hr/me/leave-requests/${ok.body.id}/cancel`).set(w.auth)).status).toBe(409);
    expect((await ask(w, type.id, "2026-06-02", "2026-06-03")).status).toBe(201); // the cancelled one no longer blocks
  });

  it("two pending requests cannot together take more days than the balance, and a double answer counts once", async () => {
    const o = await company("hrlv4");
    const type = await leaveType(o, { defaultBalance: 3 });
    const w = await linkedEmployee(o, "hrlv4w");
    const r1 = (await ask(w, type.id, "2026-07-01", "2026-07-03")).body;
    const r2 = (await ask(w, type.id, "2026-08-01", "2026-08-03")).body; // each fits the balance when asked
    const both = await Promise.all([decide(o, "/hr", r1.id, "APPROVE"), decide(o, "/hr", r1.id, "APPROVE")]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await request(app).get("/hr/me/leave-balances").query({ year: 2026 }).set(w.auth)).body[0].balanceDays).toBe(0);
    const over = await decide(o, "/hr", r2.id, "APPROVE"); // July 2026 took all 3 days of 2026
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("INSUFFICIENT_BALANCE");
    expect((await prisma.hrLeaveRequest.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("PENDING_HR"); // not approved without the days
  });

  it("the owner sets types and balances; a department manager also answers for their department; companies stay apart", async () => {
    const o = await company("hrlv5");
    const type = await leaveType(o);
    const dep = (await request(app).post("/hr/departments").set(o.auth).send({ name: "Sales" })).body;
    const lead = await linkedEmployee(o, "hrlv5l", { role: "MANAGER" });
    await request(app).patch(`/hr/departments/${dep.id}`).set(o.auth).send({ managerId: lead.employeeId });
    const w = await linkedEmployee(o, "hrlv5w", { departmentId: dep.id });
    expect((await request(app).put("/hr/leave-balances").set(o.auth).send({ employeeId: w.employeeId, leaveTypeId: type.id, year: 2026, balanceDays: 21 })).body.balanceDays).toBe(21);
    expect((await request(app).get("/hr/leave-balances").query({ employeeId: w.employeeId, year: 2026 }).set(o.auth)).body[0].balanceDays).toBe(21);
    const req = (await ask(w, type.id, "2026-09-01", "2026-09-01")).body;
    expect(req.status).toBe("PENDING_MANAGER"); // its department has a manager
    expect((await decide(lead, "/hr/team", req.id, "APPROVE")).body.status).toBe("PENDING_HR");

    const other = await company("hrlv5x");
    const otherType = await leaveType(other);
    expect((await request(app).get(`/hr/leave-balances`).query({ employeeId: w.employeeId }).set(other.auth)).status).toBe(404);
    expect((await decide(other, "/hr", req.id, "APPROVE")).status).toBe(404);
    expect((await ask(w, otherType.id, "2026-09-10", "2026-09-10")).status).toBe(404); // another company's leave type
    expect((await request(app).post("/hr/leave-types").set(o.auth).send({ name: "x", defaultBalance: -1 })).status).toBe(400);
  });
});

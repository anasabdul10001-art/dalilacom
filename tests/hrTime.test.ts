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

describe("HR attendance with the shop code", () => {
  it("when the owner turns it on, check-in/out needs the live code; a wrong or old code is refused; the secret never leaves", async () => {
    const o = await company("hrcode");
    const w = await linkedEmployee(o, "hrcodew");
    // off by default: works as before
    expect((await request(app).get("/hr/me").set(w.auth)).body.attendanceCodeRequired).toBe(false);
    expect((await request(app).post("/hr/me/check-in").set(w.auth)).status).toBe(201);
    expect((await request(app).post("/hr/me/check-out").set(w.auth)).status).toBe(200);
    // the employee cannot turn it on or read the code
    expect((await request(app).patch("/hr/company").set(w.auth).send({ attendanceCodeRequired: true })).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).get("/hr/attendance-code").set(w.auth)).status).toBeGreaterThanOrEqual(403);
    const on = await request(app).patch("/hr/company").set(o.auth).send({ attendanceCodeRequired: true });
    expect(on.body.attendanceCodeRequired).toBe(true);
    expect(on.body.attendanceSecret).toBeUndefined();
    expect((await request(app).get("/hr/company").set(o.auth)).body.attendanceSecret).toBeUndefined();
    expect((await request(app).get("/hr/me").set(w.auth)).body.attendanceCodeRequired).toBe(true);
    // without / with a wrong code: refused
    const none = await request(app).post("/hr/me/check-in").set(w.auth);
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe("ATTENDANCE_CODE_REQUIRED");
    expect((await request(app).post("/hr/me/check-in").set(w.auth).send({ code: "000000" })).status).toBe(403);
    // the owner's screen shows the live code; using it works (the scan text "dlc-att:123456" too)
    const live = (await request(app).get("/hr/attendance-code").set(o.auth)).body as { code: string; stepSeconds: number };
    expect(live.code).toMatch(/^\d{6}$/);
    expect(live.stepSeconds).toBe(30);
    expect((await request(app).post("/hr/me/check-in").set(w.auth).send({ code: `dlc-att:${live.code}` })).status).toBe(201);
    expect((await request(app).post("/hr/me/check-out").set(w.auth)).status).toBe(403); // out needs it too
    const live2 = (await request(app).get("/hr/attendance-code").set(o.auth)).body as { code: string };
    expect((await request(app).post("/hr/me/check-out").set(w.auth).send({ code: live2.code })).status).toBe(200);
  });
});

describe("HR one registered phone per employee", () => {
  const phone = (id: string, name = "Phone " + id) => ({ "X-Device-Id": id, "X-Device-Name": name });
  it("the first phone becomes theirs; another phone needs an approval; reset clears it", async () => {
    const o = await company("hrlock");
    const w = await linkedEmployee(o, "hrlockw");
    // lock off: nothing is asked
    expect((await request(app).post("/hr/me/check-in").set(w.auth)).status).toBe(201);
    expect((await request(app).post("/hr/me/check-out").set(w.auth)).status).toBe(200);
    expect((await request(app).patch("/hr/company").set(w.auth).send({ deviceLockRequired: true })).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).patch("/hr/company").set(o.auth).send({ deviceLockRequired: true })).body.deviceLockRequired).toBe(true);
    // a phone id is required, and the first phone is registered
    const noId = await request(app).post("/hr/me/check-in").set(w.auth);
    expect(noId.status).toBe(403);
    expect(noId.body.error.code).toBe("DEVICE_ID_REQUIRED");
    expect((await request(app).post("/hr/me/check-in").set(w.auth).set(phone("A"))).status).toBe(201);
    expect((await prisma.hrEmployee.findUniqueOrThrow({ where: { id: w.employeeId } })).boundDeviceId).toBe("A");
    expect((await request(app).post("/hr/me/check-out").set(w.auth).set(phone("A"))).status).toBe(200);
    // another phone: refused, one request waits (even if tried twice), the owner is told
    const other = await request(app).post("/hr/me/check-in").set(w.auth).set(phone("B"));
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("DEVICE_NOT_APPROVED");
    await request(app).post("/hr/me/check-in").set(w.auth).set(phone("B"));
    const pending = (await request(app).get("/hr/device-requests").query({ status: "PENDING" }).set(o.auth)).body as { id: string; deviceId: string }[];
    expect(pending).toHaveLength(1);
    expect(pending[0].deviceId).toBe("B");
    expect((await prisma.notification.findMany({ where: { userId: o.id } })).some((n) => n.title.includes("جهاز"))).toBe(true);
    // the employee cannot decide; the owner approves; B works, A no longer does
    expect((await request(app).post(`/hr/device-requests/${pending[0].id}/decision`).set(w.auth).send({ decision: "APPROVE" })).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).post(`/hr/device-requests/${pending[0].id}/decision`).set(o.auth).send({ decision: "APPROVE" })).body.status).toBe("APPROVED");
    expect((await request(app).post(`/hr/device-requests/${pending[0].id}/decision`).set(o.auth).send({ decision: "APPROVE" })).status).toBe(409);
    expect((await request(app).post("/hr/me/check-in").set(w.auth).set(phone("B"))).status).toBe(201);
    expect((await request(app).post("/hr/me/check-out").set(w.auth).set(phone("A"))).status).toBe(403);
    // a rejected request stays refused; reset lets the next phone register
    const c = await request(app).post("/hr/me/check-out").set(w.auth).set(phone("C"));
    expect(c.status).toBe(403);
    const cReq = (await request(app).get("/hr/device-requests").query({ status: "PENDING" }).set(o.auth)).body[0] as { id: string };
    expect((await request(app).post(`/hr/device-requests/${cReq.id}/decision`).set(o.auth).send({ decision: "REJECT" })).body.status).toBe("REJECTED");
    expect((await request(app).post("/hr/me/check-out").set(w.auth).set(phone("C"))).status).toBe(403);
    expect((await request(app).delete(`/hr/employees/${w.employeeId}/device`).set(o.auth)).body.reset).toBe(true);
    expect((await request(app).post("/hr/me/check-out").set(w.auth).set(phone("C"))).status).toBe(200);
    expect((await prisma.hrEmployee.findUniqueOrThrow({ where: { id: w.employeeId } })).boundDeviceId).toBe("C");
  });
});

describe("HR tracking of drivers and distributors", () => {
  const pt = (lat: number, lng: number, minsAgo: number) => ({ latitude: lat, longitude: lng, accuracy: 10, speed: 5, at: new Date(Date.now() - minsAgo * 60_000).toISOString() });
  it("only a tracked employee, only while checked in; the owner sees where they are and their path", async () => {
    const o = await company("hrtrk");
    const w = await linkedEmployee(o, "hrtrkw");
    const plain = await linkedEmployee(o, "hrtrkp");
    // not tracked: refused
    expect((await request(app).post("/hr/me/locations").set(w.auth).send({ points: [pt(33.5, 36.3, 1)] })).body.error.code).toBe("TRACKING_OFF");
    // only the owner/HR turns it on
    expect((await request(app).patch(`/hr/employees/${w.employeeId}`).set(w.auth).send({ tracksLocation: true })).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).patch(`/hr/employees/${w.employeeId}`).set(o.auth).send({ tracksLocation: true })).body.tracksLocation).toBe(true);
    expect((await request(app).get("/hr/me").set(w.auth)).body.employee.tracksLocation).toBe(true);
    // not checked in: refused
    const off = await request(app).post("/hr/me/locations").set(w.auth).send({ points: [pt(33.5, 36.3, 1)] });
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe("NOT_CHECKED_IN");
    await request(app).post("/hr/me/check-in").set(w.auth);
    // bad points and old/future points are not saved
    expect((await request(app).post("/hr/me/locations").set(w.auth).send({ points: [{ latitude: 95, longitude: 0, at: new Date().toISOString() }] })).status).toBe(400);
    const mixed = await request(app).post("/hr/me/locations").set(w.auth).send({ points: [pt(33.5, 36.3, 30), pt(33.51, 36.31, 20), pt(33.52, 36.32, 10), pt(33.52, 36.32, 3 * 24 * 60), pt(33.6, 36.4, -60)] });
    expect(mixed.status).toBe(201);
    expect(mixed.body.saved).toBe(3);
    // the owner sees the tracked employee (not the plain one), on shift, with the latest point
    const cur = (await request(app).get("/hr/locations/current").set(o.auth)).body as { employee: { id: string }; onShift: boolean; latest: { latitude: number } }[];
    expect(cur.map((c) => c.employee.id)).toEqual([w.employeeId]);
    expect(cur[0].onShift).toBe(true);
    expect(cur[0].latest.latitude).toBeCloseTo(33.52, 5);
    // the path, oldest first, with a distance
    const r = (await request(app).get(`/hr/locations/${w.employeeId}`).set(o.auth)).body as { points: { latitude: number }[]; distanceKm: number };
    expect(r.points.map((p) => p.latitude)).toEqual([33.5, 33.51, 33.52]);
    expect(r.distanceKm).toBeGreaterThan(2);
    expect(r.distanceKm).toBeLessThan(6);
    // employees cannot read it; after check-out nothing more is accepted
    expect((await request(app).get("/hr/locations/current").set(w.auth)).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).get("/hr/locations/current").set(plain.auth)).status).toBeGreaterThanOrEqual(403);
    await request(app).post("/hr/me/check-out").set(w.auth);
    expect((await request(app).post("/hr/me/locations").set(w.auth).send({ points: [pt(33.5, 36.3, 1)] })).status).toBe(409);
    expect((await request(app).get("/hr/locations/current").set(o.auth)).body[0].onShift).toBe(false);
  });

  it("with the phone lock on, another phone cannot report positions", async () => {
    const o = await company("hrtrk2");
    const w = await linkedEmployee(o, "hrtrk2w", {});
    await request(app).patch(`/hr/employees/${w.employeeId}`).set(o.auth).send({ tracksLocation: true });
    await request(app).patch("/hr/company").set(o.auth).send({ deviceLockRequired: true });
    const A = { "X-Device-Id": "A", "X-Device-Name": "A" };
    expect((await request(app).post("/hr/me/check-in").set(w.auth).set(A)).status).toBe(201);
    expect((await request(app).post("/hr/me/locations").set(w.auth).set(A).send({ points: [pt(33.5, 36.3, 1)] })).status).toBe(201);
    const other = await request(app).post("/hr/me/locations").set(w.auth).set({ "X-Device-Id": "B" }).send({ points: [pt(33.5, 36.3, 1)] });
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("DEVICE_NOT_APPROVED");
  });
});

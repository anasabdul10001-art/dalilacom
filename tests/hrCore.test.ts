import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
export type Acc = { id: string; email: string; auth: { Authorization: string } };
export async function account(prefix: string, data: Record<string, unknown> = {}): Promise<Acc> {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Acc ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}
let planId: string | undefined;
/** An account with an active HR plan (a trial or paid one: the plan system is the same). */
export async function owner(prefix: string, periodEnd: Date | null = new Date(Date.now() + 30 * 86400000)): Promise<Acc> {
  const a = await account(prefix);
  planId ??= (await prisma.servicePlan.create({ data: { service: "HR", name: `HR plan ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } })).id;
  await prisma.platformSubscription.create({ data: { userId: a.id, planId, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: periodEnd } });
  return a;
}
export async function company(prefix: string, currency = "SYP") {
  const a = await owner(prefix);
  const res = await request(app).post("/hr/company").set(a.auth).send({ name: `Co ${prefix}`, currency });
  expect(res.status).toBe(201);
  return { ...a, companyId: res.body.id as string };
}
export const hire = (a: { auth: object }, extra: Record<string, unknown> = {}) =>
  request(app).post("/hr/employees").set(a.auth).send({ firstName: "Salma", lastName: "Ali", hireDate: "2026-01-01", ...extra });
/** An account that has accepted the employee's invitation. */
export async function linkedEmployee(boss: { auth: object }, prefix: string, extra: Record<string, unknown> = {}) {
  const emp = (await hire(boss, extra)).body;
  const code = (await request(app).post(`/hr/employees/${emp.id}/invite`).set(boss.auth)).body.code as string;
  const worker = await account(prefix);
  expect((await request(app).post("/hr/me/accept").set(worker.auth).send({ code })).status).toBe(200);
  return { ...worker, employeeId: emp.id as string };
}

describe("HR: who sees what", () => {
  it("an ordinary account sees nothing of HR; an account with a plan can start a company; nothing is shown empty", async () => {
    const plain = await account("hrplain");
    expect((await request(app).get("/hr/overview").set(plain.auth)).body).toEqual({ manage: null, canStart: false, jobs: [], invitations: 0 });
    expect((await request(app).get("/hr/overview")).status).toBe(401);
    for (const path of ["/hr/employees", "/hr/departments", "/hr/company"]) expect((await request(app).get(path).set(plain.auth)).status).toBe(403);

    const o = await owner("hrown");
    expect((await request(app).get("/hr/overview").set(o.auth)).body).toMatchObject({ manage: null, canStart: true, jobs: [] });
    const made = await request(app).post("/hr/company").set(o.auth).send({ name: "Sweet House", currency: "syp" });
    expect(made.status).toBe(201);
    expect(made.body.currency).toBe("SYP");
    expect((await request(app).get("/hr/overview").set(o.auth)).body).toMatchObject({ manage: { companyName: "Sweet House", currency: "SYP", role: "OWNER", planActive: true }, canStart: false });
    expect((await request(app).post("/hr/company").set(o.auth).send({ name: "Second" })).status).toBe(409); // one company per owner
  });

  it("starting a company needs the HR plan, and the tools close again when the plan ends", async () => {
    const none = await account("hrnoplan");
    const res = await request(app).post("/hr/company").set(none.auth).send({ name: "No plan" });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("HR_PLAN_REQUIRED");

    const o = await company("hrlapse");
    expect((await request(app).get("/hr/employees").set(o.auth)).status).toBe(200);
    await prisma.platformSubscription.updateMany({ where: { userId: o.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/hr/employees").set(o.auth)).status).toBe(402);
    expect((await request(app).get("/hr/overview").set(o.auth)).body.manage).toMatchObject({ planActive: false }); // the tab still says why
  });
});

describe("HR: departments and employees", () => {
  it("manages departments and refuses a duplicate or deleting one that has people", async () => {
    const o = await company("hrdep");
    const dep = await request(app).post("/hr/departments").set(o.auth).send({ name: "Kitchen" });
    expect(dep.status).toBe(201);
    expect((await request(app).post("/hr/departments").set(o.auth).send({ name: "Kitchen" })).status).toBe(409);
    expect((await hire(o, { departmentId: dep.body.id })).status).toBe(201);
    expect((await request(app).delete(`/hr/departments/${dep.body.id}`).set(o.auth)).status).toBe(409);
    const empty = (await request(app).post("/hr/departments").set(o.auth).send({ name: "Empty" })).body;
    expect((await request(app).patch(`/hr/departments/${empty.id}`).set(o.auth).send({ name: "Spare" })).body.name).toBe("Spare");
    expect((await request(app).delete(`/hr/departments/${empty.id}`).set(o.auth)).body).toEqual({ deleted: true });
    const list = (await request(app).get("/hr/departments").set(o.auth)).body;
    expect(list).toHaveLength(1);
    expect(list[0]._count.employees).toBe(1);
  });

  it("adds, lists, updates and ends employees, with checks on what is sent", async () => {
    const o = await company("hremp");
    const mgr = (await hire(o, { firstName: "Boss", role: "MANAGER" })).body;
    const res = await hire(o, { email: "Sara@Example.test", position: "Cook", managerId: mgr.id, baseSalary: 500000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "sara@example.test", position: "Cook", baseSalary: 500000, inviteState: "NONE", linked: false, manager: { id: mgr.id } });
    expect((await request(app).get("/hr/employees").set(o.auth)).body).toHaveLength(2);
    expect((await request(app).get("/hr/employees").query({ status: "TERMINATED" }).set(o.auth)).body).toHaveLength(0);
    expect((await request(app).patch(`/hr/employees/${res.body.id}`).set(o.auth).send({ position: "Chef", employmentStatus: "TERMINATED" })).body).toMatchObject({ position: "Chef", employmentStatus: "TERMINATED" });
    expect(await prisma.hrAuditLog.count({ where: { companyId: o.companyId, action: "employee.status_change" } })).toBe(1);
    expect((await request(app).patch(`/hr/employees/${res.body.id}`).set(o.auth).send({ managerId: res.body.id })).status).toBe(400);
    for (const bad of [{ firstName: "" }, { hireDate: "soon" }, { baseSalary: -5 }, { baseSalary: 10.5 }, { email: "nope" }, { role: "OWNER" }]) expect((await hire(o, bad)).status).toBe(400);
  });

  it("keeps companies apart", async () => {
    const a = await company("hriso1");
    const b = await company("hriso2");
    const emp = (await hire(a)).body;
    expect((await request(app).get(`/hr/employees/${emp.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).patch(`/hr/employees/${emp.id}`).set(b.auth).send({ position: "x" })).status).toBe(404);
    expect((await request(app).post(`/hr/employees/${emp.id}/invite`).set(b.auth)).status).toBe(404);
    expect((await request(app).get("/hr/employees").set(b.auth)).body).toHaveLength(0);
    // a department or manager of another company cannot be attached
    const dep = (await request(app).post("/hr/departments").set(a.auth).send({ name: "Only A" })).body;
    expect((await hire(b, { departmentId: dep.id })).status).toBe(404);
    expect((await hire(b, { managerId: emp.id })).status).toBe(400);
    expect((await request(app).patch(`/hr/departments/${dep.id}`).set(b.auth).send({ name: "x" })).status).toBe(404);
  });
});

describe("HR: linking an employee to an account", () => {
  it("by code: kept only as a hash, works once, and the employee then has a job; the section appears only then", async () => {
    const o = await company("hrcode");
    const emp = (await hire(o)).body;
    const made = await request(app).post(`/hr/employees/${emp.id}/invite`).set(o.auth);
    expect(made.status).toBe(201);
    const code = made.body.code as string;
    const row = await prisma.hrInvite.findUniqueOrThrow({ where: { employeeId: emp.id } });
    expect(JSON.stringify(row)).not.toContain(code);
    expect((await request(app).get(`/hr/employees/${emp.id}`).set(o.auth)).body.inviteState).toBe("PENDING");

    const worker = await account("hrworker");
    expect((await request(app).get("/hr/overview").set(worker.auth)).body.jobs).toEqual([]); // before: nothing
    expect((await request(app).post("/hr/me/accept").set(worker.auth).send({ code: `${code}x` })).body.error.code).toBe("HR_INVITE_INVALID");
    const ok = await request(app).post("/hr/me/accept").set(worker.auth).send({ code });
    expect(ok.status).toBe(200);
    const after = (await request(app).get("/hr/overview").set(worker.auth)).body;
    expect(after.jobs).toHaveLength(1);
    expect(after.jobs[0]).toMatchObject({ employeeId: emp.id, role: "EMPLOYEE", currency: "SYP" });
    expect(after.manage).toBeNull(); // an employee does not get the owner's tools
    expect((await request(app).get(`/hr/employees/${emp.id}`).set(o.auth)).body.inviteState).toBe("LINKED");
    // spent
    const other = await account("hrother");
    expect((await request(app).post("/hr/me/accept").set(other.auth).send({ code })).status).toBe(400);
    // already linked
    expect((await request(app).post(`/hr/employees/${emp.id}/invite`).set(o.auth)).status).toBe(409);
  });

  it("refuses an expired code, replaces an earlier one, and the owner cannot join their own company", async () => {
    const o = await company("hrexp");
    const emp = (await hire(o)).body;
    const first = (await request(app).post(`/hr/employees/${emp.id}/invite`).set(o.auth)).body.code;
    const second = (await request(app).post(`/hr/employees/${emp.id}/invite`).set(o.auth)).body.code;
    const w = await account("hrexpw");
    expect((await request(app).post("/hr/me/accept").set(w.auth).send({ code: first })).status).toBe(400);
    expect((await request(app).post("/hr/me/accept").set(o.auth).send({ code: second })).status).toBe(409);
    await prisma.hrInvite.update({ where: { employeeId: emp.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/hr/me/accept").set(w.auth).send({ code: second })).status).toBe(400);
    expect((await request(app).delete(`/hr/employees/${emp.id}/invite`).set(o.auth)).body).toEqual({ revoked: true });
  });

  it("by email: only an account with that verified email sees the invitation and can accept it", async () => {
    const o = await company("hrmail");
    const invitedEmail = `invited-${crypto.randomUUID()}@example.test`;
    const emp = (await hire(o, { email: invitedEmail })).body;
    expect((await request(app).post(`/hr/employees/${emp.id}/invite`).set(o.auth)).body.emailed).toBe(true);

    // the account signs up first and its email is the invited one (set after the login, as the helper logs in by the original address)
    const unverified = await account("hrmailu");
    await prisma.user.update({ where: { id: unverified.id }, data: { email: invitedEmail, isEmailVerified: false } });
    expect((await request(app).get("/hr/me/invitations").set(unverified.auth)).body).toEqual([]);
    expect((await request(app).get("/hr/overview").set(unverified.auth)).body.invitations).toBe(0);

    await prisma.user.update({ where: { id: unverified.id }, data: { isEmailVerified: true } });
    const list = (await request(app).get("/hr/me/invitations").set(unverified.auth)).body;
    expect(list).toHaveLength(1);
    expect(list[0].companyName).toBe("Co hrmail");
    expect((await request(app).get("/hr/overview").set(unverified.auth)).body.invitations).toBe(1);

    const stranger = await account("hrmails", { isEmailVerified: true });
    expect((await request(app).post(`/hr/me/invitations/${list[0].id}/accept`).set(stranger.auth)).status).toBe(400); // not theirs
    expect((await request(app).post(`/hr/me/invitations/${list[0].id}/accept`).set(unverified.auth)).status).toBe(200);
    expect((await request(app).get("/hr/overview").set(unverified.auth)).body).toMatchObject({ invitations: 0 });
  });

  it("unlinking cuts the account loose and the employee can be invited again", async () => {
    const o = await company("hrunlink");
    const w = await linkedEmployee(o, "hrunlinkw");
    expect((await request(app).post(`/hr/employees/${w.employeeId}/unlink`).set(o.auth)).body).toEqual({ unlinked: true });
    expect((await request(app).get("/hr/overview").set(w.auth)).body.jobs).toEqual([]);
    expect((await request(app).post(`/hr/employees/${w.employeeId}/unlink`).set(o.auth)).status).toBe(404);
    expect((await request(app).post(`/hr/employees/${w.employeeId}/invite`).set(o.auth)).status).toBe(201);
  });
});

describe("HR: the HR role", () => {
  it("an employee with the HR role runs the company but cannot hand out the HR role", async () => {
    const o = await company("hrrole");
    const hrPerson = await linkedEmployee(o, "hrrolew", { role: "HR" });
    expect((await request(app).get("/hr/overview").set(hrPerson.auth)).body.manage).toMatchObject({ companyName: "Co hrrole", role: "HR" });
    expect((await request(app).get("/hr/employees").set(hrPerson.auth)).body).toHaveLength(1);
    const made = await hire(hrPerson, { firstName: "Hired by HR" });
    expect(made.status).toBe(201);
    expect((await hire(hrPerson, { role: "HR" })).status).toBe(403);
    expect((await request(app).patch(`/hr/employees/${made.body.id}`).set(hrPerson.auth).send({ role: "HR" })).status).toBe(403);
    expect((await request(app).patch(`/hr/employees/${made.body.id}`).set(o.auth).send({ role: "HR" })).status).toBe(200);
    // an ordinary employee has no management tools at all
    const plain = await linkedEmployee(o, "hrrolep");
    expect((await request(app).get("/hr/employees").set(plain.auth)).status).toBe(403);
    // and the HR person's access ends when the owner's plan does
    await prisma.platformSubscription.updateMany({ where: { userId: o.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/hr/employees").set(hrPerson.auth)).status).toBe(402);
  });
});

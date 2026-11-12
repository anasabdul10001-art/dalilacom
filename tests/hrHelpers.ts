import { expect } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

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

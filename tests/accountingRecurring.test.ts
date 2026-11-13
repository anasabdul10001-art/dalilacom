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
async function subscriber(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Rec ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc rec ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
type A = { auth: object; id: string };
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => dayStr(new Date(Date.now() - n * 86400000));
const make = (a: A, body: Record<string, unknown>) => request(app).post("/accounting/recurring").set(a.auth).send({ type: "EXPENSE", category: "إيجار", description: "Rent", amountCents: 50000, currency: "EUR", ...body });
const entries = (a: A) => prisma.accountingEntry.findMany({ where: { userId: a.id, source: "RECURRING" }, orderBy: { occurredAt: "asc" } });

describe("accounting: entries that repeat by themselves", () => {
  it("a monthly one with a start in the past writes every missed month, keeps its day, and a short month takes its last day", async () => {
    const a = await subscriber("rec1");
    const res = await make(a, { frequency: "MONTHLY", startDate: "2026-01-31", backfill: true });
    expect(res.status).toBe(201);
    const keys = (await entries(a)).map((e) => e.sourceKey);
    expect(keys).toContain(`recurring:${res.body.id}:2026-01-31`);
    expect(keys).toContain(`recurring:${res.body.id}:2026-02-28`);
    expect(keys).toContain(`recurring:${res.body.id}:2026-04-30`);
    expect(keys.every((k) => k!.split(":")[2] <= dayStr(new Date()))).toBe(true);
    expect(res.body.nextDue > dayStr(new Date())).toBe(true);
  });

  it("without backfill it starts from the next date, never from the past", async () => {
    const a = await subscriber("rec2");
    const monthly = await make(a, { frequency: "MONTHLY", startDate: daysAgo(10) });
    expect(monthly.status).toBe(201);
    expect(await entries(a)).toHaveLength(0);
    expect(monthly.body.nextDue > dayStr(new Date())).toBe(true);
    const weekly = await make(a, { frequency: "WEEKLY", startDate: daysAgo(7), description: "Cleaner" });
    expect(weekly.body.nextDue > dayStr(new Date())).toBe(true); // the one of today is written, the next is in a week
    const rows = await entries(a);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Cleaner");
    expect(dayStr(rows[0].occurredAt)).toBe(dayStr(new Date()));
  });

  it("reading again never writes twice, and a stored entry looks like any other", async () => {
    const a = await subscriber("rec3");
    await make(a, { frequency: "WEEKLY", startDate: daysAgo(14), backfill: true });
    for (let i = 0; i < 3; i++) await request(app).get("/accounting/summary").set(a.auth);
    expect(await entries(a)).toHaveLength(3); // 14, 7 and 0 days ago
    const list = await request(app).get("/accounting/entries").set(a.auth);
    expect(list.body[0]).toMatchObject({ type: "EXPENSE", category: "إيجار", source: "RECURRING" });
    const sum = await request(app).get("/accounting/summary").query({ from: daysAgo(15) }).set(a.auth); // the whole period, not only this month
    expect(sum.body.totals[0].expensesCents).toBe(150000);
  });

  it("stops at its end date and then switches itself off", async () => {
    const a = await subscriber("rec4");
    const res = await make(a, { frequency: "WEEKLY", startDate: daysAgo(21), endDate: daysAgo(7), backfill: true });
    expect(await entries(a)).toHaveLength(3);
    const list = await request(app).get("/accounting/recurring").set(a.auth);
    expect(list.body.find((r: { id: string }) => r.id === res.body.id).active).toBe(false);
  });

  it("can be paused and resumed (what was missed while paused is not written), changed, and deleted without touching what it wrote", async () => {
    const a = await subscriber("rec5");
    const res = await make(a, { frequency: "WEEKLY", startDate: daysAgo(21), backfill: true }); // 4 written
    expect(await entries(a)).toHaveLength(4);
    expect((await request(app).patch(`/accounting/recurring/${res.body.id}`).set(a.auth).send({ active: false })).body.active).toBe(false);
    await prisma.accountingRecurring.update({ where: { id: res.body.id }, data: { nextDue: daysAgo(14) } }); // as if it had been due while paused
    await request(app).get("/accounting/summary").set(a.auth);
    expect(await entries(a)).toHaveLength(4);
    const resumed = await request(app).patch(`/accounting/recurring/${res.body.id}`).set(a.auth).send({ active: true, amountCents: 60000 });
    expect(resumed.body).toMatchObject({ active: true, amountCents: 60000 });
    expect(resumed.body.nextDue >= dayStr(new Date())).toBe(true);
    expect((await request(app).delete(`/accounting/recurring/${res.body.id}`).set(a.auth)).status).toBe(200);
    expect(await entries(a)).toHaveLength(4);
  });

  it("a cash one due today is in the cash box, and the owner is told once", async () => {
    const a = await subscriber("rec6");
    await make(a, { frequency: "MONTHLY", startDate: dayStr(new Date()), payMethod: "CASH" });
    const box = await request(app).get("/accounting/cash").query({ day: dayStr(new Date()), currency: "EUR" }).set(a.auth);
    expect(box.body).toMatchObject({ cashOutCents: 50000, expectedCents: -50000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.notification.count({ where: { userId: a.id, type: "SYSTEM" } })).toBe(1);
  });

  it("is private to the account and checks its input", async () => {
    const a = await subscriber("rec7");
    const b = await subscriber("rec8");
    const res = await make(a, { frequency: "MONTHLY", startDate: daysAgo(3) });
    expect((await request(app).get("/accounting/recurring").set(b.auth)).body).toEqual([]);
    expect((await request(app).patch(`/accounting/recurring/${res.body.id}`).set(b.auth).send({ active: false })).status).toBe(404);
    expect((await request(app).delete(`/accounting/recurring/${res.body.id}`).set(b.auth)).status).toBe(404);
    expect((await make(a, { frequency: "MONTHLY", startDate: "2026-02-30x" })).status).toBe(400);
    expect((await make(a, { frequency: "MONTHLY", startDate: "2026-03-01", endDate: "2026-02-01" })).status).toBe(400);
    expect((await make(a, { frequency: "DAILY", startDate: "2026-03-01" })).status).toBe(400);
  });
});

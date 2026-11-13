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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Rep ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc rep ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const entry = (a: { auth: object }, body: Record<string, unknown>) => request(app).post("/accounting/entries").set(a.auth).send({ currency: "EUR", description: "test entry", ...body });
const report = (a: { auth: object }, q: Record<string, string>) => request(app).get("/accounting/reports").query(q).set(a.auth);

describe("accounting: reports", () => {
  it("totals, categories and a series by day and by month for a period", async () => {
    const a = await subscriber("repA");
    await entry(a, { type: "INCOME", category: "مبيعات", amountCents: 10000, occurredAt: "2026-03-05T10:00:00.000Z" });
    await entry(a, { type: "INCOME", category: "مبيعات", amountCents: 5000, occurredAt: "2026-03-05T18:00:00.000Z" });
    await entry(a, { type: "EXPENSE", category: "إيجار", amountCents: 4000, occurredAt: "2026-03-06T10:00:00.000Z" });
    await entry(a, { type: "INCOME", category: "مبيعات", amountCents: 7000, occurredAt: "2026-04-02T10:00:00.000Z" });
    await entry(a, { type: "INCOME", category: "مبيعات", amountCents: 999, occurredAt: "2026-06-01T10:00:00.000Z" }); // outside
    const day = await report(a, { from: "2026-03-01", to: "2026-04-30", currency: "EUR", groupBy: "day" });
    expect(day.status).toBe(200);
    expect(day.body.totals).toMatchObject({ incomeCents: 22000, expensesCents: 4000, netCents: 18000, salesCents: 22000, costOfGoodsCents: 0, otherExpensesCents: 4000 });
    expect(day.body.series).toEqual([
      { period: "2026-03-05", incomeCents: 15000, expensesCents: 0, netCents: 15000 },
      { period: "2026-03-06", incomeCents: 0, expensesCents: 4000, netCents: -4000 },
      { period: "2026-04-02", incomeCents: 7000, expensesCents: 0, netCents: 7000 },
    ]);
    const month = await report(a, { from: "2026-03-01", to: "2026-04-30", groupBy: "month" });
    expect(month.body.series.map((s: { period: string; netCents: number }) => [s.period, s.netCents])).toEqual([["2026-03-01", 11000], ["2026-04-01", 7000]]);
    expect(month.body.byCategory[0]).toMatchObject({ category: "مبيعات", type: "INCOME", amountCents: 22000 });
  });

  it("profit by product comes from the invoices and from the quick sale, with the discount counted apart", async () => {
    const a = await subscriber("repB");
    const tea = (await request(app).post("/accounting/products").set(a.auth).send({ name: "Tea", costCents: 100, salePriceCents: 250, quantity: 50, currency: "EUR" })).body;
    const cake = (await request(app).post("/accounting/products").set(a.auth).send({ name: "Cake", costCents: 300, salePriceCents: 700, quantity: 20, currency: "EUR" })).body;
    expect((await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 4 }, { productId: cake.id, quantity: 1 }], discountCents: 100 })).status).toBe(201);
    expect((await request(app).post(`/accounting/products/${tea.id}/sell`).set(a.auth).send({ quantity: 2 })).status).toBe(201);
    const today = new Date().toISOString().slice(0, 10);
    const res = await report(a, { from: today, to: today, currency: "EUR" });
    expect(res.body.byProduct).toEqual([
      { name: "Tea", quantity: 6, revenueCents: 1500, costCents: 600, profitCents: 900 }, // the biggest revenue first
      { name: "Cake", quantity: 1, revenueCents: 700, costCents: 300, profitCents: 400 },
    ]);
    expect(res.body.totals).toMatchObject({ invoices: 2, discountCents: 100, costOfGoodsCents: 900 });
    const list = await request(app).get("/accounting/sales").set(a.auth);
    expect(list.body.map((s: { number: number }) => s.number)).toEqual([2, 1]); // the quick sale is invoice 2
  });

  it("simultaneous sales get different invoice numbers", async () => {
    const a = await subscriber("repC");
    const tea = (await request(app).post("/accounting/products").set(a.auth).send({ name: "Tea", costCents: 100, salePriceCents: 250, quantity: 50, currency: "EUR" })).body;
    const results = await Promise.all(Array.from({ length: 6 }, () => request(app).post(`/accounting/products/${tea.id}/sell`).set(a.auth).send({ quantity: 1 })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = (await prisma.accountingSale.findMany({ where: { userId: a.id }, select: { number: true } })).map((s) => s.number).sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("is private, needs a valid period, and picks the currency that has entries", async () => {
    const a = await subscriber("repD");
    const b = await subscriber("repE");
    await entry(a, { type: "INCOME", category: "مبيعات", amountCents: 3000, currency: "USD", occurredAt: "2026-03-05T10:00:00.000Z" });
    const mine = await report(a, { from: "2026-03-01", to: "2026-03-31" });
    expect(mine.body.currency).toBe("USD");
    expect(mine.body.totals.incomeCents).toBe(3000);
    expect((await report(b, { from: "2026-03-01", to: "2026-03-31" })).body.totals.incomeCents).toBe(0);
    expect((await report(a, { from: "2026-03-31", to: "2026-03-01" })).status).toBe(400);
    expect((await report(a, { from: "nope", to: "2026-03-01" })).status).toBe(400);
    expect((await report(a, { from: "2020-01-01", to: "2026-03-01" })).status).toBe(400);
  });
});

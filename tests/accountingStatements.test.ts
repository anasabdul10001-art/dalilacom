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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Stm ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc stm ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
type A = { auth: object; id: string };
const today = () => new Date().toISOString().slice(0, 10);
const statements = (a: A) => request(app).get("/accounting/statements").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);

describe("accounting: financial statements (experimental)", () => {
  it("an empty account has empty statements", async () => {
    const a = await subscriber("stm0");
    const res = await statements(a);
    expect(res.status).toBe(200);
    expect(res.body.incomeStatement).toMatchObject({ revenueCents: 0, netProfitCents: 0, expenses: [] });
    expect(res.body.position).toMatchObject({ totalAssetsCents: 0, totalLiabilitiesCents: 0, equityCents: 0 });
  });

  it("the income statement and the position agree: assets minus liabilities is the profit when nothing else was put in or taken out", async () => {
    const a = await subscriber("stm1");
    const supplier = (await request(app).post("/accounting/parties").set(a.auth).send({ kind: "SUPPLIER", name: "Mill" })).body;
    const customer = (await request(app).post("/accounting/parties").set(a.auth).send({ kind: "CUSTOMER", name: "Sam" })).body;
    const tea = (await request(app).post("/accounting/products").set(a.auth).send({ name: "Tea", costCents: 100, salePriceCents: 1000, quantity: 0, currency: "EUR" })).body;
    await request(app).post("/accounting/purchases").set(a.auth).send({ items: [{ productId: tea.id, quantity: 20, unitCostCents: 100 }], partyId: supplier.id, paidCents: 500, payMethod: "CASH" }); // 2000, owes 1500
    await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 5 }], payMethod: "CASH" }); // 5000 cash
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "EXPENSE", category: "إيجار", description: "Rent", amountCents: 1000, currency: "EUR", payMethod: "CASH" });
    await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 2 }], partyId: customer.id, paidCents: 0 }); // 2000 on credit
    const res = await statements(a);
    expect(res.body.incomeStatement).toMatchObject({ salesCents: 7000, returnsCents: 0, otherIncomeCents: 0, revenueCents: 7000, costOfGoodsCents: 700, grossProfitCents: 6300, operatingExpensesCents: 1000, netProfitCents: 5300 });
    expect(res.body.incomeStatement.expenses).toEqual([{ category: "إيجار", amountCents: 1000 }]);
    expect(res.body.position).toMatchObject({ cashTotalCents: 3500, receivablesCents: 2000, inventoryCents: 1300, taxClaimCents: 0, totalAssetsCents: 6800, payablesCents: 1500, taxPayableCents: 0, totalLiabilitiesCents: 1500, equityCents: 5300, profitToDateCents: 5300, otherEquityCents: 0 });
    // the customer pays, the supplier is paid: cash moves, nothing else
    await request(app).post(`/accounting/parties/${customer.id}/payments`).set(a.auth).send({ amountCents: 2000, currency: "EUR", payMethod: "BANK" });
    await request(app).post(`/accounting/parties/${supplier.id}/payments`).set(a.auth).send({ amountCents: 1500, currency: "EUR", payMethod: "CASH" });
    const after = await statements(a);
    expect(after.body.position).toMatchObject({ cashTotalCents: 4000, receivablesCents: 0, payablesCents: 0, equityCents: 5300 }); // 3500 + 2000 - 1500
    expect(after.body.incomeStatement.netProfitCents).toBe(5300);
  });

  it("money put in by the owner shows as the balancing line, not as profit; tax owed is a liability", async () => {
    const a = await subscriber("stm2");
    // the box holds money that was never recorded as income: 10000 put in as a (cash) receipt
    await prisma.accountingEntry.create({ data: { userId: a.id, type: "RECEIPT", category: "رأس مال", description: "Owner", amountCents: 10000, currency: "EUR", source: "MANUAL", payMethod: "CASH" } });
    const rate = (await request(app).post("/accounting/tax/rates").set(a.auth).send({ name: "VAT", ratePercent: 19 })).body;
    await request(app).put("/accounting/settings").set(a.auth).send({ pricesIncludeTax: true, defaultTaxRateId: rate.id });
    const tea = (await request(app).post("/accounting/products").set(a.auth).send({ name: "Tea", costCents: 100, salePriceCents: 1190, quantity: 10, currency: "EUR" })).body;
    await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 2 }] }); // 2380 in cash, tax 380
    const res = await statements(a);
    expect(res.body.position).toMatchObject({ cashTotalCents: 12380, taxPayableCents: 380, otherEquityCents: 11000 }); // 10000 put in, and the 10 pieces that were already on the shelf (1000 at cost) when the product was added
    expect(res.body.position.profitToDateCents).toBe(2000 - 200); // income without the tax, less the cost of the two sold
    expect(res.body.position.equityCents).toBe(res.body.position.totalAssetsCents - res.body.position.totalLiabilitiesCents);
  });

  it("is private and checks the period", async () => {
    const a = await subscriber("stm3");
    const b = await subscriber("stm4");
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "مبيعات", description: "Sale", amountCents: 500, currency: "EUR", payMethod: "CASH" });
    expect((await statements(a)).body.incomeStatement.revenueCents).toBe(500);
    expect((await statements(b)).body.incomeStatement.revenueCents).toBe(0);
    expect((await request(app).get("/accounting/statements").query({ from: "2026-03-31", to: "2026-03-01" }).set(a.auth)).status).toBe(400);
    expect((await request(app).get("/accounting/statements").query({ from: "x", to: "y" }).set(a.auth)).status).toBe(400);
  });
});

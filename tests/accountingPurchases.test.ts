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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Buy ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc buy ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const product = async (a: { auth: object }, body: Record<string, unknown>) => (await request(app).post("/accounting/products").set(a.auth).send({ costCents: 100, salePriceCents: 400, quantity: 10, currency: "EUR", ...body })).body;
const supplier = async (a: { auth: object }, name = "Mill") => (await request(app).post("/accounting/parties").set(a.auth).send({ kind: "SUPPLIER", name })).body;
const buy = (a: { auth: object }, body: Record<string, unknown>) => request(app).post("/accounting/purchases").set(a.auth).send(body);
const today = () => new Date().toISOString().slice(0, 10);
const cash = (a: { auth: object }) => request(app).get("/accounting/cash").query({ day: today(), currency: "EUR" }).set(a.auth);

describe("accounting: purchases", () => {
  it("brings the stock in, averages the cost by quantity, numbers the invoice and leaves a movement", async () => {
    const a = await subscriber("buy1");
    const tea = await product(a, { name: "Tea", costCents: 100, quantity: 10 });
    const res = await buy(a, { items: [{ productId: tea.id, quantity: 30, unitCostCents: 200 }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 1, totalCents: 6000, paidCents: 6000 });
    const row = await prisma.accountingProduct.findUniqueOrThrow({ where: { id: tea.id } });
    expect(row.quantity).toBe(40);
    expect(row.costCents).toBe(175); // (10 x 100 + 30 x 200) / 40
    const moves = await request(app).get(`/accounting/products/${tea.id}/movements`).set(a.auth);
    expect(moves.body[0]).toMatchObject({ action: "STOCK_IN", quantity: 30, unitCostCents: 200 });
    expect((await buy(a, { items: [{ productId: tea.id, quantity: 10, unitCostCents: 100 }] })).body.number).toBe(2);
    // an empty shelf takes the new cost as it is
    const empty = await product(a, { name: "Cake", costCents: 999, quantity: 0 });
    await buy(a, { items: [{ productId: empty.id, quantity: 4, unitCostCents: 300 }] });
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: empty.id } })).costCents).toBe(300);
  });

  it("the money paid is a payout from the cash box, never an expense: the cost reaches the profit when the goods are sold", async () => {
    const a = await subscriber("buy2");
    const tea = await product(a, { name: "Tea", costCents: 100, quantity: 0 });
    await buy(a, { items: [{ productId: tea.id, quantity: 10, unitCostCents: 100 }], payMethod: "CASH" });
    expect((await cash(a)).body).toMatchObject({ cashOutCents: 1000, expectedCents: -1000 });
    const entries = await prisma.accountingEntry.findMany({ where: { userId: a.id } });
    expect(entries.map((e) => [e.type, e.source, e.payMethod])).toEqual([["PAYOUT", "PURCHASE", "CASH"]]);
    expect((await request(app).post(`/accounting/products/${tea.id}/sell`).set(a.auth).send({ quantity: 4, unitPriceCents: 400 })).status).toBe(201);
    const rep = await request(app).get("/accounting/reports").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);
    expect(rep.body.totals).toMatchObject({ incomeCents: 1600, expensesCents: 400, netCents: 1200 }); // only the 4 sold pieces cost
  });

  it("a purchase on credit from a supplier: part paid now, the rest is owed, and a payment later settles it", async () => {
    const a = await subscriber("buy3");
    const s = await supplier(a);
    const tea = await product(a, { name: "Tea", quantity: 0 });
    const res = await buy(a, { items: [{ productId: tea.id, quantity: 10, unitCostCents: 500 }], partyId: s.id, paidCents: 1500, payMethod: "BANK" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ totalCents: 5000, paidCents: 1500, supplierName: "Mill" });
    const stmt = await request(app).get(`/accounting/parties/${s.id}`).set(a.auth);
    expect(stmt.body.balances).toEqual([{ currency: "EUR", balanceCents: 3500 }]);
    expect(stmt.body.entries.map((e: { kind: string; purchaseNumber: number | null }) => [e.kind, e.purchaseNumber])).toEqual([["PAYMENT", 1], ["CHARGE", 1]]);
    expect((await request(app).get("/accounting/parties").set(a.auth)).body.payable).toEqual([{ currency: "EUR", cents: 3500 }]);
    expect((await cash(a)).body.cashOutCents).toBe(0); // paid by bank
    expect((await request(app).post(`/accounting/parties/${s.id}/payments`).set(a.auth).send({ amountCents: 3500, currency: "EUR", payMethod: "CASH" })).status).toBe(201);
    expect((await cash(a)).body.cashOutCents).toBe(3500);
    expect((await request(app).get(`/accounting/parties/${s.id}`).set(a.auth)).body.balances).toEqual([]);
  });

  it("refuses credit without a supplier, an overpayment, a customer as supplier, and another account's products", async () => {
    const a = await subscriber("buy4");
    const b = await subscriber("buy5");
    const tea = await product(a, { name: "Tea" });
    const customer = (await request(app).post("/accounting/parties").set(a.auth).send({ kind: "CUSTOMER", name: "Sam" })).body;
    expect((await buy(a, { items: [{ productId: tea.id, quantity: 1, unitCostCents: 100 }], paidCents: 10 })).status).toBe(400);
    expect((await buy(a, { items: [{ productId: tea.id, quantity: 1, unitCostCents: 100 }], paidCents: 9999 })).status).toBe(400);
    expect((await buy(a, { items: [{ productId: tea.id, quantity: 1, unitCostCents: 100 }], partyId: customer.id, paidCents: 0 })).status).toBe(404);
    expect((await buy(b, { items: [{ productId: tea.id, quantity: 1, unitCostCents: 100 }] })).status).toBe(404);
    expect((await buy(a, { items: [{ productId: tea.id, quantity: 1, unitCostCents: 0 }] })).status).toBe(400);
    expect((await request(app).get("/accounting/purchases").set(b.auth)).body).toEqual([]);
    const ok = await buy(a, { items: [{ productId: tea.id, quantity: 1, unitCostCents: 100 }] });
    expect((await request(app).get(`/accounting/purchases/${ok.body.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).get(`/accounting/purchases/${ok.body.id}`).set(a.auth)).body.lines).toHaveLength(1);
  });
});

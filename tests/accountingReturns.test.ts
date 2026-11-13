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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Ret ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc ret ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
type A = { auth: object };
const product = async (a: A, body: Record<string, unknown>) => (await request(app).post("/accounting/products").set(a.auth).send({ costCents: 100, salePriceCents: 1000, quantity: 20, currency: "EUR", ...body })).body;
const party = async (a: A, kind: string, name: string) => (await request(app).post("/accounting/parties").set(a.auth).send({ kind, name })).body;
const today = () => new Date().toISOString().slice(0, 10);
const cash = (a: A) => request(app).get("/accounting/cash").query({ day: today(), currency: "EUR" }).set(a.auth);
const report = (a: A) => request(app).get("/accounting/reports").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);
const qty = async (id: string) => (await prisma.accountingProduct.findUniqueOrThrow({ where: { id } })).quantity;

describe("accounting: returns", () => {
  it("a sales return puts the goods back, takes the income and the cost back, and pays the money back from the cash box", async () => {
    const a = await subscriber("ret1");
    const tea = await product(a, { name: "Tea" });
    const sale = (await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 5 }] })).body;
    expect(await qty(tea.id)).toBe(15);
    const res = await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ totalCents: 2000, refundCents: 2000, debtCents: 0, costCents: 200 });
    expect(await qty(tea.id)).toBe(17);
    expect((await cash(a)).body).toMatchObject({ cashInCents: 5000, cashOutCents: 2000, expectedCents: 3000 });
    const rep = await report(a);
    expect(rep.body.totals).toMatchObject({ incomeCents: 3000, expensesCents: 300, netCents: 2700, salesCents: 3000, returnsCents: 2000, costOfGoodsCents: 300, grossProfitCents: 2700 });
    expect(rep.body.byProduct).toEqual([{ name: "Tea", quantity: 3, revenueCents: 3000, costCents: 300, profitCents: 2700 }]);
    const again = await request(app).get(`/accounting/sales/${sale.id}`).set(a.auth);
    expect(again.body.lines[0]).toMatchObject({ quantity: 5, returnedQuantity: 2 });
    // no more than was sold can come back
    expect((await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 4 }] })).status).toBe(409);
    expect((await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 3 }] })).status).toBe(201);
    expect(await qty(tea.id)).toBe(20);
  });

  it("the customer gets back their share of the invoice discount", async () => {
    const a = await subscriber("ret2");
    const tea = await product(a, { name: "Tea" });
    const sale = (await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 4 }], discountCents: 400 })).body; // 4000 - 400
    const res = await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 2 }] });
    expect(res.body).toMatchObject({ totalCents: 1800 }); // 2000 minus half of the discount
  });

  it("a return on a credit sale lowers the debt first and pays back only the rest", async () => {
    const a = await subscriber("ret3");
    const c = await party(a, "CUSTOMER", "Sam");
    const tea = await product(a, { name: "Tea" });
    const sale = (await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 5 }], partyId: c.id, paidCents: 3000, payMethod: "CASH" })).body; // owes 2000
    const res = await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 3 }] }); // 3000 back
    expect(res.body).toMatchObject({ totalCents: 3000, debtCents: 2000, refundCents: 1000 });
    expect((await request(app).get(`/accounting/parties/${c.id}`).set(a.auth)).body.balances).toEqual([]);
    expect((await cash(a)).body).toMatchObject({ cashInCents: 3000, cashOutCents: 1000 });
  });

  it("a purchase return takes the goods out, lowers what we owe first and gets the rest back in money", async () => {
    const a = await subscriber("ret4");
    const s = await party(a, "SUPPLIER", "Mill");
    const tea = await product(a, { name: "Tea", quantity: 0 });
    const buy = (await request(app).post("/accounting/purchases").set(a.auth).send({ items: [{ productId: tea.id, quantity: 10, unitCostCents: 500 }], partyId: s.id, paidCents: 3000, payMethod: "CASH" })).body; // owes 2000
    expect(await qty(tea.id)).toBe(10);
    const res = await request(app).post(`/accounting/purchases/${buy.id}/returns`).set(a.auth).send({ items: [{ lineId: buy.lines[0].id, quantity: 6 }] }); // 3000 back
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ totalCents: 3000, debtCents: 2000, refundCents: 1000 });
    expect(await qty(tea.id)).toBe(4);
    expect((await request(app).get(`/accounting/parties/${s.id}`).set(a.auth)).body.balances).toEqual([]);
    expect((await cash(a)).body).toMatchObject({ cashOutCents: 3000, cashInCents: 1000 });
    expect((await report(a)).body.totals).toMatchObject({ incomeCents: 0, expensesCents: 0 }); // buying and returning goods is not profit or loss
    // goods already sold cannot go back to the supplier
    await request(app).post(`/accounting/products/${tea.id}/sell`).set(a.auth).send({ quantity: 4 });
    expect((await request(app).post(`/accounting/purchases/${buy.id}/returns`).set(a.auth).send({ items: [{ lineId: buy.lines[0].id, quantity: 4 }] })).status).toBe(409);
    expect(await qty(tea.id)).toBe(0);
  });

  it("is private to the account", async () => {
    const a = await subscriber("ret5");
    const b = await subscriber("ret6");
    const tea = await product(a, { name: "Tea" });
    const sale = (await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 1 }] })).body;
    expect((await request(app).post(`/accounting/sales/${sale.id}/returns`).set(b.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 1 }] })).status).toBe(404);
    expect((await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: crypto.randomUUID(), quantity: 1 }] })).status).toBe(404);
    expect(await qty(tea.id)).toBe(19);
  });
});

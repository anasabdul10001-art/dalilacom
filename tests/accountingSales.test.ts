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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Sale ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc sale ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const product = async (a: { auth: object }, body: Record<string, unknown>) => (await request(app).post("/accounting/products").set(a.auth).send({ costCents: 100, salePriceCents: 250, quantity: 10, currency: "EUR", ...body })).body;
const sale = (a: { auth: object }, body: Record<string, unknown>) => request(app).post("/accounting/sales").set(a.auth).send(body);

describe("accounting: sales invoice", () => {
  it("sells several products at once, numbers the invoice and writes the income and the cost", async () => {
    const a = await subscriber("sale1");
    const tea = await product(a, { name: "Tea", costCents: 100, salePriceCents: 250, quantity: 10 });
    const cake = await product(a, { name: "Cake", costCents: 300, salePriceCents: 700, quantity: 4 });
    const res = await sale(a, { items: [{ productId: tea.id, quantity: 2 }, { productId: cake.id, quantity: 1 }], customerName: "Sam", payMethod: "BANK" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 1, customerName: "Sam", subtotalCents: 1200, discountCents: 0, totalCents: 1200, costCents: 500, netCents: 700, payMethod: "BANK" });
    expect(res.body.lines).toHaveLength(2);
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: tea.id } })).quantity).toBe(8);
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: cake.id } })).quantity).toBe(3);
    const entries = await prisma.accountingEntry.findMany({ where: { userId: a.id, source: "SALE" }, orderBy: { amountCents: "desc" } });
    expect(entries.map((e) => [e.type, Number(e.amountCents), e.payMethod])).toEqual([["INCOME", 1200, "BANK"], ["EXPENSE", 500, null]]);
    const second = await sale(a, { items: [{ productId: tea.id, quantity: 1 }] });
    expect(second.body.number).toBe(2);
    const list = await request(app).get("/accounting/sales").set(a.auth);
    expect(list.body.map((s: { number: number }) => s.number)).toEqual([2, 1]);
    expect((await request(app).get(`/accounting/sales/${res.body.id}`).set(a.auth)).body.lines[0].name).toBeTruthy();
  });

  it("takes a discount, as an amount or as a percent, and refuses a bigger one", async () => {
    const a = await subscriber("sale2");
    const tea = await product(a, { name: "Tea", salePriceCents: 1000, quantity: 20 });
    expect((await sale(a, { items: [{ productId: tea.id, quantity: 2 }], discountCents: 500 })).body).toMatchObject({ subtotalCents: 2000, discountCents: 500, totalCents: 1500 });
    expect((await sale(a, { items: [{ productId: tea.id, quantity: 2 }], discountPercent: 10 })).body).toMatchObject({ discountCents: 200, totalCents: 1800 });
    expect((await sale(a, { items: [{ productId: tea.id, quantity: 1 }], discountCents: 1001 })).status).toBe(400);
    expect((await sale(a, { items: [{ productId: tea.id, quantity: 1 }], discountPercent: 100 })).status).toBe(400); // a free invoice is not a sale
  });

  it("one short product cancels the whole sale and leaves the stock alone", async () => {
    const a = await subscriber("sale3");
    const tea = await product(a, { name: "Tea", quantity: 5 });
    const cake = await product(a, { name: "Cake", quantity: 1 });
    const res = await sale(a, { items: [{ productId: tea.id, quantity: 3 }, { productId: cake.id, quantity: 2 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(res.body.error.details.name).toBe("Cake");
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: tea.id } })).quantity).toBe(5);
    expect(await prisma.accountingSale.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.accountingEntry.count({ where: { userId: a.id } })).toBe(0);
  });

  it("is private to the account, and the same product twice becomes one line", async () => {
    const a = await subscriber("sale4");
    const b = await subscriber("sale5");
    const tea = await product(a, { name: "Tea", quantity: 9 });
    expect((await sale(b, { items: [{ productId: tea.id, quantity: 1 }] })).status).toBe(404);
    const res = await sale(a, { items: [{ productId: tea.id, quantity: 2 }, { productId: tea.id, quantity: 3 }] });
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].quantity).toBe(5);
    expect((await request(app).get(`/accounting/sales/${res.body.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).get("/accounting/sales").set(b.auth)).body).toEqual([]);
  });

  it("cannot mix currencies, and the invoice entries cannot be edited by hand", async () => {
    const a = await subscriber("sale6");
    const eur = await product(a, { name: "Tea", currency: "EUR" });
    const usd = await product(a, { name: "Cake", currency: "USD" });
    expect((await sale(a, { items: [{ productId: eur.id, quantity: 1 }, { productId: usd.id, quantity: 1 }] })).status).toBe(400);
    expect((await sale(a, { items: [{ productId: eur.id, quantity: 1 }] })).status).toBe(201);
    const entry = await prisma.accountingEntry.findFirstOrThrow({ where: { userId: a.id, source: "SALE", type: "INCOME" } });
    expect((await request(app).patch(`/accounting/entries/${entry.id}`).set(a.auth).send({ description: "changed" })).status).toBe(409);
  });
});

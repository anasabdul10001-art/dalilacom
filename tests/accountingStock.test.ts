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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Stock ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc stock ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const product = async (a: { auth: object }, body: Record<string, unknown>) => (await request(app).post("/accounting/products").set(a.auth).send({ costCents: 100, salePriceCents: 250, quantity: 10, currency: "EUR", ...body })).body;

describe("accounting: stock watch", () => {
  it("lists what is out and what is at or under its minimum, least first", async () => {
    const a = await subscriber("stlow");
    await product(a, { name: "Fine", quantity: 10, lowStockAt: 2 });
    const low = await product(a, { name: "Low", quantity: 3, lowStockAt: 3 });
    const out = await product(a, { name: "Out", quantity: 0 });
    await product(a, { name: "NoMin", quantity: 1 }); // no minimum set: not low
    const res = await request(app).get("/accounting/stock/low").set(a.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { name: string; level: string }) => [i.name, i.level])).toEqual([["Out", "OUT"], ["Low", "LOW"]]);
    expect(res.body).toMatchObject({ out: 1, low: 1 });
    expect(low.id).toBeTruthy(); expect(out.id).toBeTruthy();
    expect((await request(app).patch(`/accounting/products/${low.id}`).set(a.auth).send({ lowStockAt: 1 })).status).toBe(200);
    expect((await request(app).get("/accounting/stock/low").set(a.auth)).body.low).toBe(0);
  });

  it("a physical count sets the counted numbers, keeps a movement for each difference and skips what did not change", async () => {
    const a = await subscriber("stcount");
    const tea = await product(a, { name: "Tea", quantity: 10 });
    const cake = await product(a, { name: "Cake", quantity: 4 });
    const res = await request(app).post("/accounting/stock/count").set(a.auth).send({ items: [{ productId: tea.id, countedQuantity: 7 }, { productId: cake.id, countedQuantity: 4 }], note: "monthly" });
    expect(res.status).toBe(200);
    expect(res.body.changed).toEqual([{ id: tea.id, name: "Tea", before: 10, after: 7, difference: -3 }]);
    expect(res.body.unchanged).toBe(1);
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: tea.id } })).quantity).toBe(7);
    const moves = await request(app).get(`/accounting/products/${tea.id}/movements`).set(a.auth);
    expect(moves.body[0]).toMatchObject({ action: "ADJUSTMENT", quantity: 7 });
    expect(moves.body[0].note).toContain("10");
    expect((await request(app).get(`/accounting/products/${cake.id}/movements`).set(a.auth)).body.filter((m: { action: string }) => m.action === "ADJUSTMENT")).toHaveLength(0);
  });

  it("is private to the account", async () => {
    const a = await subscriber("stpriv");
    const b = await subscriber("stother");
    const tea = await product(a, { name: "Tea", quantity: 5 });
    expect((await request(app).get(`/accounting/products/${tea.id}/movements`).set(b.auth)).status).toBe(404);
    const res = await request(app).post("/accounting/stock/count").set(b.auth).send({ items: [{ productId: tea.id, countedQuantity: 0 }] });
    expect(res.body.skipped).toHaveLength(1);
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: tea.id } })).quantity).toBe(5);
  });

  it("tells the owner once when a sale takes a product down to its minimum", async () => {
    const a = await subscriber("stalert");
    const tea = await product(a, { name: "Tea", quantity: 5, lowStockAt: 2 });
    const notes = () => prisma.notification.count({ where: { userId: a.id, type: "SYSTEM" } });
    expect((await request(app).post(`/accounting/products/${tea.id}/sell`).set(a.auth).send({ quantity: 1 })).status).toBe(201); // 4 left: above the minimum
    expect(await notes()).toBe(0);
    expect((await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 2 }] })).status).toBe(201); // 2 left: reached it
    await new Promise((r) => setTimeout(r, 300));
    expect(await notes()).toBe(1);
    expect((await request(app).post(`/accounting/products/${tea.id}/sell`).set(a.auth).send({ quantity: 1 })).status).toBe(201); // 1 left: already under, no second alert
    await new Promise((r) => setTimeout(r, 300));
    expect(await notes()).toBe(1);
  });
});

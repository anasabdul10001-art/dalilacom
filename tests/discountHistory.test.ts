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
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Hist ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

describe("the history of confirmed discounts, for the shop and for the customer", () => {
  it("both see the same confirmed discounts; each sees only their own", async () => {
    const cat = await prisma.category.upsert({ where: { slug: "hist-test-cat" }, update: {}, create: { name: "Hist", slug: "hist-test-cat" } });
    const owner = await account("histshop", { role: "MERCHANT" });
    const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Hist Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
    expect(reg.status).toBe(201);
    await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
    const customer = await account("histcustomer");
    const stranger = await account("histstranger");
    const plan = await prisma.servicePlan.create({ data: { name: `Plan-${crypto.randomUUID()}`, durationDays: 30, priceCents: 0 } });
    expect((await request(app).post("/membership/subscribe").set(customer.auth).send({ planId: plan.id })).status).toBeLessThan(300);

    const fresh = async () => {
      await prisma.membership.updateMany({ where: { userId: customer.id }, data: { lastRedeemedTimeStep: null } });
      return (await request(app).get("/qr/mine").set(customer.auth)).body;
    };
    expect((await request(app).get("/qr/transactions/shop").set(owner.auth)).body).toMatchObject({ summary: { count: 0 }, items: [] });
    // the shop confirms two visits
    for (const bill of [10000, 5000]) {
      const code = await fresh();
      const res = await request(app).post("/qr/redeem").set(owner.auth).send({ ...code, billAmountCents: bill });
      expect(res.status).toBe(201);
    }

    const shop = (await request(app).get("/qr/transactions/shop").set(owner.auth)).body;
    expect(shop.summary.count).toBe(2);
    expect(shop.summary.billCents).toBe(15000);
    expect(shop.items).toHaveLength(2);
    expect(shop.items[0]).toMatchObject({ memberName: "Hist histcustomer" });
    const mine = (await request(app).get("/qr/transactions/mine").set(customer.auth)).body;
    expect(mine).toHaveLength(2);
    expect(mine.map((m: { transactionRef: string }) => m.transactionRef).sort()).toEqual(shop.items.map((i: { transactionRef: string }) => i.transactionRef).sort());
    // a stranger has nothing, and the customer is not a shop
    expect((await request(app).get("/qr/transactions/mine").set(stranger.auth)).body).toEqual([]);
    expect((await request(app).get("/qr/transactions/shop").set(customer.auth)).status).toBe(403);
    // either side opens the receipt of a confirmed discount; a stranger cannot
    const ref = shop.items[0].transactionRef;
    expect((await request(app).get(`/invoices/discount/${ref}`).set(owner.auth)).status).toBe(200);
    expect((await request(app).get(`/invoices/discount/${ref}`).set(customer.auth)).status).toBe(200);
    expect((await request(app).get(`/invoices/discount/${ref}`).set(stranger.auth)).status).toBe(404);
  });
});

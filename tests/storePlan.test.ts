import { describe, it, expect, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  process.env.STORE_PLAN = "off";
  await prisma.$disconnect();
});
beforeEach(() => {
  process.env.STORE_PLAN = "on";
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Sp ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "sp-test-cat" }, update: {}, create: { name: "Sp Test", slug: "sp-test-cat" } });
  const owner = await account("spshop", { role: "MERCHANT" });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Sp Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  return { owner, id: reg.body.id as string };
}
const plan = (name: string, priceCents: number, priceCredits: number | null, durationDays = 30) =>
  prisma.servicePlan.create({ data: { service: "MERCHANT_ACCOUNT", name: `${name} ${crypto.randomUUID().slice(0, 5)}`, durationDays, priceCents, currency: "EUR", priceCredits } });
const addProduct = (s: { owner: { auth: object } }) => request(app).post("/products").set(s.owner.auth).send({ name: "منتج تجريبي", priceCents: 1000, stock: 3 });

describe("the store opens when a plan is chosen", () => {
  it("a shop with no plan cannot add products; it sees the plans, chooses the free one, and then it can", async () => {
    const free = await plan("Free store", 0, null);
    const s = await shop();

    const me = (await request(app).get("/merchant/me").set(s.owner.auth)).body;
    expect(me.storePlan).toEqual({ required: true, active: false });
    const blocked = await addProduct(s);
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe("PLAN_REQUIRED");
    expect(blocked.body.error.message).toMatch(/[\u0600-\u06FF]/);

    const listed = (await request(app).get("/merchant/store-plans").set(s.owner.auth)).body;
    expect(listed).toMatchObject({ required: true, active: false, current: null });
    expect(listed.plans.find((p: { id: string }) => p.id === free.id)).toMatchObject({ free: true, priceCredits: 0, durationDays: 30 });

    const chosen = await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: free.id });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({ active: true, current: { id: free.id } });
    expect((await prisma.merchantProfile.findUnique({ where: { id: s.id } }))!.planEndsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    expect((await addProduct(s)).status).toBe(201);
  });

  it("a paid plan comes out of the wallet in the same step, and is refused without the money", async () => {
    const paid = await plan("Paid store", 500, 50, 60);
    const s = await shop();
    const poor = await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: paid.id });
    expect(poor.status).toBe(409);
    expect(poor.body.error.code).toBe("INSUFFICIENT_BALANCE");
    expect((await addProduct(s)).status).toBe(402);

    await prisma.wallet.upsert({ where: { userId: s.owner.id }, update: { balance: 70 }, create: { userId: s.owner.id, balance: 70 } });
    const ok = await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: paid.id });
    expect(ok.status).toBe(200);
    expect((await prisma.wallet.findUnique({ where: { userId: s.owner.id } }))!.balance).toBe(20);
    expect(await prisma.walletTransaction.findFirst({ where: { userId: s.owner.id, type: "SUBSCRIPTION" } })).toMatchObject({ amount: -50 });
    expect((await addProduct(s)).status).toBe(201);
  });

  it("only a store plan can be chosen, an unpriced one cannot, and an ended plan closes the store again", async () => {
    const unpriced = await plan("Unpriced store", 900, null);
    const s = await shop();
    const membership = await prisma.servicePlan.create({ data: { service: "MEMBERSHIP", name: `Card ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR" } });
    expect((await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: membership.id })).status).toBe(404);
    expect((await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: unpriced.id })).status).toBe(409);

    const free = await plan("Free again", 0, null);
    await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: free.id });
    expect((await addProduct(s)).status).toBe(201);
    await prisma.merchantProfile.update({ where: { id: s.id }, data: { planEndsAt: new Date(Date.now() - 1000) } });
    expect((await addProduct(s)).status).toBe(402);
    // renewing brings it back
    await request(app).post("/merchant/store-plans/subscribe").set(s.owner.auth).send({ planId: free.id });
    expect((await addProduct(s)).status).toBe(201);
  });

  it("the rule is off while the owner has set no store plan (or the switch is off)", async () => {
    process.env.STORE_PLAN = "off";
    const s = await shop();
    expect((await addProduct(s)).status).toBe(201);
  });
});

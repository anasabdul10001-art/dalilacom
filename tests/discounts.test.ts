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
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Disc ${prefix}` });
  expect(registered.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const admin = () => account("discadmin", { role: "ADMIN" });

async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "disc-test-cat" }, update: {}, create: { name: "Disc Test", slug: "disc-test-cat" } });
  const owner = await account("discshop");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Disc Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Disc product", priceCents: 1000, stock: 9, categoryId: cat.id });
  return { owner, id: reg.body.id as string, productId: product.body.id as string };
}

async function member() {
  const customer = await account("disccustomer");
  const plan = await prisma.servicePlan.create({ data: { name: `Plan-${crypto.randomUUID()}`, durationDays: 30, priceCents: 0 } });
  expect((await request(app).post("/membership/subscribe").set(customer.auth).send({ planId: plan.id })).status).toBeLessThan(300);
  return customer;
}

/** A fresh code of the member's card (the previous one is consumed by a redeem). */
async function code(customer: { id: string; auth: object }) {
  await prisma.membership.updateMany({ where: { userId: customer.id }, data: { lastRedeemedTimeStep: null } });
  return (await request(app).get("/qr/mine").set(customer.auth)).body as { memberNumber: string; code: string };
}

const redeem = async (s: Awaited<ReturnType<typeof shop>>, customer: { id: string; auth: object }, extra: object = {}) =>
  request(app).post("/qr/redeem").set(s.owner.auth).send({ ...(await code(customer)), billAmountCents: 10000, ...extra });
const verify = async (s: Awaited<ReturnType<typeof shop>>, customer: { id: string; auth: object }) =>
  request(app).post("/qr/verify").set(s.owner.auth).send(await code(customer));
const make = (s: Awaited<ReturnType<typeof shop>>, body: object) => request(app).post("/merchant/discounts").set(s.owner.auth).send({ title: "عرض", percent: 10, ...body });
const approve = async (id: string) => expect((await request(app).post(`/admin/discounts/${id}/approve`).set((await admin()).auth)).status).toBe(200);

describe("a new discount waits for the admin", () => {
  it("is not usable (or shown) until approved, and a refusal tells the shop why", async () => {
    const s = await shop();
    const c = await member();
    const made = await make(s, { title: "خصم الربيع", percent: 20, description: "لكل الزبائن" });
    expect(made.status).toBe(201);
    expect(made.body.status).toBe("PENDING");

    // not on the public page, not offered at the till
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts).toEqual([]);
    expect((await verify(s, c)).body.discounts).toEqual([]);
    const mine = await request(app).get("/merchant/discounts").set(s.owner.auth);
    expect(mine.body[0]).toMatchObject({ title: "خصم الربيع", state: "PENDING", uses: 0 });

    // the admin sees it with the shop's name, and refuses with a reason
    const a = await admin();
    const pending = await request(app).get("/admin/discounts").query({ status: "PENDING" }).set(a.auth);
    expect(pending.body.find((d: { id: string }) => d.id === made.body.id).merchant.businessName).toBeTruthy();
    expect((await request(app).post(`/admin/discounts/${made.body.id}/reject`).set(a.auth).send({ reason: "النسبة مبالغ فيها" })).status).toBe(200);
    const refused = (await request(app).get("/merchant/discounts").set(s.owner.auth)).body[0];
    expect(refused).toMatchObject({ state: "REJECTED", rejectionReason: "النسبة مبالغ فيها" });

    // an approved one is live: shown to everyone and offered at the till
    const ok = await make(s, { title: "خصم ثاني", percent: 15 });
    await approve(ok.body.id);
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts[0]).toMatchObject({ title: "خصم ثاني", percent: 15 });
    expect((await verify(s, c)).body.discounts[0]).toMatchObject({ title: "خصم ثاني", eligible: true });
  });

  it("checks what the form chose: dates, section, products of the shop only, percent", async () => {
    const s = await shop();
    const other = await shop();
    const day = 86400000;
    expect((await make(s, { percent: 0 })).status).toBe(400);
    expect((await make(s, { percent: 101 })).status).toBe(400);
    expect((await make(s, { endDate: new Date(Date.now() - day).toISOString() })).status).toBe(400);
    expect((await make(s, { startDate: new Date(Date.now() + 3 * day).toISOString(), endDate: new Date(Date.now() + day).toISOString() })).status).toBe(400);
    expect((await make(s, { scope: "SECTION", scopeSection: "" })).status).toBe(400); // a section must be named
    expect((await make(s, { scope: "SECTION" })).status).toBe(400);
    expect((await make(s, { scope: "PRODUCTS", productIds: [] })).status).toBe(400);
    expect((await make(s, { scope: "PRODUCTS", productIds: [other.productId] })).status).toBe(400); // someone else's product
    const typed = await make(s, { scope: "SECTION", scopeSection: "  ملابس رجالية " }); // the shop types the section in its own words
    expect(typed.status).toBe(201);
    expect(typed.body.scopeSection).toBe("ملابس رجالية");
    expect((await make(s, { scope: "PRODUCTS", productIds: [s.productId] })).status).toBe(201);
  });

  it("starts on its start date: scheduled before it, live after, and ended after its end date", async () => {
    const s = await shop();
    const day = 86400000;
    const later = await make(s, { startDate: new Date(Date.now() + 2 * day).toISOString() });
    await approve(later.body.id);
    expect((await request(app).get("/merchant/discounts").set(s.owner.auth)).body[0].state).toBe("SCHEDULED");
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts).toEqual([]);
    await prisma.discount.update({ where: { id: later.body.id }, data: { startDate: new Date(Date.now() - day) } });
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts.length).toBe(1);
    await prisma.discount.update({ where: { id: later.body.id }, data: { endDate: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/merchant/discounts").set(s.owner.auth)).body[0].state).toBe("ENDED");
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts).toEqual([]);
  });
});

describe("the shop's limits", () => {
  it("lets each customer have it only so many times", async () => {
    const s = await shop();
    const c = await member();
    const d = await make(s, { percent: 10, perCustomerLimit: 2 });
    await approve(d.body.id);
    expect((await redeem(s, c)).status).toBe(201);
    const second = await redeem(s, c);
    expect(second.status).toBe(201);
    expect(second.body.discountPercent).toBe(10);
    const third = await redeem(s, c);
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe("LIMIT_REACHED");
    const seen = (await verify(s, c)).body.discounts[0];
    expect(seen).toMatchObject({ eligible: false, usedByMember: 2, remainingForMember: 0 });
    // the member sees on the shop page how many times are left; a visitor does not
    expect((await request(app).get(`/merchant/${s.id}`).set(c.auth)).body.discounts[0]).toMatchObject({ perCustomerLimit: 2, myTimesLeft: 0 });
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts[0].myTimesLeft).toBeNull();
  });

  it("lets only so many different people have it", async () => {
    const s = await shop();
    const first = await member();
    const second = await member();
    const d = await make(s, { percent: 10, maxCustomers: 1 });
    await approve(d.body.id);
    expect((await redeem(s, first)).status).toBe(201);
    expect((await redeem(s, first)).status).toBe(201); // the same person again is fine (no per-person limit set)
    const blocked = await redeem(s, second);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("LIMIT_REACHED");
    expect((await verify(s, second)).body.discounts[0].eligible).toBe(false);
    // everyone can see how many places are left, on the shop page and in the list
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts[0]).toMatchObject({ maxCustomers: 1, peopleLeft: 0 });
    const listed = (await request(app).get("/merchant?q=" + encodeURIComponent("Disc Shop"))).body.find((m: { id: string }) => m.id === s.id);
    expect(listed.discounts[0].peopleLeft).toBe(0);
  });

  it("applies the discount the shop picks, or the best one the member may still take", async () => {
    const s = await shop();
    const c = await member();
    const small = await make(s, { title: "صغير", percent: 10 });
    const big = await make(s, { title: "كبير", percent: 30, perCustomerLimit: 1 });
    await approve(small.body.id);
    await approve(big.body.id);
    const v = await verify(s, c);
    expect(v.body.discounts.map((x: { percent: number }) => x.percent)).toEqual([30, 10]);

    const picked = await redeem(s, c, { discountId: small.body.id });
    expect(picked.body.discountPercent).toBe(10);
    const best = await redeem(s, c);
    expect(best.body.discountPercent).toBe(30);
    const after = await redeem(s, c); // the 30% is used up for this person, the 10% still works
    expect(after.body.discountPercent).toBe(10);
    expect((await redeem(s, c, { discountId: crypto.randomUUID() })).status).toBe(400);
  });
});

describe("the shop looks after its discounts", () => {
  it("pauses and ends at once, sends changed terms to the admin again, and removes an unused one", async () => {
    const s = await shop();
    const c = await member();
    const d = await make(s, { percent: 10 });
    await approve(d.body.id);

    expect((await request(app).patch(`/merchant/discounts/${d.body.id}`).set(s.owner.auth).send({ isActive: false })).status).toBe(200);
    expect((await request(app).get("/merchant/discounts").set(s.owner.auth)).body[0].state).toBe("PAUSED");
    expect((await verify(s, c)).body.discounts).toEqual([]);
    await request(app).patch(`/merchant/discounts/${d.body.id}`).set(s.owner.auth).send({ isActive: true });
    expect((await request(app).get("/merchant/discounts").set(s.owner.auth)).body[0].state).toBe("LIVE");

    const edited = await request(app).patch(`/merchant/discounts/${d.body.id}`).set(s.owner.auth).send({ percent: 25 });
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe("PENDING"); // new terms need a new approval
    expect((await request(app).get(`/merchant/${s.id}`)).body.discounts).toEqual([]);
    await approve(d.body.id);
    await redeem(s, c);

    // one that was used stays in the history (switched off); an unused one is removed
    expect((await request(app).delete(`/merchant/discounts/${d.body.id}`).set(s.owner.auth)).status).toBe(200);
    expect((await prisma.discount.findUnique({ where: { id: d.body.id } }))?.isActive).toBe(false);
    const unused = await make(s, { percent: 5 });
    expect((await request(app).delete(`/merchant/discounts/${unused.body.id}`).set(s.owner.auth)).status).toBe(200);
    expect(await prisma.discount.findUnique({ where: { id: unused.body.id } })).toBeNull();

    // ending now
    const ending = await make(s, { percent: 8 });
    await approve(ending.body.id);
    await request(app).patch(`/merchant/discounts/${ending.body.id}`).set(s.owner.auth).send({ endNow: true });
    expect((await request(app).get("/merchant/discounts").set(s.owner.auth)).body.find((x: { id: string }) => x.id === ending.body.id).state).toBe("ENDED");
  });

  it("shows customers what a discount covers and until when", async () => {
    const s = await shop();
    const d = await make(s, { title: "على المنتج", percent: 12, scope: "PRODUCTS", productIds: [s.productId], description: "لمدة محدودة", perCustomerLimit: 3, endDate: new Date(Date.now() + 5 * 86400000).toISOString() });
    await approve(d.body.id);
    const shown = (await request(app).get(`/merchant/${s.id}`)).body.discounts[0];
    expect(shown).toMatchObject({ scope: "PRODUCTS", productNames: ["Disc product"], description: "لمدة محدودة", perCustomerLimit: 3 });
    expect(shown.endDate).toBeTruthy();
    const sec = await make(s, { title: "قسم", percent: 9, scope: "SECTION", scopeSection: "fashion" });
    await approve(sec.body.id);
    const fashion = (await request(app).get(`/merchant/${s.id}`)).body.discounts.find((x: { title: string }) => x.title === "قسم");
    expect(fashion.section).toMatchObject({ id: "fashion", nameEn: "Fashion" });
    const own = await make(s, { title: "قسم حر", percent: 7, scope: "SECTION", scopeSection: "أحذية رياضية" });
    await approve(own.body.id);
    const mine = (await request(app).get(`/merchant/${s.id}`)).body.discounts.find((x: { title: string }) => x.title === "قسم حر");
    expect(mine.section).toMatchObject({ name: "أحذية رياضية" });
  });

  it("is for shops only; only the admin approves", async () => {
    const s = await shop();
    const customer = await account("disccust2");
    expect((await request(app).post("/merchant/discounts").set(customer.auth).send({ title: "x", percent: 5 })).status).toBe(403);
    const d = await make(s, { percent: 5 });
    expect((await request(app).post(`/admin/discounts/${d.body.id}/approve`).set(s.owner.auth)).status).toBe(403);
  });
});

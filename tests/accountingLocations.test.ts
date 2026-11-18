import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => { await prisma.$disconnect(); });

const password = "correct-horse-battery-staple";
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Loc ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
async function owner(prefix: string) {
  const a = await account(prefix);
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Loc plan ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: a.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  return a;
}
async function staffMember(boss: { id: string; auth: object }, role: string, name: string) {
  const worker = await account("locw");
  const id = (await request(app).post("/business-staff").set(boss.auth).send({ name, role, salesRateBp: 0 })).body.id;
  const code = (await request(app).post(`/business-staff/${id}/invite`).set(boss.auth)).body.code;
  expect((await request(app).post("/business-staff/accept").set(worker.auth).send({ code })).status).toBe(200);
  return { id, as: { ...worker.auth, "X-Business-Owner": boss.id } };
}
const tea = (boss: { auth: object }) => request(app).post("/accounting/products").set(boss.auth).send({ name: "Tea", costCents: 100, salePriceCents: 1000, quantity: 20, currency: "EUR" }).then((r) => r.body);
const place = (boss: { auth: object }, body: Record<string, unknown>) => request(app).post("/accounting/locations").set(boss.auth).send(body).then((r) => r.body);
const stockOf = async (id: string) => (await prisma.accountingProduct.findUniqueOrThrow({ where: { id } })).quantity;

describe("accounting: goods at branches and distributors", () => {
  it("giving goods out takes them from the main store, and returning puts them back", async () => {
    const boss = await owner("locgive");
    const p = await tea(boss);
    const shop = await place(boss, { name: "Branch 2", kind: "BRANCH" });
    expect((await request(app).post(`/accounting/locations/${shop.id}/give`).set(boss.auth).send({ productId: p.id, quantity: 5 })).status).toBe(201);
    expect(await stockOf(p.id)).toBe(15);
    expect((await request(app).post(`/accounting/locations/${shop.id}/give`).set(boss.auth).send({ productId: p.id, quantity: 99 })).status).toBe(409);
    expect((await request(app).post(`/accounting/locations/${shop.id}/return`).set(boss.auth).send({ productId: p.id, quantity: 2 })).status).toBe(200);
    expect(await stockOf(p.id)).toBe(17);
    expect((await request(app).post(`/accounting/locations/${shop.id}/return`).set(boss.auth).send({ productId: p.id, quantity: 9 })).status).toBe(409);
    const list = (await request(app).get("/accounting/locations").set(boss.auth)).body;
    expect(list[0]).toMatchObject({ name: "Branch 2", onHandUnits: 3, soldUnits: 0 });
    expect(list[0].items[0]).toMatchObject({ given: 5, returned: 2, onHand: 3, sold: 0 });
    // a location holding goods cannot be switched off
    expect((await request(app).patch(`/accounting/locations/${shop.id}`).set(boss.auth).send({ isActive: false })).status).toBe(409);
  });

  it("a sale from a location uses that location's goods only, and the overview adds up", async () => {
    const boss = await owner("locsale");
    const p = await tea(boss);
    const van = await place(boss, { name: "Van 1", kind: "DISTRIBUTOR" });
    await request(app).post(`/accounting/locations/${van.id}/give`).set(boss.auth).send({ productId: p.id, quantity: 6 });
    const sold = await request(app).post("/accounting/sales").set(boss.auth).send({ items: [{ productId: p.id, quantity: 4 }], locationId: van.id });
    expect(sold.status).toBe(201);
    expect(sold.body).toMatchObject({ channel: "DISTRIBUTOR", locationId: van.id });
    expect(await stockOf(p.id)).toBe(14); // the main store is untouched by the sale
    expect((await request(app).post("/accounting/sales").set(boss.auth).send({ items: [{ productId: p.id, quantity: 3 }], locationId: van.id })).status).toBe(409); // only 2 left on the van
    const overview = (await request(app).get("/accounting/stock/overview").set(boss.auth)).body;
    expect(overview.find((x: { productId: string }) => x.productId === p.id)).toMatchObject({ inMainStore: 14, distributed: 2, sold: 4 });
    // the customer brings 1 back: it returns to the van, not the main store
    const line = sold.body.lines[0].id;
    expect((await request(app).post(`/accounting/sales/${sold.body.id}/returns`).set(boss.auth).send({ items: [{ lineId: line, quantity: 1 }] })).status).toBe(201);
    expect(await stockOf(p.id)).toBe(14);
    const stock = await prisma.accountingLocationStock.findFirstOrThrow({ where: { locationId: van.id } });
    expect(stock).toMatchObject({ onHand: 3, sold: 3, given: 6 });
  });

  it("a distributor sells only from his own location; who may hand goods out follows the role", async () => {
    const boss = await owner("locstaff");
    const p = await tea(boss);
    const dist = await staffMember(boss, "CASHIER", "Distributor");
    const keeper = await staffMember(boss, "STOCK", "Keeper");
    const van = await place(boss, { name: "Van A", kind: "DISTRIBUTOR", staffId: dist.id });
    const other = await place(boss, { name: "Van B", kind: "DISTRIBUTOR" });
    // a stock keeper may hand goods out; a cashier may not
    expect((await request(app).post(`/accounting/locations/${van.id}/give`).set(keeper.as).send({ productId: p.id, quantity: 5 })).status).toBe(201);
    expect((await request(app).post(`/accounting/locations/${van.id}/give`).set(dist.as).send({ productId: p.id, quantity: 1 })).status).toBe(403);
    await request(app).post(`/accounting/locations/${other.id}/give`).set(boss.auth).send({ productId: p.id, quantity: 5 });
    // he sees only his own van and sells from it even when he names another
    expect((await request(app).get("/accounting/locations").set(dist.as)).body.map((x: { name: string }) => x.name)).toEqual(["Van A"]);
    const s = await request(app).post("/accounting/sales").set(dist.as).send({ items: [{ productId: p.id, quantity: 2 }], locationId: other.id });
    expect(s.status).toBe(201);
    expect(s.body.locationId).toBe(van.id);
    expect((await prisma.accountingLocationStock.findFirstOrThrow({ where: { locationId: other.id } })).onHand).toBe(5);
    // and the shop's own sale from the main store still works for the owner
    expect((await request(app).post("/accounting/sales").set(boss.auth).send({ items: [{ productId: p.id, quantity: 1 }], channel: "WHOLESALE" })).body.channel).toBe("WHOLESALE");
  });
});

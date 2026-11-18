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

  it("the merchant decides how many units the online store offers; they leave the warehouse and the two always add up", async () => {
    const boss = await owner("locstore");
    const p = await tea(boss);
    const category = await prisma.category.findFirstOrThrow();
    await prisma.user.update({ where: { id: boss.id }, data: { role: "MERCHANT" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: boss.id, businessName: "Store", categoryId: category.id, approvalStatus: "APPROVED", address: "x", phone: "1", latitude: 1, longitude: 2 } });
    const listing = await prisma.product.create({ data: { merchantId: shop.id, name: "Tea online", priceCents: 1200, stock: 0 } });
    const share = (quantity: number) => request(app).post(`/accounting/products/${p.id}/store`).set(boss.auth).send({ storeProductId: listing.id, quantity });
    const storeStock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: listing.id } })).stock;
    expect((await share(8)).status).toBe(200);
    expect(await stockOf(p.id)).toBe(12);
    expect(await storeStock()).toBe(8);
    expect((await share(99)).status).toBe(409); // the warehouse does not have that much
    expect((await share(3)).status).toBe(200); // lowering it sends units back to the warehouse
    expect(await stockOf(p.id)).toBe(17);
    expect(await storeStock()).toBe(3);
    // the linked listing is no longer a second product in accounting; it shows on its own product
    const list = (await request(app).get("/accounting/products").set(boss.auth)).body;
    expect(list.find((x: { id: string }) => x.id === `store:${listing.id}`)).toBeUndefined();
    expect(list.find((x: { id: string }) => x.id === p.id)).toMatchObject({ storeProductId: listing.id, storeUnits: 3 });
    const ov = (await request(app).get("/accounting/stock/overview").set(boss.auth)).body.find((x: { productId: string }) => x.productId === p.id);
    expect(ov).toMatchObject({ inMainStore: 17, inOnlineStore: 3 });
    // the store page cannot change the quantity of a linked listing by itself
    expect((await request(app).patch(`/products/${listing.id}`).set(boss.auth).send({ stock: 50 })).status).toBe(409);
    // unlinking brings the store's units back to the warehouse and frees the listing
    expect((await request(app).post(`/accounting/products/${p.id}/store/unlink`).set(boss.auth).send({})).status).toBe(200);
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: p.id } })).quantity).toBe(20);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ stock: 0, accountingProductId: null });
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

  it("settlement: a distributor's cash is held until handed over; the report shows sales per seller and channel", async () => {
    const boss = await owner("locsettle");
    const p = await tea(boss);
    const dist = await staffMember(boss, "CASHIER", "Ali");
    const van = await place(boss, { name: "Van S", kind: "DISTRIBUTOR", staffId: dist.id });
    await request(app).post(`/accounting/locations/${van.id}/give`).set(boss.auth).send({ productId: p.id, quantity: 6 });
    expect((await request(app).post("/accounting/sales").set(dist.as).send({ items: [{ productId: p.id, quantity: 4 }] })).status).toBe(201); // 4 x 1000 in cash
    const st = (await request(app).get(`/accounting/locations/${van.id}/settlement`).set(boss.auth)).body;
    expect(st.currencies[0]).toMatchObject({ soldCents: 4000, cashCents: 4000, handedOverCents: 0, heldCents: 4000 });
    expect(st.goods[0].onHand).toBe(2);
    // the distributor may look but not receive money
    expect((await request(app).get(`/accounting/locations/${van.id}/settlement`).set(dist.as)).status).toBe(200);
    expect((await request(app).post(`/accounting/locations/${van.id}/handover`).set(dist.as).send({ currency: "EUR", amountCents: 100 })).status).toBe(403);
    const ok = await request(app).post(`/accounting/locations/${van.id}/handover`).set(boss.auth).send({ currency: "EUR", amountCents: 3000 });
    expect(ok.status).toBe(201);
    expect(ok.body.currencies[0]).toMatchObject({ handedOverCents: 3000, heldCents: 1000 });
    expect((await request(app).post(`/accounting/locations/${van.id}/handover`).set(boss.auth).send({ currency: "EUR", amountCents: 2000 })).status).toBe(409);
    // the shop's cash box counts only what is really in the box: 4000 sold by the distributor, 3000 of it handed over
    const box = (await request(app).get("/accounting/cash").query({ currency: "EUR" }).set(boss.auth)).body;
    expect(box).toMatchObject({ cashInCents: 4000, withDistributorsCents: 4000, handedOverCents: 3000, expectedCents: 3000 });
    // the owner also sells in the shop and a delivered online order counts as its own channel
    await request(app).post("/accounting/sales").set(boss.auth).send({ items: [{ productId: p.id, quantity: 1 }] });
    await prisma.user.update({ where: { id: boss.id }, data: { role: "MERCHANT" } });
    const category = await prisma.category.findFirstOrThrow();
    const shop = await prisma.merchantProfile.create({ data: { userId: boss.id, businessName: "S", categoryId: category.id, approvalStatus: "APPROVED", address: "x", phone: "1", latitude: 1, longitude: 2 } });
    const buyer = await account("locbuyer");
    await prisma.order.create({ data: { orderNumber: `T-${Date.now()}`, userId: buyer.id, merchantId: shop.id, status: "DELIVERED", subtotalCents: 5000, totalCents: 5000 } });
    const rep = (await request(app).get("/accounting/reports/sellers").set(boss.auth)).body;
    const ch = (name: string) => rep.channels.find((c: { channel: string }) => c.channel === name);
    expect(ch("DISTRIBUTOR")).toMatchObject({ count: 1, totalCents: 4000 });
    expect(ch("SHOP")).toMatchObject({ count: 1, totalCents: 1000 });
    expect(ch("ONLINE")).toMatchObject({ count: 1, totalCents: 5000 });
    const ali = rep.sellers.find((x: { name: string | null }) => x.name === "Ali");
    expect(ali).toMatchObject({ count: 1, totalCents: 4000, cashHeldCents: 1000 });
    // a location still holding cash cannot be deleted; after the handover it goes, its goods return and the sale stays
    expect((await request(app).delete(`/accounting/locations/${van.id}`).set(boss.auth)).status).toBe(409);
    expect((await request(app).post(`/accounting/locations/${van.id}/handover`).set(boss.auth).send({ currency: "EUR", amountCents: 1000 })).status).toBe(201);
    expect((await request(app).delete(`/accounting/locations/${van.id}`).set(boss.auth)).status).toBe(200);
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: p.id } })).quantity).toBe(15);
    expect(await prisma.accountingLocation.count({ where: { id: van.id } })).toBe(0);
    expect(await prisma.accountingSale.count({ where: { userId: boss.id, locationId: null, channel: "DISTRIBUTOR" } })).toBe(1);
    expect(rep.sellers.find((x: { isOwner: boolean }) => x.isOwner)).toMatchObject({ count: 1, totalCents: 1000 });
    // a cashier cannot read the report
    expect((await request(app).get("/accounting/reports/sellers").set(dist.as)).status).toBe(403);
  });
});

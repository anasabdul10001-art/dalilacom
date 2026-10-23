import { describe, it, expect, afterAll, beforeAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

// Syria's market currency is a per-country setting: these tests run it in lira (the new way) and in dollars (how it is today)
let before: { id: string; currencyCode: string } | null = null;
async function marketIs(code: string) {
  const row = await prisma.country.findUnique({ where: { isoCode2: "SY" } });
  if (row) await prisma.country.update({ where: { id: row.id }, data: { currencyCode: code } });
  else await prisma.country.create({ data: { name: "Syria", isoCode2: "SY", currencyCode: code, defaultLanguage: "ar" } });
}
beforeAll(async () => {
  before = await prisma.country.findUnique({ where: { isoCode2: "SY" }, select: { id: true, currencyCode: true } });
  await marketIs("SYP");
});
afterAll(async () => {
  if (before) await prisma.country.update({ where: { id: before.id }, data: { currencyCode: before.currencyCode } });
  else await prisma.country.deleteMany({ where: { isoCode2: "SY", currencyCode: { in: ["SYP", "USD"] } } }).catch(() => {});
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Price ${prefix}`, countryCode: "SY" })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "price-test-cat" }, update: {}, create: { name: "Price Test", slug: "price-test-cat" } });
  const owner = await account("priceshop");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Price Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  return { owner, id: reg.body.id as string };
}
const add = (s: { owner: { auth: Record<string, string> } }, body: Record<string, unknown>) => request(app).post("/products").set(s.owner.auth).send({ name: "Price product", stock: 5, ...body });
const setPricing = (s: { owner: { auth: Record<string, string> } }, body: Record<string, unknown>) => request(app).put("/merchant/pricing").set(s.owner.auth).send(body);
const stored = (id: string) => prisma.product.findUniqueOrThrow({ where: { id } });
const shown = (id: string) => request(app).get(`/store/products/${id}`).set("CF-IPCountry", "SY");

describe("one pricing setting for the whole shop (Syria prices in lira or dollars)", () => {
  it("a shop that sets nothing prices in the market money exactly as before", async () => {
    const s = await shop();
    const p = await add(s, { priceCents: 5000, memberDiscountEnabled: true, memberPriceCents: 4000 });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ priceCents: 5000, memberPriceCents: 4000, enteredPriceCents: null });
    expect((await shown(p.body.id)).body).toMatchObject({ displayCurrency: "SYP", altCurrency: "USD", altPriceCents: null });
  });

  it("pricing in dollars needs the shop's dollar rate first", async () => {
    const s = await shop();
    const refused = await setPricing(s, { priceCurrency: "USD" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("USD_RATE_REQUIRED");
    expect((await setPricing(s, { showBothCurrencies: true })).status).toBe(400); // both needs a rate too
  });

  it("every price the shop writes afterwards is in its money, converted with its rate", async () => {
    const s = await shop();
    expect((await setPricing(s, { priceCurrency: "USD", usdRateSyp: 15000 })).body).toMatchObject({ priceCurrency: "USD", usdRateSyp: 15000, showBothCurrencies: false });
    const p = await add(s, { priceCents: 200, memberDiscountEnabled: true, memberPriceCents: 150 });
    expect(p.body).toMatchObject({ priceCents: 3_000_000, memberPriceCents: 2_250_000, enteredPriceCents: 200, enteredMemberPriceCents: 150 });
    const view = (await shown(p.body.id)).body;
    expect(view).toMatchObject({ priceCents: 3_000_000, displayCurrency: "USD", altCurrency: "USD", altPriceCents: 200, altMemberPriceCents: 150 });
    const edited = await request(app).patch(`/products/${p.body.id}`).set(s.owner.auth).send({ priceCents: 300 });
    expect(edited.body).toMatchObject({ priceCents: 4_500_000, enteredPriceCents: 300, enteredMemberPriceCents: 150 });
  });

  it("showing both is one switch next to the rate", async () => {
    const s = await shop();
    const p = await add(s, { priceCents: 3_000_000 });
    await setPricing(s, { usdRateSyp: 15000, showBothCurrencies: true });
    expect((await shown(p.body.id)).body).toMatchObject({ displayCurrency: "BOTH", altCurrency: "USD", altPriceCents: 200 });
  });

  it("a new rate reprices every product at once, nobody edits them one by one", async () => {
    const s = await shop();
    await setPricing(s, { priceCurrency: "USD", usdRateSyp: 10000 });
    const a = await add(s, { priceCents: 100 });
    const b = await add(s, { priceCents: 250, memberDiscountEnabled: true, memberPriceCents: 200 });
    expect((await setPricing(s, { usdRateSyp: 20000 })).status).toBe(200);
    expect(await stored(a.body.id)).toMatchObject({ priceCents: 2_000_000, enteredPriceCents: 100 });
    expect(await stored(b.body.id)).toMatchObject({ priceCents: 5_000_000, memberPriceCents: 4_000_000, enteredPriceCents: 250 });
  });

  it("changing the shop's money keeps what every product is worth", async () => {
    const s = await shop();
    const lira = await add(s, { priceCents: 3_000_000 });
    expect((await setPricing(s, { priceCurrency: "USD", usdRateSyp: 15000 })).status).toBe(200);
    expect(await stored(lira.body.id)).toMatchObject({ priceCents: 3_000_000, enteredPriceCents: 200 }); // 30,000 lira is 2 dollars
    expect((await setPricing(s, { priceCurrency: "SYP" })).status).toBe(200);
    expect(await stored(lira.body.id)).toMatchObject({ priceCents: 3_000_000, enteredPriceCents: null });
  });

  it("the rate cannot be removed while the shop's prices depend on it", async () => {
    const s = await shop();
    await setPricing(s, { priceCurrency: "USD", usdRateSyp: 10000 });
    const res = await setPricing(s, { usdRateSyp: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("USD_RATE_REQUIRED");
  });

  it("the cart and the order are charged in the market money", async () => {
    const s = await shop();
    await setPricing(s, { priceCurrency: "USD", usdRateSyp: 10000 });
    const p = await add(s, { priceCents: 100 });
    const customer = await account("pricecust");
    await request(app).post("/cart/items").set(customer.auth).send({ productId: p.body.id, quantity: 2 });
    const checkout = await request(app).post("/cart/checkout").set(customer.auth).send({});
    expect(checkout.status).toBe(201);
    expect(checkout.body[0].totalCents).toBe(2_000_000);
  });

  it("only the shop's own pricing can be set, and only sensible values", async () => {
    const s = await shop();
    expect((await setPricing(s, { usdRateSyp: 0 })).status).toBe(400);
    expect((await setPricing(s, { priceCurrency: "EUR" })).status).toBe(400);
    const customer = await account("pricestranger");
    expect((await request(app).put("/merchant/pricing").set(customer.auth).send({ usdRateSyp: 1 })).status).toBe(403);
  });
});

describe("the same setting while Syria is still priced in dollars", () => {
  beforeAll(async () => {
    await marketIs("USD");
  });
  afterAll(async () => {
    await marketIs("SYP");
  });

  it("a shop that writes in lira is converted to dollars, and a new rate reprices everything", async () => {
    const s = await shop();
    expect((await setPricing(s, { priceCurrency: "SYP" })).status).toBe(400); // lira is not the market money, so it needs the rate
    expect((await setPricing(s, { priceCurrency: "SYP", usdRateSyp: 15000, showBothCurrencies: true })).status).toBe(200);
    const p = await add(s, { priceCents: 3_000_000 });
    expect(p.body).toMatchObject({ priceCents: 200, enteredPriceCents: 3_000_000 });
    expect((await shown(p.body.id)).body).toMatchObject({ currency: "USD", priceCents: 200, displayCurrency: "BOTH", altCurrency: "SYP", altPriceCents: 3_000_000 });
    await setPricing(s, { usdRateSyp: 30000 });
    expect((await stored(p.body.id)).priceCents).toBe(100);
  });

  it("a shop that writes in dollars keeps them as they are and can show the lira next to them", async () => {
    const s = await shop();
    await setPricing(s, { usdRateSyp: 15000, showBothCurrencies: true });
    const p = await add(s, { priceCents: 500 });
    expect(p.body).toMatchObject({ priceCents: 500, enteredPriceCents: null });
    expect((await shown(p.body.id)).body).toMatchObject({ priceCents: 500, displayCurrency: "BOTH", altCurrency: "SYP", altPriceCents: 7_500_000 });
  });
});

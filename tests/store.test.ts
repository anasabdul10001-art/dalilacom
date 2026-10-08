import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Role } from "@prisma/client";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

// Two approved shops in different countries, one product each.
let syProduct: string;
let deProduct: string;
let noCountryProduct: string;
const tag = crypto.randomUUID().slice(0, 8);

async function shop(country: string | null, name: string, place: { cityId?: string; lat?: number; lng?: number } = {}) {
  const category = (await prisma.category.findFirst()) ?? (await prisma.category.create({ data: { name: "t", slug: `t-${tag}` } }));
  const user = await prisma.user.create({ data: { email: uniqueEmail("store"), passwordHash: "x", fullName: name, role: Role.MERCHANT, countryCode: country, cityId: place.cityId } });
  const merchant = await prisma.merchantProfile.create({ data: { userId: user.id, businessName: name, categoryId: category.id, latitude: place.lat, longitude: place.lng, approvalStatus: "APPROVED" } });
  const product = await prisma.product.create({
    data: { merchantId: merchant.id, name: `${name} product`, priceCents: 1000, stock: 5, storeSection: "electronics", icon: "📱" },
  });
  return product.id;
}

beforeAll(async () => {
  syProduct = await shop("SY", `سوري ${tag}`);
  deProduct = await shop("DE", `German ${tag}`);
  noCountryProduct = await shop(null, `بلا بلد ${tag}`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const names = (res: request.Response) => res.body.items.map((p: { id: string }) => p.id);
const list = (country: string) => request(app).get("/store/products").query({ limit: 60 }).set("CF-IPCountry", country);

describe("the store only shows a shopper their own country's shops", () => {
  it("a visitor connecting from Syria sees Syria's shops (and the shops with no country set), not Germany's", async () => {
    const res = await list("SY");
    expect(res.status).toBe(200);
    expect(names(res)).toContain(syProduct);
    expect(names(res)).toContain(noCountryProduct);
    expect(names(res)).not.toContain(deProduct);
  });

  it("a visitor from Germany sees only Germany's shops", async () => {
    const res = await list("DE");
    expect(names(res)).toContain(deProduct);
    expect(names(res)).not.toContain(syProduct);
    expect(names(res)).not.toContain(noCountryProduct);
  });

  it("the account's own country wins over where it connects from", async () => {
    const email = uniqueEmail("shopper");
    const password = "Passw0rd!x";
    await request(app).post("/auth/register").send({ email, password, fullName: "Shopper", countryCode: "DE" });
    const login = await request(app).post("/auth/login").send({ email, password });
    const res = await request(app).get("/store/products").query({ limit: 60 }).set("CF-IPCountry", "SY").set("Authorization", `Bearer ${login.body.token}`);
    expect(names(res)).toContain(deProduct);
    expect(names(res)).not.toContain(syProduct);
  });

  it("the home page and the sections are scoped the same way, and another country's product is not found", async () => {
    const home = await request(app).get("/store/home").set("CF-IPCountry", "DE");
    expect(home.body.country).toBe("DE");
    expect(home.body.newest.map((p: { id: string }) => p.id)).not.toContain(syProduct);
    expect((await request(app).get(`/store/products/${syProduct}`).set("CF-IPCountry", "DE")).status).toBe(404);
    expect((await request(app).get(`/store/products/${deProduct}`).set("CF-IPCountry", "DE")).status).toBe(200);
  });

  it("a visitor whose country cannot be told is treated as the platform's first country", async () => {
    const res = await request(app).get("/store/home");
    expect(res.body.country).toBe("SY");
  });

  it("can be narrowed to one city, or to the shops within some kilometres of the shopper", async () => {
    const country = await prisma.country.upsert({ where: { isoCode2: "XT" }, update: {}, create: { name: "Test Country", isoCode2: "XT", currencyCode: "TST", defaultLanguage: "en" } });
    const cityA = await prisma.geoUnit.create({ data: { countryId: country.id, level: "CITY", name: `A ${tag}` } });
    const cityB = await prisma.geoUnit.create({ data: { countryId: country.id, level: "CITY", name: `B ${tag}` } });
    const inA = await shop("QQ", `shop A ${tag}`, { cityId: cityA.id, lat: 33.51, lng: 36.27 });
    const inB = await shop("QQ", `shop B ${tag}`, { cityId: cityB.id, lat: 36.2, lng: 37.13 });
    const get = (q: object) => request(app).get("/store/products").query({ limit: 60, ...q }).set("CF-IPCountry", "QQ");

    expect(names(await get({}))).toEqual(expect.arrayContaining([inA, inB]));

    const city = names(await get({ scope: "city", cityId: cityA.id }));
    expect(city).toContain(inA);
    expect(city).not.toContain(inB);

    const near = names(await get({ scope: "radius", lat: 33.52, lng: 36.28, radiusKm: 5 }));
    expect(near).toContain(inA);
    expect(near).not.toContain(inB);
    expect(names(await get({ scope: "radius", lat: 33.52, lng: 36.28, radiusKm: 500 }))).toEqual(expect.arrayContaining([inA, inB]));
  });

  it("prices are in the money of the shopper's country", async () => {
    await prisma.country.upsert({ where: { isoCode2: "QQ" }, update: { currencyCode: "QQD" }, create: { name: `Q ${tag}`, isoCode2: "QQ", currencyCode: "QQD" } });
    const market = await request(app).get("/geo/market").set("CF-IPCountry", "QQ");
    expect(market.body).toEqual({ country: "QQ", currencyCode: "QQD" });
    expect((await request(app).get("/store/home").set("CF-IPCountry", "QQ")).body.currency).toBe("QQD");
    expect((await request(app).get("/store/products").set("CF-IPCountry", "QQ")).body.currency).toBe("QQD");
    // a country nobody configured falls back to euros
    expect((await request(app).get("/geo/market").set("CF-IPCountry", "ZY")).body.currencyCode).toBe("EUR");
  });

  it("can list only the products that have a member price", async () => {
    const res = await request(app).get("/store/products").query({ deals: "1", limit: 60 }).set("CF-IPCountry", "SY");
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { memberDiscountEnabled: boolean }) => p.memberDiscountEnabled)).toBe(true);
  });
});

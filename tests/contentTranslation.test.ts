import { describe, it, expect, afterAll, vi, beforeEach } from "vitest";
import crypto from "crypto";
import request from "supertest";

// The AI is replaced by a tiny dictionary so the tests are fast and do not need a key.
const calls: string[][] = [];
const DICT: Record<string, Record<string, string>> = {
  English: { "فستان صيفي خفيف": "Light summer dress", "قماش قطن ١٠٠٪": "100% cotton fabric", "محل ممتاز وخدمة سريعة": "Excellent shop and fast service", "خصم نهاية الموسم": "End of season sale", "نحن نبيع الملابس منذ ٢٠١٠": "We have sold clothes since 2010", "فرع حلب": "Aleppo branch" },
  Arabic: { "Light summer dress": "فستان صيفي خفيف" },
};
let failing = false;
vi.mock("../src/services/ai.service", async (original) => ({
  ...(await original<typeof import("../src/services/ai.service")>()),
  translateBatch: vi.fn(async (texts: string[], target: string) => {
    calls.push(texts);
    if (failing) return null;
    return texts.map((t) => DICT[target]?.[t] ?? null);
  }),
}));

import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { needsTranslation, translateTexts } from "../src/services/contentTranslation.service";

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  calls.length = 0;
  failing = false;
  await prisma.contentTranslation.deleteMany(); // the saved translations are only a cache: start each test without them
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Tr ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function shopWithProduct(name: string, description: string, bio: string) {
  const cat = await prisma.category.upsert({ where: { slug: "tr-test-cat" }, update: {}, create: { name: "Tr Test", slug: "tr-test-cat" } });
  const owner = await account("trshop", { bio });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Tr Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, latitude: 33.5, longitude: 36.3 });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  const product = await prisma.product.create({ data: { merchantId: reg.body.id, name, description, priceCents: 1000, stock: 5, specs: [{ label: "قماش قطن ١٠٠٪", value: "XL" }] } });
  return { owner, shopId: reg.body.id as string, productId: product.id };
}

describe("which texts are translated", () => {
  it("only the ones written in the other script; numbers, sizes and the reader's own language are left alone", () => {
    expect(needsTranslation("فستان صيفي خفيف", "en")).toBe(true);
    expect(needsTranslation("Light summer dress", "en")).toBe(false);
    expect(needsTranslation("Light summer dress", "ar")).toBe(true);
    expect(needsTranslation("فستان صيفي خفيف", "ar")).toBe(false);
    expect(needsTranslation("XL", "ar")).toBe(false);
    expect(needsTranslation("2500", "en")).toBe(false);
    expect(needsTranslation("😀", "en")).toBe(false);
  });
});

describe("a text somebody typed, read in another language", () => {
  it("is translated once, kept, and the original stays untouched for its owner", async () => {
    const s = await shopWithProduct("فستان صيفي خفيف", "محل ممتاز وخدمة سريعة", "نحن نبيع الملابس منذ ٢٠١٠");

    const english = (await request(app).get("/store/products").query({ merchantId: s.shopId }).set("Accept-Language", "en")).body;
    expect(english.items[0]).toMatchObject({ name: "Light summer dress", description: "Excellent shop and fast service" });
    expect(english.items[0].specs[0]).toMatchObject({ label: "100% cotton fabric", value: "XL" });
    expect(calls.length).toBeGreaterThan(0);

    // the second reader costs nothing: it comes from the saved translation
    calls.length = 0;
    const again = (await request(app).get("/store/products").query({ merchantId: s.shopId }).set("Accept-Language", "en")).body;
    expect(again.items[0].name).toBe("Light summer dress");
    expect(calls).toEqual([]);

    // an Arabic reader sees the original
    const arabic = (await request(app).get("/store/products").query({ merchantId: s.shopId }).set("Accept-Language", "ar")).body;
    expect(arabic.items[0].name, "arabic reader").toBe("فستان صيفي خفيف");

    // the shop's own list (what it edits) and the stored product are never changed
    const mine = (await request(app).get("/products/mine").set(s.owner.auth).set("Accept-Language", "en")).body;
    expect(mine[0].name, "mine").toBe("فستان صيفي خفيف");
    expect((await request(app).get(`/products/${s.productId}`).set("Accept-Language", "en")).body.name, "single").toBe("فستان صيفي خفيف");
    expect((await prisma.product.findUnique({ where: { id: s.productId } }))!.name, "stored").toBe("فستان صيفي خفيف");

    // the product page and the shop's public list follow the reader too
    expect((await request(app).get(`/store/products/${s.productId}`).set("Accept-Language", "en")).body.name).toBe("Light summer dress");
    expect((await request(app).get("/products").query({ merchantId: s.shopId }).set("Accept-Language", "en")).body[0].name).toBe("Light summer dress");
  });

  it("a Latin text is translated into Arabic for an Arabic reader", async () => {
    const found = await translateTexts(["Light summer dress"], "ar");
    expect(found.get("Light summer dress")).toBe("فستان صيفي خفيف");
  });

  it("the shop page: bio, branch and discount texts; the shop name stays as written", async () => {
    const s = await shopWithProduct("فستان صيفي خفيف", "x", "نحن نبيع الملابس منذ ٢٠١٠");
    await prisma.user.update({ where: { id: s.owner.id }, data: { role: "MERCHANT" } });
    await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "فرع حلب", latitude: 36.2, longitude: 37.1 });
    await prisma.discount.create({ data: { merchantId: s.shopId, title: "خصم نهاية الموسم", percent: 20, isActive: true, status: "APPROVED" } });

    const page = (await request(app).get(`/merchant/${s.shopId}`).set("Accept-Language", "en")).body;
    expect(page.bio).toBe("We have sold clothes since 2010");
    expect(page.branches[0].name).toBe("Aleppo branch");
    expect(page.discounts[0].title).toBe("End of season sale");
    expect(page.businessName).toMatch(/^Tr Shop/);

    const list = (await request(app).get("/merchant").query({ q: page.businessName }).set("Accept-Language", "en")).body;
    expect(list[0].bio).toBe("We have sold clothes since 2010");
    expect(list[0].discounts[0].title).toBe("End of season sale");
  });

  it("other people's comments are translated, the reader's own is not", async () => {
    const s = await shopWithProduct("فستان صيفي خفيف", "x", "bio");
    const buyer = await account("trbuyer");
    await prisma.productReview.create({ data: { productId: s.productId, userId: buyer.id, stars: 5, comment: "محل ممتاز وخدمة سريعة" } });
    const other = (await request(app).get(`/reviews/products/${s.productId}`).set("Accept-Language", "en")).body;
    expect(other.items[0].comment).toBe("Excellent shop and fast service");
    const own = (await request(app).get(`/reviews/products/${s.productId}`).set(buyer.auth).set("Accept-Language", "en")).body;
    expect(own.items[0].comment).toBe("محل ممتاز وخدمة سريعة");
  });

  it("when the AI does not answer the original is shown, and the answer is not asked again for a moment", async () => {
    failing = true;
    const text = `فستان لا ترجمة له ${crypto.randomUUID()}`;
    const first = await translateTexts([text], "en");
    expect(first.size).toBe(0);
    const asked = calls.length;
    expect(asked).toBeGreaterThan(0);
    await translateTexts([`${text} ثاني`], "en");
    expect(calls.length).toBe(asked); // paused after the failure
  });
});

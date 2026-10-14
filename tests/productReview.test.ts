import { describe, it, expect, afterAll, vi, beforeEach } from "vitest";
import crypto from "crypto";
import request from "supertest";

// The AI is replaced by a rule on the product's name so the tests are fast and need no key.
const screened: string[] = [];
vi.mock("../src/services/ai.service", async (original) => ({
  ...(await original<typeof import("../src/services/ai.service")>()),
  screenListing: vi.fn(async (listing: { name: string }) => {
    screened.push(listing.name);
    if (listing.name.includes("DOWN")) return null;
    if (listing.name.includes("BLOCK")) return { verdict: "BLOCK", reasons: ["محتوى غير لائق"] };
    if (listing.name.includes("REVIEW")) return { verdict: "REVIEW", reasons: ["الصورة رديئة"] };
    return { verdict: "OK", reasons: [] };
  }),
}));

import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  process.env.PRODUCT_REVIEW = "off";
  await prisma.$disconnect();
});

beforeEach(() => {
  screened.length = 0;
  process.env.PRODUCT_REVIEW = "on";
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Rv ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "rv-test-cat" }, update: {}, create: { name: "Rv Test", slug: "rv-test-cat" } });
  const owner = await account("rvshop", { role: "MERCHANT" });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Rv Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  return { owner, id: reg.body.id as string };
}
const add = (s: { owner: { auth: object } }, name: string) => request(app).post("/products").set(s.owner.auth).send({ name, priceCents: 1000, stock: 5 });
const inStore = async (shopId: string) => ((await request(app).get("/store/products").query({ merchantId: shopId })).body.items as { name: string }[]).map((p) => p.name);

describe("a product is looked at before anyone sees it", () => {
  it("an ordinary product goes live at once", async () => {
    const s = await shop();
    const res = await add(s, "حذاء رياضي");
    expect(res.status).toBe(201);
    expect(res.body.moderation).toBe("APPROVED");
    expect(await inStore(s.id)).toContain("حذاء رياضي");
  });

  it("a clear violation is refused at once: hidden from everyone but its shop, not for the cart, and the shop is told why", async () => {
    const s = await shop();
    const res = await add(s, "منتج BLOCK");
    expect(res.body).toMatchObject({ moderation: "REJECTED", moderationNote: "محتوى غير لائق" });
    expect(await inStore(s.id)).not.toContain("منتج BLOCK");
    expect((await request(app).get("/products").query({ merchantId: s.id })).body.map((p: { name: string }) => p.name)).not.toContain("منتج BLOCK");
    expect((await request(app).get(`/products/${res.body.id}`)).status).toBe(404); // a stranger
    expect((await request(app).get(`/products/${res.body.id}`).set(s.owner.auth)).status).toBe(200); // its shop can still fix it
    expect((await request(app).get(`/store/products/${res.body.id}`)).status).toBe(404);
    const buyer = await account("rvbuyer");
    expect((await request(app).post("/cart/items").set(buyer.auth).send({ productId: res.body.id, quantity: 1 })).status).toBe(404);
    expect(await prisma.notification.count({ where: { userId: s.owner.id, title: "ما انقبل منتجك" } })).toBe(1);
  });

  it("an unsure product waits for an admin, who approves it or refuses it with a reason", async () => {
    const s = await shop();
    const boss = await account("rvboss", { role: "ADMIN" });
    const waiting = await add(s, "منتج REVIEW");
    expect(waiting.body).toMatchObject({ moderation: "PENDING", moderationNote: "الصورة رديئة" });
    expect(await inStore(s.id)).not.toContain("منتج REVIEW");
    expect(await prisma.notification.count({ where: { userId: boss.id, title: "منتج بانتظار المراجعة" } })).toBeGreaterThanOrEqual(1);

    const queue = (await request(app).get("/admin/products").set(boss.auth)).body;
    const row = queue.find((p: { id: string }) => p.id === waiting.body.id);
    expect(row).toMatchObject({ name: "منتج REVIEW", moderation: "PENDING", note: "الصورة رديئة" });
    expect(row.shop).toContain("Rv Shop");
    expect((await request(app).get("/admin/products").set((await account("rvcust")).auth)).status).toBe(403);

    expect((await request(app).post(`/admin/products/${waiting.body.id}/approve`).set(boss.auth)).status).toBe(200);
    expect(await inStore(s.id)).toContain("منتج REVIEW");
    expect(await prisma.notification.count({ where: { userId: s.owner.id, title: "منتجك صار بالمتجر ✅" } })).toBe(1);

    const other = await add(s, "منتج REVIEW ثاني");
    expect((await request(app).post(`/admin/products/${other.body.id}/reject`).set(boss.auth).send({ reason: "الصورة غير واضحة" })).status).toBe(200);
    expect(await inStore(s.id)).not.toContain("منتج REVIEW ثاني");
    expect((await prisma.product.findUnique({ where: { id: other.body.id } }))).toMatchObject({ moderation: "REJECTED", moderationNote: "الصورة غير واضحة" });
  });

  it("when no AI answers, the product waits for an admin instead of going live unchecked", async () => {
    const s = await shop();
    const res = await add(s, "منتج DOWN");
    expect(res.body.moderation).toBe("PENDING");
    expect(await inStore(s.id)).not.toContain("منتج DOWN");
  });

  it("a change of price does not start a new review; a change of words or pictures does", async () => {
    const s = await shop();
    const ok = await add(s, "كرسي خشب");
    screened.length = 0;
    const cheaper = await request(app).patch(`/products/${ok.body.id}`).set(s.owner.auth).send({ priceCents: 900, stock: 9 });
    expect(cheaper.body.moderation).toBe("APPROVED");
    expect(screened).toEqual([]);
    const renamed = await request(app).patch(`/products/${ok.body.id}`).set(s.owner.auth).send({ name: "كرسي BLOCK" });
    expect(renamed.body.moderation).toBe("REJECTED");
    expect(screened).toEqual(["كرسي BLOCK"]);
    expect(await inStore(s.id)).not.toContain("كرسي BLOCK");
  });

  it("can be switched off (PRODUCT_REVIEW=off): everything shows at once", async () => {
    process.env.PRODUCT_REVIEW = "off";
    const s = await shop();
    const res = await add(s, "منتج BLOCK");
    expect(res.body.moderation).toBe("APPROVED");
    expect(screened).toEqual([]);
  });
});

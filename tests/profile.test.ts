import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const PASSWORD = "correct-horse-battery-staple";

async function account(prefix: string, fullName: string) {
  const email = uniqueEmail(prefix);
  // Registering already returns a token — using it keeps this file well under the login rate limit.
  const registered = await request(app).post("/auth/register").send({ email, password: PASSWORD, fullName });
  expect(registered.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { token: registered.body.token as string, id: user.id, auth: { Authorization: `Bearer ${registered.body.token}` } };
}

// A real (tiny) PNG and JPEG header — enough for the byte sniffing, which is what the server trusts.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(200)]);

describe("Account profile: description and photo", () => {
  it("starts empty and saves a name and description", async () => {
    const a = await account("prof", "Profile Owner");
    const me = await request(app).get("/profile/me").set(a.auth);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ fullName: "Profile Owner", bio: null, avatarUrl: null });

    const patch = await request(app).patch("/profile/me").set(a.auth).send({ fullName: "د. سامر", bio: "اختصاصي أطفال — خبرة 12 سنة" });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ fullName: "د. سامر", bio: "اختصاصي أطفال — خبرة 12 سنة" });

    expect((await request(app).patch("/profile/me").set(a.auth).send({ bio: "x".repeat(501) })).status).toBe(400);
    expect((await request(app).get("/profile/me")).status).toBe(401);
  });

  it("stores a photo, serves it publicly with safe headers, and can remove it", async () => {
    const a = await account("photo", "Photo Owner");
    const put = await request(app).put("/profile/avatar").set(a.auth).set("Content-Type", "image/png").send(PNG);
    expect(put.status).toBe(200);
    expect(put.body.avatarUrl).toMatch(new RegExp(`^/profile/avatar/${a.id}\\?v=\\d+$`));

    const img = await request(app).get(put.body.avatarUrl); // no auth: other people see profile photos
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(img.body, PNG)).toBe(0);

    // replacing it changes the cache-busting version and the bytes
    await new Promise((r) => setTimeout(r, 5));
    const again = await request(app).put("/profile/avatar").set(a.auth).set("Content-Type", "image/jpeg").send(JPEG);
    expect(again.body.avatarUrl).not.toBe(put.body.avatarUrl);
    expect((await request(app).get(again.body.avatarUrl)).headers["content-type"]).toBe("image/jpeg");

    const del = await request(app).delete("/profile/avatar").set(a.auth);
    expect(del.body.avatarUrl).toBeNull();
    expect((await request(app).get(`/profile/avatar/${a.id}`)).status).toBe(404);
  });

  it("refuses anything that is not really an image, too-large files, and anonymous uploads", async () => {
    const a = await account("badphoto", "Bad Photo");
    // claims to be a PNG but is a script — sniffing the bytes catches it
    const fake = await request(app).put("/profile/avatar").set(a.auth).set("Content-Type", "image/png").send(Buffer.from("<script>alert(1)</script>".padEnd(64, " ")));
    expect(fake.status).toBe(415);
    // an SVG (can carry scripts) is not an accepted type at all
    const svg = await request(app).put("/profile/avatar").set(a.auth).set("Content-Type", "image/svg+xml").send(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    expect(svg.status).toBe(415);
    const big = await request(app).put("/profile/avatar").set(a.auth).set("Content-Type", "image/png").send(Buffer.concat([PNG, Buffer.alloc(400 * 1024)]));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect((await request(app).put("/profile/avatar").set("Content-Type", "image/png").send(PNG)).status).toBe(401);
  });
});

describe("The merchant's photo and description show on their public page", () => {
  it("is returned by the directory, the place page and the owner's own profile", async () => {
    const owner = await account("shopowner", "Shop Owner");
    const category = await prisma.category.upsert({ where: { slug: "profile-test-cat" }, update: {}, create: { name: "Profile Test", slug: "profile-test-cat" } });
    const name = `Profile Shop ${crypto.randomUUID().slice(0, 6)}`;
    const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: name, categoryId: category.id, latitude: 33.5, longitude: 36.3 });
    expect(reg.status).toBe(201);
    await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });

    const put = await request(app).put("/profile/avatar").set(owner.auth).set("Content-Type", "image/png").send(PNG);
    await request(app).patch("/profile/me").set(owner.auth).send({ bio: "أفضل خدمة بالمدينة" });

    const detail = await request(app).get(`/merchant/${reg.body.id}`);
    expect(detail.body).toMatchObject({ bio: "أفضل خدمة بالمدينة", avatarUrl: put.body.avatarUrl });
    expect(detail.body.user).toBeUndefined(); // the owner's account record is never exposed

    const list = await request(app).get("/merchant").query({ q: name });
    expect(list.body[0]).toMatchObject({ businessName: name, avatarUrl: put.body.avatarUrl, bio: "أفضل خدمة بالمدينة" });
    expect(list.body[0].user).toBeUndefined();

    const mine = await request(app).get("/merchant/me").set(owner.auth);
    expect(mine.body.avatarUrl).toBe(put.body.avatarUrl);
  });
});

describe("Printable documents carry the issuing account's name and photo", () => {
  async function orderFixture() {
    const merchantUser = await account("invmerchant", "Invoice Merchant");
    const category = await prisma.category.upsert({ where: { slug: "profile-test-cat" }, update: {}, create: { name: "Profile Test", slug: "profile-test-cat" } });
    const shopName = `متجر <b>الأمل</b> ${crypto.randomUUID().slice(0, 4)}`; // markup in the name must come out escaped
    const profile = await prisma.merchantProfile.create({
      data: { userId: merchantUser.id, businessName: shopName, categoryId: category.id, phone: "0933000111", approvalStatus: "APPROVED" },
    });
    await prisma.user.update({ where: { id: merchantUser.id }, data: { role: "MERCHANT", bio: "نبيع الأفضل" } });
    const avatar = await request(app).put("/profile/avatar").set(merchantUser.auth).set("Content-Type", "image/png").send(PNG);
    const merchantAuth = merchantUser.auth; // the server re-reads the role from the database on every request

    const product = await request(app).post("/products").set(merchantAuth).send({ name: "منتج تجريبي", priceCents: 5000, stock: 10, categoryId: category.id });
    expect(product.status).toBe(201);

    const customer = await account("invcustomer", "Invoice Customer");
    await request(app).post("/cart/items").set(customer.auth).send({ productId: product.body.id, quantity: 2 });
    const checkout = await request(app).post("/cart/checkout").set(customer.auth);
    expect(checkout.status).toBe(201);
    return { merchantAuth, customer, shopName, profile, avatarUrl: avatar.body.avatarUrl as string, order: checkout.body[0] };
  }

  it("prints an order invoice with the merchant's name and photo; both sides can open it, strangers cannot", async () => {
    const f = await orderFixture();
    const res = await request(app).get(`/invoices/order/${f.order.id}`).set(f.customer.auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("فاتورة طلب");
    expect(res.text).toContain(f.order.orderNumber);
    expect(res.text).toContain(`src="${f.avatarUrl}"`); // the account's profile photo
    expect(res.text).toContain("نبيع الأفضل");
    expect(res.text).toContain("Invoice Customer");
    expect(res.text).toContain("منتج تجريبي");
    // markup in the shop name is escaped, never injected
    expect(res.text).toContain("&lt;b&gt;الأمل&lt;/b&gt;");
    expect(res.text).not.toContain("<b>الأمل</b>");

    expect((await request(app).get(`/invoices/order/${f.order.id}`).set(f.merchantAuth)).status).toBe(200);
    const stranger = await account("invstranger", "Stranger");
    expect((await request(app).get(`/invoices/order/${f.order.id}`).set(stranger.auth)).status).toBe(404);
    expect((await request(app).get(`/invoices/order/${f.order.id}`)).status).toBe(401);
  });

  it("shows an initial instead of a photo when the account has none, and prints discount receipts", async () => {
    const f = await orderFixture();
    await request(app).delete("/profile/avatar").set(f.merchantAuth);
    const noPhoto = await request(app).get(`/invoices/order/${f.order.id}`).set(f.customer.auth);
    expect(noPhoto.text).toContain('class="doc-logo ph"');
    expect(noPhoto.text).not.toContain('class="doc-logo"'); // no account photo (the platform mark in the corner is separate)
    expect(noPhoto.text).toContain("/brand/logo-192.png");

    const plan = await prisma.servicePlan.create({ data: { name: "Receipt Plan", durationDays: 30, priceCents: 1000 } });
    const member = await prisma.user.findUniqueOrThrow({ where: { id: f.order.userId } });
    const membership = await prisma.membership.create({
      data: { memberNumber: `DLK-${crypto.randomUUID().slice(0, 10).toUpperCase()}`, userId: member.id, planId: plan.id, endDate: new Date(Date.now() + 86400000), qrSecret: "s" },
    });
    const tx = await prisma.discountTransaction.create({
      data: { membershipId: membership.id, merchantId: f.profile.id, billAmountCents: 10000, discountPercent: 10, discountAmountCents: 1000, finalAmountCents: 9000 },
    });
    const receipt = await request(app).get(`/invoices/discount/${tx.transactionRef}`).set(f.merchantAuth);
    expect(receipt.status).toBe(200);
    expect(receipt.text).toContain("إيصال حسم");
    expect(receipt.text).toContain("90.00 €");
    expect((await request(app).get(`/invoices/discount/${tx.transactionRef}`).set(f.customer.auth)).status).toBe(200);
    const stranger = await account("rcstranger", "Stranger Two");
    expect((await request(app).get(`/invoices/discount/${tx.transactionRef}`).set(stranger.auth)).status).toBe(404);
  });
});

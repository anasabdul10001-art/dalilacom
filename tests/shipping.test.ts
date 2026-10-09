import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import sharp from "sharp";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Ship ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function shop(approved = true) {
  const cat = await prisma.category.upsert({ where: { slug: "ship-test-cat" }, update: {}, create: { name: "Ship Test", slug: "ship-test-cat" } });
  const owner = await account("shipshop");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Ship Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: approved ? "APPROVED" : "PENDING" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  let productId = "";
  if (approved) {
    const product = await request(app).post("/products").set(owner.auth).send({ name: "Ship product", priceCents: 1000, stock: 9, categoryId: cat.id });
    expect(product.status).toBe(201);
    productId = product.body.id;
  }
  return { owner, id: reg.body.id as string, productId };
}

describe("a shop that is not approved yet", () => {
  it("cannot use merchant mode: no shipping methods, no discounts, and the message is in Arabic", async () => {
    const s = await shop(false);
    const put = await request(app).put("/merchant/shipping-methods").set(s.owner.auth).send({ methods: [{ name: "توصيل", costCents: 200 }] });
    expect(put.status).toBe(403);
    expect(put.body.error.message).toBe("محلك لسا ما انوافق عليه من الإدارة، بتقدر تستخدم وضع التاجر بعد الموافقة");
    const discount = await request(app).post("/merchant/discounts").set(s.owner.auth).send({ title: "عرض", percent: 10 });
    expect(discount.status).toBe(403);
    expect(discount.body.error.message).toContain("محلك لسا ما انوافق");
  });
});

describe("shipping methods", () => {
  it("the shop lists how it sends orders and the cost; customers see them and pick one at checkout", async () => {
    const s = await shop();
    expect((await request(app).put("/merchant/shipping-methods").set(s.owner.auth).send({ methods: [] })).status).toBe(400); // at least one
    const put = await request(app).put("/merchant/shipping-methods").set(s.owner.auth).send({ methods: [{ name: "استلام من المحل", costCents: 0 }, { name: "توصيل داخل المدينة", costCents: 350 }] });
    expect(put.status).toBe(200);
    expect(put.body.map((m: { name: string }) => m.name)).toEqual(["استلام من المحل", "توصيل داخل المدينة"]);
    expect((await request(app).get("/merchant/shipping-methods").set(s.owner.auth)).body).toHaveLength(2);
    expect((await request(app).get(`/merchant/${s.id}`)).body.shippingMethods).toHaveLength(2);

    const customer = await account("shipcust");
    expect((await request(app).post("/cart/items").set(customer.auth).send({ productId: s.productId, quantity: 2 })).status).toBe(201);
    const cart = (await request(app).get("/cart").set(customer.auth)).body;
    expect(cart.shipping).toHaveLength(1);
    expect(cart.shipping[0].merchantId).toBe(s.id);
    expect(cart.shipping[0].methods).toHaveLength(2);

    // a choice is needed
    const without = await request(app).post("/cart/checkout").set(customer.auth).send({});
    expect(without.status).toBe(400);
    expect(without.body.error.message).toBe("اختر طريقة الشحن لكل متجر بالسلة");
    // a method of another shop does not count
    const other = await shop();
    const otherMethod = (await request(app).put("/merchant/shipping-methods").set(other.owner.auth).send({ methods: [{ name: "شحن", costCents: 100 }] })).body[0];
    expect((await request(app).post("/cart/checkout").set(customer.auth).send({ shipping: { [s.id]: otherMethod.id } })).status).toBe(400);

    const delivery = cart.shipping[0].methods[1];
    const done = await request(app).post("/cart/checkout").set(customer.auth).send({ shipping: { [s.id]: delivery.id } });
    expect(done.status).toBe(201);
    expect(done.body[0]).toMatchObject({ shippingName: "توصيل داخل المدينة", shippingCents: 350, totalCents: 2000 + 350 });

    // changing the list later does not touch the order already placed
    await request(app).put("/merchant/shipping-methods").set(s.owner.auth).send({ methods: [{ name: "شحن سريع", costCents: 900 }] });
    const orders = (await request(app).get("/orders/mine").set(customer.auth)).body;
    expect(JSON.stringify(orders)).toContain("توصيل داخل المدينة");
  });

  it("a shop with no shipping methods still checks out as before", async () => {
    const s = await shop();
    const customer = await account("shipcust2");
    await request(app).post("/cart/items").set(customer.auth).send({ productId: s.productId, quantity: 1 });
    const done = await request(app).post("/cart/checkout").set(customer.auth).send({});
    expect(done.status).toBe(201);
    expect(done.body[0]).toMatchObject({ shippingCents: 0, totalCents: 1000 });
  });

  it("shows the customer how many are in stock", async () => {
    const s = await shop();
    const detail = await request(app).get(`/store/products/${s.productId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.stock).toBe(9);
  });
});

describe("improving a product photo", () => {
  it("makes a clean 1200x1200 white-background copy of the shop's own photo, and never of someone else's", async () => {
    const s = await shop();
    // a photo with a big plain border and a coloured product in the middle
    const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#d0d0d0" } })
      .composite([{ input: await sharp({ create: { width: 200, height: 160, channels: 3, background: "#aa2222" } }).png().toBuffer(), left: 350, top: 220 }])
      .png()
      .toBuffer();
    const up = await request(app).post("/products/photos").set(s.owner.auth).set("Content-Type", "image/png").send(original);
    expect(up.status).toBe(201);
    const better = await request(app).post(`/products/photos/${up.body.id}/enhance`).set(s.owner.auth);
    expect(better.status).toBe(201);
    expect(better.body.id).not.toBe(up.body.id); // a new copy; the original stays
    const stored = await prisma.productPhoto.findUnique({ where: { id: better.body.id } });
    const meta = await sharp(Buffer.from(stored!.data)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 1200, "jpeg"]);
    // the corner is white now (the plain border is gone)
    const pixel = async (left: number, top: number) => [...(await sharp(Buffer.from(stored!.data)).extract({ left, top, width: 1, height: 1 }).raw().toBuffer())];
    expect(await pixel(2, 2)).toEqual([255, 255, 255]);
    const middle = await pixel(600, 600); // the product, centred and filling the canvas
    expect(middle[0]).toBeGreaterThan(middle[1] + 60);

    const stranger = await shop();
    expect((await request(app).post(`/products/photos/${up.body.id}/enhance`).set(stranger.owner.auth)).status).toBe(404);
    expect((await request(app).post(`/products/photos/${crypto.randomUUID()}/enhance`).set(s.owner.auth)).status).toBe(404);
  });
});

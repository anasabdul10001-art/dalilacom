import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { shortName } from "../src/routes/reviews.routes";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, fullName: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName });
  expect(registered.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "review-test-cat" }, update: {}, create: { name: "Review Test", slug: "review-test-cat" } });
  const owner = await account("revshop", "Shop Owner");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Rev Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Review product", priceCents: 1000, stock: 50, categoryId: cat.id });
  expect(product.status).toBe(201);
  return { owner, merchantId: reg.body.id as string, productId: product.body.id as string };
}

/** The customer orders the shop's product and the shop takes the order all the way to DELIVERED (or stops earlier). */
async function order(s: Awaited<ReturnType<typeof shop>>, customer: { auth: object }, until: "PENDING" | "DELIVERED" = "DELIVERED") {
  expect((await request(app).post("/cart/items").set(customer.auth).send({ productId: s.productId, quantity: 1 })).status).toBeLessThan(300);
  const checkout = await request(app).post("/cart/checkout").set(customer.auth);
  expect(checkout.status).toBeLessThan(300);
  const id = (checkout.body.orders ?? checkout.body)[0].id as string;
  if (until === "DELIVERED") {
    for (const status of ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"]) {
      expect((await request(app).patch(`/orders/${id}/status`).set(s.owner.auth).send({ status })).status).toBe(200);
    }
  }
  return id;
}

describe("names are shortened", () => {
  it("shows a first name and an initial", () => {
    expect(shortName("أنس عبد العزيز")).toBe("أنس ع.");
    expect(shortName("Sam")).toBe("Sam");
    expect(shortName("  ")).toBe("—");
  });
});

describe("product reviews", () => {
  it("can be read by anyone, written only by someone who received the product, and move the product's stars", async () => {
    const s = await shop();
    const buyer = await account("revbuyer", "Layla Hassan");
    const waiting = await account("revwaiting", "Omar Khaled");
    const stranger = await account("revstranger", "Nobody Here");
    await order(s, buyer);
    await order(s, waiting, "PENDING"); // ordered but not delivered yet

    // a visitor with no account reads the (empty) reviews
    const empty = await request(app).get(`/reviews/products/${s.productId}`);
    expect(empty.status).toBe(200);
    expect(empty.body.summary).toMatchObject({ average: 0, count: 0 });
    expect(empty.body.canReview).toBe(false);

    // not a buyer / not delivered yet / a visitor / the shop itself: no
    const body = { stars: 5, comment: "ممتاز" };
    expect((await request(app).put(`/reviews/products/${s.productId}`).send(body)).status).toBe(401);
    expect((await request(app).put(`/reviews/products/${s.productId}`).set(stranger.auth).send(body)).status).toBe(403);
    expect((await request(app).put(`/reviews/products/${s.productId}`).set(waiting.auth).send(body)).status).toBe(403);
    expect((await request(app).put(`/reviews/products/${s.productId}`).set(s.owner.auth).send(body)).status).toBe(403);
    expect((await request(app).get(`/reviews/products/${s.productId}`).set(buyer.auth)).body.canReview).toBe(true);

    // the buyer can; 1..5 only
    expect((await request(app).put(`/reviews/products/${s.productId}`).set(buyer.auth).send({ stars: 6 })).status).toBe(400);
    expect((await request(app).put(`/reviews/products/${s.productId}`).set(buyer.auth).send(body)).status).toBe(200);

    // anyone sees it, with a short name and the verified mark
    const seen = await request(app).get(`/reviews/products/${s.productId}`);
    expect(seen.body.summary).toMatchObject({ average: 5, count: 1 });
    expect(seen.body.items[0]).toMatchObject({ stars: 5, comment: "ممتاز", name: "Layla H.", verified: true, mine: false });
    expect(seen.body.items[0]).not.toHaveProperty("userId");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: s.productId } })).rating).toBe(5);

    // editing replaces, it does not add a second review
    await request(app).put(`/reviews/products/${s.productId}`).set(buyer.auth).send({ stars: 3, comment: "عدّلت رأيي" });
    const edited = await request(app).get(`/reviews/products/${s.productId}`).set(buyer.auth);
    expect(edited.body.summary).toMatchObject({ average: 3, count: 1 });
    expect(edited.body.mine).toEqual({ stars: 3, comment: "عدّلت رأيي" });
    expect(edited.body.items[0].mine).toBe(true);

    // deleting takes the stars away again
    await request(app).delete(`/reviews/products/${s.productId}`).set(buyer.auth);
    expect((await request(app).get(`/reviews/products/${s.productId}`)).body.summary.count).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: s.productId } })).ratingCount).toBe(0);
  });
});

describe("shops: followers and reviews", () => {
  it("shows followers and stars to everyone; following needs an account; rating needs a delivered order", async () => {
    const s = await shop();
    const buyer = await account("revbuyer2", "Rana Ali");
    const fan = await account("revfan", "Kareem Saleh");
    await order(s, buyer);

    // a visitor sees the numbers on the shop page and in the reviews
    const page = await request(app).get(`/merchant/${s.merchantId}`);
    expect(page.body).toMatchObject({ rating: 0, ratingCount: 0, followersCount: 0 });

    // following: an account is needed, and any account will do (a customer here)
    expect((await request(app).put(`/favorites/${s.merchantId}`)).status).toBe(401);
    expect((await request(app).put(`/favorites/${s.merchantId}`).set(fan.auth)).status).toBe(200);
    expect((await request(app).put(`/favorites/${s.merchantId}`).set(buyer.auth)).status).toBe(200);
    expect((await request(app).get(`/merchant/${s.merchantId}`)).body.followersCount).toBe(2);
    expect((await request(app).get(`/reviews/shops/${s.merchantId}`)).body.followersCount).toBe(2);
    await request(app).delete(`/favorites/${s.merchantId}`).set(fan.auth);
    expect((await request(app).get(`/merchant/${s.merchantId}`)).body.followersCount).toBe(1);

    // rating: only the one who received an order
    expect((await request(app).put(`/reviews/shops/${s.merchantId}`).set(fan.auth).send({ stars: 5 })).status).toBe(403);
    expect((await request(app).put(`/reviews/shops/${s.merchantId}`).send({ stars: 5 })).status).toBe(401);
    expect((await request(app).put(`/reviews/shops/${s.merchantId}`).set(buyer.auth).send({ stars: 4, comment: "تعامل راقي" })).status).toBe(200);

    const after = await request(app).get(`/merchant/${s.merchantId}`);
    expect(after.body).toMatchObject({ rating: 4, ratingCount: 1 });
    const list = await request(app).get(`/reviews/shops/${s.merchantId}`);
    expect(list.body.items[0]).toMatchObject({ stars: 4, comment: "تعامل راقي", name: "Rana A.", verified: true });
    expect(list.body.summary.distribution[4]).toBe(1);
  });
});

describe("a shop rates its customer", () => {
  it("only after delivering to them; shops see the rating, the customer sees their own average", async () => {
    const s = await shop();
    const other = await shop();
    const customer = await account("revcustomer", "Huda Nasser");
    const waiting = await account("revwaiting2", "Sami Daher");
    await order(s, customer);
    await order(s, waiting, "PENDING");

    const asCustomer = await request(app).get(`/reviews/customers/${customer.id}`).set(customer.auth);
    expect(asCustomer.status).toBe(403); // customers do not browse other people's ratings
    expect((await request(app).put(`/reviews/customers/${waiting.id}`).set(s.owner.auth).send({ stars: 5 })).status).toBe(403); // not delivered
    expect((await request(app).put(`/reviews/customers/${customer.id}`).set(other.owner.auth).send({ stars: 5 })).status).toBe(403); // not their customer
    expect((await request(app).put(`/reviews/customers/${customer.id}`).set(s.owner.auth).send({ stars: 5, comment: "يدفع بسرعة" })).status).toBe(200);

    const seenByShop = await request(app).get(`/reviews/customers/${customer.id}`).set(other.owner.auth);
    expect(seenByShop.body.summary).toMatchObject({ average: 5, count: 1 });
    expect(seenByShop.body.items[0]).toMatchObject({ stars: 5, comment: "يدفع بسرعة", mine: false });
    expect(seenByShop.body.canReview).toBe(false);

    expect((await request(app).get("/reviews/customers/me").set(customer.auth)).body).toEqual({ rating: 5, ratingCount: 1 });

    // the shop's own order list carries the rating, and the customer's carries what is left to rate
    const shopOrders = await request(app).get("/orders/merchant").set(s.owner.auth);
    const row = shopOrders.body.find((o: { userId: string }) => o.userId === customer.id);
    expect(row).toMatchObject({ customerRating: { rating: 5, ratingCount: 1 }, ratedCustomer: true });
    const mine = await request(app).get("/orders/mine").set(customer.auth);
    expect(mine.body[0].rated).toEqual({ shop: false, products: [] });
    await request(app).put(`/reviews/shops/${s.merchantId}`).set(customer.auth).send({ stars: 5 });
    await request(app).put(`/reviews/products/${s.productId}`).set(customer.auth).send({ stars: 5 });
    const done = await request(app).get("/orders/mine").set(customer.auth);
    expect(done.body[0].rated).toEqual({ shop: true, products: [s.productId] });
  });
});

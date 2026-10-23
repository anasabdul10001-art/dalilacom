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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Pay ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function shopWithProduct() {
  const cat = await prisma.category.upsert({ where: { slug: "pay-test-cat" }, update: {}, create: { name: "Pay Test", slug: "pay-test-cat" } });
  const owner = await account("payshop");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Pay Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Pay product", priceCents: 1000, stock: 9, categoryId: cat.id });
  expect(product.status).toBe(201);
  return { owner, productId: product.body.id as string };
}

async function placeOrder(body: Record<string, unknown> = {}) {
  const shop = await shopWithProduct();
  const customer = await account("paycust");
  await request(app).post("/cart/items").set(customer.auth).send({ productId: shop.productId, quantity: 2 });
  const checkout = await request(app).post("/cart/checkout").set(customer.auth).send(body);
  return { shop, customer, checkout };
}

describe("paying for an order", () => {
  it("lists only the methods that work now", async () => {
    const customer = await account("paylist");
    const res = await request(app).get("/orders/payment-methods").set(customer.auth);
    expect(res.status).toBe(200);
    expect(res.body.methods).toEqual(["COD"]);
  });

  it("checkout without a method is pay-on-delivery: a pending payment for the order total", async () => {
    const { checkout } = await placeOrder();
    expect(checkout.status).toBe(201);
    expect(checkout.body[0].payment).toMatchObject({ method: "COD", status: "PENDING", amountCents: 2000 });
  });

  it("refuses the online method: no gateway is connected, so nobody is pretend-charged", async () => {
    const { checkout } = await placeOrder({ paymentMethod: "ONLINE" });
    expect(checkout.status).toBe(400);
    expect(checkout.body.error.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    expect(await prisma.order.count({ where: { userId: (await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).id } })).toBe(0);
  });

  it("the merchant confirms the cash only after the order is on its way, and only once", async () => {
    const { shop, customer, checkout } = await placeOrder();
    const orderId = checkout.body[0].id as string;
    const early = await request(app).post(`/orders/${orderId}/payment/confirm-cash`).set(shop.owner.auth);
    expect(early.status).toBe(409);

    for (const status of ["CONFIRMED", "PREPARING", "SHIPPED"]) {
      expect((await request(app).patch(`/orders/${orderId}/status`).set(shop.owner.auth).send({ status })).status).toBe(200);
    }
    // the customer cannot confirm their own payment
    const byCustomer = await request(app).post(`/orders/${orderId}/payment/confirm-cash`).set(customer.auth);
    expect(byCustomer.status).toBe(403);

    const ok = await request(app).post(`/orders/${orderId}/payment/confirm-cash`).set(shop.owner.auth);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: "PAID_CASH", confirmedById: shop.owner.id });
    expect(ok.body.paidAt).toBeTruthy();
    expect((await request(app).post(`/orders/${orderId}/payment/confirm-cash`).set(shop.owner.auth)).status).toBe(409);

    const mine = await request(app).get(`/orders/${orderId}`).set(customer.auth);
    expect(mine.body.payment.status).toBe("PAID_CASH");
  });

  it("another merchant cannot confirm someone else's order", async () => {
    const { checkout } = await placeOrder();
    const stranger = await shopWithProduct();
    const res = await request(app).post(`/orders/${checkout.body[0].id}/payment/confirm-cash`).set(stranger.owner.auth);
    expect(res.status).toBe(404);
  });

  it("cancelling an unpaid order fails its payment", async () => {
    const { customer, checkout } = await placeOrder();
    const orderId = checkout.body[0].id as string;
    expect((await request(app).post(`/orders/${orderId}/cancel`).set(customer.auth)).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("FAILED");
  });

  it("a merchant cancelling an order that was already paid marks the payment refunded", async () => {
    const { shop, checkout } = await placeOrder();
    const orderId = checkout.body[0].id as string;
    await prisma.payment.update({ where: { orderId }, data: { status: "PAID_CASH", paidAt: new Date() } });
    const res = await request(app).patch(`/orders/${orderId}/status`).set(shop.owner.auth).send({ status: "CANCELLED", cancelReason: "out of stock" });
    expect(res.status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("REFUNDED");
  });
});

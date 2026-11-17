import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { seedCategories } from "../prisma/categories.seed";
import { autoAcceptDueReceipts } from "../src/services/orderReceipt.service";

beforeAll(async () => { await seedCategories(prisma); }, 120000);
afterAll(async () => { await prisma.$disconnect(); });

const password = "correct-horse-battery-staple";
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Acc ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
async function shopWithOrder(status: "SHIPPED" | "DELIVERED", deliveredDaysAgo?: number) {
  const boss = await account("rcboss");
  await prisma.user.update({ where: { id: boss.id }, data: { role: "MERCHANT" } });
  const customer = await account("rccust");
  const category = await prisma.category.findFirstOrThrow();
  const shop = await prisma.merchantProfile.create({ data: { userId: boss.id, businessName: "Shop", categoryId: category.id, approvalStatus: "APPROVED", address: "x", phone: "1", latitude: 1, longitude: 2 } });
  const delivered = status === "DELIVERED";
  const order = await prisma.order.create({
    data: {
      orderNumber: `R-${Math.random().toString(36).slice(2, 10)}`, userId: customer.id, merchantId: shop.id, status, subtotalCents: 1000, totalCents: 1000,
      ...(delivered ? { deliveredAt: new Date(Date.now() - (deliveredDaysAgo ?? 0) * 86400000), receiptStatus: "PENDING" as const } : {}),
    },
  });
  return { boss, customer, order };
}

describe("receipt of a delivered order", () => {
  it("marking an order delivered starts a pending receipt", async () => {
    const { boss, order } = await shopWithOrder("SHIPPED");
    expect((await request(app).patch(`/orders/${order.id}/status`).set(boss.auth).send({ status: "DELIVERED" })).status).toBe(200);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.receiptStatus).toBe("PENDING");
    expect(after.deliveredAt).not.toBeNull();
  });

  it("the customer accepts once; nobody else can answer", async () => {
    const { boss, customer, order } = await shopWithOrder("DELIVERED");
    expect((await request(app).post(`/orders/${order.id}/receipt`).set(boss.auth).send({ decision: "ACCEPT" })).status).toBe(404);
    const ok = await request(app).post(`/orders/${order.id}/receipt`).set(customer.auth).send({ decision: "ACCEPT" });
    expect(ok.status).toBe(200);
    expect(ok.body.receiptStatus).toBe("ACCEPTED");
    expect((await request(app).post(`/orders/${order.id}/receipt`).set(customer.auth).send({ decision: "REJECT", note: "late answer" })).status).toBe(409);
  });

  it("a rejection needs a reason and tells the shop", async () => {
    const { boss, customer, order } = await shopWithOrder("DELIVERED");
    expect((await request(app).post(`/orders/${order.id}/receipt`).set(customer.auth).send({ decision: "REJECT" })).status).toBe(400);
    const res = await request(app).post(`/orders/${order.id}/receipt`).set(customer.auth).send({ decision: "REJECT", note: "The box was empty" });
    expect(res.status).toBe(200);
    expect(res.body.receiptStatus).toBe("REJECTED");
    expect(res.body.receiptNote).toBe("The box was empty");
    expect(await prisma.notification.count({ where: { userId: boss.id, type: "ORDER_STATUS", title: { contains: order.orderNumber } } })).toBeGreaterThan(0);
  });

  it("an order that is not delivered has nothing to answer", async () => {
    const { customer, order } = await shopWithOrder("SHIPPED");
    expect((await request(app).post(`/orders/${order.id}/receipt`).set(customer.auth).send({ decision: "ACCEPT" })).status).toBe(409);
  });

  it("after 10 days without an answer the order counts as accepted", async () => {
    const old = await shopWithOrder("DELIVERED", 11);
    const fresh = await shopWithOrder("DELIVERED", 3);
    await autoAcceptDueReceipts();
    const a = await prisma.order.findUniqueOrThrow({ where: { id: old.order.id } });
    expect(a.receiptStatus).toBe("ACCEPTED");
    expect(a.receiptAuto).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fresh.order.id } })).receiptStatus).toBe("PENDING");
  });

});

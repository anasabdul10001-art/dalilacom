import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { emailService } from "../src/services/email.service";
import { uniqueEmail } from "./helpers";

const sendSpy = vi.spyOn(emailService, "send").mockResolvedValue();

beforeEach(() => {
  sendSpy.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function account(prefix: string, fullName: string) {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName });
  const login = await request(app).post("/auth/login").send({ email, password });
  const token = login.body.token as string;
  return { email, token, bearer: `Bearer ${token}` };
}

async function category() {
  return prisma.category.upsert({
    where: { slug: "notif-test-cat" },
    update: {},
    create: { name: "Notifications Test", slug: "notif-test-cat" },
  });
}

/** An approved merchant with one product in stock — the shortest path to a real checkout. */
async function shop() {
  const cat = await category();
  const owner = await account("notifshop", "Notification Shop Owner");
  const reg = await request(app)
    .post("/merchant/register")
    .set("Authorization", owner.bearer)
    .send({ businessName: `Notif Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, latitude: 33.5, longitude: 36.3 });
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
  await prisma.user.update({ where: { id: ownerUser.id }, data: { role: "MERCHANT" } });

  const product = await request(app)
    .post("/products")
    .set("Authorization", owner.bearer)
    .send({ name: "منتج إشعار", priceCents: 5000, stock: 10, categoryId: cat.id });
  return { owner, ownerUser, merchantId: reg.body.id as string, productId: product.body.id as string };
}

function inbox(bearer: string, type?: string) {
  return request(app)
    .get("/notifications")
    .set("Authorization", bearer)
    .query({ take: 100 })
    .then((r) => (type ? r.body.items.filter((n: { type: string }) => n.type === type) : r.body.items));
}

describe("Notification preferences (section 87)", () => {
  it("defaults every type to FULL and stores what the user changes", async () => {
    const user = await account("notifpref", "Pref User");

    const defaults = await request(app).get("/notifications/preferences").set("Authorization", user.bearer);
    expect(defaults.status).toBe(200);
    expect(defaults.body).toContainEqual({ type: "ORDER_PLACED", mode: "FULL" });
    expect(defaults.body).toContainEqual({ type: "GEO_NEARBY", mode: "FULL" });
    expect(defaults.body.every((p: { mode: string }) => p.mode === "FULL")).toBe(true);

    const saved = await request(app)
      .put("/notifications/preferences")
      .set("Authorization", user.bearer)
      .send({ preferences: [{ type: "ORDER_PLACED", mode: "IN_APP_ONLY" }, { type: "GEO_NEARBY", mode: "OFF" }] });
    expect(saved.status).toBe(200);
    expect(saved.body).toContainEqual({ type: "ORDER_PLACED", mode: "IN_APP_ONLY" });
    expect(saved.body).toContainEqual({ type: "GEO_NEARBY", mode: "OFF" });
    expect(saved.body).toContainEqual({ type: "ORDER_STATUS", mode: "FULL" }); // untouched type keeps its default

    const reread = await request(app).get("/notifications/preferences").set("Authorization", user.bearer);
    expect(reread.body).toContainEqual({ type: "ORDER_PLACED", mode: "IN_APP_ONLY" });
  });

  it("rejects the same type twice, an unknown type and an unknown mode", async () => {
    const user = await account("notifpref2", "Pref User 2");

    const dup = await request(app)
      .put("/notifications/preferences")
      .set("Authorization", user.bearer)
      .send({ preferences: [{ type: "ORDER_PLACED", mode: "OFF" }, { type: "ORDER_PLACED", mode: "FULL" }] });
    expect(dup.status).toBe(400);

    const unknownType = await request(app)
      .put("/notifications/preferences")
      .set("Authorization", user.bearer)
      .send({ preferences: [{ type: "NOT_A_TYPE", mode: "OFF" }] });
    expect(unknownType.status).toBe(400);

    const unknownMode = await request(app)
      .put("/notifications/preferences")
      .set("Authorization", user.bearer)
      .send({ preferences: [{ type: "ORDER_PLACED", mode: "MAYBE" }] });
    expect(unknownMode.status).toBe(400);
  });
});

describe("A real order drives the notifications (section 13)", () => {
  it("tells the customer when the order is in, when its status moves, and tells the merchant when the customer cancels", async () => {
    const { owner, ownerUser, productId } = await shop();
    const customer = await account("notifcustomer", "Notif Customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });

    await request(app).post("/cart/items").set("Authorization", customer.bearer).send({ productId, quantity: 2 });
    const checkout = await request(app).post("/cart/checkout").set("Authorization", customer.bearer);
    expect(checkout.status).toBe(201);
    const order = checkout.body[0];

    const placed = await inbox(customer.bearer, "ORDER_PLACED");
    expect(placed).toHaveLength(1);
    expect(placed[0].data).toMatchObject({ orderId: order.id, orderNumber: order.orderNumber });
    expect(placed[0].title).toContain("استلام طلبك");
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: customer.email })); // FULL also emails

    // The merchant hears about the new order too, with a title that says it is theirs to act on.
    const merchantPlaced = await prisma.notification.findMany({ where: { userId: ownerUser.id, type: "ORDER_PLACED" } });
    expect(merchantPlaced).toHaveLength(1);
    expect(merchantPlaced[0].title).toContain("طلب جديد");
    expect(merchantPlaced[0].body).toContain(order.orderNumber);
    expect(merchantPlaced[0].data).toMatchObject({ orderId: order.id, audience: "MERCHANT" });

    // The merchant moves the order on: the customer hears about it.
    sendSpy.mockClear();
    const moved = await request(app)
      .patch(`/orders/${order.id}/status`)
      .set("Authorization", owner.bearer)
      .send({ status: "CONFIRMED" });
    expect(moved.status).toBe(200);

    const statusNotes = await inbox(customer.bearer, "ORDER_STATUS");
    expect(statusNotes).toHaveLength(1);
    expect(statusNotes[0].data).toMatchObject({ orderId: order.id, status: "CONFIRMED" });

    // The customer cancels: that one goes to the merchant, not to themselves.
    const beforeCancel = (await inbox(customer.bearer, "ORDER_STATUS")).length;
    const cancelled = await request(app).post(`/orders/${order.id}/cancel`).set("Authorization", customer.bearer);
    expect(cancelled.status).toBe(200);

    expect((await inbox(customer.bearer, "ORDER_STATUS")).length).toBe(beforeCancel);
    const merchantNotes = await prisma.notification.findMany({ where: { userId: ownerUser.id, type: "ORDER_STATUS" } });
    expect(merchantNotes).toHaveLength(1);
    expect(merchantNotes[0].data).toMatchObject({ orderId: order.id, status: "CANCELLED" });

    // Sanity: the customer's own id is the one the inbox endpoint scopes to.
    expect(customerUser.id).not.toBe(ownerUser.id);
  });

  it("writes nothing at all when the user turned that type off", async () => {
    const { productId } = await shop();
    const customer = await account("notifoff", "Off Customer");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });

    await request(app)
      .put("/notifications/preferences")
      .set("Authorization", customer.bearer)
      .send({ preferences: [{ type: "ORDER_PLACED", mode: "OFF" }] });
    sendSpy.mockClear();

    await request(app).post("/cart/items").set("Authorization", customer.bearer).send({ productId, quantity: 1 });
    const checkout = await request(app).post("/cart/checkout").set("Authorization", customer.bearer);
    expect(checkout.status).toBe(201); // the order still happens

    expect(await prisma.notification.count({ where: { userId: user.id, type: "ORDER_PLACED" } })).toBe(0);
    // the merchant's own new-order email is separate; nothing goes to this customer
    expect(sendSpy).not.toHaveBeenCalledWith(expect.objectContaining({ to: customer.email }));
  });

  it("keeps the inbox row but skips the email on IN_APP_ONLY", async () => {
    const { productId } = await shop();
    const customer = await account("notifinapp", "In-App Customer");

    await request(app)
      .put("/notifications/preferences")
      .set("Authorization", customer.bearer)
      .send({ preferences: [{ type: "ORDER_PLACED", mode: "IN_APP_ONLY" }] });
    sendSpy.mockClear();

    await request(app).post("/cart/items").set("Authorization", customer.bearer).send({ productId, quantity: 1 });
    await request(app).post("/cart/checkout").set("Authorization", customer.bearer);

    expect(await inbox(customer.bearer, "ORDER_PLACED")).toHaveLength(1);
    expect(sendSpy).not.toHaveBeenCalledWith(expect.objectContaining({ to: customer.email }));
  });
});

describe("A redeemed discount notifies the member (section 34/13)", () => {
  it("writes a DISCOUNT_RECEIVED notification naming the shop and the percentage", async () => {
    const { owner, merchantId } = await shop();
    const made = await request(app).post("/merchant/discounts").set("Authorization", owner.bearer).send({ title: "15% off", percent: 15 });
    await prisma.discount.update({ where: { id: made.body.id }, data: { status: "APPROVED" } });

    const plan = await prisma.servicePlan.create({ data: { name: `Notif Plan ${Date.now()}`, durationDays: 30, priceCents: 0 } });
    const member = await account("notifmember", "Notif Member");
    await request(app).post("/membership/subscribe").set("Authorization", member.bearer).send({ planId: plan.id });

    const mine = await request(app).get("/qr/mine").set("Authorization", member.bearer);
    expect(mine.status).toBe(200);

    sendSpy.mockClear();
    const redeem = await request(app)
      .post("/qr/redeem")
      .set("Authorization", owner.bearer)
      .send({ memberNumber: mine.body.memberNumber, code: mine.body.code, billAmountCents: 20000 });
    expect(redeem.status).toBe(201);

    const notes = await inbox(member.bearer, "DISCOUNT_RECEIVED");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("15%");
    expect(notes[0].data).toMatchObject({ merchantId, discountPercent: 15, finalAmountCents: 17000 });
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: member.email }));
  });
});

describe("The membership expiry reminder is produced lazily (section 13)", () => {
  it("appears when the membership is close to ending, and only once", async () => {
    const member = await account("notifexpiry", "Expiring Member");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    const plan = await prisma.servicePlan.create({ data: { name: `Expiry Plan ${Date.now()}`, durationDays: 30, priceCents: 0 } });

    await prisma.membership.create({
      data: {
        userId: user.id,
        planId: plan.id,
        memberNumber: `DLK-${crypto.randomInt(1_000_000_000, 9_999_999_999)}`,
        qrSecret: crypto.randomBytes(32).toString("hex"),
        startDate: new Date(Date.now() - 28 * 86_400_000),
        endDate: new Date(Date.now() + 2 * 86_400_000), // two days left
      },
    });

    const card = await request(app).get("/membership/me").set("Authorization", member.bearer);
    expect(card.status).toBe(200);

    const first = await prisma.notification.findMany({ where: { userId: user.id, type: "MEMBERSHIP_EXPIRING" } });
    expect(first).toHaveLength(1);
    expect(first[0].body).toContain("2 أيام");

    // Opening the inbox again (and the card again) must not pile up duplicates.
    await request(app).get("/notifications").set("Authorization", member.bearer);
    await request(app).get("/membership/me").set("Authorization", member.bearer);
    expect(await prisma.notification.count({ where: { userId: user.id, type: "MEMBERSHIP_EXPIRING" } })).toBe(1);
  });

  it("stays silent while the membership has plenty of time left", async () => {
    const member = await account("notiffresh", "Fresh Member");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    const plan = await prisma.servicePlan.create({ data: { name: `Fresh Plan ${Date.now()}`, durationDays: 30, priceCents: 0 } });
    await prisma.membership.create({
      data: {
        userId: user.id,
        planId: plan.id,
        memberNumber: `DLK-${crypto.randomInt(1_000_000_000, 9_999_999_999)}`,
        qrSecret: crypto.randomBytes(32).toString("hex"),
        endDate: new Date(Date.now() + 25 * 86_400_000),
      },
    });

    await request(app).get("/membership/me").set("Authorization", member.bearer);
    expect(await prisma.notification.count({ where: { userId: user.id, type: "MEMBERSHIP_EXPIRING" } })).toBe(0);
  });
});

describe("The inbox itself", () => {
  it("counts unread, marks one read, marks all read, and never touches another account's rows", async () => {
    const owner = await account("notifinbox", "Inbox Owner");
    const stranger = await account("notifstranger", "Stranger");
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
    const strangerUser = await prisma.user.findUniqueOrThrow({ where: { email: stranger.email } });

    for (const type of ["SYSTEM", "SYSTEM", "ORDER_PLACED"] as const) {
      await prisma.notification.create({ data: { userId: ownerUser.id, type, title: "t", body: "b" } });
    }

    const list = await request(app).get("/notifications").set("Authorization", owner.bearer);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(3);
    expect(list.body.unread).toBe(3);
    expect(list.body.items[0].createdAt >= list.body.items[2].createdAt).toBe(true); // newest first

    const unreadCount = await request(app).get("/notifications/unread-count").set("Authorization", owner.bearer);
    expect(unreadCount.body).toEqual({ unread: 3 });

    // A stranger cannot mark the owner's notification as read.
    const stolen = await request(app)
      .post(`/notifications/${list.body.items[0].id}/read`)
      .set("Authorization", stranger.bearer);
    expect(stolen.body).toEqual({ marked: false });
    expect(await prisma.notification.count({ where: { userId: ownerUser.id, readAt: null } })).toBe(3);

    // The owner can, and marking it twice is not an error.
    const mine = await request(app).post(`/notifications/${list.body.items[0].id}/read`).set("Authorization", owner.bearer);
    expect(mine.body).toEqual({ marked: true });
    const again = await request(app).post(`/notifications/${list.body.items[0].id}/read`).set("Authorization", owner.bearer);
    expect(again.body).toEqual({ marked: false });

    const unreadOnly = await request(app).get("/notifications").set("Authorization", owner.bearer).query({ unreadOnly: "true" });
    expect(unreadOnly.body.items).toHaveLength(2);

    const all = await request(app).post("/notifications/read-all").set("Authorization", owner.bearer);
    expect(all.body).toEqual({ marked: 2 });
    expect(await prisma.notification.count({ where: { userId: ownerUser.id, readAt: null } })).toBe(0);

    // The stranger's own inbox stays empty — they were never a recipient.
    const strangerList = await request(app).get("/notifications").set("Authorization", stranger.bearer);
    expect(strangerList.body).toEqual({ items: [], unread: 0 });
    expect(strangerUser.id).not.toBe(ownerUser.id);
  });

  it("requires a token", async () => {
    const res = await request(app).get("/notifications");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_MISSING_TOKEN");
  });
});

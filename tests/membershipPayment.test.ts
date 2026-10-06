import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { adjustBalance } from "../src/services/wallet.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Member" });
  const login = await request(app).post("/auth/login").send({ email, password });
  const token = login.body.token as string;
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { email, token, bearer: `Bearer ${token}`, userId: user.id };
}

/** Credits the wallet through the production helper, so the ledger is built exactly as in real life. */
async function giveCredits(userId: string, amount: number) {
  await prisma.$transaction((tx) => adjustBalance(tx, userId, amount, "TOPUP", "test-credit"));
}

const balance = (userId: string) => prisma.wallet.findUnique({ where: { userId } }).then((w) => w?.balance ?? 0);

const plan = (data: { name: string; priceCents: number; priceCredits?: number | null; durationDays?: number }) =>
  prisma.membershipPlan.create({
    data: { name: `${data.name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, durationDays: data.durationDays ?? 30, priceCents: data.priceCents, priceCredits: data.priceCredits ?? null },
  });

describe("Buying a membership now costs money (sections 24/51/54)", () => {
  it("activates a free plan with no wallet movement at all", async () => {
    const user = await account("freeplan");
    const free = await plan({ name: "Free", priceCents: 0 });

    const res = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: free.id });

    expect(res.status).toBe(201);
    expect(res.body.creditsPaid).toBe(0);
    expect(res.body.paidTransactionId).toBeNull();
    expect(res.body.walletBalance).toBeNull(); // nothing was charged, so there is no new balance to report
    expect(await balance(user.userId)).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { userId: user.userId, type: "MEMBERSHIP" } })).toBe(0);
  });

  it("refuses a priced plan that the admin has not priced in credits, instead of guessing a rate", async () => {
    const user = await account("unpriced");
    const unpriced = await plan({ name: "Unpriced", priceCents: 999 });

    const res = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: unpriced.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PLAN_PRICING_NOT_CONFIGURED");
    expect(await prisma.membership.count({ where: { userId: user.userId } })).toBe(0);
    expect(await balance(user.userId)).toBe(0);
  });

  it("debits exactly the plan's credit price and records the payment on the membership", async () => {
    const user = await account("paidplan");
    await giveCredits(user.userId, 1500);
    const paid = await plan({ name: "Paid", priceCents: 999, priceCredits: 1000 });

    const res = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: paid.id });

    expect(res.status).toBe(201);
    expect(res.body.creditsPaid).toBe(1000);
    expect(res.body.walletBalance).toBe(500);
    expect(await balance(user.userId)).toBe(500);

    const ledger = await prisma.walletTransaction.findMany({ where: { userId: user.userId, type: "MEMBERSHIP" } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(-1000);
    expect(ledger[0].ref).toContain("membership:");

    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.userId } });
    expect(membership.creditsPaid).toBe(1000);
    expect(membership.paidTransactionId).toBe(ledger[0].id); // the membership points at the row that paid for it

    // The card reports what was paid, so the customer can see it.
    const card = await request(app).get("/membership/me").set("Authorization", user.bearer);
    expect(card.body.creditsPaid).toBe(1000);
  });

  it("refuses when the balance is short, and leaves neither a membership nor a debit behind", async () => {
    const user = await account("poorplan");
    await giveCredits(user.userId, 400);
    const paid = await plan({ name: "Pricey", priceCents: 1999, priceCredits: 1000 });

    const res = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: paid.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_BALANCE");
    expect(res.body.error.details).toMatchObject({ balance: 400, needed: 1000 });
    expect(await prisma.membership.count({ where: { userId: user.userId } })).toBe(0);
    expect(await balance(user.userId)).toBe(400);
    expect(await prisma.walletTransaction.count({ where: { userId: user.userId, type: "MEMBERSHIP" } })).toBe(0);
  });

  it("lets an admin price a plan in credits afterwards, and then it becomes buyable", async () => {
    const admin = await account("planadmin");
    await prisma.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
    const customer = await account("laterbuyer");
    await giveCredits(customer.userId, 3000);
    const p = await plan({ name: "Later", priceCents: 500 });

    const created = await request(app)
      .post("/membership/plans")
      .set("Authorization", admin.bearer)
      .send({ name: `Created ${Date.now()}`, durationDays: 30, priceCents: 500, priceCredits: 250 });
    expect(created.status).toBe(201);
    expect(created.body.priceCredits).toBe(250);

    const patched = await request(app)
      .patch(`/membership/plans/${p.id}`)
      .set("Authorization", admin.bearer)
      .send({ priceCredits: 300 });
    expect(patched.status).toBe(200);
    expect(patched.body.priceCredits).toBe(300);

    // The public plan list carries the credit price, which is what the client shows before subscribing.
    const listed = await request(app).get("/membership/plans");
    expect(listed.body.find((x: { id: string }) => x.id === p.id).priceCredits).toBe(300);

    const res = await request(app).post("/membership/subscribe").set("Authorization", customer.bearer).send({ planId: p.id });
    expect(res.status).toBe(201);
    expect(res.body.creditsPaid).toBe(300);
    expect(await balance(customer.userId)).toBe(2700);
  });

  it("still refuses a second membership while one is active, and the price is only charged once", async () => {
    const user = await account("doublebuy");
    await giveCredits(user.userId, 5000);
    const paid = await plan({ name: "Twice", priceCents: 999, priceCredits: 400 });

    const first = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: paid.id });
    expect(first.status).toBe(201);

    const second = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: paid.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");

    expect(await balance(user.userId)).toBe(4600); // debited once, not twice
    expect(await prisma.walletTransaction.count({ where: { userId: user.userId, type: "MEMBERSHIP" } })).toBe(1);
  });

  it("rejects an unauthenticated or unknown-plan subscribe", async () => {
    const anonymous = await request(app).post("/membership/subscribe").send({ planId: "3f1e5d7a-0000-4000-8000-000000000000" });
    expect(anonymous.status).toBe(401);

    const user = await account("unknownplan");
    const missing = await request(app)
      .post("/membership/subscribe")
      .set("Authorization", user.bearer)
      .send({ planId: "3f1e5d7a-0000-4000-8000-000000000000" });
    expect(missing.status).toBe(404);
  });

  it("refuses a plan that an admin has deactivated", async () => {
    const user = await account("inactiveplan");
    const p = await plan({ name: "Inactive", priceCents: 0 });
    await prisma.membershipPlan.update({ where: { id: p.id }, data: { isActive: false } });

    const res = await request(app).post("/membership/subscribe").set("Authorization", user.bearer).send({ planId: p.id });
    expect(res.status).toBe(404);
    expect(await prisma.membership.count({ where: { userId: user.userId } })).toBe(0);
  });
});

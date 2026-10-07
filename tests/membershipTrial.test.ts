import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { adjustBalance } from "../src/services/wallet.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const DAY = 24 * 60 * 60 * 1000;

async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Trial Member" });
  const login = await request(app).post("/auth/login").send({ email, password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { userId: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

const giveCredits = (userId: string, amount: number) => prisma.$transaction((tx) => adjustBalance(tx, userId, amount, "TOPUP", "test-credit"));
const balance = (userId: string) => prisma.wallet.findUnique({ where: { userId } }).then((w) => w?.balance ?? 0);
const planWithTrial = (trialDays: number, priceCredits = 10) =>
  prisma.servicePlan.create({
    data: { name: `Trial plan ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, durationDays: 30, trialDays, priceCents: 500, priceCredits },
  });
const subscribe = (user: { auth: Record<string, string> }, planId: string) => request(app).post("/membership/subscribe").set(user.auth).send({ planId });

describe("The free period of a membership", () => {
  it("starts free for the plan's trial days, with no wallet movement, and says so on the card", async () => {
    const user = await account("trialstart");
    const plan = await planWithTrial(14);

    const res = await subscribe(user, plan.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isTrial: true, creditsPaid: 0, walletBalance: null });
    const days = (new Date(res.body.endDate).getTime() - new Date(res.body.startDate).getTime()) / DAY;
    expect(Math.round(days)).toBe(14);
    expect(await balance(user.userId)).toBe(0);

    const card = await request(app).get("/membership/me").set(user.auth);
    expect(card.body).toMatchObject({ status: "ACTIVE", isTrial: true });
    // still more than a week left: it cannot be bought again yet
    expect((await subscribe(user, plan.id)).status).toBe(409);
  });

  it("is given once per account — and a plan without trial days charges from the start", async () => {
    const noTrial = await planWithTrial(0);
    const user = await account("notrial");
    const res = await subscribe(user, noTrial.id);
    expect(res.status).toBe(409); // no credits yet, and no free period to hide that
    expect(res.body.error.code).toBe("INSUFFICIENT_BALANCE");

    const a = await account("trialA");
    const b = await account("trialB");
    const plan = await planWithTrial(7);
    expect((await subscribe(a, plan.id)).body.isTrial).toBe(true);
    expect((await subscribe(b, plan.id)).body.isTrial).toBe(true); // every account gets its own
  });
});

describe("Renewing a membership", () => {
  it("is charged once the free period is about to end, extends the same card, and stops being a trial", async () => {
    const user = await account("renewtrial");
    const plan = await planWithTrial(14, 10);
    const first = await subscribe(user, plan.id);
    const card = await prisma.membership.findFirstOrThrow({ where: { userId: user.userId } });

    // three days left: renewal opens, and a trial is never free twice
    const endsSoon = new Date(Date.now() + 3 * DAY);
    await prisma.membership.update({ where: { id: card.id }, data: { endDate: endsSoon } });
    const poor = await subscribe(user, plan.id);
    expect(poor.status).toBe(409);
    expect(poor.body.error.code).toBe("INSUFFICIENT_BALANCE");

    await giveCredits(user.userId, 25);
    const renewed = await subscribe(user, plan.id);
    expect(renewed.status).toBe(201);
    expect(renewed.body).toMatchObject({ memberNumber: first.body.memberNumber, isTrial: false, creditsPaid: 10, walletBalance: 15 });
    // the three remaining days are kept: 3 + 30
    expect(Math.round((new Date(renewed.body.endDate).getTime() - Date.now()) / DAY)).toBe(33);
    expect(await prisma.membership.count({ where: { userId: user.userId } })).toBe(1);
  });

  it("works after the card has run out (it used to answer 'already active' forever), keeping the number and QR", async () => {
    const user = await account("renewexpired");
    const plan = await planWithTrial(0, 10);
    await giveCredits(user.userId, 30);
    const first = await subscribe(user, plan.id);
    expect(first.status).toBe(201);
    const before = await prisma.membership.findFirstOrThrow({ where: { userId: user.userId } });
    await prisma.membership.update({ where: { id: before.id }, data: { endDate: new Date(Date.now() - 2 * DAY) } });
    expect((await request(app).get("/membership/me").set(user.auth)).body.status).toBe("EXPIRED");

    const again = await subscribe(user, plan.id);
    expect(again.status).toBe(201);
    expect(again.body.memberNumber).toBe(first.body.memberNumber);
    expect(Math.round((new Date(again.body.endDate).getTime() - Date.now()) / DAY)).toBe(30); // starts from now, not from the old end
    expect(await balance(user.userId)).toBe(10);
    const after = await prisma.membership.findFirstOrThrow({ where: { userId: user.userId } });
    expect(after.qrSecret).toBe(before.qrSecret);
    expect((await request(app).get("/membership/me").set(user.auth)).body.status).toBe("ACTIVE");
  });
});

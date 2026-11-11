import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../src/services/settings.service";

// The free monthly allowance (set in the admin panel) is the same for every account. When it is used up an account needs a plan,
// and a plan priced at 0 counts: the owner makes one to keep an account free for longer.
let before: Awaited<ReturnType<typeof getSettings>>["marketplace"];
beforeAll(async () => {
  before = (await getSettings()).marketplace;
  await saveSettings({ marketplace: { ...before, freeListingsPerMonth: 1 } });
});
afterAll(async () => {
  await saveSettings({ marketplace: before });
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function user() {
  const email = uniqueEmail("mq");
  expect((await request(app).post("/auth/register").send({ email, password, fullName: "Mq user" })).status).toBe(201);
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}
const sell = (auth: object, title: string) => request(app).post("/marketplace/listings").set(auth).send({ title, priceCents: 1000, currency: "SYP" });

describe("the free monthly allowance, for an ordinary account", () => {
  it("stops when it is used up and goes on after the account takes a plan priced at 0", async () => {
    const auth = await user();
    expect((await request(app).put("/marketplace/my-store").set(auth).send({ name: `Store ${crypto.randomUUID().slice(0, 6)}` })).status).toBeLessThan(300);
    expect((await sell(auth, "first one")).status).toBe(201);
    const blocked = await sell(auth, "second one");
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe("MARKETPLACE_PLAN_REQUIRED");

    const zero = await prisma.servicePlan.create({ data: { service: "MERCHANT_ACCOUNT", name: `Zero ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
    expect((await request(app).post("/marketplace/subscribe").set(auth).send({ planId: zero.id })).status).toBe(201);
    expect((await sell(auth, "second one")).status).toBe(201);
  });

  it("new (not used) products are allowed by default and refused while the admin switch is off, until the account has a plan", async () => {
    expect(DEFAULT_SETTINGS.marketplace.allowNewProducts).toBe(true);
    const auth = await user();
    await request(app).put("/marketplace/my-store").set(auth).send({ name: `Store ${crypto.randomUUID().slice(0, 6)}` });
    await saveSettings({ marketplace: { ...before, freeListingsPerMonth: 5, allowNewProducts: false } });
    try {
      const refused = await request(app).post("/marketplace/listings").set(auth).send({ title: "brand new", priceCents: 1000, condition: "NEW" });
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("NEW_PRODUCTS_CLOSED");
      await saveSettings({ marketplace: { ...before, freeListingsPerMonth: 5, allowNewProducts: true } });
      expect((await request(app).post("/marketplace/listings").set(auth).send({ title: "brand new", priceCents: 1000, condition: "NEW" })).status).toBe(201);
    } finally {
      await saveSettings({ marketplace: { ...before, freeListingsPerMonth: 1 } });
    }
  });
});

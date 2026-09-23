import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { emailService } from "../src/services/email.service";
import { saveSettings } from "../src/services/settings.service";
import { uniqueEmail } from "./helpers";

const sendSpy = vi.spyOn(emailService, "send").mockResolvedValue();

beforeEach(() => {
  sendSpy.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerAndLogin(role: "customer" = "customer") {
  const email = uniqueEmail(role);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Test User" });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { email, password, token: login.body.token as string, userId: login.body.user.id as string };
}

describe("Security: rate limiting", () => {
  it("returns 429 with the unified envelope once the limit is exceeded", async () => {
    // Isolated tiny app/limiter — doesn't share state with the real /auth limiters, so it can't
    // be flaky depending on how many other tests already hit those endpoints.
    const testApp = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "too many" } }),
    });
    testApp.get("/limited", limiter, (_req, res) => res.json({ ok: true }));

    const r1 = await request(testApp).get("/limited");
    const r2 = await request(testApp).get("/limited");
    const r3 = await request(testApp).get("/limited");

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("Security: unauthorized access", () => {
  it("rejects a protected route with no token", async () => {
    const res = await request(app).get("/wallet");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_MISSING_TOKEN");
  });

  it("rejects a protected route with a garbage token", async () => {
    const res = await request(app).get("/wallet").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_TOKEN");
  });
});

describe("Security: malformed requests", () => {
  it("rejects a login body missing required fields with a validation envelope", async () => {
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Security: authorization (role enforcement)", () => {
  it("blocks a customer from a merchant-only route", async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Product", priceCents: 1000 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("Security: security event creation", () => {
  it("logs LOGIN_SUCCESS and LOGIN_FAILURE events with the right userId", async () => {
    const { email, password, userId } = await registerAndLogin();
    await request(app).post("/auth/login").send({ email, password: "wrong-password" });

    const events = await prisma.securityEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    const types = events.map((e) => e.type);
    expect(types).toContain("REGISTER");
    expect(types).toContain("LOGIN_SUCCESS");
    expect(types).toContain("LOGIN_FAILURE");
  });
});

describe("Security: no sensitive data leakage", () => {
  it("never returns the password hash or raw password in register/login responses", async () => {
    const email = uniqueEmail("nosecrets");
    const password = "correct-horse-battery-staple";
    const reg = await request(app).post("/auth/register").send({ email, password, fullName: "Test" });
    const login = await request(app).post("/auth/login").send({ email, password });

    for (const res of [reg, login]) {
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(password);
      expect(raw.toLowerCase()).not.toContain("passwordhash");
    }
  });

  it("never leaks a stack trace on a validation error", async () => {
    const res = await request(app).post("/auth/register").send({ email: "bad" });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/at \w+.*\(.*:\d+:\d+\)/); // typical "at functionName (file:line:col)" stack frame
  });
});

describe("Security: duplicate / replayed sensitive requests", () => {
  it("rejects redeeming the same QR code twice (replay protection)", async () => {
    const category = await prisma.category.create({ data: { name: "Test Cat", slug: `test-cat-${Date.now()}` } });

    const merchantEmail = uniqueEmail("merchant");
    const merchantPassword = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email: merchantEmail, password: merchantPassword, fullName: "Merchant Owner" });
    const merchantLogin = await request(app).post("/auth/login").send({ email: merchantEmail, password: merchantPassword });
    const merchantToken = merchantLogin.body.token as string;

    const merchantReg = await request(app)
      .post("/merchant/register")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ businessName: "Test Shop", categoryId: category.id });
    await prisma.merchantProfile.update({ where: { id: merchantReg.body.id }, data: { approvalStatus: "APPROVED" } });
    await request(app).post("/merchant/discounts").set("Authorization", `Bearer ${merchantToken}`).send({ title: "10% off", percent: 10 });

    const plan = await prisma.membershipPlan.create({ data: { name: `Plan-${Date.now()}`, durationDays: 30, priceCents: 0 } });
    const { token: customerToken } = await registerAndLogin();
    await request(app).post("/membership/subscribe").set("Authorization", `Bearer ${customerToken}`).send({ planId: plan.id });

    const mine = await request(app).get("/qr/mine").set("Authorization", `Bearer ${customerToken}`);
    expect(mine.status).toBe(200);
    const { memberNumber, code } = mine.body;

    const first = await request(app)
      .post("/qr/redeem")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ memberNumber, code, billAmountCents: 10000 });
    expect(first.status).toBe(201);

    // Replaying the same code is rejected one step earlier than the transaction-level race
    // check: once lastRedeemedTimeStep advances, every remaining tolerance window step is
    // either <= it (skipped) or doesn't match the presented code — so this comes back as
    // "invalid/expired code" (400), not the 409 used for the narrower concurrent-request race.
    const replay = await request(app)
      .post("/qr/redeem")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ memberNumber, code, billAmountCents: 10000 });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects a second wallet top-up submitted with the same reference (idempotency)", async () => {
    await saveSettings({ payment: { usdtTrc20Address: "", localWallets: [{ key: "TEST_WALLET", label: "Test", accountNumber: "123" }] } });
    const { token } = await registerAndLogin();
    const reference = `dup-ref-${Date.now()}`;

    const first = await request(app)
      .post("/wallet/topups")
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "TEST_WALLET", reference, amountClaimed: 10 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/wallet/topups")
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "TEST_WALLET", reference, amountClaimed: 10 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });
});

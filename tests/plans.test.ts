import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { taxRateFor } from "../src/services/plan.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

async function account(prefix: string, countryCode?: string) {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Plan Tester" });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (countryCode) await prisma.user.update({ where: { id: user.id }, data: { countryCode } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { email, id: user.id, bearer: `Bearer ${login.body.token}` };
}

async function admin() {
  const user = await account("planadmin");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email: user.email, password: "correct-horse-battery-staple" });
  return { id: user.id, bearer: `Bearer ${login.body.token}` };
}

/** Countries used for price/tax resolution (isoCode2 is what the API takes). */
async function country(isoCode2: string, currencyCode: string) {
  return prisma.country.upsert({
    where: { isoCode2 },
    update: { currencyCode },
    create: { name: `Country ${isoCode2}`, isoCode2, currencyCode },
  });
}

const plan = (data: { name: string; service?: "MEMBERSHIP" | "MERCHANT_ACCOUNT"; priceCredits?: number | null; durationDays?: number }) =>
  prisma.servicePlan.create({
    data: {
      name: `${data.name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      service: data.service ?? "MEMBERSHIP",
      durationDays: data.durationDays ?? 30,
      priceCents: 999,
      priceCredits: data.priceCredits === undefined ? 500 : data.priceCredits,
    },
  });

/** The catalogue entry for one plan, or undefined when the plan is not listed. */
async function catalogEntry(query: string, planId: string) {
  const res = await request(app).get(`/plans/catalog${query}`);
  expect(res.status).toBe(200);
  return res.body.services.flatMap((s: { plans: { id: string }[] }) => s.plans).find((p: { id: string }) => p.id === planId);
}

describe("The pricing catalogue (sections 24/60/64)", () => {
  it("lists every service in one call, with the auto-responder rendered from the settings it lives in", async () => {
    const res = await request(app).get("/plans/catalog");

    expect(res.status).toBe(200);
    expect(res.body.creditName).toBeTruthy();
    expect(res.body.creditsPerUsd).toBeGreaterThan(0);

    const services = res.body.services.map((s: { service: string }) => s.service);
    // The responder prices are single-sourced in PlatformSetting, so they are rendered read-only here.
    expect(services).toContain("RESPONDER_CUSTOMER");
    expect(services).toContain("RESPONDER_MERCHANT");

    const responder = res.body.services.find((s: { service: string }) => s.service === "RESPONDER_CUSTOMER").plans[0];
    expect(responder.source).toBe("settings");
    expect(responder.editable).toBe(false);
    expect(responder.priceCredits).toBeGreaterThan(0);
    expect(responder.source === "settings" && responder.features.length >= 0).toBe(true);
  });

  it("prices a plan per country and falls back to the plan's own price everywhere else", async () => {
    const de = await country("DE", "EUR");
    const sy = await country("SY", "SYP");
    const p = await plan({ name: "Per-country", priceCredits: 1000 });

    const adminAuth = await admin();
    const priced = await request(app)
      .put(`/plans/${p.id}/prices`)
      .set("Authorization", adminAuth.bearer)
      .send({ prices: [{ countryId: de.id, priceCredits: 800, cashAmountCents: 899, currencyCode: "EUR" }] });
    expect(priced.status).toBe(200);

    // Guest asking for Germany pays the override…
    const inGermany = await catalogEntry("?country=DE", p.id);
    expect(inGermany).toMatchObject({ priceCredits: 800, priceFrom: "country", basePriceCredits: 1000, cashAmountCents: 899 });

    // …a guest asking for a country without an override pays the plan's own price…
    const inSyria = await catalogEntry("?country=SY", p.id);
    expect(inSyria).toMatchObject({ priceCredits: 1000, priceFrom: "default" });

    // …and the account's own country wins over the query parameter when signed in.
    const german = await account("germanuser", "DE");
    const signedIn = await request(app).get("/plans/catalog?country=SY").set("Authorization", german.bearer);
    const entry = signedIn.body.services.flatMap((s: { plans: { id: string }[] }) => s.plans).find((x: { id: string }) => x.id === p.id);
    expect(entry).toMatchObject({ priceCredits: 800, priceFrom: "country" });
    expect(signedIn.body.countryCode).toBe("DE");
    expect(sy.id).toBeTruthy();
  });

  it("lets an admin build a merchant plan with specifications and a quota, and shows it on the page", async () => {
    const auth = await admin();

    const created = await request(app)
      .post("/plans")
      .set("Authorization", auth.bearer)
      .send({
        service: "MERCHANT_ACCOUNT",
        name: `باقة متجر ${Date.now()}`,
        description: "للتجار الصغار",
        durationDays: 30,
        trialDays: 7,
        priceCents: 1900,
        currency: "EUR",
        priceCredits: 1800,
        monthlyBroadcastLimit: 4,
      });
    expect(created.status).toBe(201);
    expect(created.body.monthlyBroadcastLimit).toBe(4);

    const features = await request(app)
      .put(`/plans/${created.body.id}/features`)
      .set("Authorization", auth.bearer)
      .send({
        features: [
          { text: "٤ إشعارات للمتابعين شهريًا", included: true },
          { text: "بدون إشعارات جماعية", included: false },
        ],
      });
    expect(features.status).toBe(200);
    expect(features.body.map((f: { text: string }) => f.text)).toEqual([
      "٤ إشعارات للمتابعين شهريًا",
      "بدون إشعارات جماعية",
    ]);

    const entry = await catalogEntry("", created.body.id);
    expect(entry).toMatchObject({ service: "MERCHANT_ACCOUNT", priceCredits: 1800, monthlyBroadcastLimit: 4, source: "catalog", editable: true });
    expect(entry.features).toEqual([
      { text: "٤ إشعارات للمتابعين شهريًا", included: true },
      { text: "بدون إشعارات جماعية", included: false },
    ]);

    // The admin list has everything the editor needs in one round trip.
    const list = await request(app).get("/plans/admin").set("Authorization", auth.bearer);
    const row = list.body.find((p: { id: string }) => p.id === created.body.id);
    expect(row.features).toHaveLength(2);
    expect(row._count.memberships).toBe(0);
  });

  it("refuses a membership subscription to a plan that is not a membership", async () => {
    const merchantPlan = await plan({ name: "Merchant only", service: "MERCHANT_ACCOUNT" });
    const customer = await account("wrongplan");

    const res = await request(app).post("/membership/subscribe").set("Authorization", customer.bearer).send({ planId: merchantPlan.id });
    expect(res.status).toBe(404);
    expect(await prisma.membership.count({ where: { userId: customer.id } })).toBe(0);
  });

  it("protects the plan and tax editors behind the admin role", async () => {
    const customer = await account("plaincustomer");
    const p = await plan({ name: "Protected" });

    expect((await request(app).post("/plans").send({ service: "MEMBERSHIP", name: "x", durationDays: 30, priceCents: 0 })).status).toBe(401);
    expect((await request(app).get("/plans/admin").set("Authorization", customer.bearer)).status).toBe(403);
    expect((await request(app).put(`/plans/${p.id}/features`).set("Authorization", customer.bearer).send({ features: [] })).status).toBe(403);
    expect((await request(app).put(`/plans/${p.id}/prices`).set("Authorization", customer.bearer).send({ prices: [] })).status).toBe(403);
    expect((await request(app).put("/plans/tax-rates").set("Authorization", customer.bearer).send({ name: "VAT", percentBps: 1900 })).status).toBe(403);
  });

  it("refuses to delete a plan that still has memberships, but deletes an unused one", async () => {
    const auth = await admin();
    const used = await plan({ name: "In use", priceCredits: 0 });
    const member = await account("planmember");
    await request(app).post("/membership/subscribe").set("Authorization", member.bearer).send({ planId: used.id });

    const blocked = await request(app).delete(`/plans/${used.id}`).set("Authorization", auth.bearer);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PLAN_IN_USE");

    const unused = await plan({ name: "Unused" });
    const removed = await request(app).delete(`/plans/${unused.id}`).set("Authorization", auth.bearer);
    expect(removed.status).toBe(200);
    expect(await prisma.servicePlan.findUnique({ where: { id: unused.id } })).toBeNull();
  });

  it("keeps two countries from sharing the same override list entry", async () => {
    const auth = await admin();
    const de = await country("DE", "EUR");
    const p = await plan({ name: "Duplicates" });

    const res = await request(app)
      .put(`/plans/${p.id}/prices`)
      .set("Authorization", auth.bearer)
      .send({ prices: [{ countryId: de.id, priceCredits: 100 }, { countryId: de.id, priceCredits: 200 }] });
    expect(res.status).toBe(400);
  });
});

describe("Tax rates (sections 58/64)", () => {
  it("stores a rate per country plus one platform default, and resolves the right one", async () => {
    const auth = await admin();
    const de = await country("DE", "EUR");

    const german = await request(app)
      .put("/plans/tax-rates")
      .set("Authorization", auth.bearer)
      .send({ countryId: de.id, name: "VAT 19%", percentBps: 1900 });
    expect(german.status).toBe(200);
    expect(german.body).toMatchObject({ name: "VAT 19%", percentBps: 1900, isDefault: false });

    const fallback = await request(app)
      .put("/plans/tax-rates")
      .set("Authorization", auth.bearer)
      .send({ name: "ضريبة افتراضية", percentBps: 0 });
    expect(fallback.status).toBe(200);
    expect(fallback.body.isDefault).toBe(true); // no country = the platform default

    // Updating the same country replaces rather than duplicates.
    await request(app).put("/plans/tax-rates").set("Authorization", auth.bearer).send({ countryId: de.id, name: "VAT 20%", percentBps: 2000 });
    const list = await request(app).get("/plans/tax-rates").set("Authorization", auth.bearer);
    expect(list.body.filter((r: { countryId: string | null }) => r.countryId === de.id)).toHaveLength(1);

    expect((await taxRateFor("DE"))?.percentBps).toBe(2000);
    expect((await taxRateFor("SY"))?.isDefault).toBe(true); // no rate of its own -> platform default

    const removed = await request(app).delete(`/plans/tax-rates/${german.body.id}`).set("Authorization", auth.bearer);
    expect(removed.status).toBe(200);
  });

  it("rejects a nonsense percentage", async () => {
    const auth = await admin();
    const tooBig = await request(app).put("/plans/tax-rates").set("Authorization", auth.bearer).send({ name: "VAT", percentBps: 20000 });
    expect(tooBig.status).toBe(400);
  });
});

describe("The account's country drives the price", () => {
  it("is accepted by the profile update and returned by the catalogue", async () => {
    const user = await account("countryuser");
    await country("FR", "EUR");

    const patched = await request(app).patch("/profile/me").set("Authorization", user.bearer).send({ countryCode: "fr", vatNumber: "FR12345678901" });
    expect(patched.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.countryCode).toBe("FR"); // upper-cased on the way in
    expect(stored.vatNumber).toBe("FR12345678901");

    const catalog = await request(app).get("/plans/catalog").set("Authorization", user.bearer);
    expect(catalog.body.countryCode).toBe("FR");

    const bad = await request(app).patch("/profile/me").set("Authorization", user.bearer).send({ countryCode: "France" });
    expect(bad.status).toBe(400);
  });
});

import crypto from "crypto";
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { adjustBalance } from "../src/services/wallet.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const PASSWORD = "correct-horse-battery-staple";

// Registering returns a token already, which keeps this file far below the login rate limit.
async function account(prefix: string, data: { countryCode?: string; vatNumber?: string } = {}) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password: PASSWORD, fullName: "Country Tester" });
  expect(registered.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (Object.keys(data).length) await prisma.user.update({ where: { id: user.id }, data });
  return { id: user.id, auth: { Authorization: `Bearer ${registered.body.token}` } };
}

// A code no other test file can pick (the shared two-letter counter is only unique inside one process,
// and test files run in parallel), so these countries never collide with the geography tests'.
const newCountry = () =>
  prisma.country.create({
    data: { name: `Test ${crypto.randomUUID().slice(0, 6)}`, isoCode2: `T${crypto.randomBytes(3).toString("hex").toUpperCase()}`, currencyCode: "TST", defaultLanguage: "en" },
  });

const giveCredits = (userId: string, amount: number) => prisma.$transaction((tx) => adjustBalance(tx, userId, amount, "TOPUP", "test-credit"));
const balance = (userId: string) => prisma.wallet.findUnique({ where: { userId } }).then((w) => w?.balance ?? 0);

describe("A membership is charged the price the customer's country is shown (section 64)", () => {
  it("debits the country override, the plan's own price elsewhere, and ignores an inactive override", async () => {
    const country = await newCountry();
    const plan = await prisma.servicePlan.create({
      data: { name: `Country price ${crypto.randomUUID().slice(0, 6)}`, durationDays: 30, priceCents: 999, priceCredits: 100 },
    });
    const override = await prisma.planPrice.create({ data: { planId: plan.id, countryId: country.id, priceCredits: 60 } });

    // The pricing page and the charge agree: a customer in that country sees 60 …
    const local = await account("localbuyer", { countryCode: country.isoCode2 });
    const shown = await request(app).get("/plans/catalog").set(local.auth);
    const entry = shown.body.services.flatMap((s: { plans: { id: string }[] }) => s.plans).find((p: { id: string }) => p.id === plan.id);
    expect(entry.priceCredits).toBe(60);

    // … and is charged 60.
    await giveCredits(local.id, 200);
    const bought = await request(app).post("/membership/subscribe").set(local.auth).send({ planId: plan.id });
    expect(bought.status).toBe(201);
    expect(bought.body.creditsPaid).toBe(60);
    expect(await balance(local.id)).toBe(140);

    // A customer with no country (or another one) pays the plan's own price.
    const elsewhere = await account("elsewherebuyer");
    await giveCredits(elsewhere.id, 200);
    const base = await request(app).post("/membership/subscribe").set(elsewhere.auth).send({ planId: plan.id });
    expect(base.body.creditsPaid).toBe(100);
    expect(await balance(elsewhere.id)).toBe(100);

    // An override the admin switched off no longer applies.
    await prisma.planPrice.update({ where: { id: override.id }, data: { isActive: false } });
    const afterOff = await account("afteroff", { countryCode: country.isoCode2 });
    await giveCredits(afterOff.id, 200);
    const off = await request(app).post("/membership/subscribe").set(afterOff.auth).send({ planId: plan.id });
    expect(off.body.creditsPaid).toBe(100);
  });

  it("still refuses when the plan costs money and no credit price exists for that customer", async () => {
    const plan = await prisma.servicePlan.create({
      data: { name: `Unpriced ${crypto.randomUUID().slice(0, 6)}`, durationDays: 30, priceCents: 500, priceCredits: null },
    });
    const user = await account("unpriced");
    await giveCredits(user.id, 1000);
    const res = await request(app).post("/membership/subscribe").set(user.auth).send({ planId: plan.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PLAN_PRICING_NOT_CONFIGURED");
    expect(await balance(user.id)).toBe(1000);
  });
});

describe("Invoices show VAT when the admin has set a rate (section 58)", () => {
  async function paidOrderFor(customer: { id: string; auth: Record<string, string> }) {
    const owner = await account("vatshop");
    const category = await prisma.category.upsert({ where: { slug: "vat-test-cat" }, update: {}, create: { name: "VAT Test", slug: "vat-test-cat" } });
    await prisma.merchantProfile.create({
      data: { userId: owner.id, businessName: `VAT Shop ${crypto.randomUUID().slice(0, 5)}`, categoryId: category.id, approvalStatus: "APPROVED" },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
    const product = await request(app).post("/products").set(owner.auth).send({ name: "منتج", priceCents: 5000, stock: 10, categoryId: category.id });
    expect(product.status).toBe(201);
    await request(app).post("/cart/items").set(customer.auth).send({ productId: product.body.id, quantity: 2 });
    const checkout = await request(app).post("/cart/checkout").set(customer.auth);
    expect(checkout.status).toBe(201);
    return checkout.body[0].id as string; // total 10000 cents
  }

  it("splits the tax out of the tax-inclusive total, with the customer's tax number", async () => {
    const country = await newCountry();
    await prisma.taxRate.create({ data: { countryId: country.id, name: "VAT 19%", percentBps: 1900 } });
    const customer = await account("vatcustomer", { countryCode: country.isoCode2, vatNumber: "DE123456789" });
    const orderId = await paidOrderFor(customer);

    const html = (await request(app).get(`/invoices/order/${orderId}`).set(customer.auth)).text;
    expect(html).toContain("VAT 19%");
    expect(html).toContain("15.97 €"); // 10000 × 1900 / 11900, rounded
    expect(html).toContain("84.03 €"); // what is left before tax
    expect(html).toContain("100.00 €"); // the total itself is never changed
    expect(html).toContain("DE123456789");
  });

  it("prints no tax lines for a 0% rate", async () => {
    const country = await newCountry();
    await prisma.taxRate.create({ data: { countryId: country.id, name: "VAT 0%", percentBps: 0 } });
    const customer = await account("zerovat", { countryCode: country.isoCode2 });
    const orderId = await paidOrderFor(customer);

    const html = (await request(app).get(`/invoices/order/${orderId}`).set(customer.auth)).text;
    expect(html).not.toContain("VAT 0%");
    expect(html).not.toContain("الصافي قبل الضريبة");
    expect(html).toContain("100.00 €");
  });
});

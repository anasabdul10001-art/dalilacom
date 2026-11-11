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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Acc ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
let planId: string | undefined;
async function accountingPlan() {
  if (!planId) planId = (await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc plan ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } })).id;
  return planId;
}
/** An account with an active accounting subscription. */
async function subscriber(prefix: string, periodEnd: Date | null = new Date(Date.now() + 30 * 86400000)) {
  const a = await account(prefix);
  await prisma.platformSubscription.create({ data: { userId: a.id, planId: await accountingPlan(), provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: periodEnd } });
  return a;
}
const addProduct = (a: { auth: object }, body: Record<string, unknown> = {}) => request(app).post("/accounting/products").set(a.auth).send({ name: "Tea", costCents: 100, salePriceCents: 250, quantity: 5, currency: "EUR", ...body });

describe("accounting: who may use it", () => {
  it("needs an active accounting plan", async () => {
    const none = await account("accnone");
    const res = await request(app).get("/accounting/summary").set(none.auth);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("ACCOUNTING_PLAN_REQUIRED");
    expect((await request(app).get("/accounting/summary")).status).toBe(401);
  });

  it("is closed again when the subscription period has ended, or it is cancelled", async () => {
    const ended = await subscriber("accended", new Date(Date.now() - 1000));
    expect((await request(app).get("/accounting/summary").set(ended.auth)).status).toBe(402);
    const cancelled = await subscriber("acccancel");
    await prisma.platformSubscription.updateMany({ where: { userId: cancelled.id }, data: { status: "CANCELLED" } });
    expect((await request(app).get("/accounting/summary").set(cancelled.auth)).status).toBe(402);
  });
});

describe("accounting: income and expenses", () => {
  it("adds entries and sums them per currency; each account sees only its own", async () => {
    const a = await subscriber("accent");
    const b = await subscriber("accother");
    expect((await request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "Sales", description: "Shop sale", amountCents: 10000 })).status).toBe(201);
    expect((await request(app).post("/accounting/entries").set(a.auth).send({ type: "EXPENSE", category: "Rent", description: "Rent May", amountCents: 3500 })).status).toBe(201);
    expect((await request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "Sales", description: "Dollar sale", amountCents: 500, currency: "usd" })).status).toBe(201);
    const summary = (await request(app).get("/accounting/summary").set(a.auth)).body;
    expect(summary.totals).toEqual(expect.arrayContaining([{ currency: "EUR", incomeCents: 10000, expensesCents: 3500, netCents: 6500 }, { currency: "USD", incomeCents: 500, expensesCents: 0, netCents: 500 }]));
    expect((await request(app).get("/accounting/entries").set(a.auth)).body).toHaveLength(3);
    expect((await request(app).get("/accounting/entries").set(b.auth)).body).toHaveLength(0);
    expect((await request(app).get("/accounting/entries").query({ type: "EXPENSE" }).set(a.auth)).body).toHaveLength(1);
  });

  it("refuses a zero or negative amount, a bad currency and a bad period", async () => {
    const a = await subscriber("accbad");
    const bad = (extra: object) => request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "x", description: "xx", amountCents: 100, ...extra });
    expect((await bad({ amountCents: 0 })).status).toBe(400);
    expect((await bad({ amountCents: -5 })).status).toBe(400);
    expect((await bad({ currency: "EURO" })).status).toBe(400);
    expect((await request(app).get("/accounting/summary").query({ from: "2026-12-01", to: "2026-01-01" }).set(a.auth)).status).toBe(400);
  });

  it("a period given as plain dates includes the whole last day", async () => {
    const a = await subscriber("accday");
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "Sales", description: "Evening sale", amountCents: 700, occurredAt: "2026-03-10T18:30:00.000Z" });
    const summary = (await request(app).get("/accounting/summary").query({ from: "2026-03-10", to: "2026-03-10" }).set(a.auth)).body;
    expect(summary.totals).toEqual([{ currency: "EUR", incomeCents: 700, expensesCents: 0, netCents: 700 }]);
  });
});

describe("accounting: stock and sales", () => {
  it("a product with stock gets an opening movement; a sale lowers the stock and books income and cost", async () => {
    const a = await subscriber("accstock");
    const made = await addProduct(a, { barcode: "123456" });
    expect(made.status).toBe(201);
    expect(await prisma.accountingStockMovement.count({ where: { productId: made.body.id, action: "STOCK_IN", quantity: 5 } })).toBe(1);
    expect((await addProduct(a, { barcode: "123456" })).status).toBe(409); // the same barcode twice
    expect((await request(app).get("/accounting/products/barcode/123456").set(a.auth)).body.id).toBe(made.body.id);

    const sold = await request(app).post(`/accounting/products/${made.body.id}/sell`).set(a.auth).send({ quantity: 2 });
    expect(sold.status).toBe(201);
    expect(sold.body).toMatchObject({ incomeCents: 500, costCents: 200, netCents: 300 });
    expect(sold.body.product.quantity).toBe(3);
    const summary = (await request(app).get("/accounting/summary").set(a.auth)).body;
    expect(summary.totals[0]).toMatchObject({ incomeCents: 500, expensesCents: 200, netCents: 300 });
  });

  it("cannot sell or take out more than is in stock, and a sale needs a price", async () => {
    const a = await subscriber("accover");
    const p = (await addProduct(a, { quantity: 2 })).body;
    expect((await request(app).post(`/accounting/products/${p.id}/sell`).set(a.auth).send({ quantity: 3 })).status).toBe(409);
    expect((await request(app).post(`/accounting/products/${p.id}/stock`).set(a.auth).send({ action: "STOCK_OUT", quantity: 3 })).status).toBe(409);
    expect((await request(app).post(`/accounting/products/${p.id}/stock`).set(a.auth).send({ action: "STOCK_IN", quantity: 0 })).status).toBe(400);
    expect((await request(app).post(`/accounting/products/${p.id}/stock`).set(a.auth).send({ action: "ADJUSTMENT", quantity: 9 })).body.quantity).toBe(9);
    const free = (await addProduct(a, { salePriceCents: 0 })).body;
    expect((await request(app).post(`/accounting/products/${free.id}/sell`).set(a.auth).send({ quantity: 1 })).status).toBe(400);
    expect((await request(app).post(`/accounting/products/${free.id}/sell`).set(a.auth).send({ quantity: 1, unitPriceCents: 400 })).status).toBe(201);
  });

  it("another account cannot see, sell or change my product", async () => {
    const a = await subscriber("accown");
    const b = await subscriber("accintruder");
    const p = (await addProduct(a)).body;
    expect((await request(app).get("/accounting/products").set(b.auth)).body).toHaveLength(0);
    expect((await request(app).post(`/accounting/products/${p.id}/sell`).set(b.auth).send({ quantity: 1 })).status).toBe(404);
    expect((await request(app).post(`/accounting/products/${p.id}/stock`).set(b.auth).send({ action: "STOCK_IN", quantity: 1 })).status).toBe(404);
    expect((await request(app).get("/accounting/products/barcode/none").set(b.auth)).status).toBe(404);
  });

  it("simultaneous sales never sell more than the stock", async () => {
    const a = await subscriber("accrace");
    const p = (await addProduct(a, { quantity: 3 })).body;
    const results = await Promise.all(Array.from({ length: 8 }, () => request(app).post(`/accounting/products/${p.id}/sell`).set(a.auth).send({ quantity: 1 })));
    const sold = results.filter((r) => r.status === 201).length;
    const left = (await prisma.accountingProduct.findUniqueOrThrow({ where: { id: p.id } })).quantity;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(sold).toBe(3);
    expect(await prisma.accountingEntry.count({ where: { userId: a.id, type: "INCOME" } })).toBe(sold);
  });
});

describe("accounting: the web store feeds it", () => {
  it("a delivered order books income, cost, commission and delivery once", async () => {
    const cat = await prisma.category.upsert({ where: { slug: "acc-test-cat" }, update: {}, create: { name: "Acc Test", slug: "acc-test-cat" } });
    const owner = await subscriber("accshop");
    await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
    const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Acc Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
    expect(reg.status).toBe(201);
    await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
    const product = await request(app).post("/products").set(owner.auth).send({ name: "Acc product", priceCents: 1000, costPriceCents: 400, stock: 9, categoryId: cat.id });
    expect(product.status).toBe(201);
    const customer = await account("acccust");
    await request(app).post("/cart/items").set(customer.auth).send({ productId: product.body.id, quantity: 2 });
    const checkout = await request(app).post("/cart/checkout").set(customer.auth).send({});
    expect(checkout.status).toBe(201);
    const orderId = checkout.body[0].id as string;
    for (const status of ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"]) {
      expect((await request(app).patch(`/orders/${orderId}/status`).set(owner.auth).send({ status })).status, status).toBe(200);
    }
    const entries = (await request(app).get("/accounting/entries").set(owner.auth)).body as { type: string; category: string; amountCents: number }[];
    expect(entries.find((e) => e.type === "INCOME")).toMatchObject({ amountCents: 2000 });
    expect(entries.find((e) => e.category === "تكلفة البضاعة المباعة")).toMatchObject({ type: "EXPENSE", amountCents: 800 });
    const { recordDeliveredOrder } = await import("../src/services/accounting.service");
    await recordDeliveredOrder(orderId); // a retry changes nothing
    expect((await request(app).get("/accounting/entries").set(owner.auth)).body).toHaveLength(entries.length);
  });
});

describe("accounting: export", () => {
  it("downloads the entries as a CSV file and keeps quotes safe", async () => {
    const a = await subscriber("acccsv");
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "EXPENSE", category: "Office", description: 'Paper "A4"', amountCents: 1250 });
    const res = await request(app).get("/accounting/export.csv").set(a.auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain('"Paper ""A4"""');
    expect(res.text).toContain('"12.50"');
  });

  it("does not let a cell start with a formula character (spreadsheet formula injection)", async () => {
    const a = await subscriber("acccsvx");
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "EXPENSE", category: "Office", description: '=HYPERLINK("http://evil.example","x")', amountCents: 100 });
    const res = await request(app).get("/accounting/export.csv").set(a.auth);
    expect(res.text).not.toMatch(/;"=HYPERLINK/);
  });
});

describe("store stock under simultaneous orders and sales", () => {
  it("two customers checking out together cannot both get the last piece, and manual sales cannot oversell a store product", async () => {
    const cat = await prisma.category.upsert({ where: { slug: "acc-test-cat" }, update: {}, create: { name: "Acc Test", slug: "acc-test-cat" } });
    const owner = await subscriber("accrace2");
    await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
    const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Acc Race ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
    await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
    const made = await request(app).post("/products").set(owner.auth).send({ name: "Last one", priceCents: 1000, stock: 1, categoryId: cat.id });
    expect(made.status).toBe(201);
    const customers = await Promise.all([account("accc1"), account("accc2"), account("accc3")]);
    for (const c of customers) expect((await request(app).post("/cart/items").set(c.auth).send({ productId: made.body.id, quantity: 1 })).status).toBe(201);
    const out = await Promise.all(customers.map((c) => request(app).post("/cart/checkout").set(c.auth).send({})));
    expect(out.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: made.body.id } })).stock).toBe(0);

    await prisma.product.update({ where: { id: made.body.id }, data: { stock: 2 } });
    const sales = await Promise.all(Array.from({ length: 6 }, () => request(app).post(`/accounting/products/store:${made.body.id}/sell`).set(owner.auth).send({ quantity: 1 })));
    expect(sales.filter((r) => r.status === 201)).toHaveLength(2);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: made.body.id } })).stock).toBe(0);
  });
});

describe("accounting: correcting mistakes", () => {
  it("edits and deletes a hand-typed entry, but not one the store wrote, and not someone else's", async () => {
    const a = await subscriber("acccorr");
    const b = await subscriber("acccorr2");
    const entry = (await request(app).post("/accounting/entries").set(a.auth).send({ type: "EXPENSE", category: "Rent", description: "Rent May", amountCents: 3500 })).body;
    const edited = await request(app).patch(`/accounting/entries/${entry.id}`).set(a.auth).send({ amountCents: 4000, description: "Rent May (fixed)" });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ amountCents: 4000, description: "Rent May (fixed)", type: "EXPENSE" });
    expect((await request(app).patch(`/accounting/entries/${entry.id}`).set(a.auth).send({ amountCents: 0 })).status).toBe(400);
    expect((await request(app).patch(`/accounting/entries/${entry.id}`).set(b.auth).send({ amountCents: 1 })).status).toBe(404);
    expect((await request(app).delete(`/accounting/entries/${entry.id}`).set(b.auth)).status).toBe(404);

    const auto = await prisma.accountingEntry.create({ data: { userId: a.id, type: "INCOME", category: "x", description: "from an order", amountCents: 100, source: "ORDER", sourceKey: `t:${crypto.randomUUID()}` } });
    expect((await request(app).patch(`/accounting/entries/${auto.id}`).set(a.auth).send({ amountCents: 1 })).status).toBe(409);
    expect((await request(app).delete(`/accounting/entries/${auto.id}`).set(a.auth)).status).toBe(409);

    expect((await request(app).delete(`/accounting/entries/${entry.id}`).set(a.auth)).status).toBe(200);
    expect((await request(app).get("/accounting/entries").set(a.auth)).body.map((e: { id: string }) => e.id)).toEqual([auto.id]);
  });

  it("edits a product (not its quantity, which only moves with stock changes) and deletes it", async () => {
    const a = await subscriber("acccorrp");
    const b = await subscriber("acccorrp2");
    const p = (await addProduct(a, { barcode: "777" })).body;
    const other = (await addProduct(a, { barcode: "888" })).body;
    const edited = await request(app).patch(`/accounting/products/${p.id}`).set(a.auth).send({ name: "Green tea", salePriceCents: 300, quantity: 999 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: "Green tea", salePriceCents: 300, quantity: 5 });
    expect((await request(app).patch(`/accounting/products/${p.id}`).set(a.auth).send({ barcode: "888" })).status).toBe(409);
    expect((await request(app).patch(`/accounting/products/${p.id}`).set(a.auth).send({ barcode: "" })).body.barcode).toBeNull();
    expect((await request(app).patch(`/accounting/products/${p.id}`).set(b.auth).send({ name: "Mine now" })).status).toBe(404);
    expect((await request(app).patch("/accounting/products/store:abc").set(a.auth).send({ name: "x1" })).status).toBe(400);
    expect((await request(app).delete(`/accounting/products/${p.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).delete(`/accounting/products/${p.id}`).set(a.auth)).status).toBe(200);
    expect((await request(app).get("/accounting/products").set(a.auth)).body.map((x: { id: string }) => x.id)).toEqual([other.id]);
  });
});

describe("accounting: invoice scans have a daily cap", () => {
  it("refuses a scan once the account has used its daily allowance", async () => {
    const a = await subscriber("accscan");
    process.env.ACCOUNTING_SCAN_DAILY_LIMIT = "2";
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key"; // makes the vision check pass; the cap is checked before any AI call
    try {
      for (let i = 0; i < 2; i++) await prisma.accountingInvoiceDraft.create({ data: { userId: a.id, mime: "image/png", data: Buffer.from([1]) } });
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      const res = await request(app).post("/accounting/invoices/scan").set(a.auth).set("Content-Type", "image/png").send(png);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("SCAN_LIMIT");
    } finally {
      delete process.env.ACCOUNTING_SCAN_DAILY_LIMIT;
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
    }
  });
});


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
async function subscriber(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Tax ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc tax ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
type A = { auth: object; id: string };
const rate = async (a: A, name: string, ratePercent: number) => (await request(app).post("/accounting/tax/rates").set(a.auth).send({ name, ratePercent })).body;
const product = async (a: A, body: Record<string, unknown>) => (await request(app).post("/accounting/products").set(a.auth).send({ costCents: 400, salePriceCents: 1190, quantity: 50, currency: "EUR", ...body })).body;
const setup = (a: A, body: Record<string, unknown>) => request(app).put("/accounting/settings").set(a.auth).send(body);
const today = () => new Date().toISOString().slice(0, 10);
const taxReport = (a: A) => request(app).get("/accounting/tax/report").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);
const cash = (a: A) => request(app).get("/accounting/cash").query({ day: today(), currency: "EUR" }).set(a.auth);

describe("accounting: tax (experimental)", () => {
  it("with no rate set nothing changes", async () => {
    const a = await subscriber("tax0");
    const tea = await product(a, { name: "Tea" });
    const res = await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 2 }] });
    expect(res.body).toMatchObject({ totalCents: 2380, taxCents: 0 });
    expect((await taxReport(a)).body).toMatchObject({ outputTaxCents: 0, inputTaxCents: 0, payableCents: 0, byRate: [] });
  });

  it("prices with the tax inside: the tax is taken out of the price, the income is without it, and the box gets the whole price", async () => {
    const a = await subscriber("tax1");
    const vat = await rate(a, "VAT 19", 19);
    await setup(a, { pricesIncludeTax: true, defaultTaxRateId: vat.id });
    const tea = await product(a, { name: "Tea", salePriceCents: 1190 });
    const res = await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 2 }] });
    expect(res.body).toMatchObject({ subtotalCents: 2380, totalCents: 2380, taxCents: 380, pricesIncludeTax: true });
    expect(res.body.lines[0]).toMatchObject({ taxRateBp: 1900, taxCents: 380 });
    const entries = await prisma.accountingEntry.findMany({ where: { userId: a.id, source: "SALE" }, orderBy: { amountCents: "desc" } });
    expect(entries.map((e) => [e.type, Number(e.amountCents)])).toEqual([["INCOME", 2000], ["EXPENSE", 800], ["RECEIPT", 380]]);
    expect((await cash(a)).body).toMatchObject({ cashInCents: 2380 });
    const rep = await taxReport(a);
    expect(rep.body.byRate).toEqual([{ ratePercent: 19, outputBaseCents: 2000, outputTaxCents: 380, inputBaseCents: 0, inputTaxCents: 0 }]);
  });

  it("prices without the tax: it is added on top, and a discount lowers the base the tax is on", async () => {
    const a = await subscriber("tax2");
    const vat = await rate(a, "VAT 10", 10);
    await setup(a, { pricesIncludeTax: false, defaultTaxRateId: vat.id });
    const tea = await product(a, { name: "Tea", salePriceCents: 1000 });
    const res = await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 4 }], discountCents: 1000 });
    expect(res.body).toMatchObject({ subtotalCents: 4000, discountCents: 1000, taxCents: 300, totalCents: 3300 }); // (4000 - 1000) x 10% on top
    const entries = await prisma.accountingEntry.findMany({ where: { userId: a.id, source: "SALE", type: { in: ["INCOME", "RECEIPT"] } }, orderBy: { amountCents: "desc" } });
    expect(entries.map((e) => [e.type, Number(e.amountCents)])).toEqual([["INCOME", 3000], ["RECEIPT", 300]]);
  });

  it("each product can have its own rate, and the quick sale is taxed too", async () => {
    const a = await subscriber("tax3");
    const food = await rate(a, "Food 7", 7);
    const vat = await rate(a, "VAT 19", 19);
    await setup(a, { pricesIncludeTax: true, defaultTaxRateId: vat.id });
    const bread = await product(a, { name: "Bread", salePriceCents: 1070, taxRateId: food.id });
    const phone = await product(a, { name: "Phone", salePriceCents: 11900 });
    const res = await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: bread.id, quantity: 1 }, { productId: phone.id, quantity: 1 }] });
    expect(res.body.lines.map((l: { name: string; taxRateBp: number; taxCents: number }) => [l.name, l.taxRateBp, l.taxCents])).toEqual([["Bread", 700, 70], ["Phone", 1900, 1900]]);
    expect(res.body.taxCents).toBe(1970);
    const quick = await request(app).post(`/accounting/products/${bread.id}/sell`).set(a.auth).send({ quantity: 2 });
    expect(quick.status).toBe(201);
    expect(quick.body).toMatchObject({ incomeCents: 2000, taxCents: 140 });
    expect(quick.body.product.quantity).toBe(47);
    expect((await taxReport(a)).body.outputTaxCents).toBe(2110);
  });

  it("a purchase pays the tax on top of the cost, and the tax of purchases is claimed against the tax of sales", async () => {
    const a = await subscriber("tax4");
    const vat = await rate(a, "VAT 19", 19);
    await setup(a, { pricesIncludeTax: true, defaultTaxRateId: vat.id });
    const tea = await product(a, { name: "Tea", costCents: 100, quantity: 0, salePriceCents: 1190 });
    const buy = await request(app).post("/accounting/purchases").set(a.auth).send({ items: [{ productId: tea.id, quantity: 10, unitCostCents: 1000 }] });
    expect(buy.body).toMatchObject({ totalCents: 11900, taxCents: 1900, paidCents: 11900 });
    expect((await prisma.accountingProduct.findUniqueOrThrow({ where: { id: tea.id } })).costCents).toBe(1000); // the cost has no tax
    await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 4 }] }); // 4 x 1190, tax 760
    const rep = await taxReport(a);
    expect(rep.body).toMatchObject({ outputTaxCents: 760, inputTaxCents: 1900, payableCents: -1140 }); // more paid than collected: a claim
  });

  it("returns take the tax back: a sales return lowers the tax collected, a purchase return the tax paid", async () => {
    const a = await subscriber("tax5");
    const vat = await rate(a, "VAT 19", 19);
    await setup(a, { pricesIncludeTax: true, defaultTaxRateId: vat.id });
    const tea = await product(a, { name: "Tea", costCents: 1000, quantity: 0, salePriceCents: 1190 });
    const buy = (await request(app).post("/accounting/purchases").set(a.auth).send({ items: [{ productId: tea.id, quantity: 10, unitCostCents: 1000 }] })).body;
    const sale = (await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 4 }] })).body; // total 4760, tax 760
    const back = await request(app).post(`/accounting/sales/${sale.id}/returns`).set(a.auth).send({ items: [{ lineId: sale.lines[0].id, quantity: 1 }] });
    expect(back.body).toMatchObject({ totalCents: 1190 });
    const ret = await request(app).post(`/accounting/purchases/${buy.id}/returns`).set(a.auth).send({ items: [{ lineId: buy.lines[0].id, quantity: 2 }] });
    expect(ret.body).toMatchObject({ totalCents: 2380 }); // 2 x 1000 + 380 tax
    const rep = await taxReport(a);
    expect(rep.body.byRate[0]).toEqual({ ratePercent: 19, outputBaseCents: 3000, outputTaxCents: 570, inputBaseCents: 8000, inputTaxCents: 1520 });
    // the income after the return is the net of the 3 pieces that stayed sold
    const profit = await request(app).get("/accounting/reports").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);
    expect(profit.body.totals).toMatchObject({ incomeCents: 3000, expensesCents: 3000 });
  });

  it("rates are the account's own, a rate is switched off and never deleted, and a rate of another account is refused", async () => {
    const a = await subscriber("tax6");
    const b = await subscriber("tax7");
    const vat = await rate(a, "VAT 19", 19);
    expect((await request(app).get("/accounting/tax/rates").set(b.auth)).body).toEqual([]);
    expect((await setup(b, { defaultTaxRateId: vat.id })).status).toBe(404);
    expect((await request(app).post("/accounting/products").set(b.auth).send({ name: "Tea", taxRateId: vat.id, salePriceCents: 100, quantity: 1 })).status).toBe(404);
    expect((await request(app).patch(`/accounting/tax/rates/${vat.id}`).set(b.auth).send({ active: false })).status).toBe(404);
    await setup(a, { defaultTaxRateId: vat.id, taxNumber: "DE123", businessName: "Shop" });
    const tea = await product(a, { name: "Tea", salePriceCents: 1190 });
    await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 1 }] });
    expect((await request(app).patch(`/accounting/tax/rates/${vat.id}`).set(a.auth).send({ active: false })).body.active).toBe(false);
    // switched off: new sales are not taxed, the old one keeps its tax in the report
    expect((await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 1 }] })).body.taxCents).toBe(0);
    const rep = await taxReport(a);
    expect(rep.body.outputTaxCents).toBe(190);
    expect(rep.body.settings).toMatchObject({ taxNumber: "DE123", businessName: "Shop" });
    expect((await request(app).get("/accounting/tax/report").query({ from: "2026-03-31", to: "2026-03-01" }).set(a.auth)).status).toBe(400);
  });
});

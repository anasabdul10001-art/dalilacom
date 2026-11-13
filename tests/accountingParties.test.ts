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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Party ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc party ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const party = async (a: { auth: object }, kind: string, name: string) => (await request(app).post("/accounting/parties").set(a.auth).send({ kind, name })).body;
const product = async (a: { auth: object }, body: Record<string, unknown>) => (await request(app).post("/accounting/products").set(a.auth).send({ costCents: 100, salePriceCents: 1000, quantity: 20, currency: "EUR", ...body })).body;
const today = () => new Date().toISOString().slice(0, 10);
const cash = (a: { auth: object }) => request(app).get("/accounting/cash").query({ day: today(), currency: "EUR" }).set(a.auth);

describe("accounting: customers and suppliers", () => {
  it("creates, renames, archives; names are unique per kind", async () => {
    const a = await subscriber("pty1");
    const c = await party(a, "CUSTOMER", "Sam");
    expect(c).toMatchObject({ kind: "CUSTOMER", name: "Sam", balances: [] });
    expect((await request(app).post("/accounting/parties").set(a.auth).send({ kind: "CUSTOMER", name: "Sam" })).status).toBe(409);
    expect((await request(app).post("/accounting/parties").set(a.auth).send({ kind: "SUPPLIER", name: "Sam" })).status).toBe(201);
    expect((await request(app).patch(`/accounting/parties/${c.id}`).set(a.auth).send({ name: "Samuel", phone: "123" })).body).toMatchObject({ name: "Samuel", phone: "123" });
    await request(app).patch(`/accounting/parties/${c.id}`).set(a.auth).send({ archived: true });
    const list = await request(app).get("/accounting/parties").query({ kind: "CUSTOMER" }).set(a.auth);
    expect(list.body.parties).toHaveLength(0);
    expect((await request(app).get("/accounting/parties").query({ kind: "CUSTOMER", archived: "1" }).set(a.auth)).body.parties).toHaveLength(1);
  });

  it("a sale on credit: the income is booked, what was paid is a receipt in the cash box, the rest is the debt of the customer", async () => {
    const a = await subscriber("pty2");
    const c = await party(a, "CUSTOMER", "Sam");
    const tea = await product(a, { name: "Tea" });
    const res = await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 5 }], partyId: c.id, paidCents: 2000, payMethod: "CASH" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ totalCents: 5000, paidCents: 2000, customerName: "Sam" });
    const entries = await prisma.accountingEntry.findMany({ where: { userId: a.id, source: "SALE" }, orderBy: { amountCents: "desc" } });
    expect(entries.map((e) => [e.type, Number(e.amountCents), e.payMethod])).toEqual([["INCOME", 5000, null], ["RECEIPT", 2000, "CASH"], ["EXPENSE", 500, null]]);
    const box = await cash(a);
    expect(box.body).toMatchObject({ cashInCents: 2000, expectedCents: 2000 }); // only what was really paid is in the box
    const stmt = await request(app).get(`/accounting/parties/${c.id}`).set(a.auth);
    expect(stmt.body.balances).toEqual([{ currency: "EUR", balanceCents: 3000 }]);
    expect(stmt.body.entries.map((e: { kind: string; amountCents: number; balanceAfterCents: number }) => [e.kind, e.amountCents, e.balanceAfterCents])).toEqual([["PAYMENT", 2000, 3000], ["CHARGE", 5000, 5000]]);
    const list = await request(app).get("/accounting/parties").set(a.auth);
    expect(list.body.receivable).toEqual([{ currency: "EUR", cents: 3000 }]);
  });

  it("a payment lowers the debt and is cash received, never profit again; paying more than owed is refused", async () => {
    const a = await subscriber("pty3");
    const c = await party(a, "CUSTOMER", "Sam");
    const tea = await product(a, { name: "Tea" });
    await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 3 }], partyId: c.id, paidCents: 0 });
    expect((await request(app).post(`/accounting/parties/${c.id}/payments`).set(a.auth).send({ amountCents: 4000, currency: "EUR" })).status).toBe(409);
    expect((await request(app).post(`/accounting/parties/${c.id}/payments`).set(a.auth).send({ amountCents: 1000, currency: "EUR", payMethod: "BANK" })).status).toBe(201);
    expect((await request(app).post(`/accounting/parties/${c.id}/payments`).set(a.auth).send({ amountCents: 2000, currency: "EUR", payMethod: "CASH" })).status).toBe(201);
    expect((await request(app).get(`/accounting/parties/${c.id}`).set(a.auth)).body.balances).toEqual([]);
    expect((await cash(a)).body).toMatchObject({ cashInCents: 2000 });
    const rep = await request(app).get("/accounting/reports").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);
    expect(rep.body.totals).toMatchObject({ incomeCents: 3000, expensesCents: 300 }); // the receipts do not count as income again
  });

  it("a supplier: what we owe, a debt that is also booked as an expense, and a payout from the cash box", async () => {
    const a = await subscriber("pty4");
    const s = await party(a, "SUPPLIER", "Mill");
    expect((await request(app).post(`/accounting/parties/${s.id}/charges`).set(a.auth).send({ amountCents: 9000, currency: "EUR", note: "flour", book: true })).status).toBe(201);
    expect((await request(app).post(`/accounting/parties/${s.id}/charges`).set(a.auth).send({ amountCents: 1000, currency: "EUR", note: "old balance" })).status).toBe(201);
    expect((await request(app).get("/accounting/parties").set(a.auth)).body.payable).toEqual([{ currency: "EUR", cents: 10000 }]);
    expect((await request(app).post(`/accounting/parties/${s.id}/payments`).set(a.auth).send({ amountCents: 4000, currency: "EUR", payMethod: "CASH" })).status).toBe(201);
    expect((await cash(a)).body).toMatchObject({ cashOutCents: 4000, expectedCents: -4000 });
    expect((await request(app).get(`/accounting/parties/${s.id}`).set(a.auth)).body.balances).toEqual([{ currency: "EUR", balanceCents: 6000 }]);
    const rep = await request(app).get("/accounting/reports").query({ from: today(), to: today(), currency: "EUR" }).set(a.auth);
    expect(rep.body.totals).toMatchObject({ expensesCents: 9000 }); // only the booked debt is an expense; the old balance and the payout are not
  });

  it("credit needs a registered customer, is private to the account, and a customer of another account is not found", async () => {
    const a = await subscriber("pty5");
    const b = await subscriber("pty6");
    const c = await party(a, "CUSTOMER", "Sam");
    const tea = await product(a, { name: "Tea" });
    expect((await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 1 }], paidCents: 100 })).status).toBe(400);
    expect((await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 1 }], partyId: c.id, paidCents: 99999 })).status).toBe(400);
    const tea2 = await product(b, { name: "Tea" });
    expect((await request(app).post("/accounting/sales").set(b.auth).send({ items: [{ productId: tea2.id, quantity: 1 }], partyId: c.id, paidCents: 0 })).status).toBe(404);
    expect((await request(app).get(`/accounting/parties/${c.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).get("/accounting/parties").set(b.auth)).body.parties).toEqual([]);
    // a sale paid in full on a customer account still leaves no debt
    expect((await request(app).post("/accounting/sales").set(a.auth).send({ items: [{ productId: tea.id, quantity: 1 }], partyId: c.id })).status).toBe(201);
    expect((await request(app).get(`/accounting/parties/${c.id}`).set(a.auth)).body.balances).toEqual([]);
  });
});

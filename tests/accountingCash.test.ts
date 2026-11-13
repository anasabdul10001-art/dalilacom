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
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Cash ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Acc cash ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } });
  await prisma.platformSubscription.create({ data: { userId: user.id, planId: plan.id, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const day = "2026-05-10";
const at = (h: number) => `${day}T${String(h).padStart(2, "0")}:00:00.000Z`;
const entry = (a: { auth: object }, body: Record<string, unknown>) => request(app).post("/accounting/entries").set(a.auth).send({ category: "مبيعات", description: "test entry", currency: "EUR", ...body });

describe("accounting: payment method and the cash box", () => {
  it("an entry is cash unless it says otherwise, and remembers who typed it", async () => {
    const a = await subscriber("cashdef");
    const res = await entry(a, { type: "INCOME", amountCents: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.payMethod).toBe("CASH");
    expect(res.body.recordedById).toBe(a.id);
    const bank = await entry(a, { type: "INCOME", amountCents: 500, payMethod: "BANK" });
    expect(bank.body.payMethod).toBe("BANK");
    expect((await entry(a, { type: "INCOME", amountCents: 500, payMethod: "CHEQUE" })).status).toBe(400);
  });

  it("the expected cash is opening + cash in - cash out; bank and wallet stay out of it", async () => {
    const a = await subscriber("cashsum");
    await request(app).put("/accounting/cash/opening").set(a.auth).send({ day, currency: "EUR", openingCents: 10000 });
    await entry(a, { type: "INCOME", amountCents: 5000, occurredAt: at(9) });
    await entry(a, { type: "EXPENSE", amountCents: 1200, occurredAt: at(10) });
    await entry(a, { type: "INCOME", amountCents: 7000, payMethod: "BANK", occurredAt: at(11) });
    await entry(a, { type: "INCOME", amountCents: 300, payMethod: "WALLET", occurredAt: at(12) });
    await entry(a, { type: "INCOME", amountCents: 999, occurredAt: "2026-05-11T09:00:00.000Z" }); // another day
    const res = await request(app).get("/accounting/cash").query({ day, currency: "EUR" }).set(a.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ openingCents: 10000, openingSource: "set", cashInCents: 5000, cashOutCents: 1200, expectedCents: 13800, closed: false, countedCents: null, differenceCents: null });
    expect(res.body.methods.find((m: { payMethod: string }) => m.payMethod === "BANK").incomeCents).toBe(7000);
    expect(res.body.methods.find((m: { payMethod: string }) => m.payMethod === "WALLET").incomeCents).toBe(300);
  });

  it("closing a day keeps what was counted and the difference; the next day opens with it", async () => {
    const a = await subscriber("cashclose");
    await entry(a, { type: "INCOME", amountCents: 4000, occurredAt: at(9) });
    expect((await request(app).post("/accounting/cash/close").set(a.auth).send({ day, currency: "EUR", countedCents: 3900, note: "short by one" })).status).toBe(200);
    const closed = await request(app).get("/accounting/cash").query({ day, currency: "EUR" }).set(a.auth);
    expect(closed.body).toMatchObject({ openingCents: 0, expectedCents: 4000, closed: true, countedCents: 3900, differenceCents: -100, note: "short by one" });
    const next = await request(app).get("/accounting/cash").query({ day: "2026-05-11", currency: "EUR" }).set(a.auth);
    expect(next.body).toMatchObject({ openingCents: 3900, openingSource: "previous", expectedCents: 3900 });
    // a closed day cannot get a new opening by hand until it is opened again
    expect((await request(app).put("/accounting/cash/opening").set(a.auth).send({ day, currency: "EUR", openingCents: 1 })).status).toBe(409);
    expect((await request(app).delete("/accounting/cash/close").query({ day, currency: "EUR" }).set(a.auth)).status).toBe(200);
    const reopened = await request(app).get("/accounting/cash").query({ day, currency: "EUR" }).set(a.auth);
    expect(reopened.body).toMatchObject({ closed: false, countedCents: null });
  });

  it("each currency has its own box, and each account only sees its own", async () => {
    const a = await subscriber("cashcur");
    const b = await subscriber("cashother");
    await entry(a, { type: "INCOME", amountCents: 2500, currency: "USD", occurredAt: at(9) });
    const usd = await request(app).get("/accounting/cash").query({ day, currency: "USD" }).set(a.auth);
    const eur = await request(app).get("/accounting/cash").query({ day, currency: "EUR" }).set(a.auth);
    const other = await request(app).get("/accounting/cash").query({ day, currency: "USD" }).set(b.auth);
    expect(usd.body.cashInCents).toBe(2500);
    expect(eur.body.cashInCents).toBe(0);
    expect(other.body.cashInCents).toBe(0);
    expect((await request(app).get("/accounting/cash").query({ day: "not-a-date", currency: "EUR" }).set(a.auth)).status).toBe(400);
  });

  it("a sale is cash by default and can be paid by bank", async () => {
    const a = await subscriber("cashsale");
    const p = await request(app).post("/accounting/products").set(a.auth).send({ name: "Tea", costCents: 100, salePriceCents: 250, quantity: 10, currency: "EUR" });
    expect((await request(app).post(`/accounting/products/${p.body.id}/sell`).set(a.auth).send({ quantity: 2 })).status).toBe(201);
    expect((await request(app).post(`/accounting/products/${p.body.id}/sell`).set(a.auth).send({ quantity: 1, payMethod: "BANK" })).status).toBe(201);
    const rows = await prisma.accountingEntry.findMany({ where: { userId: a.id, category: "مبيعات" }, orderBy: { amountCents: "desc" } });
    expect(rows.map((r) => [Number(r.amountCents), r.payMethod, r.recordedById === a.id])).toEqual([[500, "CASH", true], [250, "BANK", true]]);
  });
});

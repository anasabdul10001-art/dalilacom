import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { signHrRequest } from "../src/services/hrLink.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
let planId: string | undefined;
/** An account, with an active accounting plan unless told otherwise. */
async function owner(prefix: string, subscribed = true) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Owner ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await request(app).post("/auth/login").send({ email, password });
  if (subscribed) {
    planId ??= (await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `HR link plan ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } })).id;
    await prisma.platformSubscription.create({ data: { userId: user.id, planId, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  }
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
type Link = { linkId: string; secret: string };
/** An account already linked with an HR company: what the HR server holds afterwards. */
async function linked(prefix: string) {
  const a = await owner(prefix);
  const code = (await request(app).post("/accounting/hr-link/code").set(a.auth)).body.code as string;
  const res = await request(app).post("/integrations/hr/connect").send({ code, companyName: `Company ${prefix}` });
  expect(res.status).toBe(201);
  return { ...a, link: res.body as Link };
}
const now = () => String(Math.floor(Date.now() / 1000));
/** A call the way the HR server makes it: signed over the exact bytes sent. */
function call(link: Link, path: string, body: object, opts: { timestamp?: string; secret?: string; sentBody?: object } = {}) {
  const raw = JSON.stringify(body);
  const timestamp = opts.timestamp ?? now();
  return request(app).post(`/integrations/hr/${path}`).set("Content-Type", "application/json")
    .set({ "X-HR-Link-Id": link.linkId, "X-HR-Timestamp": timestamp, "X-HR-Signature": signHrRequest(opts.secret ?? link.secret, timestamp, raw) })
    .send(opts.sentBody ? JSON.stringify(opts.sentBody) : raw);
}
const run = (extra: object = {}) => ({ runId: "run1", revision: 1, state: "PAID", periodStart: "2026-03-01", periodEnd: "2026-03-31", currency: "usd", totalCents: 250000, employeeCount: 4, ...extra });
const payrollEntries = (userId: string) => prisma.accountingEntry.findMany({ where: { userId, source: "PAYROLL" } });
const march = { from: "2026-03-01", to: "2026-03-31" };

describe("HR link: making the link", () => {
  it("needs an active accounting plan, and shows nothing about payroll to an account without a link", async () => {
    const none = await owner("hrnoplan", false);
    expect((await request(app).post("/accounting/hr-link/code").set(none.auth)).status).toBe(402);
    expect((await request(app).post("/accounting/hr-link/code")).status).toBe(401);
    const a = await owner("hrnolink");
    expect((await request(app).get("/accounting/hr-link").set(a.auth)).body).toEqual({ status: "NONE" });
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "EXPENSE", category: "Rent", description: "Rent", amountCents: 900 });
    const summary = (await request(app).get("/accounting/summary").set(a.auth)).body;
    expect(summary.hrLink).toBeUndefined();
    expect(summary.totals).toEqual([{ currency: "EUR", incomeCents: 0, expensesCents: 900, netCents: -900 }]);
  });

  it("shows the code once, keeps only its hash, and swaps it for a secret a single time", async () => {
    const a = await owner("hrcode");
    const made = await request(app).post("/accounting/hr-link/code").set(a.auth);
    expect(made.status).toBe(201);
    const code = made.body.code as string;
    const row = await prisma.hrLink.findFirstOrThrow({ where: { userId: a.id } });
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.codeHash).toBe(crypto.createHash("sha256").update(code).digest("hex"));
    expect((await request(app).get("/accounting/hr-link").set(a.auth)).body.status).toBe("PENDING");

    expect((await request(app).post("/integrations/hr/connect").send({ code: `${code}x`, companyName: "Acme" })).body.error.code).toBe("HR_LINK_CODE_INVALID");
    const connected = await request(app).post("/integrations/hr/connect").send({ code, companyName: "Acme" });
    expect(connected.status).toBe(201);
    expect(connected.body.secret).toMatch(/^[0-9a-f]{64}$/);
    // the secret is not readable in the database, and the code is spent
    const after = await prisma.hrLink.findUniqueOrThrow({ where: { id: connected.body.linkId } });
    expect(after.secretEnc).not.toContain(connected.body.secret);
    expect(after.codeHash).toBeNull();
    expect((await request(app).post("/integrations/hr/connect").send({ code, companyName: "Other" })).status).toBe(400);
    expect((await request(app).get("/accounting/hr-link").set(a.auth)).body).toMatchObject({ status: "CONNECTED", companyName: "Acme" });
    // one link per account
    expect((await request(app).post("/accounting/hr-link/code").set(a.auth)).status).toBe(409);
  });

  it("refuses an expired code, and a newer code replaces an unused older one", async () => {
    const a = await owner("hrexpired");
    const first = (await request(app).post("/accounting/hr-link/code").set(a.auth)).body.code;
    const second = (await request(app).post("/accounting/hr-link/code").set(a.auth)).body.code;
    expect((await request(app).post("/integrations/hr/connect").send({ code: first, companyName: "Acme" })).status).toBe(400);
    await prisma.hrLink.updateMany({ where: { userId: a.id }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/integrations/hr/connect").send({ code: second, companyName: "Acme" })).status).toBe(400);
    expect((await request(app).get("/accounting/hr-link").set(a.auth)).body).toEqual({ status: "NONE" });
  });
});

describe("HR link: signed payroll messages", () => {
  it("books a paid run as one payroll expense in its own currency, in the month that was worked", async () => {
    const a = await linked("hrpaid");
    await request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "Sales", description: "March sales", amountCents: 900000, currency: "USD", occurredAt: "2026-03-15T10:00:00.000Z" });
    const res = await call(a.link, "payroll", run());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: true, revision: 1 });
    const [entry] = await payrollEntries(a.id);
    expect(entry).toMatchObject({ type: "EXPENSE", category: "رواتب", currency: "USD", source: "PAYROLL", sourceKey: `hr-payroll:${a.link.linkId}:run1` });
    expect(Number(entry.amountCents)).toBe(250000);
    expect(entry.occurredAt.toISOString()).toBe("2026-03-31T12:00:00.000Z");
    const summary = (await request(app).get("/accounting/summary").query(march).set(a.auth)).body;
    expect(summary.totals).toEqual([{ currency: "USD", incomeCents: 900000, expensesCents: 250000, netCents: 650000, payrollCents: 250000 }]);
    expect(summary.hrLink).toMatchObject({ companyName: "Company hrpaid" });
    const listed = (await request(app).get("/accounting/entries").set(a.auth)).body.find((e: { source: string }) => e.source === "PAYROLL");
    expect(listed.amountCents).toBe(250000);
  });

  it("refuses a wrong signature, a changed body, an unsigned call and an old message", async () => {
    const a = await linked("hrsig");
    expect((await call(a.link, "payroll", run(), { secret: "0".repeat(64) })).body.error.code).toBe("HR_SIGNATURE_INVALID");
    expect((await call(a.link, "payroll", run(), { sentBody: run({ totalCents: 1 }) })).status).toBe(401);
    expect((await request(app).post("/integrations/hr/payroll").send(run())).status).toBe(401);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const stale = await call(a.link, "payroll", run(), { timestamp: old });
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe("HR_REQUEST_STALE");
    expect((await call(a.link, "payroll", run(), { timestamp: String(Math.floor(Date.now() / 1000) + 3600) })).status).toBe(401);
    expect(await payrollEntries(a.id)).toHaveLength(0);
  });

  it("accepts totals only: a message carrying anything else (such as employee data) is refused", async () => {
    const a = await linked("hrstrict");
    expect((await call(a.link, "payroll", run({ employees: [{ name: "Sara", netPay: 1000 }] }))).status).toBe(400);
    expect((await call(a.link, "payroll", run({ totalCents: 10.5 }))).status).toBe(400);
    expect((await call(a.link, "payroll", run({ totalCents: -1 }))).status).toBe(400);
    expect((await call(a.link, "payroll", run({ periodEnd: "31.03.2026" }))).status).toBe(400);
    expect(await payrollEntries(a.id)).toHaveLength(0);
  });

  it("a repeated message changes nothing, and a late older one is ignored", async () => {
    const a = await linked("hrdup");
    expect((await call(a.link, "payroll", run({ revision: 2 }))).body.applied).toBe(true);
    expect((await call(a.link, "payroll", run({ revision: 2 }))).body).toEqual({ applied: false, revision: 2 });
    expect((await call(a.link, "payroll", run({ revision: 1, totalCents: 999 }))).body.applied).toBe(false);
    const entries = await payrollEntries(a.id);
    expect(entries).toHaveLength(1);
    expect(Number(entries[0].amountCents)).toBe(250000);
    // the same message sent twice at the same moment still leaves one entry
    const both = await Promise.all([call(a.link, "payroll", run({ runId: "run2" })), call(a.link, "payroll", run({ runId: "run2" }))]);
    expect(both.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(await payrollEntries(a.id)).toHaveLength(2);
  });

  it("taking the payment back removes the expense; paying again books it again", async () => {
    const a = await linked("hrrevert");
    await call(a.link, "payroll", run());
    expect((await call(a.link, "payroll", run({ revision: 2, state: "REVERTED" }))).body.applied).toBe(true);
    expect(await payrollEntries(a.id)).toHaveLength(0);
    expect((await request(app).get("/accounting/summary").query(march).set(a.auth)).body.totals).toEqual([]);
    // the first "paid" arriving late must not bring the expense back
    expect((await call(a.link, "payroll", run())).body.applied).toBe(false);
    expect(await payrollEntries(a.id)).toHaveLength(0);
    await call(a.link, "payroll", run({ revision: 3, totalCents: 260000 }));
    const entries = await payrollEntries(a.id);
    expect(entries).toHaveLength(1);
    expect(Number(entries[0].amountCents)).toBe(260000);
  });

  it("takes a total larger than 32 bits and keeps the sums exact", async () => {
    const a = await linked("hrbig");
    expect((await call(a.link, "payroll", run({ currency: "SYP", totalCents: 7_500_000_000 }))).status).toBe(200);
    expect((await call(a.link, "payroll", run({ runId: "run2", currency: "SYP", totalCents: 6_000_000_000 }))).status).toBe(200);
    const summary = (await request(app).get("/accounting/summary").query(march).set(a.auth)).body;
    expect(summary.totals).toEqual([{ currency: "SYP", incomeCents: 0, expensesCents: 13_500_000_000, netCents: -13_500_000_000, payrollCents: 13_500_000_000 }]);
    expect((await request(app).get("/accounting/export.csv").set(a.auth)).text).toContain('"75000000.00"');
    // a hand-typed entry may be that large too
    expect((await request(app).post("/accounting/entries").set(a.auth).send({ type: "INCOME", category: "Sales", description: "Big sale", amountCents: 5_000_000_000, currency: "SYP" })).body.amountCents).toBe(5_000_000_000);
  });

  it("keeps arriving while the accounting plan has lapsed, so the books have no gap", async () => {
    const a = await linked("hrlapsed");
    await prisma.platformSubscription.updateMany({ where: { userId: a.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/accounting/summary").set(a.auth)).status).toBe(402);
    expect((await call(a.link, "payroll", run())).status).toBe(200);
    expect(await payrollEntries(a.id)).toHaveLength(1);
  });
});

describe("HR link: one company never reaches another account", () => {
  it("writes only into the account of its own link, even with the same run number", async () => {
    const a = await linked("hrisoa");
    const b = await linked("hrisob");
    await call(a.link, "payroll", run({ totalCents: 111 }));
    await call(b.link, "payroll", run({ totalCents: 222 }));
    expect((await payrollEntries(a.id)).map((e) => Number(e.amountCents))).toEqual([111]);
    expect((await payrollEntries(b.id)).map((e) => Number(e.amountCents))).toEqual([222]);
    // A's secret on B's link is a wrong signature; a body cannot name another account either
    expect((await call({ linkId: b.link.linkId, secret: a.link.secret }, "payroll", run({ revision: 2, state: "REVERTED" }))).status).toBe(401);
    expect((await call(a.link, "payroll", run({ revision: 2, userId: b.id }))).status).toBe(400);
    await call(a.link, "payroll", run({ revision: 3, state: "REVERTED" }));
    expect(await payrollEntries(a.id)).toHaveLength(0);
    expect(await payrollEntries(b.id)).toHaveLength(1);
    expect((await request(app).get("/accounting/entries").set(a.auth)).body).toHaveLength(0);
  });
});

describe("HR link: payroll entries in the books, and cancelling the link", () => {
  it("cannot be edited or deleted by hand while the link is alive", async () => {
    const a = await linked("hrlock");
    await call(a.link, "payroll", run());
    const [entry] = await payrollEntries(a.id);
    const patch = await request(app).patch(`/accounting/entries/${entry.id}`).set(a.auth).send({ amountCents: 1 });
    expect(patch.status).toBe(409);
    expect(patch.body.error.message).toContain("الموارد البشرية");
    expect((await request(app).delete(`/accounting/entries/${entry.id}`).set(a.auth)).status).toBe(409);
    expect(await payrollEntries(a.id)).toHaveLength(1);
  });

  it("cancelled from the accounting side: later messages are refused, old entries stay and can then be deleted by hand", async () => {
    const a = await linked("hrrevoke");
    await call(a.link, "payroll", run());
    expect((await request(app).delete("/accounting/hr-link").set(a.auth)).body).toEqual({ revoked: true });
    expect((await prisma.hrLink.findUniqueOrThrow({ where: { id: a.link.linkId } })).secretEnc).toBeNull();
    const refused = await call(a.link, "payroll", run({ runId: "run2" }));
    expect(refused.status).toBe(410);
    expect(refused.body.error.code).toBe("HR_LINK_GONE");
    expect((await call(a.link, "payroll", run({ revision: 2, state: "REVERTED" }))).status).toBe(410);
    const entries = await payrollEntries(a.id);
    expect(entries).toHaveLength(1);
    const summary = (await request(app).get("/accounting/summary").query(march).set(a.auth)).body;
    expect(summary.hrLink).toBeUndefined();
    expect(summary.totals[0].payrollCents).toBe(250000); // real booked salaries are still shown as such
    expect((await request(app).patch(`/accounting/entries/${entries[0].id}`).set(a.auth).send({ amountCents: 1 })).status).toBe(409);
    expect((await request(app).delete(`/accounting/entries/${entries[0].id}`).set(a.auth)).status).toBe(200);
    // and the account can be linked afresh
    expect((await request(app).post("/accounting/hr-link/code").set(a.auth)).status).toBe(201);
  });

  it("cancelled from the HR side with a signed call", async () => {
    const a = await linked("hrbye");
    expect((await call(a.link, "disconnect", {}, { secret: "1".repeat(64) })).status).toBe(401);
    expect((await call(a.link, "disconnect", {})).body).toEqual({ revoked: true });
    expect((await request(app).get("/accounting/hr-link").set(a.auth)).body).toEqual({ status: "NONE" });
    expect((await call(a.link, "payroll", run())).status).toBe(410);
  });
});

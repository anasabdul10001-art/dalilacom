import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { seedCategories } from "../prisma/categories.seed";
import { company as hrCompany, hire } from "./hrHelpers";

beforeAll(async () => { await seedCategories(prisma); }, 120000);
afterAll(async () => { await prisma.$disconnect(); });

const password = "correct-horse-battery-staple";
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Acc ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
let planId: string | undefined;
async function owner(prefix: string) {
  const a = await account(prefix);
  if (!planId) planId = (await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Staff plan ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } })).id;
  await prisma.platformSubscription.create({ data: { userId: a.id, planId, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  return a;
}
/** An owner with one product, and a staff member (given role and rate) who accepted the invitation. */
async function setup(role: string, salesRateBp: number) {
  const boss = await owner("stboss");
  const worker = await account("stworker");
  const staffId = (await request(app).post("/business-staff").set(boss.auth).send({ name: "Sami", role, salesRateBp })).body.id;
  const inv = await request(app).post(`/business-staff/${staffId}/invite`).set(boss.auth);
  const code = inv.body.code;
  const acc = await request(app).post("/business-staff/accept").set(worker.auth).send({ code });
  expect(acc.status).toBe(200);
  const product = (await request(app).post("/accounting/products").set(boss.auth).send({ name: "Tea", costCents: 100, salePriceCents: 1000, quantity: 20, currency: "EUR" })).body;
  const as = { ...worker.auth, "X-Business-Owner": boss.id };
  return { boss, worker, staffId, product, as };
}

describe("business staff", () => {
  it("shows no workplace to an account that was never invited", async () => {
    const plain = await account("stplain");
    expect((await request(app).get("/business-staff/workplaces").set(plain.auth)).body).toEqual([]);
  });

  it("an invitation code works once, and the workplace appears after it", async () => {
    const s = await setup("CASHIER", 0);
    const places = (await request(app).get("/business-staff/workplaces").set(s.worker.auth)).body;
    expect(places).toHaveLength(1);
    expect(places[0].ownerId).toBe(s.boss.id);
    const code = (await request(app).post(`/business-staff/${s.staffId}/invite`).set(s.boss.auth));
    expect(code.status).toBe(409); // already linked
    const other = await account("stother");
    expect((await request(app).post("/business-staff/accept").set(other.auth).send({ code: "bsi_notarealcode123456" })).status).toBe(400);
  });

  it("a stranger cannot work inside someone's accounting", async () => {
    const s = await setup("CASHIER", 0);
    const stranger = await account("ststranger");
    const res = await request(app).get("/accounting/products").set({ ...stranger.auth, "X-Business-Owner": s.boss.id });
    expect(res.status).toBe(403);
  });

  it("a cashier sells, is recorded by name, earns a commission, and cannot see the money", async () => {
    const s = await setup("CASHIER", 500); // 5%
    const sale = await request(app).post("/accounting/sales").set(s.as).send({ items: [{ productId: s.product.id, quantity: 2 }], payMethod: "CASH" });
    expect(sale.status).toBe(201);
    const row = await prisma.accountingSale.findFirstOrThrow({ where: { userId: s.boss.id } });
    expect(row.recordedById).toBe(s.worker.id);
    const c = await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: s.staffId } });
    expect(Number(c.amountCents)).toBe(100); // 5% of 2000
    expect((await request(app).get("/accounting/summary").set(s.as)).status).toBe(403);
    expect((await request(app).post("/accounting/entries").set(s.as).send({ type: "EXPENSE", category: "x", description: "xx", amountCents: 100 })).status).toBe(403);
    expect((await request(app).delete(`/accounting/products/${s.product.id}`).set(s.as)).status).toBe(403);
    // the cashier sees only their own invoices
    expect((await request(app).get("/accounting/sales").set(s.as)).body).toHaveLength(1);
    // and the staff member reads their own commissions
    const mine = (await request(app).get(`/business-staff/me/${s.staffId}/commissions`).set(s.worker.auth)).body;
    expect(mine).toHaveLength(1);
  });

  it("a return takes back its share of the unpaid commission", async () => {
    const s = await setup("MANAGER", 1000); // 10%
    const sale = (await request(app).post("/accounting/sales").set(s.as).send({ items: [{ productId: s.product.id, quantity: 4 }], payMethod: "CASH" })).body;
    expect(Number((await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: s.staffId } })).amountCents)).toBe(400);
    const full = (await request(app).get(`/accounting/sales/${sale.id}`).set(s.as)).body;
    const ret = await request(app).post(`/accounting/sales/${sale.id}/returns`).set(s.as).send({ items: [{ lineId: full.lines[0].id, quantity: 1 }] });
    expect(ret.status).toBe(201);
    expect(Number((await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: s.staffId } })).amountCents)).toBe(300);
  });

  it("paying the commissions books one expense and cannot be done twice", async () => {
    const s = await setup("ASSISTANT", 1000);
    await request(app).post("/accounting/sales").set(s.as).send({ items: [{ productId: s.product.id, quantity: 1 }], payMethod: "CASH" });
    const pay = await request(app).post(`/business-staff/${s.staffId}/commissions/pay`).set(s.boss.auth).send({ currency: "EUR" });
    expect(pay.status).toBe(200);
    expect(pay.body.paidCents).toBe(100);
    expect(await prisma.accountingEntry.count({ where: { userId: s.boss.id, category: "عمولات الموظفون" } })).toBe(1);
    expect((await request(app).post(`/business-staff/${s.staffId}/commissions/pay`).set(s.boss.auth).send({ currency: "EUR" })).status).toBe(409);
  });

  it("removing the staff member stops the access at once; a stock keeper cannot sell", async () => {
    const s = await setup("STOCK", 0);
    expect((await request(app).get("/accounting/products").set(s.as)).status).toBe(200);
    expect((await request(app).post("/accounting/sales").set(s.as).send({ items: [{ productId: s.product.id, quantity: 1 }], payMethod: "CASH" })).status).toBe(403);
    await request(app).delete(`/business-staff/${s.staffId}`).set(s.boss.auth);
    expect((await request(app).get("/accounting/products").set(s.as)).status).toBe(403);
    expect((await request(app).get("/business-staff/workplaces").set(s.worker.auth)).body).toEqual([]);
  });

  it("every role can have a commission, a fixed pay, or both; a stock keeper earns on all sales of the business", async () => {
    const s = await setup("STOCK", 200); // 2% on every sale
    const sale = await request(app).post("/accounting/sales").set({ ...(await account("stseller")).auth, "X-Business-Owner": s.boss.id }).send({ items: [{ productId: s.product.id, quantity: 1 }] });
    expect(sale.status).toBe(403); // a stranger cannot sell
    const seller = await account("stcashier");
    const cid = (await request(app).post("/business-staff").set(s.boss.auth).send({ name: "Lina", role: "CASHIER", salesRateBp: 0, fixedPayCents: 50000 })).body.id;
    const code = (await request(app).post(`/business-staff/${cid}/invite`).set(s.boss.auth)).body.code;
    await request(app).post("/business-staff/accept").set(seller.auth).send({ code });
    const ok = await request(app).post("/accounting/sales").set({ ...seller.auth, "X-Business-Owner": s.boss.id }).send({ items: [{ productId: s.product.id, quantity: 3 }], payMethod: "CASH" });
    expect(ok.status).toBe(201);
    const c = await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: s.staffId } });
    expect(Number(c.amountCents)).toBe(60); // 2% of 3000
    // a fixed pay alone: no commissions, and paying it books one expense
    expect(await prisma.businessStaffCommission.count({ where: { staffId: cid } })).toBe(0);
    expect((await request(app).post(`/business-staff/${cid}/salary/pay`).set(s.boss.auth)).status).toBe(200);
    expect(await prisma.accountingEntry.count({ where: { userId: s.boss.id, category: "رواتب الموظفون" } })).toBe(1);
    expect((await request(app).post(`/business-staff/${s.staffId}/salary/pay`).set(s.boss.auth)).status).toBe(409); // no fixed pay set
    const noPlan = await account("stnoplan");
    expect((await request(app).get("/business-staff").set(noPlan.auth)).status).toBe(402);
  });

  it("a driver takes a ready order, delivers it, and earns on its net", async () => {
    const boss = await owner("stdboss");
    const driver = await account("stdriver");
    const customer = await account("stcust");
    const category = await prisma.category.findFirstOrThrow();
    const shop = await prisma.merchantProfile.create({ data: { userId: boss.id, businessName: "Shop", categoryId: category.id, approvalStatus: "APPROVED", address: "x", phone: "1", latitude: 1, longitude: 2 } });
    const sid = (await request(app).post("/business-staff").set(boss.auth).send({ name: "Omar", role: "DRIVER", salesRateBp: 1000 })).body.id;
    const code = (await request(app).post(`/business-staff/${sid}/invite`).set(boss.auth)).body.code;
    await request(app).post("/business-staff/accept").set(driver.auth).send({ code });
    const order = await prisma.order.create({ data: { orderNumber: `T-${Date.now()}`, userId: customer.id, merchantId: shop.id, status: "PREPARING", subtotalCents: 5000, totalCents: 5000 } });
    const list = await request(app).get(`/business-staff/driver/${sid}/orders`).set(driver.auth);
    expect(list.body.map((o: { id: string }) => o.id)).toContain(order.id);
    expect((await request(app).post(`/business-staff/driver/${sid}/orders/${order.id}/deliver`).set(driver.auth)).status).toBe(409); // not picked up yet
    expect((await request(app).post(`/business-staff/driver/${sid}/orders/${order.id}/pickup`).set(driver.auth)).status).toBe(200);
    expect((await request(app).post(`/business-staff/driver/${sid}/orders/${order.id}/deliver`).set(driver.auth)).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DELIVERED");
    expect(Number((await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: sid } })).amountCents)).toBe(500);
    // the driver never reaches the accounting itself, and another account cannot use the driver routes
    expect((await request(app).get("/accounting/products").set({ ...driver.auth, "X-Business-Owner": boss.id })).status).toBe(403);
    expect((await request(app).get(`/business-staff/driver/${sid}/orders`).set(customer.auth)).status).toBe(403);
  });

  it("a marketer works on the shop offers and announcements only, and earns a team commission on delivered orders", async () => {
    const boss = await owner("stmboss");
    await prisma.user.update({ where: { id: boss.id }, data: { role: "MERCHANT" } });
    const marketer = await account("stmarketer");
    const customer = await account("stmcust");
    const category = await prisma.category.findFirstOrThrow();
    const shop = await prisma.merchantProfile.create({ data: { userId: boss.id, businessName: "Shop M", categoryId: category.id, approvalStatus: "APPROVED", address: "x", phone: "1", latitude: 1, longitude: 2 } });
    const sid = (await request(app).post("/business-staff").set(boss.auth).send({ name: "Mira", role: "MARKETER", salesRateBp: 300, fixedPayCents: 1000 })).body.id;
    const code = (await request(app).post(`/business-staff/${sid}/invite`).set(boss.auth)).body.code;
    await request(app).post("/business-staff/accept").set(marketer.auth).send({ code });
    const as = { ...marketer.auth, "X-Business-Owner": boss.id };
    const made = await request(app).post("/merchant/discounts").set(as).send({ title: "Weekend offer", percent: 20 });
    expect(made.status).toBe(201);
    expect((await prisma.discount.findFirstOrThrow({ where: { merchantId: shop.id } })).title).toBe("Weekend offer");
    expect((await request(app).get("/merchant/discounts").set(as)).body).toHaveLength(1);
    expect((await request(app).get("/broadcasts").set(as)).status).toBe(200);
    // nothing else of the shop or its money
    expect((await request(app).get("/accounting/summary").set(as)).status).toBe(403);
    expect((await request(app).get("/ads/mine").set(as)).status).toBe(403);
    // a stranger with the header gets nothing
    const stranger = await account("stmstranger");
    expect((await request(app).get("/merchant/discounts").set({ ...stranger.auth, "X-Business-Owner": boss.id })).status).toBe(403);
    // a delivered store order pays the marketer 3% of its net
    const order = await prisma.order.create({ data: { orderNumber: `M-${Date.now()}`, userId: customer.id, merchantId: shop.id, status: "SHIPPED", subtotalCents: 10000, totalCents: 10000 } });
    expect((await request(app).patch(`/orders/${order.id}/status`).set(boss.auth).send({ status: "DELIVERED" })).status).toBe(200);
    expect(Number((await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: sid } })).amountCents)).toBe(300);
  });

  it("the commissions of a staff member linked to payroll join the payslip once, and are then paid", async () => {
    const co = await hrCompany("stpay", "EUR");
    if (!planId) planId = (await prisma.servicePlan.create({ data: { service: "ACCOUNTING", name: `Staff plan ${crypto.randomUUID().slice(0, 5)}`, durationDays: 30, priceCents: 0, currency: "EUR", priceCredits: 0 } })).id;
    await prisma.platformSubscription.create({ data: { userId: co.id, planId, provider: "TEST", status: "ACTIVE", amountCents: 0, currency: "EUR", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
    const emp = (await hire(co, { baseSalary: 100000 })).body;
    expect((await request(app).get("/business-staff/hr-employees").set(co.auth)).body.map((e: { id: string }) => e.id)).toContain(emp.id);
    const sid = (await request(app).post("/business-staff").set(co.auth).send({ name: "Salma", role: "CASHIER", salesRateBp: 500 })).body.id;
    expect((await request(app).put(`/business-staff/${sid}/hr-employee`).set(co.auth).send({ hrEmployeeId: emp.id })).status).toBe(200);
    await prisma.businessStaffCommission.create({ data: { ownerId: co.id, staffId: sid, saleId: `t-${Date.now()}`, baseCents: 20000, rateBp: 500, amountCents: 1000, currency: "EUR" } });
    const day = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    const run = (await request(app).post("/hr/payroll-runs").set(co.auth).send({ periodStart: day(-1), periodEnd: day(1) })).body.id;
    const done = await request(app).post(`/hr/payroll-runs/${run}/process`).set(co.auth);
    expect(done.status).toBe(200);
    expect(done.body[0].grossPay).toBe(101000);
    expect((await prisma.businessStaffCommission.findFirstOrThrow({ where: { staffId: sid } })).status).toBe("PAID");
    // paying the commissions again by hand finds nothing due
    expect((await request(app).post(`/business-staff/${sid}/commissions/pay`).set(co.auth).send({ currency: "EUR" })).status).toBe(409);
  });
});

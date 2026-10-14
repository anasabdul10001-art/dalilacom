import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { onlyCountry } from "../src/services/viewerCountry.service";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
const DAY = 86_400_000;

async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "av-test-cat" }, update: {}, create: { name: "Av Test", slug: "av-test-cat" } });
  const email = uniqueEmail("avshop");
  expect((await request(app).post("/auth/register").send({ email, password, fullName: "Av shop" })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data: { role: "MERCHANT" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  const auth = { Authorization: `Bearer ${login.body.token}` };
  const reg = await request(app).post("/merchant/register").set(auth).send({ businessName: `Av Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  return { auth, id: reg.body.id as string, userId: user.id };
}

describe("the calendar of the store's advertising spaces", () => {
  it("shows 60 days, how many spaces are free each day, and where an ad of the chosen length fits", async () => {
    const s = await shop();
    // the shop books in the platform's only country, or else in its owner's: a code of its own keeps other tests' bookings away
    const own = `Z${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
    await prisma.user.update({ where: { id: s.userId }, data: { countryCode: own } });
    const country = (await onlyCountry()) ?? own;
    const product = await prisma.product.create({ data: { merchantId: s.id, name: "منتج", priceCents: 100, stock: 5 } });

    const empty = (await request(app).get("/ads/availability").query({ days: 7 }).set(s.auth)).body;
    expect(empty.slots).toBe(6);
    expect(empty.days).toHaveLength(60);
    expect(empty.days[0].date).toBe(new Date().toISOString().slice(0, 10));

    // all 6 spaces are taken from day 10 to day 20
    const now = new Date();
    const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (let slot = 1; slot <= 6; slot++) {
      await prisma.adBooking.create({ data: { merchantId: s.id, productId: product.id, countryCode: country, days: 10, credits: 0, status: "ACTIVE", requestedStart: new Date(startOfToday + 10 * DAY), startsAt: new Date(startOfToday + 10 * DAY), endsAt: new Date(startOfToday + 20 * DAY), slot } });
    }
    const days = async (n: number) => (await request(app).get("/ads/availability").query({ days: n }).set(s.auth)).body.days as { date: string; free: number; canStart: boolean }[];
    const seven = await days(7);
    expect(seven[12]).toMatchObject({ free: 0, canStart: false }); // full
    expect(seven[9].free).toBeGreaterThan(0); // the day before is open
    expect(seven[25].canStart).toBe(true); // after it ends
    expect((await days(3))[5].canStart).toBe(true); // 3 days from day 5 end before day 10
    expect((await days(10))[5].canStart).toBe(false); // 10 days from day 5 run into the full days
    expect((await days(10))[20].canStart).toBe(true);
  });

  it("is for shops only", async () => {
    expect((await request(app).get("/ads/availability")).status).toBe(401);
  });
});

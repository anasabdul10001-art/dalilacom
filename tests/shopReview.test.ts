import { describe, it, expect, afterAll, vi, beforeEach } from "vitest";
import request from "supertest";

// The AI is replaced by a rule on the shop's name so the tests are fast and need no key.
const screened: string[] = [];
vi.mock("../src/services/ai.service", async (original) => ({
  ...(await original<typeof import("../src/services/ai.service")>()),
  screenShop: vi.fn(async (shop: { businessName: string }) => {
    screened.push(shop.businessName);
    if (shop.businessName.includes("DOWN")) return null;
    if (shop.businessName.includes("BAD")) return { verdict: "BLOCK", reasons: ["اسم غير لائق"] };
    if (shop.businessName.includes("ODD")) return { verdict: "REVIEW", reasons: ["الاسم غريب"] };
    return { verdict: "OK", reasons: [] };
  }),
}));

import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  process.env.SHOP_REVIEW = "off";
  await prisma.$disconnect();
});

beforeEach(() => {
  screened.length = 0;
  process.env.SHOP_REVIEW = "on";
});

const password = "correct-horse-battery-staple";
async function person(prefix: string) {
  const email = uniqueEmail(prefix);
  await request(app).post("/auth/register").send({ email, password, fullName: `Sr ${prefix}` });
  const login = await request(app).post("/auth/login").send({ email, password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
async function admin() {
  const p = await person("sra");
  await prisma.user.update({ where: { id: p.id }, data: { role: "ADMIN" } });
  return p;
}
async function register(p: { auth: Record<string, string> }, name: string, extra: Record<string, unknown> = {}) {
  const category = await prisma.category.findFirstOrThrow({ where: { isOnline: false } });
  return request(app).post("/merchant/register").set(p.auth).send({ businessName: name, categoryId: category.id, address: "شارع تجريبي", latitude: 33.5, longitude: 36.3, ...extra });
}

describe("a shop that registers is read at once", () => {
  it("an ordinary shop goes live by itself and the owner is told", async () => {
    const p = await person("sr1");
    const res = await register(p, "Good Bakery");
    expect(res.status).toBe(201);
    expect(res.body.approvalStatus).toBe("APPROVED");
    expect(screened).toContain("Good Bakery");
    const shop = await prisma.merchantProfile.findUniqueOrThrow({ where: { userId: p.id } });
    expect(shop).toMatchObject({ approvalStatus: "APPROVED", reviewSource: "AI" });
    expect(await prisma.notification.count({ where: { userId: p.id, title: "انقبل نشاطك ✅" } })).toBe(1);
    // and it is on the map
    const found = (await request(app).get("/merchant").query({ q: "Good Bakery" })).body;
    expect(found.some((m: { id: string }) => m.id === shop.id)).toBe(true);
  });

  it("a clear violation is refused with the reason, and the owner can fix it and try again", async () => {
    const p = await person("sr2");
    const res = await register(p, "BAD Name");
    expect(res.body).toMatchObject({ approvalStatus: "REJECTED", reason: "اسم غير لائق" });
    expect(await prisma.notification.count({ where: { userId: p.id, title: "ما انقبل نشاطك" } })).toBe(1);
    const fixed = await request(app).patch("/merchant/me").set(p.auth).send({ businessName: "Fixed Name Cafe" });
    expect(fixed.status).toBe(200);
    expect(fixed.body.approvalStatus).toBe("APPROVED");
  });

  it("profanity is refused even when no AI answers", async () => {
    const p = await person("sr3");
    const res = await register(p, "DOWN fuck shop");
    expect(res.body.approvalStatus).toBe("REJECTED");
    expect(screened).toHaveLength(0); // the plain check stopped it before the AI
  });

  it("a doubtful shop, or any shop when no AI answers, waits for an admin, who is told", async () => {
    const boss = await admin(); // an admin has to exist to be told
    const odd = await person("sr4");
    expect((await register(odd, "ODD Place")).body.approvalStatus).toBe("PENDING");
    expect((await prisma.merchantProfile.findUniqueOrThrow({ where: { userId: odd.id } })).reviewNote).toBe("الاسم غريب");
    const down = await person("sr5");
    expect((await register(down, "DOWN Cafe")).body.approvalStatus).toBe("PENDING");
    expect(await prisma.notification.count({ where: { userId: boss.id, title: "نشاط بانتظار المراجعة" } })).toBeGreaterThan(0);
  });

  it("nonsense that needs no AI is only looked at by an admin", async () => {
    const p = await person("sr6");
    const res = await register(p, "aaaaaaaaaa");
    expect(res.body.approvalStatus).toBe("PENDING");
  });

  it("the admin's decision tells the owner, and a live shop that renames itself into a violation is taken down", async () => {
    const boss = await admin();
    const odd = await person("sr7");
    const reg = await register(odd, "ODD Admin Case");
    await request(app).post(`/merchant/${reg.body.id}/approve`).set(boss.auth).expect(200);
    expect(await prisma.notification.count({ where: { userId: odd.id, title: "انقبل نشاطك ✅" } })).toBe(1);
    const renamed = await request(app).patch("/merchant/me").set(odd.auth).send({ businessName: "BAD Again" });
    expect(renamed.body.approvalStatus).toBe("REJECTED");
    // a detail that is not read (the phone) changes nothing
    const ok = await person("sr8");
    await register(ok, "Fine Shop");
    const phone = await request(app).patch("/merchant/me").set(ok.auth).send({ phone: "+963944000111" });
    expect(phone.body.approvalStatus).toBe("APPROVED");
  });

  it("can be switched off (SHOP_REVIEW=off): the shop waits for the admin as before", async () => {
    process.env.SHOP_REVIEW = "off";
    const p = await person("sr9");
    expect((await register(p, "Good Again")).body.approvalStatus).toBe("PENDING");
    expect(screened).toHaveLength(0);
  });
});

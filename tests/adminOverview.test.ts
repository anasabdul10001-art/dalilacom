import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";

async function admin() {
  const email = uniqueEmail("ovw");
  await request(app).post("/auth/register").send({ email, password, fullName: "Overview Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the admin home page numbers", () => {
  it("is for the admin only", async () => {
    await request(app).get("/admin/overview").expect(401);
    const email = uniqueEmail("ovwc");
    await request(app).post("/auth/register").send({ email, password, fullName: "Plain Customer" });
    const login = await request(app).post("/auth/login").send({ email, password });
    const res = await request(app).get("/admin/overview").set({ Authorization: `Bearer ${login.body.token}` });
    expect(res.status).toBe(403);
  });

  it("gives the counts, 30 gap-free days for each chart and what is waiting", async () => {
    const auth = await admin();
    const res = await request(app).get("/admin/overview").set(auth);
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.users.total).toBeGreaterThan(0);
    expect(d.users.admins).toBeGreaterThan(0);
    expect(d.users.customers + d.users.merchants + d.users.admins).toBe(d.users.total);
    for (const key of ["users", "merchants", "discounts", "orders"]) {
      expect(d.series[key]).toHaveLength(30);
      const days = d.series[key].map((p: { day: string }) => p.day);
      expect(new Set(days).size).toBe(30);
      expect([...days].sort()).toEqual(days); // oldest first
    }
    // the account just created shows in today's new users
    expect(d.series.users[29].count).toBeGreaterThan(0);
    for (const key of ["merchants", "discounts", "products", "suggestions", "ads", "topups", "marketers", "broadcasts"]) expect(typeof d.waiting[key]).toBe("number");
    expect(Array.isArray(d.topCategories)).toBe(true);
    expect(Array.isArray(d.topShops)).toBe(true);
  });
});

describe("the users list pages", () => {
  it("shows 50 accounts a page and tells the total in a header", async () => {
    const auth = await admin();
    const first = await request(app).get("/admin/users").set(auth);
    expect(first.status).toBe(200);
    expect(first.body.length).toBeLessThanOrEqual(50);
    const total = Number(first.headers["x-total-count"]);
    expect(total).toBeGreaterThanOrEqual(first.body.length);
    expect(first.headers["x-page-size"]).toBe("50");
    if (total > 50) {
      const second = await request(app).get("/admin/users").set(auth).query({ page: 2 });
      expect(second.body.length).toBeGreaterThan(0);
      const ids = new Set(first.body.map((u: { id: string }) => u.id));
      expect(second.body.some((u: { id: string }) => ids.has(u.id))).toBe(false);
    }
  });
});

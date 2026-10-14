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
async function owner() {
  const email = uniqueEmail("addr");
  expect((await request(app).post("/auth/register").send({ email, password, fullName: "Addr owner" })).status).toBe(201);
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

describe("a place that is not online must be found: pinned on the map or written down", () => {
  it("refuses a shop with neither, accepts either, and an online profession needs neither", async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const physical = await prisma.category.create({ data: { name: `Phys ${tag}`, slug: `addr-phys-${tag}` } });
    const online = await prisma.category.create({ data: { name: `Onl ${tag}`, slug: `addr-onl-${tag}`, isOnline: true } });
    const register = async (body: Record<string, unknown>) => request(app).post("/merchant/register").set(await owner()).send({ businessName: `Addr Shop ${tag}`, ...body });

    expect((await register({ categoryId: physical.id })).status).toBe(400);
    expect((await register({ categoryId: physical.id, address: "   " })).status).toBe(400);
    expect((await register({ categoryId: physical.id, address: "Mazzeh" })).status).toBe(201);
    expect((await register({ categoryId: physical.id, latitude: 33.5, longitude: 36.3 })).status).toBe(201);
    expect((await register({ categoryId: online.id })).status).toBe(201);
  });

  it("editing cannot leave a physical shop with neither", async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const physical = await prisma.category.create({ data: { name: `Phys2 ${tag}`, slug: `addr-phys2-${tag}` } });
    const auth = await owner();
    expect((await request(app).post("/merchant/register").set(auth).send({ businessName: `Addr Edit ${tag}`, categoryId: physical.id, address: "Mazzeh" })).status).toBe(201);
    const login = await request(app).get("/profile/me").set(auth);
    await prisma.user.update({ where: { id: login.body.id }, data: { role: "MERCHANT" } });
    expect((await request(app).patch("/merchant/me").set(auth).send({ address: null })).status).toBe(400);
    expect((await request(app).patch("/merchant/me").set(auth).send({ address: "Jalaa street" })).status).toBe(200);
    expect((await request(app).patch("/merchant/me").set(auth).send({ address: null, latitude: 33.5, longitude: 36.3 })).status).toBe(200);
  });
});

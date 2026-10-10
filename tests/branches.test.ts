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
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Br ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

// Damascus (main) and Aleppo (branch): about 310 km apart.
const DAMASCUS = { latitude: 33.5138, longitude: 36.2765 };
const ALEPPO = { latitude: 36.2021, longitude: 37.1343 };

async function shop(approved = true) {
  const cat = await prisma.category.upsert({ where: { slug: "branch-test-cat" }, update: {}, create: { name: "Branch Test", slug: "branch-test-cat" } });
  const owner = await account("brshop");
  const name = `Branchy ${crypto.randomUUID().slice(0, 6)}`;
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: name, categoryId: cat.id, address: "Damascus, Mazzeh", ...DAMASCUS });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: approved ? "APPROVED" : "PENDING" } });
  return { owner, id: reg.body.id as string, name };
}

describe("a shop with several branches", () => {
  it("adds, edits and removes branches; only an approved shop may, and the list is the shop's own", async () => {
    const s = await shop();
    const add = await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "فرع حلب", city: "حلب", address: "الجميلية", phone: "0944000000", ...ALEPPO });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ name: "فرع حلب", city: "حلب", latitude: ALEPPO.latitude });

    expect((await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "x", ...ALEPPO })).status).toBe(400);
    expect((await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "بدون موقع" })).status).toBe(400);

    const edit = await request(app).patch(`/merchant/branches/${add.body.id}`).set(s.owner.auth).send({ name: "فرع حلب الجديدة" });
    expect(edit.status).toBe(200);
    expect(edit.body.name).toBe("فرع حلب الجديدة");

    const other = await shop();
    expect((await request(app).patch(`/merchant/branches/${add.body.id}`).set(other.owner.auth).send({ name: "سرقة" })).status).toBe(404);
    expect((await request(app).delete(`/merchant/branches/${add.body.id}`).set(other.owner.auth)).status).toBe(404);
    expect((await request(app).get("/merchant/branches").set(other.owner.auth)).body).toEqual([]);

    expect((await request(app).get("/merchant/branches").set(s.owner.auth)).body).toHaveLength(1);
    expect((await request(app).delete(`/merchant/branches/${add.body.id}`).set(s.owner.auth)).status).toBe(200);
    expect((await request(app).get("/merchant/branches").set(s.owner.auth)).body).toEqual([]);

    const pending = await shop(false);
    const refused = await request(app).post("/merchant/branches").set(pending.owner.auth).send({ name: "فرع", ...ALEPPO });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.body.error.message).toMatch(/[؀-ۿ]/); // in Arabic
  });

  it("the shop page lists every branch", async () => {
    const s = await shop();
    await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "فرع حلب", ...ALEPPO });
    const page = (await request(app).get(`/merchant/${s.id}`)).body;
    expect(page.branches).toHaveLength(1);
    expect(page.branches[0]).toMatchObject({ name: "فرع حلب", latitude: ALEPPO.latitude });
  });

  it("the shop shows once, at the branch nearest to the customer, and is found where the map is looking", async () => {
    const s = await shop();
    await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "فرع حلب", address: "الجميلية", ...ALEPPO });

    // a customer in Aleppo gets the Aleppo branch, once
    const near = (await request(app).get("/merchant").query({ q: s.name, lat: ALEPPO.latitude, lng: ALEPPO.longitude })).body;
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ id: s.id, branchName: "فرع حلب", branchCount: 1, latitude: ALEPPO.latitude, address: "الجميلية" });
    expect(near[0].distanceKm).toBeLessThan(1);

    // a customer in Damascus gets the main place
    const home = (await request(app).get("/merchant").query({ q: s.name, lat: DAMASCUS.latitude, lng: DAMASCUS.longitude })).body;
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({ id: s.id, branchName: null, latitude: DAMASCUS.latitude });

    // a map looking at Aleppo only finds the shop through its branch
    const box = { minLat: 36, maxLat: 36.5, minLng: 37, maxLng: 37.5 };
    const there = (await request(app).get("/merchant").query({ q: s.name, ...box })).body;
    expect(there).toHaveLength(1);
    expect(there[0]).toMatchObject({ id: s.id, branchName: "فرع حلب" });

    // and a map looking elsewhere does not
    const empty = (await request(app).get("/merchant").query({ q: s.name, minLat: 10, maxLat: 11, minLng: 10, maxLng: 11 })).body;
    expect(empty).toEqual([]);

    // typing the branch's city or address finds the shop
    expect((await request(app).get("/merchant").query({ q: "الجميلية" })).body.some((m: { id: string }) => m.id === s.id)).toBe(true);
  });

  it("a removed branch no longer counts", async () => {
    const s = await shop();
    const add = await request(app).post("/merchant/branches").set(s.owner.auth).send({ name: "فرع مؤقت", ...ALEPPO });
    await request(app).delete(`/merchant/branches/${add.body.id}`).set(s.owner.auth);
    const found = (await request(app).get("/merchant").query({ q: s.name, minLat: 36, maxLat: 36.5, minLng: 37, maxLng: 37.5 })).body;
    expect(found).toEqual([]);
  });
});

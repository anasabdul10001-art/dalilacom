import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { computeOpenStatus } from "../src/services/hours.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

// 2026-10-04 is a Sunday.
const at = (iso: string) => new Date(iso);

describe("Opening hours: computeOpenStatus", () => {
  const sunday = { sun: [{ open: "09:00", close: "22:00" }] };

  it("reports no hours when none are set", () => {
    expect(computeOpenStatus(null, "UTC").hasHours).toBe(false);
    expect(computeOpenStatus({}, "UTC").hasHours).toBe(false);
  });

  it("is open inside a range and says when it closes", () => {
    expect(computeOpenStatus(sunday, "UTC", at("2026-10-04T12:00:00Z"))).toMatchObject({ isOpen: true, closesAt: "22:00" });
  });

  it("is closed before opening today and gives today's opening time", () => {
    expect(computeOpenStatus(sunday, "UTC", at("2026-10-04T08:00:00Z"))).toMatchObject({ isOpen: false, opensAt: "09:00", opensDay: "today" });
  });

  it("is closed after closing and points to the next opening day", () => {
    expect(computeOpenStatus(sunday, "UTC", at("2026-10-04T23:00:00Z"))).toMatchObject({ isOpen: false, opensAt: "09:00", opensDay: "sun" });
    const everyDay = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, [{ open: "09:00", close: "22:00" }]]));
    expect(computeOpenStatus(everyDay, "UTC", at("2026-10-04T23:00:00Z"))).toMatchObject({ isOpen: false, opensAt: "09:00", opensDay: "tomorrow" });
  });

  it("handles a range that runs past midnight", () => {
    const saturdayNight = { sat: [{ open: "18:00", close: "02:00" }] };
    expect(computeOpenStatus(saturdayNight, "UTC", at("2026-10-04T01:00:00Z"))).toMatchObject({ isOpen: true, closesAt: "02:00" }); // Sunday 01:00
    expect(computeOpenStatus(saturdayNight, "UTC", at("2026-10-04T03:00:00Z")).isOpen).toBe(false);
  });

  it("treats open === close as open around the clock", () => {
    const always = { sun: [{ open: "00:00", close: "00:00" }] };
    expect(computeOpenStatus(always, "UTC", at("2026-10-04T15:30:00Z")).isOpen).toBe(true);
  });

  it("evaluates in the given timezone (Damascus is UTC+3)", () => {
    const now = at("2026-10-04T20:00:00Z"); // 23:00 in Damascus, 20:00 UTC
    expect(computeOpenStatus(sunday, "UTC", now).isOpen).toBe(true);
    expect(computeOpenStatus(sunday, "Asia/Damascus", now).isOpen).toBe(false);
  });
});

async function makeMerchant(opts: { name: string; lat?: number; lng?: number; hours?: object }) {
  const category = await prisma.category.upsert({ where: { slug: "places-test-cat" }, update: {}, create: { name: "Places Test Cat", slug: "places-test-cat" } });
  const email = uniqueEmail("placesmerchant");
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Place Owner" });
  const user = await prisma.user.update({ where: { email }, data: { role: "MERCHANT" } });
  const profile = await prisma.merchantProfile.create({
    data: {
      userId: user.id,
      businessName: opts.name,
      categoryId: category.id,
      latitude: opts.lat,
      longitude: opts.lng,
      approvalStatus: "APPROVED",
      ...(opts.hours ? { openingHours: opts.hours } : {}),
    },
  });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { profile, token: login.body.token as string };
}

const ALWAYS_OPEN = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, [{ open: "00:00", close: "00:00" }]]));

describe("Merchant hours, open-now filter, search area and suggestions", () => {
  it("lets a merchant set and clear hours, rejecting malformed ones", async () => {
    const { token } = await makeMerchant({ name: `Hours ${crypto.randomUUID()}` });
    const bad = await request(app).put("/merchant/me/hours").set("Authorization", `Bearer ${token}`).send({ openingHours: { mon: [{ open: "9am", close: "22:00" }] } });
    expect(bad.status).toBe(400);
    const unknownDay = await request(app).put("/merchant/me/hours").set("Authorization", `Bearer ${token}`).send({ openingHours: { funday: [] } });
    expect(unknownDay.status).toBe(400);

    const ok = await request(app).put("/merchant/me/hours").set("Authorization", `Bearer ${token}`).send({ openingHours: ALWAYS_OPEN });
    expect(ok.status).toBe(200);
    expect(ok.body.openStatus.isOpen).toBe(true);

    const cleared = await request(app).put("/merchant/me/hours").set("Authorization", `Bearer ${token}`).send({ openingHours: null });
    expect(cleared.body.openStatus.hasHours).toBe(false);
  });

  it("only merchants can set hours", async () => {
    const email = uniqueEmail("plaincustomer");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Customer" });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    const res = await request(app).put("/merchant/me/hours").set("Authorization", `Bearer ${login.body.token}`).send({ openingHours: null });
    expect(res.status).toBe(403);
  });

  it("returns openStatus on search and detail, and filters with openNow", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const open = await makeMerchant({ name: `OpenShop ${tag}`, hours: ALWAYS_OPEN });
    const noHours = await makeMerchant({ name: `NoHoursShop ${tag}` });

    const all = await request(app).get("/merchant").query({ q: tag });
    expect(all.body.map((m: any) => m.id).sort()).toEqual([open.profile.id, noHours.profile.id].sort());
    expect(all.body.find((m: any) => m.id === open.profile.id).openStatus.isOpen).toBe(true);

    const onlyOpen = await request(app).get("/merchant").query({ q: tag, openNow: "true" });
    expect(onlyOpen.body.map((m: any) => m.id)).toEqual([open.profile.id]);

    const detail = await request(app).get(`/merchant/${open.profile.id}`);
    expect(detail.body.openStatus).toMatchObject({ hasHours: true, isOpen: true });
  });

  it("searches by category name and limits results to the visible map area", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const inside = await makeMerchant({ name: `Inside ${tag}`, lat: 33.51, lng: 36.28 });
    const outside = await makeMerchant({ name: `Outside ${tag}`, lat: 35.9, lng: 38.9 });

    const byCategory = await request(app).get("/merchant").query({ q: "Places Test Cat" });
    const ids = byCategory.body.map((m: any) => m.id);
    expect(ids).toContain(inside.profile.id);
    expect(ids).toContain(outside.profile.id);

    const area = await request(app).get("/merchant").query({ minLat: 33.4, maxLat: 33.6, minLng: 36.1, maxLng: 36.4 });
    const areaIds = area.body.map((m: any) => m.id);
    expect(areaIds).toContain(inside.profile.id);
    expect(areaIds).not.toContain(outside.profile.id);
  });

  it("suggests merchants and categories while typing", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    await makeMerchant({ name: `Suggest ${tag}` });
    const res = await request(app).get("/merchant/suggest").query({ q: `Suggest ${tag}` });
    expect(res.status).toBe(200);
    expect(res.body.merchants[0].businessName).toBe(`Suggest ${tag}`);
    const cats = await request(app).get("/merchant/suggest").query({ q: "Places Test" });
    expect(cats.body.categories.some((c: any) => c.name === "Places Test Cat")).toBe(true);
    expect((await request(app).get("/merchant/suggest")).status).toBe(400);
  });
});

describe("Saved places (favorites)", () => {
  async function customer() {
    const email = uniqueEmail("favuser");
    const password = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email, password, fullName: "Fav User" });
    const login = await request(app).post("/auth/login").send({ email, password });
    return login.body.token as string;
  }

  it("requires sign-in", async () => {
    expect((await request(app).get("/favorites")).status).toBe(401);
  });

  it("saves idempotently, lists, and removes a place", async () => {
    const token = await customer();
    const { profile } = await makeMerchant({ name: `Fav ${crypto.randomUUID()}`, hours: ALWAYS_OPEN });
    const auth = { Authorization: `Bearer ${token}` };

    expect((await request(app).put(`/favorites/${profile.id}`).set(auth)).status).toBe(200);
    expect((await request(app).put(`/favorites/${profile.id}`).set(auth)).status).toBe(200); // second time is a no-op

    const ids = await request(app).get("/favorites/ids").set(auth);
    expect(ids.body).toEqual([profile.id]);
    const list = await request(app).get("/favorites").set(auth);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: profile.id });
    expect(list.body[0].openStatus.isOpen).toBe(true);

    await request(app).delete(`/favorites/${profile.id}`).set(auth);
    expect((await request(app).get("/favorites/ids").set(auth)).body).toEqual([]);
  });

  it("keeps each user's saved places private and rejects unknown/unapproved merchants", async () => {
    const a = await customer();
    const b = await customer();
    const { profile } = await makeMerchant({ name: `Private ${crypto.randomUUID()}` });
    await request(app).put(`/favorites/${profile.id}`).set("Authorization", `Bearer ${a}`);
    expect((await request(app).get("/favorites/ids").set("Authorization", `Bearer ${b}`)).body).toEqual([]);

    expect((await request(app).put(`/favorites/${crypto.randomUUID()}`).set("Authorization", `Bearer ${a}`)).status).toBe(404);
    await prisma.merchantProfile.update({ where: { id: profile.id }, data: { approvalStatus: "PENDING" } });
    expect((await request(app).put(`/favorites/${profile.id}`).set("Authorization", `Bearer ${b}`)).status).toBe(404);
  });
});

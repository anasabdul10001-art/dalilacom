import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

beforeEach(() => fetchStub.mockReset());

const osrm = (over: object = {}) =>
  new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 4321.4, duration: 612.2, geometry: { coordinates: [[36.27, 33.51], [36.28, 33.52], [36.3, 33.53]] } }], ...over }));

// Each test uses its own coordinates so the in-process route cache can't hide a call.
describe("GET /route", () => {
  it("returns the road route as [lat,lng] points with distance and time", async () => {
    fetchStub.mockResolvedValueOnce(osrm());
    const res = await request(app).get("/route").query({ fromLat: 33.5111, fromLng: 36.2711, toLat: 33.5311, toLng: 36.3011, mode: "driving" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: "driving", distanceMeters: 4321, durationSeconds: 612 });
    expect(res.body.geometry[0]).toEqual([33.51, 36.27]);
    const url = fetchStub.mock.calls[0][0] as string;
    expect(url).toContain("routed-car");
    expect(url).toContain("36.2711,33.5111;36.3011,33.5311"); // OSRM wants lng,lat
  });

  it("uses the walking engine for mode=walking and caches repeated requests", async () => {
    fetchStub.mockResolvedValueOnce(osrm());
    const q = { fromLat: 33.5222, fromLng: 36.2822, toLat: 33.5322, toLng: 36.2922, mode: "walking" };
    await request(app).get("/route").query(q);
    expect(fetchStub.mock.calls[0][0]).toContain("routed-foot");
    const again = await request(app).get("/route").query(q);
    expect(again.status).toBe(200);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("validates coordinates", async () => {
    expect((await request(app).get("/route").query({ fromLat: 999, fromLng: 0, toLat: 0, toLng: 0 })).status).toBe(400);
    expect((await request(app).get("/route").query({ fromLat: 1 })).status).toBe(400);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no route and 502 when the engine is down", async () => {
    fetchStub.mockResolvedValueOnce(osrm({ code: "NoRoute", routes: [] }));
    const none = await request(app).get("/route").query({ fromLat: 33.54, fromLng: 36.31, toLat: 33.55, toLng: 36.32 });
    expect(none.status).toBe(404);
    expect(none.body.error.code).toBe("NO_ROUTE");

    fetchStub.mockRejectedValueOnce(new Error("network down"));
    const down = await request(app).get("/route").query({ fromLat: 33.56, fromLng: 36.33, toLat: 33.57, toLng: 36.34 });
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe("ROUTE_UNAVAILABLE");
  });
});

async function merchantAccount() {
  const category = await prisma.category.upsert({ where: { slug: "nav-test-cat" }, update: {}, create: { name: "Nav Test", slug: "nav-test-cat" } });
  const email = uniqueEmail("navmerchant");
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Nav Merchant" });
  const login = await request(app).post("/auth/login").send({ email, password });
  const token = login.body.token as string;
  const reg = await request(app).post("/merchant/register").set("Authorization", `Bearer ${token}`).send({ businessName: `Nav Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: category.id });
  expect(reg.status).toBe(201);
  return { token, profileId: reg.body.id as string, categoryId: category.id };
}

describe("Merchant listing: pin on the map and setup checklist", () => {
  it("shows what's missing, then updates the pin and mirrors it to the Business and main Branch", async () => {
    const { token, profileId } = await merchantAccount();
    const auth = { Authorization: `Bearer ${token}` };

    const before = await request(app).get("/merchant/me").set(auth);
    expect(before.body.onboarding).toEqual({ approved: false, location: false, hours: false, discount: false, product: false });

    const patch = await request(app).patch("/merchant/me").set(auth).send({ latitude: 33.5, longitude: 36.3, address: "شارع بغداد", phone: "0933111222" });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ latitude: 33.5, longitude: 36.3, address: "شارع بغداد" });

    const after = await request(app).get("/merchant/me").set(auth);
    expect(after.body.onboarding.location).toBe(true);

    const business = await prisma.business.findUnique({ where: { legacyMerchantProfileId: profileId } });
    expect(business).toMatchObject({ latitude: 33.5, longitude: 36.3, phone: "0933111222" });
  });

  it("rejects a half-specified or out-of-range pin", async () => {
    const { token } = await merchantAccount();
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).patch("/merchant/me").set(auth).send({ latitude: 33.5 })).status).toBe(400);
    expect((await request(app).patch("/merchant/me").set(auth).send({ latitude: 133.5, longitude: 36 })).status).toBe(400);
    // registration holds the same rule
    const category = await prisma.category.findFirstOrThrow();
    const email = uniqueEmail("halfpin");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Half Pin" });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    const reg = await request(app).post("/merchant/register").set("Authorization", `Bearer ${login.body.token}`).send({ businessName: "Half Pin Shop", categoryId: category.id, latitude: 33.5 });
    expect(reg.status).toBe(400);
  });

  it("only a merchant can edit a listing", async () => {
    const email = uniqueEmail("notmerchant");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Plain User" });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    expect((await request(app).patch("/merchant/me").set("Authorization", `Bearer ${login.body.token}`).send({ phone: "1" })).status).toBe(403);
  });
});

describe("GET /auth/me", () => {
  it("returns the signed-in user with their email verification state", async () => {
    const email = uniqueEmail("whoami");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Who Am I" });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, emailVerified: false });
    expect(res.body.emailDeliveryEnabled).toBe(false); // no SMTP configured in tests
    expect((await request(app).get("/auth/me")).status).toBe(401);
  });
});

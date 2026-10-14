import { describe, it, expect, afterAll, vi, beforeAll } from "vitest";
import request from "supertest";

process.env.GEOCODE_MIN_GAP_MS = "0";
const asked: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  asked.push(String(url));
  return {
    ok: true,
    json: async () => ({ display_name: "x", address: { house_number: "12", road: "شارع الجلاء", suburb: "المزة", city: "دمشق", state: "محافظة دمشق", country: "سوريا" } }),
  };
});

import { app } from "../src/server";
import { prisma } from "../src/prisma";

beforeAll(() => { asked.length = 0; });
afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("a place on the map in words", () => {
  it("gives street, area and city, in the reader's language, and keeps the answer", async () => {
    const res = await request(app).get("/geo/reverse").query({ lat: 33.5138, lng: 36.2765 }).set("Accept-Language", "ar");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ address: "12 شارع الجلاء، المزة، دمشق، محافظة دمشق", city: "دمشق" });
    expect(asked[0]).toContain("nominatim.openstreetmap.org/reverse");
    expect(asked[0]).toContain("accept-language=ar");
    const again = await request(app).get("/geo/reverse").query({ lat: 33.5138, lng: 36.2765 }).set("Accept-Language", "ar");
    expect(again.body.city).toBe("دمشق");
    expect(asked).toHaveLength(1); // the second one came from the saved answer
    await request(app).get("/geo/reverse").query({ lat: 33.5138, lng: 36.2765 }).set("Accept-Language", "en");
    expect(asked).toHaveLength(2); // another language is another answer
  });

  it("refuses a place that is not on Earth", async () => {
    expect((await request(app).get("/geo/reverse").query({ lat: 200, lng: 10 })).status).toBe(400);
    expect((await request(app).get("/geo/reverse")).status).toBe(400);
  });
});

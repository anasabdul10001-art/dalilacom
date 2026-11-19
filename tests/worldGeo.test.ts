import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { WORLD_COUNTRIES } from "../src/data/worldCountries";
import { ensureWorldCountries, makeCandidate } from "../src/services/worldGeo.service";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("World library", () => {
  it("lists every country of the world and leaves an existing one untouched", async () => {
    expect(WORLD_COUNTRIES.length).toBeGreaterThan(240);
    await prisma.country.upsert({ where: { isoCode2: "DE" }, update: { currencyCode: "XYZ" }, create: { name: "Germany", isoCode2: "DE", currencyCode: "XYZ" } });
    await ensureWorldCountries();
    expect(await prisma.country.count({ where: { isoCode2: { in: WORLD_COUNTRIES.map((c) => c.iso2) } } })).toBe(WORLD_COUNTRIES.length);
    expect((await prisma.country.findUnique({ where: { isoCode2: "DE" } }))?.currencyCode).toBe("XYZ");
    expect((await prisma.country.findUnique({ where: { isoCode2: "FR" } }))?.nameArabic).toBeTruthy();
    await prisma.country.update({ where: { isoCode2: "DE" }, data: { currencyCode: "EUR" } });
    const list = await request(app).get("/geo/countries");
    expect(list.body.length).toBeGreaterThan(240);
  });

  it("turns a picked place into a city, reusing the one that exists and refusing forged places", async () => {
    await ensureWorldCountries();
    const de = await prisma.country.findUniqueOrThrow({ where: { isoCode2: "DE" } });
    const name = `Teststadt${Date.now()}`;
    const row = await prisma.geoUnit.create({ data: { countryId: de.id, level: "CITY", name, nameEnglish: name } });
    const place = makeCandidate(name, null, "DE", 50.1, 8.6)!;
    const picked = await request(app).post("/geo/city").send({ token: place.token });
    expect(picked.status).toBe(200);
    expect(picked.body.city.id).toBe(row.id);
    expect(picked.body.country.isoCode2).toBe("DE");

    const forged = await request(app).post("/geo/city").send({ token: place.token.replace(/.$/, (c) => (c === "A" ? "B" : "A")) });
    expect(forged.status).toBe(400);
    const made = await request(app).post("/geo/city").send({ token: Buffer.from(JSON.stringify({ c: "DE", n: "X", la: 1, lo: 1 })).toString("base64url") + ".abc" });
    expect(made.status).toBe(400);
    await prisma.geoUnit.delete({ where: { id: row.id } });
  });

  it("uses the country a visitor picked as their market", async () => {
    await ensureWorldCountries();
    const market = await request(app).get("/geo/market").set("X-Viewer-Country", "FR");
    expect(market.body.country).toBe("FR");
    const unknown = await request(app).get("/geo/market").set("X-Viewer-Country", "ZZ");
    expect(unknown.body.country).not.toBe("ZZ");
  });
});

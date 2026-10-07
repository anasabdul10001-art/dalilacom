import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail, freeIsoCode2 } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

async function adminToken() {
  const email = uniqueEmail("geoadmin");
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Geo Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return login.body.token as string;
}

describe("Geography", () => {
  it("creates a full Country -> Region -> City -> Area hierarchy", async () => {
    const token = await adminToken();
    const country = await request(app)
      .post("/geo/countries")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Testland-${Date.now()}`, isoCode2: await freeIsoCode2(prisma), currencyCode: "TST" });
    expect(country.status).toBe(201);

    const region = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: country.body.id, level: "REGION", name: "Test Region" });
    expect(region.status).toBe(201);

    const city = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: country.body.id, level: "CITY", parentId: region.body.id, name: "Test City" });
    expect(city.status).toBe(201);

    const area = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: country.body.id, level: "AREA", parentId: city.body.id, name: "Test Area" });
    expect(area.status).toBe(201);
    expect(area.body.level).toBe("AREA");
  });

  it("allows a city with no region (countries that skip that level)", async () => {
    const token = await adminToken();
    const country = await request(app)
      .post("/geo/countries")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Flatland-${Date.now()}`, isoCode2: await freeIsoCode2(prisma), currencyCode: "TST" });
    expect(country.status).toBe(201);

    const city = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: country.body.id, level: "CITY", name: "Direct City" });
    expect(city.status).toBe(201);
  });

  it("rejects an invalid hierarchy: an AREA with no city parent", async () => {
    const token = await adminToken();
    const country = await request(app)
      .post("/geo/countries")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Badland-${Date.now()}`, isoCode2: await freeIsoCode2(prisma), currencyCode: "TST" });
    expect(country.status).toBe(201);

    const res = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: country.body.id, level: "AREA", name: "Orphan Area" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_GEO_HIERARCHY");
  });

  it("rejects an invalid hierarchy: a city whose region belongs to a different country", async () => {
    const token = await adminToken();
    const countryA = await request(app)
      .post("/geo/countries")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `CountryA-${Date.now()}`, isoCode2: await freeIsoCode2(prisma), currencyCode: "TST" });
    expect(countryA.status).toBe(201);
    const countryB = await request(app)
      .post("/geo/countries")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `CountryB-${Date.now()}`, isoCode2: await freeIsoCode2(prisma), currencyCode: "TST" });
    expect(countryB.status).toBe(201);
    const regionA = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: countryA.body.id, level: "REGION", name: "Region A" });

    const res = await request(app)
      .post("/geo/units")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryId: countryB.body.id, level: "CITY", parentId: regionA.body.id, name: "Cross-border City" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_GEO_HIERARCHY");
  });

  it("non-admin cannot create geo units", async () => {
    const email = uniqueEmail("nonadmin");
    const password = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email, password, fullName: "Regular User" });
    const login = await request(app).post("/auth/login").send({ email, password });

    const res = await request(app)
      .post("/geo/countries")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ name: "Nope", isoCode2: "ZZ", currencyCode: "ZZZ" });
    expect(res.status).toBe(403);
  });
});

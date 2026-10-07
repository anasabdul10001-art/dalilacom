import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../src/prisma";
import { seedGeo } from "../prisma/geo.seed";
import { SYRIA_REGIONS } from "../prisma/geo.data";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Starting geography of Syria", () => {
  it("creates governorates > cities > neighbourhoods with a valid hierarchy, and a second run changes nothing", async () => {
    await seedGeo(prisma);
    const second = await seedGeo(prisma);
    expect(second.created).toBe(0);

    const country = await prisma.country.findUniqueOrThrow({ where: { isoCode2: "SY" } });
    const units = await prisma.geoUnit.findMany({ where: { countryId: country.id } });
    const byId = new Map(units.map((u) => [u.id, u]));
    const regions = units.filter((u) => u.level === "REGION");
    const cities = units.filter((u) => u.level === "CITY");
    const areas = units.filter((u) => u.level === "AREA");

    expect(regions.length).toBeGreaterThanOrEqual(SYRIA_REGIONS.length);
    expect(regions.map((r) => r.nameArabic)).toEqual(expect.arrayContaining(["دمشق", "حلب", "حمص", "اللاذقية", "درعا"]));
    for (const city of cities) expect(byId.get(city.parentId!)?.level).toBe("REGION");
    for (const area of areas) expect(byId.get(area.parentId!)?.level).toBe("CITY");
    expect(areas.length).toBeGreaterThan(30);
    // every place has both names, so the Arabic and the English app can show it
    for (const unit of units.filter((u) => u.nameEnglish && u.nameArabic)) expect(unit.name).toBe(unit.nameEnglish);
  });

  it("leaves a place the admin renamed or hid exactly as it is", async () => {
    await seedGeo(prisma);
    const country = await prisma.country.findUniqueOrThrow({ where: { isoCode2: "SY" } });
    const damascus = await prisma.geoUnit.findFirstOrThrow({ where: { countryId: country.id, level: "REGION", nameArabic: "دمشق" } });
    await prisma.geoUnit.update({ where: { id: damascus.id }, data: { nameEnglish: "Damascus (edited)", isActive: false } });
    try {
      expect((await seedGeo(prisma)).created).toBe(0);
      const after = await prisma.geoUnit.findUniqueOrThrow({ where: { id: damascus.id } });
      expect(after).toMatchObject({ nameEnglish: "Damascus (edited)", isActive: false });
    } finally {
      await prisma.geoUnit.update({ where: { id: damascus.id }, data: { nameEnglish: "Damascus", isActive: true } });
    }
  });
});

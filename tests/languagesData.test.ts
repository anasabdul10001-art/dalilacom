import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { ensureWorldCountries } from "../src/services/worldGeo.service";
import { PRODUCT_CATEGORY_TR, STORE_SECTION_TR } from "../src/data/localNames";
import { STORE_SECTIONS, localizeSection } from "../src/lib/storeSections";

afterAll(async () => {
  await prisma.$disconnect();
});

const CYRILLIC = /[Ѐ-ӿ]/;

describe("Names in the languages beyond Arabic and English", () => {
  it("shows country names in the reader's language, with no Arabic or English left", async () => {
    await ensureWorldCountries();
    const de = (await request(app).get("/geo/countries?lang=de")).body.find((c: { isoCode2: string }) => c.isoCode2 === "FR");
    expect(de.nameEnglish).toBe("Frankreich");
    const ru = (await request(app).get("/geo/countries?lang=ru")).body.find((c: { isoCode2: string }) => c.isoCode2 === "FR");
    expect(ru.nameEnglish).toMatch(CYRILLIC);
    const en = (await request(app).get("/geo/countries?lang=en")).body.find((c: { isoCode2: string }) => c.isoCode2 === "FR");
    expect(en.nameEnglish).toBe("France");
  });

  it("names every store section and product category in German, Russian and Ukrainian", () => {
    for (const section of STORE_SECTIONS) {
      for (const lang of ["de", "ru", "uk"]) expect(STORE_SECTION_TR[section.id]?.[lang], `${section.id} ${lang}`).toBeTruthy();
    }
    expect(localizeSection(STORE_SECTIONS[0], "ru").nameEn).toMatch(CYRILLIC);
    expect(localizeSection(STORE_SECTIONS[0], "en").nameEn).toBe(STORE_SECTIONS[0].nameEn);
    for (const [slug, names] of Object.entries(PRODUCT_CATEGORY_TR)) {
      for (const lang of ["de", "ru", "uk"]) expect(names[lang]?.trim(), `${slug} ${lang}`).toBeTruthy();
    }
    expect(Object.values(PRODUCT_CATEGORY_TR).every((n) => CYRILLIC.test(n.ru) && CYRILLIC.test(n.uk))).toBe(true);
  });
});

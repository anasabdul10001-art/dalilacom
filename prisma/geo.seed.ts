import { PrismaClient } from "@prisma/client";
import { SYRIA_REGIONS } from "./geo.data";

const SYRIA = {
  name: "Syria",
  nameArabic: "سوريا",
  nameEnglish: "Syria",
  isoCode2: "SY",
  isoCode3: "SYR",
  currencyCode: "USD", // Syria is priced in dollars for now
  phoneCode: "+963",
  defaultLanguage: "ar",
  timezone: "Asia/Damascus",
};

/**
 * Creates the starting governorates, cities and neighbourhoods of Syria (see geo.data.ts). Idempotent and gentle: a place
 * that already exists (matched by its Arabic name under the same parent) is left exactly as the admin made it — nothing
 * is renamed, re-enabled or deleted — so it is safe to run on every deploy.
 */
export async function seedGeo(prisma: PrismaClient): Promise<{ created: number }> {
  const country = await prisma.country.upsert({ where: { isoCode2: SYRIA.isoCode2 }, update: {}, create: SYRIA });
  let created = 0;

  const ensure = async (level: "REGION" | "CITY" | "AREA", parentId: string | null, ar: string, en: string) => {
    const existing = await prisma.geoUnit.findFirst({ where: { countryId: country.id, level, parentId, OR: [{ nameArabic: ar }, { name: ar }] } });
    if (existing) return existing;
    created++;
    return prisma.geoUnit.create({ data: { countryId: country.id, level, parentId, name: en, nameArabic: ar, nameEnglish: en } });
  };

  for (const region of SYRIA_REGIONS) {
    const regionRow = await ensure("REGION", null, region.ar, region.en);
    for (const city of region.cities) {
      const cityRow = await ensure("CITY", regionRow.id, city.ar, city.en);
      for (const [ar, en] of city.areas ?? []) await ensure("AREA", cityRow.id, ar, en);
    }
  }
  return { created };
}

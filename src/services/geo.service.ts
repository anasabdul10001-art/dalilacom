import { GeoLevel } from "@prisma/client";
import { prisma } from "../prisma";

export class InvalidGeoSelectionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface GeoSelection {
  countryId: string;
  regionId?: string | null;
  cityId?: string | null;
  areaId?: string | null;
}

/**
 * Rejects geographically inconsistent input before it ever reaches the database (section:
 * Validation — "Country → Region → City → Area يجب ألا يستطيع API إنشاء علاقة غير صحيحة").
 * Checks: the country exists and is active; every provided unit is the right level and belongs
 * to that same country; and if a unit's real parent is also part of the selection, they agree.
 */
export async function validateGeoSelection(selection: GeoSelection): Promise<void> {
  const country = await prisma.country.findUnique({ where: { id: selection.countryId } });
  if (!country || !country.isActive) {
    throw new InvalidGeoSelectionError("Invalid or inactive country");
  }

  const ids = [selection.regionId, selection.cityId, selection.areaId].filter((id): id is string => !!id);
  if (ids.length === 0) return;

  const units = await prisma.geoUnit.findMany({ where: { id: { in: ids } } });
  const byId = new Map(units.map((u) => [u.id, u]));

  const checkLevel = (id: string | null | undefined, level: GeoLevel, label: string) => {
    if (!id) return;
    const unit = byId.get(id);
    if (!unit) throw new InvalidGeoSelectionError(`${label} not found`);
    if (unit.level !== level) throw new InvalidGeoSelectionError(`${label} is not a ${level}`);
    if (unit.countryId !== selection.countryId) throw new InvalidGeoSelectionError(`${label} does not belong to the selected country`);
  };

  checkLevel(selection.regionId, "REGION", "region");
  checkLevel(selection.cityId, "CITY", "city");
  checkLevel(selection.areaId, "AREA", "area");

  const city = selection.cityId ? byId.get(selection.cityId) : undefined;
  if (city?.parentId && selection.regionId && city.parentId !== selection.regionId) {
    throw new InvalidGeoSelectionError("city does not belong to the selected region");
  }
  const area = selection.areaId ? byId.get(selection.areaId) : undefined;
  if (area?.parentId && selection.cityId && area.parentId !== selection.cityId) {
    throw new InvalidGeoSelectionError("area does not belong to the selected city");
  }
}

export const DEFAULT_COUNTRY = {
  name: "Syria",
  nameArabic: "سوريا",
  nameEnglish: "Syria",
  isoCode2: "SY",
  isoCode3: "SYR",
  currencyCode: "SYP",
  phoneCode: "+963",
  defaultLanguage: "ar",
  timezone: "Asia/Damascus",
};

/**
 * The platform's default country (the oldest one configured). Self-healing: if none exists yet
 * (fresh database, CI) the Syria reference row is created on the spot, so merchant registration
 * never depends on the backfill having run first.
 */
export async function getDefaultCountry() {
  const existing = await prisma.country.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.country.upsert({ where: { isoCode2: DEFAULT_COUNTRY.isoCode2 }, update: {}, create: DEFAULT_COUNTRY });
}

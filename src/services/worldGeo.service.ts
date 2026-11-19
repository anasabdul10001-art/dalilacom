import { createHmac, timingSafeEqual } from "crypto";
import { GeoLevel } from "@prisma/client";
import { prisma } from "../prisma";
import { WORLD_COUNTRIES } from "../data/worldCountries";
import { reverseGeocode } from "./reverseGeocode.service";
import { locateIp } from "./viewerCountry.service";

/**
 * The world library: every country is listed from the start, and a city is added the first time someone picks it
 * (found through OpenStreetMap, never typed freely). Nothing here needs the admin to enter places by hand.
 */

const ARAB_LEAGUE = new Set(["DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY", "MR", "MA", "OM", "PS", "QA", "SA", "SO", "SD", "SY", "TN", "AE", "YE"]);

/** Lists every country of the world. A country that already exists (set up or priced by the admin) is left exactly as it is. */
export async function ensureWorldCountries(): Promise<number> {
  const arabic = new Intl.DisplayNames(["ar"], { type: "region" });
  const arabicName = (iso: string): string | null => {
    try { const n = arabic.of(iso); return n && n !== iso ? n : null; } catch { return null; }
  };
  const res = await prisma.country.createMany({
    data: WORLD_COUNTRIES.map((c) => ({
      name: c.en,
      nameEnglish: c.en,
      nameArabic: arabicName(c.iso2),
      isoCode2: c.iso2,
      currencyCode: c.cur,
      phoneCode: c.phone,
      defaultLanguage: ARAB_LEAGUE.has(c.iso2) ? "ar" : "en",
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/* ---------------- a place someone can pick: a signed description, so only real search results can become cities ---------------- */

export interface PlaceCandidate {
  name: string;
  detail: string | null; // region / state, to tell two towns of the same name apart
  country: string; // ISO 3166-1 alpha-2
  latitude: number;
  longitude: number;
  token: string;
}

const secret = () => process.env.JWT_SECRET ?? "dev-only";

function sign(payload: string): string {
  return createHmac("sha256", secret()).update("place:" + payload).digest("base64url");
}

function makeToken(p: { c: string; n: string; la: number; lo: number }): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readToken(token: string): { c: string; n: string; la: number; lo: number } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p.c !== "string" || typeof p.n !== "string" || !Number.isFinite(p.la) || !Number.isFinite(p.lo)) return null;
    return p;
  } catch {
    return null;
  }
}

export function makeCandidate(name: string | undefined | null, detail: string | null | undefined, country: string | undefined, lat: number, lng: number): PlaceCandidate | null {
  const n = name?.trim();
  const c = country?.trim().toUpperCase();
  if (!n || n.length > 120 || !c || !/^[A-Z]{2}$/.test(c)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { name: n, detail: detail?.trim() || null, country: c, latitude: lat, longitude: lng, token: makeToken({ c, n, la: lat, lo: lng }) };
}

/* ---------------- search ---------------- */

const UA = { "user-agent": "Dalilacom/1.0 (https://dalilacom.com)", accept: "application/json" };
const cache = new Map<string, { at: number; items: PlaceCandidate[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttled<T>(task: () => Promise<T>, gap: number): Promise<T> {
  const run = async () => {
    const wait = lastCall + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return task();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

const hasLatin = (s: string) => /[A-Za-zÀ-ɏ]/.test(s);

async function photon(q: string, country: string): Promise<PlaceCandidate[]> {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=25&layer=city&lang=en`, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: Array<{ properties?: { name?: string; state?: string; county?: string; countrycode?: string }; geometry?: { coordinates?: [number, number] } }> };
  const out: PlaceCandidate[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (!p || p.countrycode?.toUpperCase() !== country || !f.geometry?.coordinates) continue;
    const c = makeCandidate(p.name, p.state ?? p.county, country, f.geometry.coordinates[1], f.geometry.coordinates[0]);
    if (c) out.push(c);
  }
  return out;
}

async function nominatim(q: string, country: string, lang: string): Promise<PlaceCandidate[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&featuretype=settlement&countrycodes=${country.toLowerCase()}&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ name?: string; lat?: string; lon?: string; address?: Record<string, string> }>;
  const out: PlaceCandidate[] = [];
  for (const r of rows) {
    if (r.address?.country_code?.toUpperCase() !== country) continue;
    const c = makeCandidate(r.name, r.address?.state ?? r.address?.county, country, Number(r.lat), Number(r.lon));
    if (c) out.push(c);
  }
  return out;
}

/** Towns and cities of one country that match what was typed (Latin letters: as-you-type from Photon; otherwise, or when nothing came, Nominatim). */
export async function searchCities(query: string, country: string, lang: string): Promise<PlaceCandidate[]> {
  const q = query.trim().replace(/\s+/g, " ");
  const cc = country.toUpperCase();
  if (q.length < 2) return [];
  const key = `${cc}|${lang}|${q.toLocaleLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.items;
  let items: PlaceCandidate[] = [];
  try {
    if (hasLatin(q)) items = await throttled(() => photon(q, cc), 400);
    if (!items.length) items = await throttled(() => nominatim(q, cc, lang), 1100);
  } catch {
    return [];
  }
  const seen = new Set<string>();
  items = items.filter((i) => { const k = `${i.name}|${i.detail}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), items });
  return items;
}

/** A guess from the connection: the visitor's country, and the town when the address tells it. The person confirms or changes it. */
export async function detectPlace(ip: string): Promise<{ country: string | null; city: PlaceCandidate | null }> {
  const loc = await locateIp(ip);
  if (!loc?.code) return { country: null, city: null };
  const city = loc.city && loc.latitude != null && loc.longitude != null ? makeCandidate(loc.city, null, loc.code, loc.latitude, loc.longitude) : null;
  return { country: loc.code, city };
}

/** A point on the map (the phone's own position) as a pickable city: its country and the town it falls in. */
export async function placeAt(lat: number, lng: number, lang: string): Promise<{ country: string | null; city: PlaceCandidate | null }> {
  const where = await reverseGeocode(lat, lng, lang, 10);
  if (!where.country || !where.city) return { country: where.country ?? null, city: null };
  return { country: where.country, city: makeCandidate(where.city, null, where.country, lat, lng) };
}

/* ---------------- turning a picked place into a city of the platform ---------------- */

/** The city row for a picked place: the existing one when the platform already has it, otherwise a new one (with its country if needed). */
export async function cityForPlace(token: string) {
  const p = readToken(token);
  if (!p) return null;
  const country = await prisma.country.findUnique({ where: { isoCode2: p.c } });
  if (!country || !country.isActive) return null;

  const sameName = (names: Array<string | null>) => ({
    countryId: country.id,
    level: GeoLevel.CITY,
    isActive: true,
    OR: names.filter((x): x is string => !!x).flatMap((n) => [{ name: { equals: n, mode: "insensitive" as const } }, { nameArabic: { equals: n, mode: "insensitive" as const } }, { nameEnglish: { equals: n, mode: "insensitive" as const } }]),
  });
  const known = await prisma.geoUnit.findFirst({ where: sameName([p.n]) });
  if (known) return { country, city: known };

  // the name in both languages, so the city reads right in Arabic and English screens (best effort: the picked name is the fallback)
  const [ar, en] = await Promise.all([reverseGeocode(p.la, p.lo, "ar", 10), reverseGeocode(p.la, p.lo, "en", 10)]);
  const again = await prisma.geoUnit.findFirst({ where: sameName([ar.city, en.city]) });
  if (again) return { country, city: again };

  const city = await prisma.geoUnit.create({
    data: { countryId: country.id, level: GeoLevel.CITY, name: en.city ?? p.n, nameEnglish: en.city ?? (hasLatin(p.n) ? p.n : null), nameArabic: ar.city ?? (hasLatin(p.n) ? null : p.n), latitude: p.la, longitude: p.lo },
  });
  return { country, city };
}

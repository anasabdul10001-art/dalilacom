import { LandmarkSector, LandmarkStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { normalizeText } from "./category.service";
import { translateRecords } from "./contentTranslation.service";
import landmarkWords from "../lib/landmarkWords.json";

/**
 * The public places on the map (mosques, hospitals, parks, main streets): they belong to the platform, not to an account.
 * The admin adds them by hand or imports them from OpenStreetMap into a review list; only approved ones (ACTIVE) are on the map.
 * Later the real owner of a private place (a private hospital) can claim it and it becomes an ordinary shop.
 */
export class LandmarkError extends Error {
  constructor(message: string, readonly status = 400, readonly extra?: unknown) {
    super(message);
  }
}

export const LANDMARK_PAGE = 50;
const R_EARTH = 6371;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/** Words that say what kind of place it is, not which one: "جامع الأموي" and "الأموي" are the same place. */
const KIND_WORDS = new Set<string>(landmarkWords.kindWords);

export function nameKey(name: string): string {
  const words = normalizeText(name).split(" ").filter(Boolean);
  const core = words.filter((w) => !KIND_WORDS.has(w));
  return (core.length ? core : words).join(" ");
}

/** The same name, or one inside the other, or most words shared. */
export function sameName(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  const wa = new Set(ka.split(" "));
  const wb = new Set(kb.split(" "));
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared > 0 && shared / Math.max(wa.size, wb.size) >= 0.67;
}

/** Places already on the platform that look like this one (same kind of name, close by). */
export async function findSimilar(input: { name: string; latitude: number; longitude: number; kindId?: string; maxKm?: number; excludeId?: string }) {
  const maxKm = input.maxKm ?? 0.15;
  const dLat = maxKm / 111.32;
  const dLng = maxKm / (111.32 * Math.max(0.2, Math.cos((input.latitude * Math.PI) / 180)));
  const near = await prisma.landmark.findMany({
    where: {
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      ...(input.kindId ? { kindId: input.kindId } : {}),
      latitude: { gte: input.latitude - dLat, lte: input.latitude + dLat },
      longitude: { gte: input.longitude - dLng, lte: input.longitude + dLng },
    },
    include: { kind: true },
    take: 60,
  });
  return near.filter((l) => sameName(l.name, input.name) && distanceKm(l.latitude, l.longitude, input.latitude, input.longitude) <= maxKm);
}

/* ---------------- kinds ---------------- */

export async function listKinds(onlyActive: boolean) {
  return prisma.landmarkKind.findMany({ where: onlyActive ? { isActive: true } : {}, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export interface KindInput {
  slug?: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  color: string;
  geometry: "POINT" | "LINE";
  claimable: boolean;
  isActive: boolean;
  sortOrder?: number;
}

export async function createKind(input: KindInput & { slug: string }) {
  const exists = await prisma.landmarkKind.findUnique({ where: { slug: input.slug } });
  if (exists) throw new LandmarkError("This kind already exists", 409);
  return prisma.landmarkKind.create({ data: { ...input, sortOrder: input.sortOrder ?? 100 } });
}

export async function updateKind(id: string, input: Partial<KindInput>) {
  const kind = await prisma.landmarkKind.findUnique({ where: { id } });
  if (!kind) throw new LandmarkError("Kind not found", 404);
  const { slug: _slug, ...data } = input; // the slug never changes: imports and the apps use it
  return prisma.landmarkKind.update({ where: { id }, data });
}

/* ---------------- what everybody sees ---------------- */

export interface PublicQuery {
  minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
  kinds?: string[]; // slugs
  zoom?: number; // the map's zoom: kinds that are drawn only closer up are left out (they would use the limit for nothing)
  q?: string;
  limit: number;
  lang: string;
}

type LandmarkWithKind = Prisma.LandmarkGetPayload<{ include: { kind: true } }>;

export function shape(l: LandmarkWithKind, lang: string) {
  const en = lang !== "ar";
  return {
    id: l.id,
    name: en && l.nameEn ? l.nameEn : l.name,
    description: l.description,
    kind: { slug: l.kind.slug, name: en ? l.kind.nameEn : l.kind.nameAr, icon: l.kind.icon, color: l.kind.color, geometry: l.kind.geometry },
    sector: l.sector,
    address: l.address,
    phone: l.phone,
    latitude: l.latitude,
    longitude: l.longitude,
    path: l.path,
    claimable: l.kind.claimable && l.sector !== "PUBLIC",
  };
}

export async function publicLandmarks(q: PublicQuery) {
  const hasBox = q.minLat !== undefined && q.maxLat !== undefined && q.minLng !== undefined && q.maxLng !== undefined;
  let slugs = q.kinds?.length ? q.kinds : undefined;
  if (q.zoom !== undefined) {
    const zoom = q.zoom;
    slugs = (await listKinds(true)).map((k) => k.slug).filter((s) => kindMinZoom(s) <= zoom && (!slugs || slugs.includes(s)));
  }
  const rows = await prisma.landmark.findMany({
    where: {
      status: "ACTIVE",
      kind: { isActive: true, ...(slugs ? { slug: { in: slugs } } : {}) },
      ...(hasBox ? { latitude: { gte: q.minLat, lte: q.maxLat }, longitude: { gte: q.minLng, lte: q.maxLng } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { nameEn: { contains: q.q, mode: "insensitive" } }, { address: { contains: q.q, mode: "insensitive" } }] } : {}),
    },
    include: { kind: true },
    orderBy: [{ kind: { sortOrder: "asc" } }, { name: "asc" }],
    take: q.limit,
  });
  const out = rows.map((l) => shape(l, q.lang));
  if (q.lang !== "ar") await translateRecords(q.lang, out as unknown as Record<string, unknown>[], ["address", "description"]);
  return out;
}

export async function publicLandmark(id: string, lang: string) {
  const l = await prisma.landmark.findFirst({ where: { id, status: "ACTIVE", kind: { isActive: true } }, include: { kind: true } });
  if (!l) return null;
  const out = shape(l, lang);
  if (lang !== "ar") await translateRecords(lang, [out as unknown as Record<string, unknown>], ["address", "description"]);
  return out;
}

/* ---------------- the admin's side ---------------- */

export interface AdminListQuery { status?: LandmarkStatus; kind?: string; q?: string; page: number; withoutArabic?: boolean }

export async function adminList(query: AdminListQuery) {
  const where: Prisma.LandmarkWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.kind ? { kind: { slug: query.kind } } : {}),
    ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { nameEn: { contains: query.q, mode: "insensitive" } }, { address: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [total, rows, counts] = await Promise.all([
    prisma.landmark.count({ where }),
    prisma.landmark.findMany({ where, include: { kind: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * LANDMARK_PAGE, take: LANDMARK_PAGE }),
    prisma.landmark.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { total, pageSize: LANDMARK_PAGE, items: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
}

export interface LandmarkInput {
  kindId: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  sector?: LandmarkSector | null;
  status?: LandmarkStatus;
  cityId?: string | null;
  address?: string | null;
  phone?: string | null;
  latitude: number;
  longitude: number;
  path?: number[][][] | null;
}

function cleanPath(kindGeometry: string, path: number[][][] | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (kindGeometry !== "LINE") return Prisma.JsonNull;
  const segments = (path ?? []).map((seg) => seg.filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))).filter((seg) => seg.length >= 2);
  if (!segments.length) throw new LandmarkError("Draw the street on the map first", 400);
  return segments.slice(0, 40).map((s) => s.slice(0, 400));
}

export async function createLandmark(input: LandmarkInput, force: boolean) {
  const kind = await prisma.landmarkKind.findUnique({ where: { id: input.kindId } });
  if (!kind) throw new LandmarkError("Kind not found", 404);
  const path = cleanPath(kind.geometry, input.path);
  if (!force) {
    const similar = await findSimilar({ name: input.name, latitude: input.latitude, longitude: input.longitude, kindId: kind.id, maxKm: kind.geometry === "LINE" ? 2.5 : 0.15 });
    if (similar.length) throw new LandmarkError("A similar place is already on the map", 409, similar.map((s) => ({ id: s.id, name: s.name, status: s.status })));
  }
  return prisma.landmark.create({
    data: {
      kindId: kind.id, name: input.name.trim(), nameEn: input.nameEn?.trim() || null, description: input.description?.trim() || null,
      sector: input.sector ?? null, status: input.status ?? "ACTIVE", cityId: input.cityId || null, address: input.address?.trim() || null,
      phone: input.phone?.trim() || null, latitude: input.latitude, longitude: input.longitude, path, source: "ADMIN",
    },
    include: { kind: true },
  });
}

export async function updateLandmark(id: string, input: Partial<LandmarkInput>) {
  const current = await prisma.landmark.findUnique({ where: { id }, include: { kind: true } });
  if (!current) throw new LandmarkError("Place not found", 404);
  const kind = input.kindId && input.kindId !== current.kindId ? await prisma.landmarkKind.findUnique({ where: { id: input.kindId } }) : current.kind;
  if (!kind) throw new LandmarkError("Kind not found", 404);
  const data: Prisma.LandmarkUncheckedUpdateInput = {};
  if (input.kindId) data.kindId = kind.id;
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.nameEn !== undefined) data.nameEn = input.nameEn?.trim() || null;
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.sector !== undefined) data.sector = input.sector;
  if (input.status !== undefined) data.status = input.status;
  if (input.cityId !== undefined) data.cityId = input.cityId || null;
  if (input.address !== undefined) data.address = input.address?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.path !== undefined || input.kindId) data.path = cleanPath(kind.geometry, input.path ?? (current.path as number[][][] | null));
  return prisma.landmark.update({ where: { id }, data, include: { kind: true } });
}

export async function deleteLandmark(id: string) {
  const l = await prisma.landmark.findUnique({ where: { id } });
  if (!l) throw new LandmarkError("Place not found", 404);
  if (l.status === "CLAIMED") throw new LandmarkError("This place was taken over by its owner", 409);
  await prisma.landmark.delete({ where: { id } });
}

/** Approve / hide / delete many at once (the review list). Claimed places are never touched. */
export async function reviewLandmarks(input: { ids?: string[]; filter?: { status?: LandmarkStatus; kind?: string }; action: "approve" | "hide" | "delete" }) {
  const where: Prisma.LandmarkWhereInput = {
    status: { not: "CLAIMED" },
    ...(input.ids ? { id: { in: input.ids } } : {}),
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    ...(input.filter?.kind ? { kind: { slug: input.filter.kind } } : {}),
  };
  if (!input.ids && !input.filter) throw new LandmarkError("Say which places", 400);
  if (input.action === "delete") return { changed: (await prisma.landmark.deleteMany({ where })).count };
  return { changed: (await prisma.landmark.updateMany({ where, data: { status: input.action === "approve" ? "ACTIVE" : "HIDDEN" } })).count };
}

/* ---------------- import from OpenStreetMap ---------------- */

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

/** What each kind of point looks like in OpenStreetMap: the Overpass selectors that fetch it, and the test that says an element belongs to it. */
interface OsmRule { selectors: string[]; match: (t: Record<string, string>) => boolean; dupKm?: number }
const OSM_POINT_KINDS: Record<string, OsmRule> = {
  mosque: { selectors: [`["amenity"="place_of_worship"]["religion"="muslim"]`], match: (t) => t.amenity === "place_of_worship" && t.religion === "muslim" },
  church: { selectors: [`["amenity"="place_of_worship"]["religion"="christian"]`], match: (t) => t.amenity === "place_of_worship" && t.religion === "christian" },
  hospital: { selectors: [`["amenity"="hospital"]`], match: (t) => t.amenity === "hospital" },
  park: { selectors: [`["leisure"="park"]`], match: (t) => t.leisure === "park" },
  school: { selectors: [`["amenity"="school"]`], match: (t) => t.amenity === "school" },
  kindergarten: { selectors: [`["amenity"="kindergarten"]`], match: (t) => t.amenity === "kindergarten" },
  university: { selectors: [`["amenity"~"^(university|college)$"]`], match: (t) => t.amenity === "university" || t.amenity === "college" },
  government: { selectors: [`["office"="government"]`, `["amenity"~"^(townhall|courthouse)$"]`], match: (t) => t.office === "government" || t.amenity === "townhall" || t.amenity === "courthouse" },
  police: { selectors: [`["amenity"="police"]`], match: (t) => t.amenity === "police" },
  fire_station: { selectors: [`["amenity"="fire_station"]`], match: (t) => t.amenity === "fire_station" },
  post_office: { selectors: [`["amenity"="post_office"]`], match: (t) => t.amenity === "post_office" },
  bus_station: { selectors: [`["amenity"="bus_station"]`], match: (t) => t.amenity === "bus_station" },
  train_station: { selectors: [`["railway"="station"]`], match: (t) => t.railway === "station" },
  airport: { selectors: [`["aeroway"="aerodrome"]`], match: (t) => t.aeroway === "aerodrome" },
  stadium: { selectors: [`["leisure"="stadium"]`], match: (t) => t.leisure === "stadium" },
  museum: { selectors: [`["tourism"="museum"]`], match: (t) => t.tourism === "museum" },
  historic: { selectors: [`["historic"~"^(castle|fort|archaeological_site)$"]`], match: (t) => ["castle", "fort", "archaeological_site"].includes(t.historic) },
  market: { selectors: [`["amenity"="marketplace"]`], match: (t) => t.amenity === "marketplace" },
  square: { selectors: [`["place"="square"]`], match: (t) => t.place === "square" },
  neighborhood: { selectors: [`["place"~"^(suburb|neighbourhood|quarter)$"]`], match: (t) => ["suburb", "neighbourhood", "quarter"].includes(t.place), dupKm: 1 },
};
export const IMPORTABLE = [...Object.keys(OSM_POINT_KINDS), "main_street"] as const;

/** Kinds where "public or private" matters (a private one may be claimed by its owner). */
const SECTOR_KINDS = new Set(["hospital", "school", "kindergarten", "university"]);

/** How close the map must be before a kind is drawn: many small places (mosques, schools) wait for a closer view. */
const ZOOM_12 = new Set(["main_street", "hospital", "park", "neighborhood", "airport", "train_station", "university"]);
const ZOOM_14 = new Set(["mosque", "church", "school", "kindergarten", "police", "fire_station", "post_office", "market"]);
export function kindMinZoom(slug: string): number {
  return ZOOM_12.has(slug) ? 12 : ZOOM_14.has(slug) ? 14 : 13;
}

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

function overpassQuery(slugs: string[], s: number, w: number, n: number, e: number): string {
  const box = `(${s},${w},${n},${e})`;
  const points = slugs.flatMap((s) => (OSM_POINT_KINDS[s]?.selectors ?? []).map((sel) => `nwr${sel}${box};`));
  const parts: string[] = ["[out:json][timeout:90];"];
  if (points.length) parts.push(`(${points.join("")})->.a;.a out center tags;`);
  if (slugs.includes("main_street")) parts.push(`way["highway"~"^(motorway|trunk|primary)$"]["name"]${box}->.b;.b out geom tags;`);
  return parts.join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The public Overpass servers are shared and sometimes busy (429/502/504): try each one, with a pause, a few times. */
async function callOverpass(query: string): Promise<OsmElement[]> {
  let lastError = "";
  for (let round = 0; round < 3; round++) {
    for (const url of OVERPASS) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 100_000);
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Dalilacom/1.0 (info@dalilacom.com)" }, body: "data=" + encodeURIComponent(query), signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
        const json = (await res.json()) as { elements?: OsmElement[] };
        return json.elements ?? [];
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    await sleep(6_000 * (round + 1));
  }
  throw new LandmarkError("The map data service did not answer, try again in a minute", 502, lastError);
}

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Fetches the places around a point from OpenStreetMap into the REVIEW list (nothing is on the map until the admin approves). */
export async function importFromOsm(input: { latitude: number; longitude: number; radiusKm: number; kinds: string[]; cityId?: string | null; fetcher?: (q: string) => Promise<OsmElement[]> }) {
  const slugs = input.kinds.filter((k) => (IMPORTABLE as readonly string[]).includes(k));
  if (!slugs.length) throw new LandmarkError("Pick at least one kind", 400);
  const kinds = await prisma.landmarkKind.findMany({ where: { slug: { in: slugs } } });
  const kindBySlug = new Map(kinds.map((k) => [k.slug, k]));
  const dLat = input.radiusKm / 111.32;
  const dLng = input.radiusKm / (111.32 * Math.max(0.2, Math.cos((input.latitude * Math.PI) / 180)));
  const [s, w, n, e] = [Math.max(-90, input.latitude - dLat), dLng >= 180 ? -180 : Math.max(-180, input.longitude - dLng), Math.min(90, input.latitude + dLat), dLng >= 180 ? 180 : Math.min(180, input.longitude + dLng)];
  const fetchedElements = await (input.fetcher ?? callOverpass)(overpassQuery(slugs, s, w, n, e));
  // Overpass searches a rectangle. Keep imported places inside the circular area shown to the admin.
  const elements = fetchedElements.filter((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat !== undefined && lng !== undefined) return distanceKm(input.latitude, input.longitude, lat, lng) <= input.radiusKm;
    return (el.geometry ?? []).some((point) => distanceKm(input.latitude, input.longitude, point.lat, point.lon) <= input.radiusKm);
  });

  const existing = await prisma.landmark.findMany({ where: { latitude: { gte: s, lte: n }, longitude: { gte: w, lte: e } }, select: { name: true, latitude: true, longitude: true, kindId: true, sourceRef: true } });
  const refs = new Set(existing.map((x) => x.sourceRef).filter(Boolean) as string[]);
  const dup = (name: string, lat: number, lng: number, kindId: string, km: number) => existing.some((x) => x.kindId === kindId && sameName(x.name, name) && distanceKm(x.latitude, x.longitude, lat, lng) <= km);

  const created: Record<string, number> = {};
  let skipped = 0;
  let withoutArabic = 0;
  let unnamed = 0;
  const rows: Prisma.LandmarkUncheckedCreateInput[] = [];
  const streets = new Map<string, { name: string; nameEn?: string; segments: number[][][] }>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = (tags["name:ar"] || tags.name || "").trim();
    if (!name) { unnamed++; continue; }
    const nameEn = (tags["name:en"] || "").trim() || undefined;
    if (tags.highway) {
      const pts = (el.geometry ?? []).map((g) => [g.lat, g.lon]);
      if (pts.length < 2) continue;
      const key = nameKey(name);
      const entry = streets.get(key) ?? { name, nameEn, segments: [] };
      entry.segments.push(pts);
      streets.set(key, entry);
      continue;
    }
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    const slug = slugs.find((s) => OSM_POINT_KINDS[s]?.match(tags));
    const kind = slug ? kindBySlug.get(slug) : undefined;
    if (!slug || !kind) continue;
    const ref = `osm:${el.type}/${el.id}`;
    if (refs.has(ref) || dup(name, lat, lng, kind.id, OSM_POINT_KINDS[slug].dupKm ?? 0.12)) { skipped++; continue; }
    refs.add(ref);
    const op = (tags["operator:type"] || tags.ownership || "").toLowerCase();
    const sector: LandmarkSector | null = !SECTOR_KINDS.has(slug) ? null : /gov|public|state/.test(op) ? "PUBLIC" : /private/.test(op) ? "PRIVATE" : null;
    if (!hasArabic(name)) withoutArabic++;
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    rows.push({ kindId: kind.id, name, nameEn: nameEn ?? null, sector, status: "PENDING_REVIEW", cityId: input.cityId ?? null, address: street || null, phone: tags.phone || tags["contact:phone"] || null, latitude: lat, longitude: lng, source: "OSM", sourceRef: ref });
    created[slug] = (created[slug] ?? 0) + 1;
  }

  const streetKind = kindBySlug.get("main_street");
  if (streetKind) {
    for (const st of streets.values()) {
      // the name goes at the middle of the longest piece
      const longest = [...st.segments].sort((a, b) => b.length - a.length)[0];
      const mid = longest[Math.floor(longest.length / 2)];
      if (dup(st.name, mid[0], mid[1], streetKind.id, 2.5)) { skipped++; continue; }
      if (!hasArabic(st.name)) withoutArabic++;
      rows.push({ kindId: streetKind.id, name: st.name, nameEn: st.nameEn ?? null, status: "PENDING_REVIEW", cityId: input.cityId ?? null, latitude: mid[0], longitude: mid[1], path: st.segments.slice(0, 40).map((seg) => seg.filter((_, i) => i % Math.max(1, Math.ceil(seg.length / 400)) === 0)), source: "OSM" });
      created.main_street = (created.main_street ?? 0) + 1;
    }
  }

  if (rows.length) await prisma.landmark.createMany({ data: rows, skipDuplicates: true });
  return { fetched: elements.length, created, skipped, unnamed, withoutArabic, total: rows.length };
}

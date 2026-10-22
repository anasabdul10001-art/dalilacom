import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { foldedColumn } from "../lib/arabicFold";
import aliasFile from "../lib/landmarkKindAliases.json";
import { categoryAndDescendantIds, localizedName, loadCategoryTree, normalizeText, searchCategories, words } from "./category.service";
import { distanceKm, nameKey, shape } from "./landmark.service";

/**
 * One search for everything on the map: the shops that registered AND the public places (mosques, schools, castles...).
 * Arabic spelling is folded, a word that names a kind ("مدارس") lists the nearest places of that kind, and the order balances how
 * well the name matches with how near it is (a full match far away still beats a weak match next door).
 */

const KIND_WORDS = new Map<string, string[]>(); // a (folded, stemmed) word -> the kinds it names
for (const [slug, list] of Object.entries(aliasFile.kinds)) {
  for (const raw of list) {
    for (const w of words(normalizeText(raw))) KIND_WORDS.set(w, [...(KIND_WORDS.get(w) ?? []), slug]);
  }
}

export interface SearchInput {
  q: string;
  lat?: number;
  lng?: number;
  limit: number;
  lang: string;
}

export interface SearchItem {
  type: "shop" | "landmark";
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  address: string | null;
  score: number;
  kind?: { slug: string; name: string; icon: string; color: string };
  category?: { id: string; name: string; icon: string | null } | null;
  place?: ReturnType<typeof shape>; // the full public place (the card that opens on the map)
}

const PROXIMITY_KM = 5; // how fast nearness fades: a place this far counts about a third as much as one right here

function textScore(name: string, query: string, tokens: string[]): number {
  const n = normalizeText(name);
  const nameWords = words(n);
  if (n === query || nameKey(name) === nameKey(query)) return 1;
  if (n.startsWith(query)) return 0.85;
  if (tokens.length && tokens.every((t) => nameWords.some((w) => w.startsWith(t)))) return 0.7;
  if (n.includes(query) || (tokens.length && tokens.every((t) => n.includes(t)))) return 0.5;
  return 0.3;
}

const near = (lat: number | null, lng: number | null, ref: { lat: number; lng: number } | null) =>
  ref && lat != null && lng != null ? Math.round(distanceKm(ref.lat, ref.lng, lat, lng) * 10) / 10 : null;

/** full match x (0.5 + 0.5 x nearness): an exact name far away (about 0.5) always beats a weak match right next door (at most 0.3). */
function finalScore(text: number, km: number | null): number {
  return km == null ? text : text * (0.5 + 0.5 * Math.exp(-km / PROXIMITY_KM));
}

export async function unifiedSearch(input: SearchInput): Promise<{ items: SearchItem[]; kinds: string[] | null }> {
  const norm = normalizeText(input.q);
  if (norm.length < 2) return { items: [], kinds: null };
  const tokens = words(norm).filter((w) => w.length >= 2);
  if (!tokens.length) return { items: [], kinds: null };
  const ref = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null;

  // words that name a kind of place ("مدارس", "جامع"): they pick the kind, the other words must be in the name
  const kindTokens = tokens.filter((t) => KIND_WORDS.has(t));
  const nameTokens = tokens.filter((t) => !KIND_WORDS.has(t));
  const kindSlugs = kindTokens.length ? [...new Set(kindTokens.flatMap((t) => KIND_WORDS.get(t)!))] : null;

  const [landmarks, shops] = await Promise.all([
    searchLandmarks(norm, tokens, nameTokens, kindSlugs, ref, input),
    searchShops(norm, tokens, ref, input),
  ]);
  const items = [...landmarks, ...shops].sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.name.localeCompare(b.name, "ar"));
  return { items: items.slice(0, input.limit), kinds: kindSlugs };
}

async function searchLandmarks(norm: string, tokens: string[], nameTokens: string[], kindSlugs: string[] | null, ref: { lat: number; lng: number } | null, input: SearchInput): Promise<SearchItem[]> {
  const run = async (needKinds: string[] | null, nameTerms: string[]) => {
    const conds: Prisma.Sql[] = [Prisma.sql`l."status" = 'ACTIVE'`, Prisma.sql`k."isActive" = true`];
    if (needKinds) conds.push(Prisma.sql`k."slug" IN (${Prisma.join(needKinds)})`);
    for (const t of nameTerms) {
      const like = "%" + t.replace(/[\\%_]/g, "") + "%";
      conds.push(Prisma.sql`(${foldedColumn(Prisma.raw('l."name"'))} LIKE ${like} OR lower(coalesce(l."nameEn", '')) LIKE ${like})`);
    }
    const order = ref
      ? Prisma.sql`ORDER BY (power(l."latitude" - ${ref.lat}, 2) + power((l."longitude" - ${ref.lng}) * cos(radians(${ref.lat})), 2)) ASC`
      : Prisma.sql`ORDER BY l."name" ASC`;
    const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT l."id" FROM "Landmark" l JOIN "LandmarkKind" k ON k."id" = l."kindId"
      WHERE ${Prisma.join(conds, " AND ")} ${order} LIMIT 300`);
    if (!ids.length) return [];
    const rows = await prisma.landmark.findMany({ where: { id: { in: ids.map((r) => r.id) } }, include: { kind: true } });
    const rank = new Map(ids.map((r, i) => [r.id, i]));
    return rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  };

  // the kind named plus the name words; when that finds nothing, every word is tried in the name ("جامع الأموي" with no mosque so called)
  let rows = await run(kindSlugs, nameTokens);
  if (!rows.length && kindSlugs && nameTokens.length) rows = await run(null, tokens);
  const kindOnly = !!kindSlugs && !nameTokens.length;
  const en = input.lang !== "ar";
  return rows.map((l) => {
    const km = near(l.latitude, l.longitude, ref);
    const text = kindOnly ? 0.8 : Math.max(textScore(l.name, norm, nameTokens.length ? nameTokens : tokens), l.nameEn ? textScore(l.nameEn, norm, tokens) - 0.1 : 0);
    return {
      type: "landmark" as const, id: l.id, name: en && l.nameEn ? l.nameEn : l.name, latitude: l.latitude, longitude: l.longitude, distanceKm: km, address: l.address,
      score: finalScore(text, km), kind: { slug: l.kind.slug, name: en ? l.kind.nameEn : l.kind.nameAr, icon: l.kind.icon, color: l.kind.color }, place: shape(l, input.lang),
    };
  });
}

async function searchShops(norm: string, tokens: string[], ref: { lat: number; lng: number } | null, input: SearchInput): Promise<SearchItem[]> {
  const conds: Prisma.Sql[] = [Prisma.sql`m."approvalStatus" = 'APPROVED'`];
  for (const t of tokens) {
    const like = "%" + t.replace(/[\\%_]/g, "") + "%";
    conds.push(Prisma.sql`${foldedColumn(Prisma.raw('m."businessName"'))} LIKE ${like}`);
  }
  const byName = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT m."id" FROM "MerchantProfile" m WHERE ${Prisma.join(conds, " AND ")} LIMIT 200`);
  // "صيدلية" or "حلاق" reaches the shops of that profession even when their own name does not say it
  const hits = (await searchCategories(input.q, input.lang, 4)).filter((c) => c.score >= 60);
  const categoryIds = hits.length ? (await Promise.all(hits.map((c) => categoryAndDescendantIds(c.id)))).flat() : [];
  const ids = new Set(byName.map((r) => r.id));
  const rows = await prisma.merchantProfile.findMany({
    where: { approvalStatus: "APPROVED", OR: [{ id: { in: [...ids] } }, ...(categoryIds.length ? [{ categoryId: { in: categoryIds } }] : [])] },
    include: { category: true, branches: { where: { isActive: true } } },
    take: 200,
  });
  const { byId } = await loadCategoryTree();
  return rows.map((m) => {
    const places = [
      ...(m.latitude != null && m.longitude != null ? [{ lat: m.latitude, lng: m.longitude, address: m.address }] : []),
      ...m.branches.map((b) => ({ lat: b.latitude, lng: b.longitude, address: b.address ?? b.city })),
    ];
    const best = ref ? [...places].sort((a, b) => distanceKm(ref.lat, ref.lng, a.lat, a.lng) - distanceKm(ref.lat, ref.lng, b.lat, b.lng))[0] : places[0];
    const km = best ? near(best.lat, best.lng, ref) : null;
    const text = ids.has(m.id) ? textScore(m.businessName, norm, tokens) : 0.45;
    const node = byId.get(m.categoryId);
    return {
      type: "shop" as const, id: m.id, name: m.businessName, latitude: best?.lat ?? null, longitude: best?.lng ?? null, distanceKm: km, address: best?.address ?? null,
      score: finalScore(text, km), category: { id: m.categoryId, name: node ? localizedName(node, input.lang) : m.category.name, icon: m.category.icon },
    };
  });
}

import { prisma } from "../prisma";
import { DEFAULT_LANGUAGE } from "../lib/languages";

/* ---------------- text normalisation (Arabic-friendly, case-insensitive) ---------------- */

const STOPWORDS = new Set(["دكتور", "دكتوره", "طبيب", "طبيبه", "د", "dr", "doctor", "في", "عن", "محل", "محلات"]);

const ch = (code: number) => String.fromCharCode(code);

// Arabic diacritics (tashkeel 064B-065F, superscript alef 0670) and tatweel (0640).
const DIACRITICS = new RegExp(`[${ch(0x064b)}-${ch(0x065f)}${ch(0x0670)}${ch(0x0640)}]`, "g");

// Letters folded to one spelling: alef variants -> alef, teh marbuta -> heh, alef maksura / hamza-yeh -> yeh, hamza-waw -> waw.
const FOLD = new Map<number, number>([
  [0x0623, 0x0627], [0x0625, 0x0627], [0x0622, 0x0627], [0x0671, 0x0627],
  [0x0629, 0x0647],
  [0x0649, 0x064a], [0x0626, 0x064a],
  [0x0624, 0x0648],
]);

/** "الأَسنان" / "اسنان" / "Dentist" -> comparable forms: no diacritics, unified letters, western digits. */
export function normalizeText(input: string): string {
  let folded = "";
  for (const c of input.toLowerCase().replace(DIACRITICS, "")) {
    const code = c.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) folded += String(code - 0x0660); // Arabic-Indic digits
    else folded += FOLD.has(code) ? ch(FOLD.get(code)!) : c;
  }
  return folded.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Drops the definite article so "الاطباء" finds "اطباء". */
function stem(word: string): string {
  return word.length > 3 && word.startsWith("ال") ? word.slice(2) : word;
}

function words(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean).map(stem);
}

/* ---------------- the category tree, cached briefly ---------------- */

export interface CategoryNode {
  id: string;
  slug: string;
  parentId: string | null;
  icon: string | null;
  sortOrder: number;
  names: Record<string, string>; // lang -> name; the default language comes from Category.name
  haystack: string[]; // every normalised name + synonym, in every language
  children: CategoryNode[];
}

let cache: { at: number; byId: Map<string, CategoryNode>; roots: CategoryNode[] } | null = null;
const TTL_MS = 30_000;

export function invalidateCategoryCache() {
  cache = null;
}

export async function loadCategoryTree() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const rows = await prisma.category.findMany({ include: { translations: true } });
  const byId = new Map<string, CategoryNode>();
  for (const r of rows) {
    const names: Record<string, string> = { [DEFAULT_LANGUAGE]: r.name };
    const haystack = new Set<string>([normalizeText(r.name)]);
    for (const t of r.translations) {
      if (t.name) {
        names[t.lang] = t.name;
        haystack.add(normalizeText(t.name));
      }
      for (const s of t.synonyms) haystack.add(normalizeText(s));
    }
    byId.set(r.id, { id: r.id, slug: r.slug, parentId: r.parentId, icon: r.icon, sortOrder: r.sortOrder, names, haystack: [...haystack].filter(Boolean), children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const order = (a: CategoryNode, b: CategoryNode) => a.sortOrder - b.sortOrder || (a.names[DEFAULT_LANGUAGE] ?? "").localeCompare(b.names[DEFAULT_LANGUAGE] ?? "", "ar");
  for (const node of byId.values()) node.children.sort(order);
  roots.sort(order);
  cache = { at: Date.now(), byId, roots };
  return cache;
}

export function localizedName(node: CategoryNode, lang: string): string {
  return node.names[lang] ?? node.names[DEFAULT_LANGUAGE] ?? node.slug;
}

/** The category itself plus everything beneath it — "doctors" must include every specialty. */
export async function categoryAndDescendantIds(categoryId: string): Promise<string[]> {
  const { byId } = await loadCategoryTree();
  const start = byId.get(categoryId);
  if (!start) return [categoryId];
  const ids: string[] = [];
  const walk = (n: CategoryNode) => { ids.push(n.id); n.children.forEach(walk); };
  walk(start);
  return ids;
}

/** Approved merchants per category, rolled up so a section counts everything inside it. */
export async function merchantCountsBySubtree(): Promise<Map<string, number>> {
  const { byId } = await loadCategoryTree();
  const grouped = await prisma.merchantProfile.groupBy({ by: ["categoryId"], where: { approvalStatus: "APPROVED" }, _count: { _all: true } });
  const own = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  const total = new Map<string, number>();
  const sum = (n: CategoryNode): number => {
    const value = (own.get(n.id) ?? 0) + n.children.reduce((acc, c) => acc + sum(c), 0);
    total.set(n.id, value);
    return value;
  };
  for (const root of [...byId.values()].filter((n) => !n.parentId)) sum(root);
  return total;
}

export interface CategoryShape {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  merchantCount: number;
  children: CategoryShape[];
}

/** The whole tree in one language, with counts — what the browse screens render. */
export async function categoryTreeFor(lang: string): Promise<CategoryShape[]> {
  const [{ roots }, counts] = await Promise.all([loadCategoryTree(), merchantCountsBySubtree()]);
  const shape = (n: CategoryNode): CategoryShape => ({
    id: n.id,
    slug: n.slug,
    name: localizedName(n, lang),
    icon: n.icon,
    merchantCount: counts.get(n.id) ?? 0,
    children: n.children.map(shape),
  });
  return roots.map(shape);
}

/**
 * Places carry their category row, whose name is the base (Arabic) one. This returns a function that swaps
 * in the name for [lang], so a customer browsing in English sees "Dentist" on the card, not the Arabic.
 */
export async function categoryNameLocalizer(lang: string) {
  const { byId } = await loadCategoryTree();
  return <T extends { category?: { id: string; name: string } | null }>(place: T): T => {
    const node = place.category ? byId.get(place.category.id) : undefined;
    return place.category && node ? { ...place, category: { ...place.category, name: localizedName(node, lang) } } : place;
  };
}

/* ---------------- search ---------------- */

export interface CategoryHit {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  path: string; // "الطبي › أطباء › أسنان"
  depth: number;
  merchantCount: number;
  score: number;
}

function scoreNode(node: CategoryNode, q: string, queryWords: string[]): number {
  let best = 0;
  for (const item of node.haystack) {
    if (item === q) best = Math.max(best, 100);
    else if (item.startsWith(q)) best = Math.max(best, 80);
    const itemWords = words(item);
    if (itemWords.some((w) => w.startsWith(stem(q)))) best = Math.max(best, 60);
    if (queryWords.length > 1 && queryWords.every((qw) => itemWords.some((w) => w.startsWith(qw)))) best = Math.max(best, 70);
    if (q.length >= 3 && item.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

/** Ranked categories for a typed query, in any supported language, tolerant of spelling variants. */
export async function searchCategories(query: string, lang: string, limit = 8): Promise<CategoryHit[]> {
  const normalized = normalizeText(query);
  if (normalized.length < 2) return [];
  const allWords = words(normalized);
  const meaningful = allWords.filter((w) => !STOPWORDS.has(w));
  // "دكتور اسنان" -> look for "اسنان"; but a lone "طبيب" still has to find something.
  const queryWords = meaningful.length ? meaningful : allWords;
  const q = queryWords.join(" ");

  const [{ byId }, counts] = await Promise.all([loadCategoryTree(), merchantCountsBySubtree()]);
  const pathOf = (n: CategoryNode): string => {
    const names: string[] = [];
    for (let cur: CategoryNode | undefined = n; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) names.unshift(localizedName(cur, lang));
    return names.join(" › ");
  };
  const depthOf = (n: CategoryNode) => { let d = 0; for (let c = n.parentId ? byId.get(n.parentId) : undefined; c; c = c.parentId ? byId.get(c.parentId) : undefined) d++; return d; };

  return [...byId.values()]
    .map((n) => {
      // The query exactly as typed beats the version with filler words ("doctor", "دكتور") removed.
      const exact = scoreNode(n, allWords.join(" "), allWords);
      const core = q !== allWords.join(" ") ? scoreNode(n, q, queryWords) - 5 : 0;
      return { n, score: Math.max(exact, core) };
    })
    .filter((x) => x.score >= 40)
    .map(({ n, score }) => ({
      id: n.id,
      slug: n.slug,
      name: localizedName(n, lang),
      icon: n.icon,
      path: pathOf(n),
      depth: depthOf(n),
      merchantCount: counts.get(n.id) ?? 0,
      score,
    }))
    .sort((a, b) => b.score - a.score || b.merchantCount - a.merchantCount || a.depth - b.depth)
    .slice(0, limit);
}

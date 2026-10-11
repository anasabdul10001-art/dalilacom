import { prisma } from "../prisma";
import { DEFAULT_LANGUAGE } from "../lib/languages";
import { isStoreSection } from "../lib/storeSections";
import { normalizeText, scoreHaystack, words } from "./category.service";

/** The categories products are filed under (departments > categories > kinds), cached briefly like the professions. */
export interface ProductCategoryNode {
  id: string;
  slug: string;
  parentId: string | null;
  icon: string | null;
  section: string | null;
  isCustom: boolean;
  sortOrder: number;
  names: Record<string, string>;
  haystack: string[];
  children: ProductCategoryNode[];
}

let cache: { at: number; byId: Map<string, ProductCategoryNode>; roots: ProductCategoryNode[] } | null = null;
const TTL_MS = 30_000;
export const invalidateProductCategories = () => { cache = null; };

export async function loadProductCategories() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const rows = await prisma.productCategory.findMany();
  const byId = new Map<string, ProductCategoryNode>();
  for (const r of rows) {
    const names: Record<string, string> = { [DEFAULT_LANGUAGE]: r.name };
    if (r.nameEn) names.en = r.nameEn;
    const haystack = [...new Set([r.name, r.nameEn ?? "", ...r.synonyms].map(normalizeText).filter(Boolean))];
    byId.set(r.id, { id: r.id, slug: r.slug, parentId: r.parentId, icon: r.icon, section: r.section, isCustom: r.isCustom, sortOrder: r.sortOrder, names, haystack, children: [] });
  }
  const roots: ProductCategoryNode[] = [];
  for (const n of byId.values()) (n.parentId && byId.get(n.parentId) ? byId.get(n.parentId)!.children : roots).push(n);
  const order = (a: ProductCategoryNode, b: ProductCategoryNode) => a.sortOrder - b.sortOrder || a.names.ar.localeCompare(b.names.ar, "ar");
  for (const n of byId.values()) n.children.sort(order);
  roots.sort(order);
  cache = { at: Date.now(), byId, roots };
  return cache;
}

const nameOf = (n: ProductCategoryNode, lang: string) => n.names[lang] ?? n.names[DEFAULT_LANGUAGE];

export interface ProductCategoryShape {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  custom: boolean;
  children: ProductCategoryShape[];
}

export async function productCategoryTree(lang: string): Promise<ProductCategoryShape[]> {
  const { roots } = await loadProductCategories();
  const shape = (n: ProductCategoryNode): ProductCategoryShape => ({ id: n.id, slug: n.slug, name: nameOf(n, lang), icon: n.icon, custom: n.isCustom, children: n.children.map(shape) });
  return roots.map(shape);
}

/** The store section a category's products appear in: the one its department says. */
export async function sectionOfProductCategory(id: string): Promise<string | null> {
  const { byId } = await loadProductCategories();
  for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) if (cur.section && isStoreSection(cur.section)) return cur.section;
  return null;
}

export interface ProductCategoryHit {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  path: string; // "Fashion › Women › Dresses"
  depth: number;
  custom: boolean;
  score: number;
}

/** Ranked categories for what a shop typed — any language, with or without "al", tolerant of spelling variants. */
export async function searchProductCategories(query: string, lang: string, limit = 10): Promise<ProductCategoryHit[]> {
  const normalized = normalizeText(query);
  if (normalized.length < 2) return [];
  const queryWords = words(normalized);
  const q = queryWords.join(" ");
  const { byId } = await loadProductCategories();
  const pathOf = (n: ProductCategoryNode) => {
    const names: string[] = [];
    for (let cur: ProductCategoryNode | undefined = n; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) names.unshift(nameOf(cur, lang));
    return names.join(" › ");
  };
  const depthOf = (n: ProductCategoryNode) => { let d = 0; for (let c = n.parentId ? byId.get(n.parentId) : undefined; c; c = c.parentId ? byId.get(c.parentId) : undefined) d++; return d; };
  return [...byId.values()]
    .map((n) => ({ n, score: scoreHaystack(n.haystack, q, queryWords) }))
    .filter((x) => x.score >= 40)
    .map(({ n, score }) => ({ id: n.id, slug: n.slug, name: nameOf(n, lang), icon: n.icon, path: pathOf(n), depth: depthOf(n), custom: n.isCustom, score }))
    .sort((a, b) => b.score - a.score || b.depth - a.depth || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** A shop's own category: filed under a chosen one, usable at once. The same name under the same parent is the same category. */
export async function addProductCategory(merchantId: string, name: string, parentId: string): Promise<{ id: string; created: boolean }> {
  const { byId } = await loadProductCategories();
  const parent = byId.get(parentId);
  if (!parent) return { id: "", created: false };
  const wanted = normalizeText(name);
  const twin = parent.children.find((c) => c.haystack.some((h) => h === wanted));
  if (twin) return { id: twin.id, created: false };
  const row = await prisma.productCategory.create({
    data: { slug: `c-${Math.random().toString(36).slice(2, 10)}`, name: name.trim(), synonyms: [], parentId, sortOrder: 1000, isCustom: true, createdById: merchantId },
  });
  invalidateProductCategories();
  return { id: row.id, created: true };
}

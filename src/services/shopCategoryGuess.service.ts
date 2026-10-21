import noise from "../lib/shopNameNoise.json";
import { aiAvailable, pickProfessionsFromName } from "./ai.service";
import { CategoryNode, loadCategoryTree, localizedName, normalizeText, scoreHaystack, words } from "./category.service";

/** Words that appear in many shop names and say nothing about the work. */
const NOISE = new Set<string>(noise.noiseWords);

export interface CategoryGuess {
  id: string;
  name: string;
  icon: string | null;
  online: boolean;
  path: string;
}

export interface GuessResult {
  items: CategoryGuess[];
  source: "WORDS" | "AI" | "NONE";
}

function pathOf(node: CategoryNode, byId: Map<string, CategoryNode>, lang: string): string {
  const names: string[] = [];
  for (let cur: CategoryNode | undefined = node; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) names.unshift(localizedName(cur, lang));
  return names.join(" › ");
}

const shape = (n: CategoryNode, byId: Map<string, CategoryNode>, lang: string): CategoryGuess => ({ id: n.id, name: localizedName(n, lang), icon: n.icon, online: n.isOnline, path: pathOf(n, byId, lang) });

/** A word with a preposition glued on (a "for the", "by the", "and the" before the noun): the word as written and with that part removed. */
function variants(token: string): string[] {
  const out = new Set([token]);
  for (const prefix of noise.gluedPrefixes) if (token.startsWith(prefix) && token.length - prefix.length >= 3) out.add(token.slice(prefix.length));
  if (/^[وبل]/.test(token) && token.length >= 5) out.add(token.slice(1));
  return [...out];
}

/** The professions whose names or synonyms contain a word of the shop's name ("حلاق" in "صالون الأمير للحلاقة"). */
export async function guessFromWords(name: string, lang: string, limit = 4): Promise<{ items: CategoryGuess[]; strong: boolean }> {
  const { byId } = await loadCategoryTree();
  const whole = normalizeText(name);
  const all = words(whole);
  const tokens = all.filter((w) => w.length >= 3 && !NOISE.has(w));
  const hits: { n: CategoryNode; score: number; depth: number }[] = [];
  for (const n of byId.values()) {
    let depth = 0;
    for (let c = n.parentId ? byId.get(n.parentId) : undefined; c; c = c.parentId ? byId.get(c.parentId) : undefined) depth++;
    if (depth === 0 && n.children.length) continue; // a whole section says too little
    let score = all.length > 1 ? scoreHaystack(n.haystack, all.join(" "), all) : 0;
    let matched = 0; // how many words of the name point to this profession (a salon and a shaving word both say barber)
    for (const tok of tokens) {
      const best = Math.max(...variants(tok).map((v) => scoreHaystack(n.haystack, v, [v])));
      if (best >= 60) matched++;
      score = Math.max(score, best);
    }
    if (score >= 60) hits.push({ n, score: score + 8 * Math.max(0, matched - 1), depth });
  }
  // a hit whose own sub-profession also hit is dropped: the specific one is the better answer
  const ids = new Set(hits.map((h) => h.n.id));
  const leafish = hits.filter((h) => !h.n.children.some((c) => ids.has(c.id)));
  leafish.sort((a, b) => b.score - a.score || b.depth - a.depth || a.n.sortOrder - b.n.sortOrder);
  // only what is close to the best answer, and one row per name (the same profession may exist twice)
  const seen = new Set<string>();
  const top = leafish.filter((h, i) => h.score >= leafish[0].score - 25 && !seen.has(pathOf(h.n, byId, "ar")) && (seen.add(pathOf(h.n, byId, "ar")), true)).slice(0, limit);
  return { items: top.map((h) => shape(h.n, byId, lang)), strong: !!top.length && top[0].score >= 80 };
}

/** Which profession fits a shop name: its own words first; the AI when the words are not clear (and an AI is available). */
export async function guessShopCategory(name: string, lang: string, useAi: boolean): Promise<GuessResult> {
  const clean = name.replace(/\s+/g, " ").trim();
  if (normalizeText(clean).length < 3) return { items: [], source: "NONE" };
  const local = await guessFromWords(clean, lang);
  if (local.strong || !useAi || !aiAvailable()) return { items: local.items, source: local.items.length ? "WORDS" : "NONE" };

  const { byId } = await loadCategoryTree();
  const options = [...byId.values()].filter((n) => n.parentId || !n.children.length);
  const picks = await pickProfessionsFromName(clean, options.map((n) => pathOf(n, byId, "ar")));
  if (!picks || !picks.length) return { items: local.items, source: local.items.length ? "WORDS" : "NONE" };
  const fromAi = picks.map((i) => shape(options[i], byId, lang));
  const rest = local.items.filter((x) => !fromAi.some((y) => y.id === x.id));
  return { items: [...fromAi, ...rest].slice(0, 4), source: "AI" };
}

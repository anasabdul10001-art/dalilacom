import crypto from "crypto";
import { prisma } from "../prisma";
import { SUPPORTED_LANGUAGES, isSupportedLanguage } from "../lib/languages";
import { translateBatch } from "./ai.service";

/**
 * Texts people typed (a product's description, a shop's bio, a comment, a branch's name...) are shown in the language of
 * whoever reads them. The AI translates a text once per language and the result is kept, so a text costs one translation.
 * A text is never made to wait for the AI for long: if the answer is not there within a moment the reader gets the
 * original now and the translation (finished in the background) the next time. Names of shops and people are not translated.
 */

const ARABIC = /[\u0600-\u06FF]/g;
const LATIN = /[A-Za-z\u00C0-\u024F]/g;
const MAX_TEXT = 1500;
const BATCH = 25;
const PROMPT_NAME: Record<string, string> = { ar: "Arabic", en: "English" };
const waitMs = () => Number(process.env.CONTENT_TRANSLATE_WAIT_MS ?? 2500);

let pausedUntil = 0; // when the AI did not answer, do not ask again for a minute (nobody waits for a dead provider)

export const hashOf = (text: string) => crypto.createHash("sha1").update(text.trim()).digest("hex");

/** Does this text read in a different language than [lang]? (Arabic script against the rest, since those are the platform's two scripts.) */
export function needsTranslation(text: string, lang: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > MAX_TEXT) return false;
  const ar = (t.match(ARABIC) ?? []).length;
  const latin = (t.match(LATIN) ?? []).length;
  if (ar + latin < 3) return false; // numbers, emoji, a size
  return lang === "ar" ? ar / (ar + latin) < 0.3 : ar / (ar + latin) >= 0.3;
}

function targetName(lang: string): string {
  return PROMPT_NAME[lang] ?? SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.name ?? lang;
}

async function fetchAndStore(missing: string[], lang: string, fresh: Map<string, string>): Promise<void> {
  try {
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const out = await translateBatch(chunk, targetName(lang));
      if (!out) { pausedUntil = Date.now() + 60_000; return; }
      const rows: { sourceHash: string; lang: string; text: string }[] = [];
      chunk.forEach((original, k) => {
        const translated = out[k];
        if (translated && translated !== original) {
          fresh.set(original, translated);
          rows.push({ sourceHash: hashOf(original), lang, text: translated });
        }
      });
      if (rows.length) await prisma.contentTranslation.createMany({ data: rows, skipDuplicates: true });
    }
  } catch {
    pausedUntil = Date.now() + 60_000;
  }
}

/** Original text (trimmed) -> its translation, for the texts that have one ready (or finished within the wait). */
export async function translateTexts(texts: string[], lang: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!isSupportedLanguage(lang)) return result;
  const wanted = [...new Set(texts.map((t) => t.trim()).filter((t) => needsTranslation(t, lang)))];
  if (!wanted.length) return result;

  const saved = await prisma.contentTranslation.findMany({ where: { lang, sourceHash: { in: wanted.map(hashOf) } } });
  const byHash = new Map(saved.map((r) => [r.sourceHash, r.text]));
  const missing: string[] = [];
  for (const text of wanted) {
    const hit = byHash.get(hashOf(text));
    if (hit) result.set(text, hit);
    else missing.push(text);
  }
  if (!missing.length || Date.now() < pausedUntil) return result;

  const fresh = new Map<string, string>();
  const work = fetchAndStore(missing, lang, fresh);
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, waitMs()))]);
  for (const [original, translated] of fresh) result.set(original, translated);
  return result;
}

type Rec = Record<string, unknown>;

/**
 * Replaces, in place, the listed text fields of every record by their translation into [lang] (when there is one).
 * Only copies built for a response may be passed — never a row that is about to be saved.
 */
export async function translateRecords(lang: string, records: (Rec | null | undefined)[], keys: string[]): Promise<void> {
  const list = records.filter((r): r is Rec => !!r && typeof r === "object");
  const texts: string[] = [];
  for (const r of list) for (const k of keys) if (typeof r[k] === "string") texts.push(r[k] as string);
  const found = await translateTexts(texts, lang);
  if (!found.size) return;
  for (const r of list) for (const k of keys) {
    const v = r[k];
    if (typeof v === "string") { const t = found.get(v.trim()); if (t) r[k] = t; }
  }
}

/** A product's own texts: its name and description, and the labels and values of its details. */
export async function translateProducts(lang: string, products: (Rec | null | undefined)[]): Promise<void> {
  const list = products.filter((p): p is Rec => !!p);
  // the details are shared with the stored row: copy them before changing
  for (const p of list) if (Array.isArray(p.specs)) p.specs = (p.specs as Rec[]).map((s) => ({ ...s }));
  const copied = list.flatMap((p) => (Array.isArray(p.specs) ? (p.specs as Rec[]) : []));
  await translateRecords(lang, [...list, ...copied], ["name", "description", "label", "value"]);
}

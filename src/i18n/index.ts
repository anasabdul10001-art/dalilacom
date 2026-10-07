import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../lib/languages";
// <i18n-imports>
import { en } from "./en";
// </i18n-imports>

/**
 * A language's translation of the server's own texts. Arabic is the source language of the code, so it has
 * no pack; every other language adds one file (src/i18n/<code>.ts) and one line in `PACKS` below.
 * `npm run i18n:add -- <code> "<name>" <rtl|ltr>` creates the file and the line for you.
 */
export interface LanguagePack {
  /** Arabic source text -> translation (whole texts). */
  phrases: Record<string, string>;
  /** Texts with numbers/names inside: regex -> replacement ("$1") or a function. */
  patterns: [RegExp, string | ((match: RegExpMatchArray) => string)][];
  /** Words replaced anywhere inside a text (admin-configurable names such as the credit unit). */
  words?: Record<string, string>;
}

const PACKS: Record<string, LanguagePack> = {
  // <i18n-packs> — `npm run i18n:add` inserts new languages here
  en,
  // </i18n-packs>
};

export function languagePack(lang: string): LanguagePack | undefined {
  return PACKS[lang];
}

export function registeredLanguages(): string[] {
  return Object.keys(PACKS);
}

const ARABIC = new RegExp("[" + String.fromCharCode(0x600) + "-" + String.fromCharCode(0x6ff) + "]");

/** Translates one text into [lang]; text with no entry (or an Arabic reader) comes back unchanged. */
export function translateText(text: string, lang: string): string {
  if (lang === DEFAULT_LANGUAGE || typeof text !== "string" || !ARABIC.test(text)) return text;
  const pack = PACKS[lang];
  if (!pack) return text;
  const trimmed = text.trim();
  let result = text;
  if (Object.prototype.hasOwnProperty.call(pack.phrases, trimmed)) {
    result = text.replace(trimmed, () => pack.phrases[trimmed]);
  } else {
    for (const [re, replacement] of pack.patterns) {
      const match = trimmed.match(re);
      if (match) {
        result = text.replace(trimmed, () => (typeof replacement === "function" ? replacement(match) : trimmed.replace(re, replacement)));
        break;
      }
    }
  }
  for (const [word, translation] of Object.entries(pack.words ?? {})) {
    if (result.includes(word)) result = result.split(word).join(translation);
  }
  return result;
}

const languageMeta = (lang: string) => SUPPORTED_LANGUAGES.find((l) => l.code === lang);
export const directionOf = (lang: string): "rtl" | "ltr" => languageMeta(lang)?.dir ?? "rtl";

/**
 * Translates a whole HTML page produced by the server (email verification, Facebook linking...): every text
 * between two tags goes through [translateText] on its own — never a blind substring replace, so names and
 * other user data inside the page are left alone — and the page's lang/dir attributes follow the language.
 */
export function translateHtml(html: string, lang: string): string {
  if (lang === DEFAULT_LANGUAGE || !PACKS[lang]) return html;
  return html
    .replace(/>([^<>]+)</g, (_m, text: string) => `>${translateText(text, lang)}<`)
    .replace(/<html lang="ar" dir="rtl"/i, `<html lang="${lang}" dir="${directionOf(lang)}"`);
}

const MESSAGE_KEYS = new Set(["message", "creditName"]);

/**
 * JSON responses carry their human-readable text in `message`, `creditName` and `error.message`. Only those are
 * translated (and only at the top level), so no field a user typed can ever be rewritten.
 */
export function localizeBody(body: unknown, lang: string): unknown {
  if (lang === DEFAULT_LANGUAGE || !PACKS[lang] || body === null || typeof body !== "object" || Array.isArray(body)) return body;
  const source = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  for (const key of Object.keys(out)) {
    if (MESSAGE_KEYS.has(key) && typeof out[key] === "string") out[key] = translateText(out[key] as string, lang);
  }
  const error = source.error;
  if (typeof error === "string") out.error = translateText(error, lang);
  else if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    out.error = { ...(error as object), message: translateText((error as { message: string }).message, lang) };
  }
  return out;
}

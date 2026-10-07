import type { Request } from "express";

/**
 * The languages the platform serves. Adding one is: add it here, add its translations (category names
 * live in CategoryTranslation rows, the apps' screen texts in their own dictionary files) — no code changes.
 * The default is also the language stored on the base rows (Category.name is Arabic).
 */
export const SUPPORTED_LANGUAGES = [
  // <languages> — `npm run i18n:add` appends here
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "en", name: "English", dir: "ltr" },
  // </languages>
] as const;

export const DEFAULT_LANGUAGE = "ar";

const CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export function isSupportedLanguage(code: string | undefined | null): code is string {
  return !!code && CODES.includes(code);
}

/** ?lang=xx wins, then the Accept-Language header (by q-weight, "en-US" -> "en"), then the default. */
export function resolveLanguage(req: Request): string {
  const explicit = typeof req.query.lang === "string" ? req.query.lang.toLowerCase().split("-")[0] : undefined;
  if (isSupportedLanguage(explicit)) return explicit;

  const header = req.headers["accept-language"];
  if (typeof header === "string") {
    const ranked = header
      .split(",")
      .map((part) => {
        const [tag, ...params] = part.trim().split(";");
        const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
        return { code: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
      })
      .sort((a, b) => b.q - a.q);
    const match = ranked.find((r) => isSupportedLanguage(r.code));
    if (match) return match.code;
  }
  return DEFAULT_LANGUAGE;
}

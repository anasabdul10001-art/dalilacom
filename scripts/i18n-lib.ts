/**
 * Tooling for languages. `addLanguage` scaffolds a new language on every platform (server, web, Android) with
 * English placeholders; `checkLanguages` reports what a language still lacks and — for the reference
 * languages — any Arabic text somewhere in the code that has no translation at all.
 * Everything takes the project root as a parameter so the tests can run it on a temporary copy.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { pathToFileURL } from "url";

const ARABIC = new RegExp("[" + String.fromCharCode(0x600) + "-" + String.fromCharCode(0x6ff) + "]");
export const hasArabic = (text: string) => ARABIC.test(text);

/* ---------------- small file helpers (keep the file's own line endings) ---------------- */

function read(file: string): { text: string; crlf: boolean } {
  const raw = fs.readFileSync(file, "utf8");
  return { text: raw.replace(/\r\n/g, "\n"), crlf: raw.includes("\r\n") };
}
function write(file: string, text: string, crlf = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text, "utf8");
}
function insertBefore(file: string, marker: string, insertion: string) {
  const { text, crlf } = read(file);
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`Marker "${marker}" not found in ${file}`);
  const lineStart = text.lastIndexOf("\n", at) + 1;
  write(file, text.slice(0, lineStart) + insertion + text.slice(lineStart), crlf);
}

/* ---------------- what is registered ---------------- */

export interface LanguageInfo {
  code: string;
  name: string;
  dir: "rtl" | "ltr";
}

export function registeredLanguages(root: string): LanguageInfo[] {
  const { text } = read(path.join(root, "src/lib/languages.ts"));
  return [...text.matchAll(/\{ code: "([a-z]+)", name: "([^"]+)", dir: "(rtl|ltr)" \}/g)].map((m) => ({ code: m[1], name: m[2], dir: m[3] as "rtl" | "ltr" }));
}

/* ---------------- web language files ---------------- */

interface WebLanguage {
  langs: Record<string, { name: string; dir: string }>;
  dict: Record<string, string>;
  phrases: Record<string, string>;
  patterns: [RegExp, string | ((m: RegExpMatchArray) => string)][];
  words: Record<string, string>;
}

/** Runs one i18n.<code>.js in a sandbox (it only fills registries) and returns what it registered. */
export function loadWebLanguage(root: string, code: string): WebLanguage | null {
  const file = path.join(root, `public/app/i18n.${code}.js`);
  if (!fs.existsSync(file)) return null;
  const sandbox: Record<string, unknown> = { LANGS: {}, DICT: {}, PHRASES: {}, PATTERNS: {}, WORDS: {}, tr: (x: string) => x };
  vm.createContext(sandbox);
  vm.runInContext(read(file).text, sandbox);
  const get = <T>(name: string, fallback: T): T => ((sandbox[name] as Record<string, T>)[code] as T) ?? fallback;
  return {
    langs: sandbox.LANGS as WebLanguage["langs"],
    dict: get("DICT", {}),
    phrases: get("PHRASES", {}),
    patterns: get("PATTERNS", []),
    words: get("WORDS", {}),
  };
}

function patternLiteral(entry: [RegExp, string | ((m: RegExpMatchArray) => string)]): string {
  const [re, replacement] = entry;
  return `  [${re.toString()}, ${typeof replacement === "function" ? replacement.toString() : JSON.stringify(replacement)}],`;
}

/* ---------------- Android resources ---------------- */

export function androidStrings(root: string, folder: string): Record<string, string> {
  const dir = path.join(root, "android/app/src/main/res", folder);
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir).filter((f) => f.startsWith("strings") && f.endsWith(".xml"))) {
    for (const m of read(path.join(dir, file)).text.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)) out[m[1]] = m[2];
  }
  return out;
}

/* ---------------- adding a language ---------------- */

export interface AddOptions {
  code: string;
  name: string;
  dir: "rtl" | "ltr";
}

export async function addLanguage(root: string, { code, name, dir }: AddOptions): Promise<string[]> {
  if (!/^[a-z]{2}$/.test(code)) throw new Error(`Language code must be two lowercase letters (e.g. "de"), got "${code}"`);
  if (dir !== "rtl" && dir !== "ltr") throw new Error(`Direction must be "rtl" or "ltr"`);
  if (!name.trim() || /["\\]/.test(name)) throw new Error("Give the language's own name (e.g. Deutsch), without quotes");
  if (registeredLanguages(root).some((l) => l.code === code)) throw new Error(`Language "${code}" already exists`);
  const done: string[] = [];

  // 1. server: the registry, and a translation pack stub (English placeholders, to be translated)
  insertBefore(path.join(root, "src/lib/languages.ts"), "// </languages>", `  { code: "${code}", name: "${name}", dir: "${dir}" },\n`);
  const enPack = (await import(pathToFileURL(path.join(root, "src/i18n/en.ts")).href)).en as {
    phrases: Record<string, string>;
    patterns: [RegExp, string | ((m: RegExpMatchArray) => string)][];
    words?: Record<string, string>;
  };
  write(
    path.join(root, `src/i18n/${code}.ts`),
    [
      `import type { LanguagePack } from "./index";`,
      ``,
      `/**`,
      ` * ${name} — scaffolded by \`npm run i18n:add\`. Every value below is still the ENGLISH placeholder:`,
      ` * translate the values (keep the Arabic keys and the $1 / {...} markers) and run \`npm run i18n:check\`.`,
      ` */`,
      `export const pack: LanguagePack = {`,
      `  phrases: ${JSON.stringify(enPack.phrases, null, 4).replace(/\n/g, "\n  ")},`,
      `  patterns: [`,
      ...enPack.patterns.map((p) => "  " + patternLiteral(p)),
      `  ],`,
      `  words: ${JSON.stringify(enPack.words ?? {}, null, 4).replace(/\n/g, "\n  ")},`,
      `};`,
      ``,
    ].join("\n"),
  );
  insertBefore(path.join(root, "src/i18n/index.ts"), "// </i18n-imports>", `import { pack as ${code} } from "./${code}";\n`);
  insertBefore(path.join(root, "src/i18n/index.ts"), "// </i18n-packs>", `  ${code},\n`);
  done.push(`server: src/lib/languages.ts, src/i18n/${code}.ts, src/i18n/index.ts`);

  // 2. web: one self-registering file
  const en = loadWebLanguage(root, "en");
  if (!en) throw new Error("public/app/i18n.en.js is missing — it is the template for new languages");
  write(
    path.join(root, `public/app/i18n.${code}.js`),
    [
      `// ${name} — scaffolded by \`npm run i18n:add\`. Every value below is still the ENGLISH placeholder:`,
      `// translate the values (keep the keys, the {n} / $1 markers). \`npm run i18n:check\` lists what is left. See docs/I18N.md.`,
      `LANGS.${code} = { name: ${JSON.stringify(name)}, dir: "${dir}" };`,
      `DICT.${code} = ${JSON.stringify(en.dict, null, 2)};`,
      `PHRASES.${code} = ${JSON.stringify(en.phrases, null, 2)};`,
      `PATTERNS.${code} = [`,
      ...en.patterns.map(patternLiteral),
      `];`,
      `WORDS.${code} = ${JSON.stringify(en.words)};`,
      ``,
    ].join("\n"),
  );
  const index = path.join(root, "public/app/index.html");
  const html = read(index);
  const lastTag = [...html.text.matchAll(/<script src="i18n\.[a-z]+\.js"><\/script>\n/g)].pop();
  if (!lastTag) throw new Error("No i18n script tags found in public/app/index.html");
  const at = lastTag.index! + lastTag[0].length;
  write(index, html.text.slice(0, at) + `<script src="i18n.${code}.js"></script>\n` + html.text.slice(at), html.crlf);
  done.push(`web: public/app/i18n.${code}.js, public/app/index.html`);

  // 3. Android: resource folder (copy of English as placeholders) + the language list
  const resRoot = path.join(root, "android/app/src/main/res");
  const enFolder = path.join(resRoot, "values-en");
  for (const file of fs.readdirSync(enFolder).filter((f) => f.startsWith("strings") && f.endsWith(".xml"))) {
    const source = read(path.join(enFolder, file));
    const note = `<!-- ${name}: scaffolded by npm run i18n:add. The values are still ENGLISH placeholders — translate them (keep the keys and %1$s / %1$d markers). -->\n`;
    write(path.join(resRoot, `values-${code}`, file), source.text.replace(/(<\?xml[^>]*\?>\n)/, `$1${note}`), source.crlf);
  }
  insertBefore(
    path.join(root, "android/app/src/main/kotlin/com/dalilacom/app/ui/i18n/AppLanguages.kt"),
    "// </languages>",
    `        AppLanguage("${code}", "${name}", rtl = ${dir === "rtl"}),\n`,
  );
  done.push(`android: res/values-${code}/*, ui/i18n/AppLanguages.kt`);
  return done;
}

/* ---------------- checking ---------------- */

export interface LanguageReport {
  code: string;
  missing: { web: string[]; android: string[]; server: string[]; categories: string[] };
  /** same text as the English one (a placeholder, or a word that really is identical) */
  sameAsEnglish: { web: number; android: number; server: number };
}

export interface CheckReport {
  languages: LanguageReport[];
  /** Arabic texts that exist in the code but have no translation in English (the reference language). */
  uncovered: { web: string[]; android: string[]; server: string[] };
}

const looksTranslatable = (text: string) => /[A-Za-z]{4,}/.test(text);

/** Arabic string literals of a file's source (single/double/backtick, comments skipped). */
function arabicLiterals(source: string): { text: string; line: number; template: boolean }[] {
  const out: { text: string; line: number; template: boolean }[] = [];
  const lines = source.split("\n");
  const literal = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    for (const m of line.matchAll(literal)) {
      const text = m[1] ?? m[2] ?? m[3] ?? "";
      if (hasArabic(text)) out.push({ text, line: index + 1, template: m[3] !== undefined && text.includes("${") });
    }
  });
  return out;
}

function walk(dir: string, extensions: string[], skip: (file: string) => boolean = () => false): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "build") continue;
      out.push(...walk(full, extensions, skip));
    } else if (extensions.some((e) => entry.name.endsWith(e)) && !skip(full)) out.push(full);
  }
  return out;
}

/** Server files whose Arabic is data or an internal word list, not text a user reads. */
const SERVER_IGNORE = ["src/i18n/", "src/lib/languages.ts", "src/services/category.service.ts", "src/services/geo.service.ts", "src/services/responder.service.ts", "src/lib/storeSections.ts", "src/services/demoStore.service.ts", "src/services/ai.service.ts"];

export async function checkLanguages(root: string): Promise<CheckReport> {
  const langs = registeredLanguages(root).filter((l) => l.code !== "ar");
  const enWeb = loadWebLanguage(root, "en");
  const arWeb = loadWebLanguage(root, "ar");
  const enPack = (await import(pathToFileURL(path.join(root, "src/i18n/en.ts")).href)).en as { phrases: Record<string, string>; patterns: [RegExp, string | ((m: RegExpMatchArray) => string)][] };
  const arAndroid = androidStrings(root, "values");
  const enAndroid = androidStrings(root, "values-en");
  const categoriesSource = fs.existsSync(path.join(root, "prisma/categories.data.ts")) ? read(path.join(root, "prisma/categories.data.ts")).text : "";
  const categorySlugs = [...categoriesSource.matchAll(/\bc\("([a-z0-9-]+)"/g)].map((m) => m[1]);

  const languages: LanguageReport[] = [];
  for (const { code } of langs) {
    const web = loadWebLanguage(root, code);
    const reference = code === "en" ? arWeb : enWeb; // en must have every key Arabic has; others every key English has
    const missingWeb: string[] = [];
    let sameWeb = 0;
    if (!web) missingWeb.push(`(no public/app/i18n.${code}.js)`);
    else {
      for (const key of Object.keys(arWeb?.dict ?? {})) if (!(key in web.dict)) missingWeb.push(`DICT ${key}`);
      if (code !== "en") for (const key of Object.keys(enWeb?.phrases ?? {})) if (!(key in web.phrases)) missingWeb.push(`PHRASE ${key}`);
      if (code !== "en") {
        for (const [key, value] of Object.entries(web.dict)) if (value === enWeb?.dict[key] && looksTranslatable(value)) sameWeb++;
        for (const [key, value] of Object.entries(web.phrases)) if (value === enWeb?.phrases[key] && looksTranslatable(value)) sameWeb++;
      }
    }
    void reference;

    const android = androidStrings(root, `values-${code}`);
    const missingAndroid = Object.keys(arAndroid).filter((k) => !(k in android)).map((k) => `string ${k}`);
    const sameAndroid = code === "en" ? 0 : Object.entries(android).filter(([k, v]) => v === enAndroid[k] && looksTranslatable(v)).length;

    const missingServer: string[] = [];
    let sameServer = 0;
    if (code === "en") {
      /* en is the reference pack */
    } else {
      const pack = fs.existsSync(path.join(root, `src/i18n/${code}.ts`)) ? ((await import(pathToFileURL(path.join(root, `src/i18n/${code}.ts`)).href + `?t=${Date.now()}`)).pack as typeof enPack) : null;
      if (!pack) missingServer.push(`(no src/i18n/${code}.ts)`);
      else {
        for (const key of Object.keys(enPack.phrases)) if (!(key in pack.phrases)) missingServer.push(key);
        if (pack.patterns.length !== enPack.patterns.length) missingServer.push(`patterns: ${pack.patterns.length} of ${enPack.patterns.length}`);
        for (const [key, value] of Object.entries(pack.phrases)) if (value === enPack.phrases[key] && looksTranslatable(value)) sameServer++;
      }
    }

    // category names: English comes with the seed; every other language adds `tr: { <code>: ... }` to the nodes
    const missingCategories = code === "en" ? [] : categorySlugs.filter((slug) => !new RegExp(`c\\("${slug}"[\\s\\S]*?tr:\\s*\\{[^}]*\\b${code}:`).test(categoriesSource));
    languages.push({
      code,
      missing: { web: missingWeb, android: missingAndroid, server: missingServer, categories: missingCategories },
      sameAsEnglish: { web: sameWeb, android: sameAndroid, server: sameServer },
    });
  }

  // Arabic text in the code that nobody translated (what a developer adds next week and forgets)
  const uncovered = { web: [] as string[], android: [] as string[], server: [] as string[] };
  const translatedByEn = (text: string) => {
    const trimmed = text.trim();
    if (trimmed in (enWeb?.phrases ?? {}) || trimmed in enPack.phrases) return true;
    return [...(enWeb?.patterns ?? []), ...enPack.patterns].some(([re]) => re.test(trimmed));
  };

  const appJs = path.join(root, "public/app/app.js");
  if (fs.existsSync(appJs)) {
    for (const { text, line } of arabicLiterals(read(appJs).text)) {
      // pieces of HTML templates: judge each text between tags (and attribute values) separately
      // text between tags; a ${value} inside it is replaced by "0" so the number/name patterns can be tried on it
      const pieces = text.split(/<[^>]*>/).map((p) => p.replace(/\$\{[^}]*\}/g, "0").trim()).filter((p) => hasArabic(p));
      for (const piece of pieces) if (!translatedByEn(piece) && !Object.values(arWeb?.dict ?? {}).includes(piece) && !isOnlyPunctuation(piece)) uncovered.web.push(`app.js:${line}  ${piece}`);
    }
  }
  for (const file of walk(path.join(root, "android/app/src/main/kotlin"), [".kt"], (f) => f.endsWith("AppLanguages.kt"))) {
    for (const { text, line } of arabicLiterals(read(file).text)) uncovered.android.push(`${path.relative(root, file)}:${line}  ${text}`);
  }
  for (const file of walk(path.join(root, "src"), [".ts"], (f) => SERVER_IGNORE.some((s) => f.replace(/\\/g, "/").includes(s)))) {
    for (const { text, line, template } of arabicLiterals(read(file).text)) {
      if (template) continue; // texts with values inside are matched by patterns; they cannot be judged statically
      const pieces = text.split(/<[^>]*>/).map((p) => p.trim()).filter((p) => hasArabic(p));
      for (const piece of pieces) if (!translatedByEn(piece) && !isOnlyPunctuation(piece)) uncovered.server.push(`${path.relative(root, file)}:${line}  ${piece}`);
    }
  }
  return { languages, uncovered };
}

function isOnlyPunctuation(text: string): boolean {
  return !/[\p{L}\p{N}]/u.test(text.replace(new RegExp("[" + String.fromCharCode(0x600) + "-" + String.fromCharCode(0x6ff) + "]", "g"), "")) && text.length <= 2;
}

/** The report as plain text for the terminal. */
export function formatReport(report: CheckReport): { text: string; failed: boolean } {
  const lines: string[] = [];
  let failed = false;
  for (const l of report.languages) {
    const missing = l.missing.web.length + l.missing.android.length + l.missing.server.length + l.missing.categories.length;
    const same = l.sameAsEnglish.web + l.sameAsEnglish.android + l.sameAsEnglish.server;
    lines.push(`\n[${l.code}] ${missing === 0 ? "complete" : `MISSING ${missing}`}${same ? `  (${same} texts still identical to English — maybe not translated yet)` : ""}`);
    if (missing) failed = true;
    for (const [platform, list] of Object.entries(l.missing)) {
      if (list.length) lines.push(`  ${platform}: ${list.length} missing` + list.slice(0, 5).map((x) => `\n    - ${x}`).join("") + (list.length > 5 ? `\n    … and ${list.length - 5} more` : ""));
    }
  }
  for (const [platform, list] of Object.entries(report.uncovered)) {
    if (!list.length) continue;
    failed = true;
    lines.push(`\nUNTRANSLATED ${platform} (Arabic text in the code with no English): ${list.length}` + list.slice(0, 8).map((x) => `\n    - ${x}`).join("") + (list.length > 8 ? `\n    … and ${list.length - 8} more` : ""));
  }
  if (!failed) lines.push("\nEverything is covered.");
  return { text: lines.join("\n"), failed };
}

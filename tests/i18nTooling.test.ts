import fs from "fs";
import path from "path";
import { describe, it, expect, afterAll } from "vitest";
import { addLanguage, checkLanguages, formatReport, loadWebLanguage, registeredLanguages } from "../scripts/i18n-lib";

const repo = path.resolve(__dirname, "..");
// Inside the project (git-ignored) so the test runner can import the generated TypeScript from it.
const sandboxRoot = path.join(repo, "tmp-i18n-sandbox");

afterAll(() => {
  fs.rmSync(sandboxRoot, { recursive: true, force: true });
});

/** A throwaway copy of just the files the tooling touches. */
function copyProject(name: string): string {
  const target = path.join(sandboxRoot, name);
  fs.rmSync(target, { recursive: true, force: true });
  const copy = (from: string, to = from) => fs.cpSync(path.join(repo, from), path.join(target, to), { recursive: true });
  copy("src/lib/languages.ts");
  copy("src/i18n");
  copy("public/app/index.html");
  for (const file of fs.readdirSync(path.join(repo, "public/app")).filter((f) => /^i18n(\.[a-z]+)?\.js$|^app\.js$/.test(f))) copy(`public/app/${file}`);
  copy("android/app/src/main/res/values");
  copy("android/app/src/main/res/values-en");
  copy("android/app/src/main/kotlin/com/dalilacom/app/ui/i18n/AppLanguages.kt");
  copy("prisma/categories.data.ts");
  return target;
}

describe("The project's own translations (a guard for every future change)", () => {
  it("has every language complete and no Arabic text left untranslated in the code", async () => {
    const report = await checkLanguages(repo);
    expect(report.languages.map((l) => l.code)).toEqual(expect.arrayContaining(["en"]));
    for (const language of report.languages) {
      expect(language.missing, `language ${language.code}`).toEqual({ web: [], android: [], server: [], categories: [] });
    }
    // If this fails, someone wrote Arabic text for users without adding its English: run `npm run i18n:check`.
    expect(report.uncovered).toEqual({ web: [], android: [], server: [] });
    expect(formatReport(report).failed).toBe(false);
  });
});

describe("npm run i18n:add", () => {
  it("scaffolds a language on the server, the web and Android — and the checker then lists what is left", async () => {
    const root = copyProject("add");
    const done = await addLanguage(root, { code: "de", name: "Deutsch", dir: "ltr" });
    expect(done).toHaveLength(3);

    // server
    expect(registeredLanguages(root).map((l) => l.code)).toEqual(["ar", "en", "de"]);
    const index = fs.readFileSync(path.join(root, "src/i18n/index.ts"), "utf8");
    expect(index).toContain('import { pack as de } from "./de";');
    expect(index).toMatch(/\n\s+de,\n\s+\/\/ <\/i18n-packs>/);
    expect(fs.readFileSync(path.join(root, "src/i18n/de.ts"), "utf8")).toContain('"الباقة غير موجودة": "Plan not found"'); // English placeholder, Arabic key

    // web: a self-registering file, loaded before app.js
    const web = loadWebLanguage(root, "de")!;
    expect(web.langs.de).toEqual({ name: "Deutsch", dir: "ltr" });
    expect(web.dict["tab.map"]).toBe("Map");
    expect(Object.keys(web.phrases).length).toBeGreaterThan(200);
    expect(web.patterns.length).toBe(loadWebLanguage(root, "en")!.patterns.length);
    const html = fs.readFileSync(path.join(root, "public/app/index.html"), "utf8");
    expect(html.indexOf('i18n.de.js')).toBeGreaterThan(html.indexOf("i18n.en.js"));
    expect(html.indexOf('i18n.de.js')).toBeLessThan(html.indexOf('app.js'));

    // android
    expect(fs.existsSync(path.join(root, "android/app/src/main/res/values-de/strings.xml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "android/app/src/main/res/values-de/strings_screens.xml"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "android/app/src/main/kotlin/com/dalilacom/app/ui/i18n/AppLanguages.kt"), "utf8")).toContain('AppLanguage("de", "Deutsch", rtl = false),');

    // nothing is missing (placeholders exist everywhere), but the checker says they are still English — and that the
    // category names need translating by hand
    const german = (await checkLanguages(root)).languages.find((l) => l.code === "de")!;
    expect(german.missing.web).toEqual([]);
    expect(german.missing.android).toEqual([]);
    expect(german.missing.server).toEqual([]);
    expect(german.missing.categories.length).toBeGreaterThan(50);
    expect(german.sameAsEnglish.web).toBeGreaterThan(100);
    expect(german.sameAsEnglish.android).toBeGreaterThan(100);
    expect(german.sameAsEnglish.server).toBeGreaterThan(50);
  });

  it("refuses a duplicate, a bad code and a bad direction", async () => {
    const root = copyProject("refuse");
    await expect(addLanguage(root, { code: "en", name: "English", dir: "ltr" })).rejects.toThrow(/already exists/);
    await expect(addLanguage(root, { code: "deu", name: "Deutsch", dir: "ltr" })).rejects.toThrow(/two lowercase letters/);
    await expect(addLanguage(root, { code: "fr", name: "Français", dir: "up" as never })).rejects.toThrow(/rtl/);
  });
});

describe("npm run i18n:check", () => {
  it("reports a missing key per platform for a language that fell behind", async () => {
    const root = copyProject("behind");
    await addLanguage(root, { code: "fr", name: "Français", dir: "ltr" });
    // drop one text from each platform's French files
    const webFile = path.join(root, "public/app/i18n.fr.js");
    fs.writeFileSync(webFile, fs.readFileSync(webFile, "utf8").replace(/\n\s*"tab\.map": "Map",?/, "\n").replace('"tab.map": "Map", ', ""));
    const xml = path.join(root, "android/app/src/main/res/values-fr/strings.xml");
    fs.writeFileSync(xml, fs.readFileSync(xml, "utf8").replace(/\s*<string name="tab_map">[^<]*<\/string>/, ""));
    const pack = path.join(root, "src/i18n/fr.ts");
    fs.writeFileSync(pack, fs.readFileSync(pack, "utf8").replace(/\n\s*"الباقة غير موجودة": "Plan not found",/, ""));

    const french = (await checkLanguages(root)).languages.find((l) => l.code === "fr")!;
    expect(french.missing.web).toContain("DICT tab.map");
    expect(french.missing.android).toContain("string tab_map");
    expect(french.missing.server).toContain("الباقة غير موجودة");
    expect(formatReport(await checkLanguages(root)).failed).toBe(true);
  });

  it("finds Arabic text added to the code without a translation", async () => {
    const root = copyProject("untranslated");
    fs.mkdirSync(path.join(root, "src/routes"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/routes/new.routes.ts"), 'export const message = "رسالة جديدة بدون ترجمة";\nexport const known = "الباقة غير موجودة";\n');
    const appJs = path.join(root, "public/app/app.js");
    fs.writeFileSync(appJs, fs.readFileSync(appJs, "utf8") + '\nconst added = `<p>نص جديد بالتطبيق</p>`;\n');
    const kotlin = path.join(root, "android/app/src/main/kotlin/com/dalilacom/app/ui/NewScreen.kt");
    fs.mkdirSync(path.dirname(kotlin), { recursive: true });
    fs.writeFileSync(kotlin, 'val label = "عنوان جديد"\n');

    const { uncovered } = await checkLanguages(root);
    expect(uncovered.server.join("\n")).toContain("رسالة جديدة بدون ترجمة");
    expect(uncovered.server.join("\n")).not.toContain("الباقة غير موجودة");
    expect(uncovered.web.join("\n")).toContain("نص جديد بالتطبيق");
    expect(uncovered.android.join("\n")).toContain("عنوان جديد");
  });
});

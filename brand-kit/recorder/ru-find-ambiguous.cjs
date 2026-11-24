// Debug: Arabic texts used by the recorder that the site translates in more than one way (the auto-map takes the first, which may be the wrong screen)
const fs = require("fs"), vm = require("vm");
const ctx = { LANGS: {}, DICT: {}, PHRASES: {}, PATTERNS: {}, WORDS: {} }; vm.createContext(ctx);
for (const f of ["ar", "ru"]) vm.runInContext(fs.readFileSync(`../../public/app/i18n.${f}.js`, "utf8"), ctx);
const multi = {};
for (const [k, v] of Object.entries(ctx.DICT.ar)) if (ctx.DICT.ru[k]) (multi[v.trim()] ??= new Map()).set(k, ctx.DICT.ru[k]);
const lits = new Set();
const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const runs = /[\u0600-\u06FF][\u0600-\u06FF\s\u2013\-\u00b7()%.,\u061f:\u060c]*[\u0600-\u06FF)%]|[\u0600-\u06FF]/g;
for (const f of ["accounting-guided.cjs", "guided.cjs", "ch-a.cjs", "ch-b.cjs", "lib.cjs"]) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(re)) { const t = m[1] ?? m[2] ?? m[3]; if (/[\u0600-\u06FF]/.test(t)) { lits.add(t.trim()); for (const r of t.matchAll(runs)) lits.add(r[0].trim()); } }
}
for (const l of lits) {
  const m = multi[l];
  if (m && new Set(m.values()).size > 1) console.log(l, "=>", [...m].map(([k, v]) => k.split(".").slice(0, 3).join(".") + ": " + v).join(" | ").slice(0, 320));
}

// Builds brand-kit/voice-pack/: the real texts of the app (so a writer hears the current voice), the product facts, and the prompt.
// Run: node brand-kit/makeVoicePack.cjs
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "voice-pack");
fs.mkdirSync(out, { recursive: true });

// ---- the app's Arabic texts: load the dictionary file in a sandbox ----
const ctx = { LANGS: {}, DICT: {}, PHRASES: {}, PATTERNS: {}, WORDS: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "public/app/i18n.ar.js"), "utf8"), ctx);
const ar = ctx.DICT.ar;
const entries = Object.entries(ar).filter(([, v]) => typeof v === "string" && /[؀-ۿ]/.test(v));

const groups = [
  ["أزرار وأفعال (CTA)", /^(login\.pill|filter\.|search\.|ref\.(apply|copy|become)|adr\.(publish|refuse)|dh\.receipt|disc\.(add|give)|fab\.|reg\.|sp\.choose)/],
  ["عناوين الشاشات", /(title|\.head)$/],
  ["رسائل الحالة والأخطاء", /(failed|error|need|empty|none|bad|already|denied|expired|sent|pending|ok)$/i],
  ["أوصاف وشروحات", /(sub|hint|note|desc|intro|body)$/],
];
const pick = (re, max) => entries.filter(([k]) => re.test(k)).slice(0, max);
let voice = "# نصوص التطبيق الفعلية اليوم (صوت العلامة الحالي)\n\nهذه نصوص حقيقية من تطبيق وموقع دليلكم كما هي، مأخوذة من ملف الترجمة العربي. هي **مثال على الصوت الحالي، وليست بالضرورة الصوت المطلوب**. لاحظ الخليط بين الفصحى والعامية الشامية.\n\n";
const seen = new Set();
for (const [title, re] of groups) {
  const rows = pick(re, 28).filter(([k]) => !seen.has(k));
  rows.forEach(([k]) => seen.add(k));
  if (!rows.length) continue;
  voice += `## ${title}\n\n` + rows.map(([k, v]) => `- ${v.replace(/\s+/g, " ").trim()}`).join("\n") + "\n\n";
}
fs.writeFileSync(path.join(out, "02-app-texts.md"), voice);

// ---- the server's messages (errors, notifications) ----
const arErrors = fs.readFileSync(path.join(root, "src/i18n/arErrors.ts"), "utf8");
const msgs = [...arErrors.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => m[2]).filter((t) => /[؀-ۿ]/.test(t));
const notifs = [...fs.readFileSync(path.join(root, "src/i18n/en.ts"), "utf8").matchAll(/^\s*"([^"]*[؀-ۿ][^"]*)":/gm)].map((m) => m[1]).filter((t) => t.length < 90 && /(تمت|لم تتم|طلب|وصل|حسم|منتج|إعلان|عضوية|رصيد)/.test(t));
fs.writeFileSync(
  path.join(out, "03-server-messages.md"),
  "# رسائل الأخطاء والإشعارات (من السيرفر)\n\nنصوص حقيقية يراها المستخدم عند الخطأ أو بالإشعارات.\n\n## رسائل الأخطاء\n\n" +
    [...new Set(msgs)].slice(0, 60).map((t) => `- ${t}`).join("\n") +
    "\n\n## عناوين الإشعارات وغيرها\n\n" +
    [...new Set(notifs)].slice(0, 50).map((t) => `- ${t}`).join("\n") + "\n",
);
console.log("texts:", entries.length, "errors:", msgs.length, "notifs:", notifs.length);

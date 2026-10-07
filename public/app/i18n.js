// The framework for the web preview's languages. The texts live in one file per language:
// i18n.ar.js (the source), i18n.en.js, ... Each registers itself in LANGS / DICT / PHRASES / PATTERNS / WORDS.
// `npm run i18n:add -- <code> "<name>" <rtl|ltr>` creates a new language file and wires it up; see docs/I18N.md.
const LANGS = {}; // filled by the language files (i18n.<code>.js)
const DEFAULT_LANG = "ar";

const DICT = {}; // DICT[code] = { key: text }, filled by the language files

function loadSavedLang() {
  try {
    const saved = localStorage.getItem("dlk_lang");
    if (saved && LANGS[saved]) return saved;
  } catch (e) {}
  return DEFAULT_LANG; // Arabic first — the browser's language is not guessed
}

let LANG = DEFAULT_LANG;

/** t("sheet.count", { n: 5 }) -> the current language's text; falls back to Arabic, then to the key itself. */
function t(key, vars) {
  let text = (DICT[LANG] && DICT[LANG][key]) ?? DICT[DEFAULT_LANG][key] ?? key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] !== undefined ? vars[name] : `{${name}}`));
  return text;
}

// Called once by app.js, after all language files have registered themselves.
function initLanguage() {
  LANG = loadSavedLang();
  applyLang();
}

function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANGS[LANG].dir;
}

/* ---------------- translating what the screens render (gettext-style) ----------------
   The screens are written in Arabic. For any other language the rendered text is translated by lookup:
   PHRASES[lang]  = { "arabic text exactly as shown": "translation" }
   PATTERNS[lang] = [ [regex, "replacement with $1" | (match) => string], ... ]  for texts with numbers/names in them.
   Both come from i18n.<lang>.js. Text with no entry simply stays Arabic. */
const PHRASES = {};
const PATTERNS = {};
const WORDS = {}; // WORDS[lang] = { "arabic word or name": "translation" } — replaced anywhere inside a text
const ARABIC_RE = new RegExp("[" + String.fromCharCode(0x600) + "-" + String.fromCharCode(0x6ff) + "]");

function tr(text) {
  if (LANG === DEFAULT_LANG || typeof text !== "string" || !ARABIC_RE.test(text)) return text;
  const trimmed = text.trim();
  let result = text;
  const table = PHRASES[LANG];
  if (table && Object.prototype.hasOwnProperty.call(table, trimmed)) {
    result = text.replace(trimmed, () => table[trimmed]);
  } else {
    for (const [re, replacement] of PATTERNS[LANG] || []) {
      const match = trimmed.match(re);
      if (match) {
        result = text.replace(trimmed, () => (typeof replacement === "function" ? replacement(match) : trimmed.replace(re, replacement)));
        break;
      }
    }
  }
  for (const [word, translation] of Object.entries(WORDS[LANG] || {})) {
    if (result.includes(word)) result = result.split(word).join(translation);
  }
  return result;
}

// Translates every text node and the placeholder/title/alt/aria-label attributes under [root].
function trDom(root) {
  if (LANG === DEFAULT_LANG || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const tag = node.parentNode && node.parentNode.nodeName;
    if (tag === "TEXTAREA" || tag === "SCRIPT" || tag === "STYLE") continue; // user text / code, never translated
    if (ARABIC_RE.test(node.nodeValue)) {
      const out = tr(node.nodeValue);
      if (out !== node.nodeValue) node.nodeValue = out;
    }
  }
  root.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach((el) => {
    for (const attribute of ["placeholder", "title", "aria-label", "alt"]) {
      const value = el.getAttribute(attribute);
      if (value && ARABIC_RE.test(value)) el.setAttribute(attribute, tr(value));
    }
  });
}

// The browser's own dialogs go through the same table.
for (const name of ["alert", "confirm", "prompt"]) {
  const native = window[name].bind(window);
  window[name] = (message, ...rest) => native(tr(String(message)), ...rest);
}

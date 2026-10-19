// Same-origin — this page is served by the API itself (public/app/), so no CORS/base-URL needed.
const API_BASE = "";

initLanguage(); // language files are loaded by now (index.html order)

// A phone/keyboard set to Arabic or Persian types its own digit shapes, which parseInt/parseFloat reject.
// Every number typed into a form goes through latinDigits() first. (Built from char codes so no Arabic text sits in the code.)
/** A country, governorate, city or neighbourhood named in the reader's language. */
function geoName(u) {
  return LANG === "ar" ? u.nameArabic || u.name : u.nameEnglish || u.name;
}

function latinDigits(text) {
  const ch = (n) => String.fromCharCode(n);
  return String(text == null ? "" : text)
    .replace(new RegExp("[" + ch(0x660) + "-" + ch(0x669) + "]", "g"), (d) => d.charCodeAt(0) - 0x660)
    .replace(new RegExp("[" + ch(0x6f0) + "-" + ch(0x6f9) + "]", "g"), (d) => d.charCodeAt(0) - 0x6f0)
    .replace(new RegExp("[" + ch(0x66b) + ch(0x60c) + ",]", "g"), ".")
    .replace(new RegExp("[" + ch(0x66c) + "\\s]", "g"), "");
}

const S = {
  currency: "EUR",
  token: localStorage.getItem("dlk_token") || null,
  role: localStorage.getItem("dlk_role") || null,
  screen: S_initialScreen(),
  homeTab: "discover",
  merchantTab: "redeem",
  params: {},
  stack: [],
  busy: false,
  error: null,
  qrTimer: null,
  qrTick: null,
};

function S_initialScreen() {
  return "home";
}

/* ---------------- light / dark mode ---------------- */

// Follows the device until the user picks one with the button; the pick is remembered.
const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function currentTheme() {
  let saved = null;
  try { saved = localStorage.getItem("dlk_theme"); } catch (e) {}
  return saved === "light" || saved === "dark" ? saved : darkQuery && darkQuery.matches ? "dark" : "light";
}
function applyTheme() { document.documentElement.setAttribute("data-theme", currentTheme()); }
function toggleTheme() {
  try { localStorage.setItem("dlk_theme", currentTheme() === "dark" ? "light" : "dark"); } catch (e) {}
  applyTheme();
  render();
}
applyTheme();
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { applyTheme(); render(); });

/* ---------------- helpers ---------------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Money in the currency of the shopper's country (S.currency, from /geo/market): dollars in Syria for now, euros elsewhere unless set. */
const CURRENCY_SYMBOL = { USD: "$", EUR: "€", GBP: "£", TRY: "₺" };

function fmt(cents) {
  const code = S.currency || "EUR";
  const amount = (Number(cents || 0) / 100).toFixed(2);
  const sym = CURRENCY_SYMBOL[code];
  if (!sym) return `${amount} ${code}`;
  return LANG === "en" ? `${sym}${amount}` : `${amount} ${sym}`;
}

async function loadMarket() {
  const { ok, data } = await api("GET", "/geo/market");
  if (ok && data.currencyCode && data.currencyCode !== S.currency) { S.currency = data.currencyCode; render(); }
}

function errMsg(data, fallback) {
  if (!data || !data.error) return fallback;
  if (typeof data.error === "string") return data.error;
  if (data.error.code === "AUTH_MISSING_TOKEN") return "سجّل دخولك أول لتكمل";
  // a refused field is named in plain words (the server's own wording for it is technical)
  const fields = (data.error.details && data.error.details.fieldErrors) || {};
  const FIELD_TEXT = {
    email: "الإيميل غير صحيح، اكتبه بهالشكل: name@example.com",
    newEmail: "الإيميل الجديد غير صحيح، اكتبه بهالشكل: name@example.com",
    password: "كلمة السر لازم تكون 8 أحرف أو أكثر",
    newPassword: "كلمة السر الجديدة لازم تكون 8 أحرف أو أكثر",
    fullName: "اكتب اسمك (حرفين أو أكثر)",
    phone: "رقم الهاتف غير صحيح (6 أرقام على الأقل)",
  };
  for (const key of Object.keys(fields)) if (FIELD_TEXT[key]) return FIELD_TEXT[key];
  const fieldError = Object.values(fields).flat()[0];
  return fieldError || data.error.message || fallback;
}

async function api(method, path, body) {
  // The server answers (errors, pages, names) in the app's language, not the browser's.
  const headers = { "Content-Type": "application/json", "Accept-Language": LANG };
  if (S.token) headers["Authorization"] = "Bearer " + S.token;
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (method !== "GET" && res.ok && S._onboarding) S._onboarding.at = 0; // any write may change the setup checklist
    if (res.status === 401 && S.token) {
      // An expired/revoked session drops the visitor back onto the (public) map, not a login wall.
      clearToken();
      S.homeTab = "discover";
      reset("home");
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: "تعذّر الاتصال بالسيرفر، تحقق من الإنترنت" } };
  }
}

function setToken(token, role) {
  S.token = token;
  S.role = role;
  localStorage.setItem("dlk_token", token);
  localStorage.setItem("dlk_role", role);
  if (S._discover) loadFavIds();
  loadMarket(); // the account's own country decides the currency
  saveAccountLanguage(); // push notifications and emails are written in this language
  claimStoredJoin(); // a code from a referral link, for accounts made with Google or Facebook
}

function saveAccountLanguage() {
  if (!S.token) return;
  api("PATCH", "/profile/me", { language: LANG }).catch(() => {});
}

function clearToken() {
  S.token = null;
  S.role = null;
  localStorage.removeItem("dlk_token");
  localStorage.removeItem("dlk_role");
  if (S._discover) S._discover.favIds = [];
  S._favorites = null;
  S.account = null;
  S._refMe = null;
  S._onboarding = null;
  S._mprof = null;
  S._profile = null;
  loadMarket();
}

function stopQrLoop() {
  if (S.qrTimer) clearTimeout(S.qrTimer);
  if (S.qrTick) clearInterval(S.qrTick);
  S.qrTimer = null;
  S.qrTick = null;
}

function go(screen, params) {
  stopQrLoop();
  S.stack.push({ screen: S.screen, params: S.params, homeTab: S.homeTab, merchantTab: S.merchantTab });
  S.screen = screen;
  S.params = params || {};
  S.error = null;
  render();
}

function back() {
  stopQrLoop();
  const prev = S.stack.pop() || { screen: "home", params: {}, homeTab: "home", merchantTab: "redeem" };
  S.screen = prev.screen;
  S.params = prev.params;
  S.homeTab = prev.homeTab || S.homeTab;
  S.merchantTab = prev.merchantTab || S.merchantTab;
  S.error = null;
  render();
}

/** Not open yet: the buttons stay, a tap only says it is coming (flip these when the Meta app and the auto-responder are ready). */
const SOON = { facebookLogin: true, responder: true };

function reset(screen) {
  stopQrLoop();
  S.stack = [];
  S.screen = screen;
  S.params = {};
  S.error = null;
  render();
}

function setHomeTab(tab) {
  // The auto-responder is a whole screen of its own: the middle button opens it (guests are taken to sign in first).
  if (tab === "responder") {
    if (SOON.responder) return toast(t("soon.responder"));
    if (!S.token) return go("login");
    S._resp = null;
    return go("responder");
  }
  // the store is a whole screen of its own: guests may browse it too
  if (tab === "store") return openStore();
  if (tab !== "card") stopQrLoop();
  // the deals tab is the map of the shops with a discount; it shares the map's state with the plain map tab
  if (tab === "deals" || tab === "discover") {
    const d = discoverState();
    d.discountsOnly = tab === "deals";
    if (tab === "deals") S._dealsIntro = !dealsIntroHidden();
  }
  S.homeTab = tab;
  render();
}

function setMerchantTab(tab) {
  S.merchantTab = tab;
  render();
}

function root() {
  return document.getElementById("screen-body");
}

/* ---- the round floating buttons: the member card for everyone, the discount button for shops ---- */

const FAB_HIDDEN = ["login", "register", "merchantRegister", "forgot", "socialEmail"];
const FAB_STORE = ["store", "productDetail"]; // the shop's discount button is not shown on the store screens
const FAB_CARD_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/></svg>`;
const FAB_TAG_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>`;

function isMapScreen() { return S.screen === "home" && (S.homeTab === "discover" || S.homeTab === "deals"); }
function showCardFab() { return !FAB_HIDDEN.includes(S.screen) && !(S.screen === "home" && S.homeTab === "card"); }
function showDiscFab() { return S.role === "MERCHANT" && !!S.token && !FAB_HIDDEN.includes(S.screen) && !FAB_STORE.includes(S.screen); }

function cardFabButton(cls) {
  return `<button class="${cls} card-fab" title="${esc(t("deals.myCard"))}" aria-label="${esc(t("deals.myCard"))}" onclick="openMyCard()">${FAB_CARD_SVG}</button>`;
}
function discFabButton(cls) {
  return `<button id="fab-disc" class="${cls} disc-fab" title="${esc(t("fab.discount"))}" aria-label="${esc(t("fab.discount"))}" onclick="S._mfabOpen=!S._mfabOpen;render()">${FAB_TAG_SVG}</button>`;
}

/** Inside the map the two sit where the language and theme buttons were. */
function mapFabsHtml() {
  return `${showCardFab() ? cardFabButton("map-fab theme-fab") : ""}${showDiscFab() ? discFabButton("map-fab lang-fab") : ""}`;
}

/** On every other page they stand in a column; the discount menu and the hints open beside the discount button. */
function floatingButtonsHtml() {
  const card = showCardFab();
  const disc = showDiscFab();
  if (!card && !disc) return "";
  const stack = isMapScreen() ? "" : `<div class="fab-stack">${disc ? discFabButton("rfab") : ""}${card ? cardFabButton("rfab") : ""}</div>`;
  if (!disc) return stack;
  mfabStartTips();
  return `${stack}
  ${S._mfabOpen ? `<div class="mfab-shade" onclick="S._mfabOpen=false;render()"></div>` : ""}
  <div id="mfab-pop" class="mfab-pop">
    <div id="mfab-tip" class="mfab-tip" style="display:none"><button class="mfab-tip-x" onclick="mfabTipClose(event)" aria-label="x">✕</button><span id="mfab-tip-text" onclick="mfabGo('add')"></span></div>
    ${S._mfabOpen ? `<div class="mfab-menu">
      <button onclick="mfabGo('add')"><span>➕</span>${esc(t("fab.addDiscount"))}</button>
      <button onclick="mfabGo('give')"><span>🎟️</span>${esc(t("fab.giveDiscount"))}</button>
    </div>` : ""}
  </div>`;
}

/** The menu and the hints open beside the discount button, wherever it is on the page. */
function placeDiscPopup() {
  const pop = document.getElementById("mfab-pop");
  const btn = document.getElementById("fab-disc");
  if (!pop || !btn) return;
  const r = btn.getBoundingClientRect();
  pop.style.bottom = Math.max(8, window.innerHeight - r.bottom) + "px";
  if (document.documentElement.dir === "rtl") { pop.style.right = window.innerWidth - r.left + 10 + "px"; pop.style.left = "auto"; }
  else { pop.style.left = r.right + 10 + "px"; pop.style.right = "auto"; }
}

/** Every so often a short hint says why a discount is good for the shop (the true reasons), until the shop closes it. */
let _mfabTimer = null;
function mfabStartTips() {
  if (S._mfabTipsOff === undefined) S._mfabTipsOff = tipsOffNow();
  if (_mfabTimer || S._mfabTipsOff) return;
  const tips = t("fab.tips").split("||");
  let i = 0;
  const show = () => {
    const box = document.getElementById("mfab-tip");
    const text = document.getElementById("mfab-tip-text");
    if (!box || !text || S._mfabTipsOff || S._mfabOpen) return;
    text.textContent = tips[i++ % tips.length];
    box.style.display = "";
    placeDiscPopup();
    setTimeout(() => { const b = document.getElementById("mfab-tip"); if (b) b.style.display = "none"; }, 9000);
  };
  setTimeout(show, 5000);
  _mfabTimer = setInterval(show, 38000);
}
const tipsOffNow = () => { if (typeof S._mfabTipsOff === "boolean") return S._mfabTipsOff; try { return localStorage.getItem("dlk_fab_tips_off") === "1"; } catch (e) { return false; } };
function setTipsOff(off) {
  S._mfabTipsOff = off;
  try { if (off) localStorage.setItem("dlk_fab_tips_off", "1"); else localStorage.removeItem("dlk_fab_tips_off"); } catch (e) {}
  if (!off) _mfabTimer = null; // the hints start again
  render();
}

function mfabTipClose(ev) {
  ev.stopPropagation();
  S._mfabTipsOff = true;
  try { localStorage.setItem("dlk_fab_tips_off", "1"); } catch (e) {}
  const b = document.getElementById("mfab-tip");
  if (b) b.style.display = "none";
}

function mfabGo(what) {
  S._mfabOpen = false;
  if (what === "add") { S._disc = null; return go("discounts"); }
  S.merchantTab = "redeem"; // where a member's code is scanned and the discount given
  if (S.screen !== "merchantMode") return go("merchantMode");
  render();
}

/** The card is a page of the home screen; a guest is taken to sign in first. */
function openMyCard() {
  if (!S.token) return go("login");
  reset("home");
  setHomeTab("card");
}

/** Language and light/dark live in the account settings now. */
function lookAndLanguageHtml() {
  return `<div class="card">
    <div class="section-title" style="margin-top:0">${esc(t("acct.look"))}</div>
    <div class="switch-row"><span>${esc(t("acct.dark"))}</span>
      <label class="switch"><input type="checkbox" ${currentTheme() === "dark" ? "checked" : ""} onchange="toggleTheme()" /><span class="track"></span></label></div>
    <div style="margin-top:10px"><strong>${esc(t("acct.language"))}</strong>
      <div class="chip-row" style="margin-top:6px;flex-wrap:wrap">${Object.entries(LANGS).map(([code, l]) => `<button class="chip ${code === LANG ? "active" : ""}" onclick="setLang('${code}')">${esc(l.name)}</button>`).join("")}</div></div>
    ${S.role === "MERCHANT" ? `<div class="switch-row" style="margin-top:12px"><span>${esc(t("acct.fabTips"))}</span>
      <label class="switch"><input type="checkbox" ${tipsOffNow() ? "" : "checked"} onchange="setTipsOff(!this.checked)" /><span class="track"></span></label></div>` : ""}
  </div>`;
}

// Our own social media pages: the owner sets them (and switches each on or off) in the admin panel; until they load, Facebook shows.
let SOCIAL_LINKS = [{ platform: "facebook", url: "https://www.facebook.com/Dalilacomsy" }];
const SOCIAL_NAME = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", googleplay: "Google Play" };
const SOCIAL_GLYPH = {
  facebook: '<path fill="#fff" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3z"/>',
  instagram: '<rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4.1" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1.05" fill="#fff"/>',
  youtube: '<rect x="3.4" y="6.4" width="17.2" height="11.2" rx="3.2" fill="#fff"/><path d="M10.2 9.5v5l4.4-2.5z" fill="#ba2a34"/>',
  googleplay: '<polygon fill="#00A0FF" points="5,2.5 5,21.5 13,12"/><polygon fill="#00E676" points="5,2.5 13,12 16.8,9.97"/><polygon fill="#FFC800" points="13,12 16.8,9.97 20,12 16.8,14.03"/><polygon fill="#FF3A44" points="5,21.5 13,12 16.8,14.03"/>',
  tiktok: '<path d="M13.3 4.6v10.1a2.9 2.9 0 1 1-2.9-2.9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.3 4.6c.3 2.1 1.7 3.6 4 3.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
};
let APP_DOWNLOAD = false; // the owner switched the direct download of the Android app on (admin panel)
async function loadAppDownloadLink() {
  try {
    const res = await fetch(API_BASE + "/app-download");
    if (!res.ok) return;
    const data = await res.json();
    if (!!data.available !== APP_DOWNLOAD) { APP_DOWNLOAD = !!data.available; render(); }
  } catch (e) { /* the link simply stays hidden */ }
}
async function loadSocialLinks() {
  try {
    const res = await fetch(API_BASE + "/social-links");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.links) && JSON.stringify(data.links) !== JSON.stringify(SOCIAL_LINKS)) { SOCIAL_LINKS = data.links; render(); }
  } catch (e) { /* the icons simply stay as they are */ }
}

/** The logo in the language of the screen: the Arabic lettering, or the English logo (wide) for every other language. kind: vertical | horizontal; tone: color | white | black. */
function logoSrc(kind, tone) {
  return LANG === "ar" ? `/brand/logo-full-${kind}-${tone}.png` : `/brand/logo-en-horizontal-${tone}.png`;
}

/** The essential pages (about, privacy, terms, returns, shipping): small links at the bottom of the main screens. */
function legalLinksHtml() {
  const L = [["about", "legal.about"], ["privacy", "legal.privacy"], ["terms", "legal.terms"], ["refund", "legal.refund"], ["shipping", "legal.shipping"]];
  return `<nav class="legal-links" aria-label="legal">${L.map(([p, k]) => `<a href="/${p}.html" target="_blank" rel="noopener">${esc(t(k))}</a>`).join("")}</nav>`;
}

/** Small round icons to our pages (the ones switched on in the admin panel), with the line that other pages with the name are not ours. */
function followUsHtml(withNote) {
  if (!SOCIAL_LINKS.length && !APP_DOWNLOAD) return "";
  const icons = SOCIAL_LINKS.map((l) => `<a class="follow-icon${l.platform === "googleplay" ? " is-play" : ""}" href="${esc(l.url)}" target="_blank" rel="noopener" aria-label="${esc(SOCIAL_NAME[l.platform] || l.platform)}" title="${esc(SOCIAL_NAME[l.platform] || l.platform)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${SOCIAL_GLYPH[l.platform] || ""}</svg></a>`).join("");
  return `<div class="follow-us">
    <span class="follow-label">${esc(t("follow.us"))}</span>
    <div class="follow-icons">${icons}</div>
    ${APP_DOWNLOAD ? `<a class="follow-apk" href="/download.html" target="_blank" rel="noopener">${esc(t("follow.download"))}</a>` : ""}
    ${withNote ? `<small>${esc(t("follow.official"))}</small>` : ""}
  </div>`;
}

/** A slim floating bar on the edge of the screen, always in sight: our pages, the Play page, and the direct download of the Android app. */
function socialDockHtml() {
  if (FAB_HIDDEN.includes(S.screen) || (!SOCIAL_LINKS.length && !APP_DOWNLOAD)) return "";
  const icon = (href, name, glyph) => `<a class="dock-icon${name === "Google Play" ? " is-play" : ""}" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(name)}" title="${esc(name)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${glyph}</svg></a>`;
  const apk = APP_DOWNLOAD ? icon("/download.html", t("follow.download"), '<path d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>') : "";
  dockStartTimer(); // shown open for a few seconds when it first appears, then it folds to a small arrow
  const arrow = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `<nav class="social-dock${S._dockOpen !== false ? " open" : ""}" id="social-dock" aria-label="${esc(t("follow.us"))}">
    <div class="dock-icons">${SOCIAL_LINKS.map((l) => icon(l.url, SOCIAL_NAME[l.platform] || l.platform, SOCIAL_GLYPH[l.platform] || "")).join("")}${apk}</div>
    <button class="dock-tab" onclick="dockToggle()" aria-label="${esc(t("follow.us"))}" title="${esc(t("follow.us"))}">${arrow}</button>
  </nav>`;
}

/** The bar of our pages stays open for 5 seconds, then folds to a small arrow; the arrow opens it again (again for 5 seconds). */
let _dockTimer = null;
function dockSet(open) {
  S._dockOpen = open;
  const el = document.getElementById("social-dock");
  if (el) el.classList.toggle("open", open);
  clearTimeout(_dockTimer);
  if (open) _dockTimer = setTimeout(() => dockSet(false), 5000);
}
function dockToggle() { dockSet(!(S._dockOpen !== false)); }
function dockStartTimer() {
  if (S._dockStarted) return;
  S._dockStarted = true;
  S._dockOpen = true;
  _dockTimer = setTimeout(() => dockSet(false), 5000);
}

async function render() {
  const el = root();
  if (!el) return;
  el.classList.toggle("map-mode", S.screen === "home" && (S.homeTab === "discover" || S.homeTab === "deals"));
  document.body.classList.toggle("navigating", !!(S._route && S._route.phase === "navigating"));
  const active = document.activeElement;
  const keepFocus = active && active.id === "disc-q" ? active.selectionStart : null;
  el.innerHTML = renderScreen() + photoMenuHtml() + floatingButtonsHtml() + socialDockHtml() + landmarkClaimHtml() + landmarkSimilarHtml() + adImageAddHtml();
  wireUpAfterRender();
  placeDiscPopup();
  trDom(el); // translate the rendered Arabic when another language is on
  if (keepFocus !== null) {
    const input = document.getElementById("disc-q");
    if (input) { input.focus(); try { input.setSelectionRange(keepFocus, keepFocus); } catch (e) {} }
  }
}

function statusBadge(status) {
  const map = {
    PENDING: ["warning", "بانتظار الموافقة"],
    APPROVED: ["success", "معتمد"],
    REJECTED: ["danger", "مرفوض"],
  };
  const [cls, label] = map[status] || ["neutral", status];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

const ORDER_STATUS_LABEL = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "مؤكد",
  PREPARING: "قيد التحضير",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغى",
};
const ORDER_STATUS_CLASS = {
  PENDING: "warning",
  CONFIRMED: "info",
  PREPARING: "warning",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
};
const ORDER_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
const ORDER_ACTION_LABEL = {
  CONFIRMED: "تأكيد الطلب",
  PREPARING: "بدء التحضير",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
};

function orderBadge(status) {
  return `<span class="badge ${ORDER_STATUS_CLASS[status] || "neutral"}">${esc(ORDER_STATUS_LABEL[status] || status)}</span>`;
}

/* ---------------- icons ---------------- */

const ICON = {
  home: '<svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.8 7.8a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0l-7.8-7.8a1 1 0 0 1-.3-.7Z"/><circle cx="8" cy="8" r="1.3"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>',
  bot: '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6"/><circle cx="12" cy="3.5" r="1"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  store: '<svg viewBox="0 0 24 24"><path d="M4 9 5.5 4h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5.5 11.5V20h13v-8.5"/><path d="M10 20v-4.5h4V20"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M3 4h2l2.2 11h10.4L20 8H6.2"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M8 9h8M8 13h8"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.3"/><path d="M5 20c1.3-3.6 4-5.4 7-5.4s5.7 1.8 7 5.4"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M4 12h16" stroke-dasharray="2.5 2.5"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3.5 7 12 3l8.5 4-8.5 4-8.5-4Z"/><path d="M3.5 7v10L12 21l8.5-4V7"/><path d="M12 11v10"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15Z"/><path d="M10 21h4"/></svg>',
};

/* ---------------- screen router ---------------- */

function renderScreen() {
  if (S.busy) return spinner();
  switch (S.screen) {
    case "login": return screenLogin();
    case "register": return screenRegister();
    case "home": return screenHomeShell();
    case "merchantDetail": return screenMerchantDetail();
    case "productDetail": return screenProductDetail();
    case "orderDetail": return screenOrderDetail();
    case "merchantRegister": return screenMerchantRegister();
    case "merchantMode": return screenMerchantModeShell();
    case "shippingMethods": return screenShipping();
    case "merchantBranches": return screenBranches();
    case "storePlans": return screenStorePlans();
    case "aiPlans": return screenAiPlans();
    case "productEdit": return screenProductEdit();
    case "affiliateMine": return screenAffiliateMine();
    case "marketing": return screenMarketing();
    case "discountHistory": return screenDiscountHistory();
    case "adminReview": return screenAdminReview();
    case "wallet": return screenWallet();
    case "responder": return screenResponder();
    case "favorites": return screenFavorites();
    case "store": return screenStore();
    case "productWizard": return screenProductWizard();
    case "discounts": return screenDiscounts();
    case "discountForm": return screenDiscountForm();
    case "adBook": return screenAdBook();
    case "myAds": return screenMyAds();
    case "merchantHours": return screenMerchantHours();
    case "merchantProfile": return screenMerchantProfile();
    case "profileEdit": return screenProfileEdit();
    case "account": return screenAccount();
    case "forgot": return screenForgot();
    case "socialEmail": return screenSocialEmail();
    case "pricing": return screenPricing();
    default: return screenLogin();
  }
}

function spinner() {
  return `<div class="center-pad"><div class="spinner"></div></div>`;
}

function errorBanner() {
  return S.error ? `<div class="error-banner">${esc(S.error)}</div>` : "";
}

/* ================= AUTH ================= */

// Login/register are reachable by guests from the map, so they always offer a way back to it.
function backToMap() {
  S.homeTab = "discover";
  reset("home");
}

/* ---- Continue with Google / Facebook: the server runs the sign-in, this page only opens its link ---- */

function socialButtonsHtml() {
  if (!S._social) {
    S._social = { loaded: false, google: false, facebook: false };
    api("GET", "/auth/social/providers").then(({ ok, data }) => {
      S._social = { loaded: true, google: ok && data.google, facebook: ok && data.facebook };
      if (S._social.google || S._social.facebook) render();
    });
  }
  const p = S._social;
  const showFb = p.facebook || SOON.facebookLogin;
  if (!p.google && !showFb) return "";
  const ICONS = { google: `<svg class="social-ico" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0 -1.56 -0.14 -3.06 -0.4 -4.5H24v8.51h11.84c-0.51 2.75 -2.06 5.08 -4.39 6.64v5.52h7.11c4.16 -3.83 6.56 -9.47 6.56 -16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92 -1.97 14.56 -5.33l-7.11 -5.52c-1.97 1.32 -4.49 2.1 -7.45 2.1 -5.73 0 -10.58 -3.87 -12.31 -9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s0.25 -2.86 0.69 -4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55 0.85 6.91 2.34 9.88l7.35 -5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31 -6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73 -5.2 6.58 -9.07 12.31 -9.07z"/></svg>`, facebook: `<svg class="social-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#fff"/><path fill="#1877F2" d="M24 12.073c0 -6.627 -5.373 -12 -12 -12s-12 5.373 -12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0 -3.007 1.792 -4.669 4.533 -4.669 1.312 0 2.686 0.235 2.686 0.235v2.953H15.83c-1.491 0 -1.956 0.925 -1.956 1.874v2.25h3.328l-0.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>` };
  const link = (provider, key) => `<a class="btn outline social-btn" href="/auth/social/${provider}/start?platform=web&lang=${encodeURIComponent(LANG)}">${ICONS[provider]}<span>${esc(t(key))}</span></a>`;
  const fbSoon = `<button type="button" class="btn outline social-btn soon" onclick="toast(t('soon.facebook'))">${ICONS.facebook}<span>${esc(t("social.facebook"))}</span></button>`;
  const fb = SOON.facebookLogin ? fbSoon : p.facebook ? link("facebook", "social.facebook") : "";
  return `<div class="social-or">${esc(t("social.or"))}</div>${p.google ? link("google", "social.google") : ""}${fb}`;
}

/** Back from the provider: a one-time ticket becomes a session, or the reason it did not work is shown on the login screen. */
async function bootSocialReturn() {
  const q = new URLSearchParams(location.search);
  const ticket = q.get("ticket");
  const failure = q.get("social_error");
  const pending = q.get("social_pending");
  if (!ticket && !failure && !pending) return false;
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  if (pending) {
    // Facebook shared no email: ask for one instead of turning the person away
    S.stack = [];
    S.screen = "socialEmail";
    S.params = { pending, name: q.get("name") || "" };
    S.error = null;
    render();
    return true;
  }
  if (ticket) {
    const { ok, data } = await api("POST", "/auth/social/exchange", { ticket });
    if (ok) {
      setToken(data.token, data.user.role);
      reset("home");
      return true;
    }
  }
  S.stack = [];
  S.screen = "login";
  S.params = {};
  S.error = t("social.error." + failure) !== "social.error." + failure ? t("social.error." + failure) : t("social.failed");
  render();
  return true;
}

function screenSocialEmail() {
  return `
    ${authLogoHtml()}
    <h1 class="screen-title">أكمل تسجيلك</h1>
    <p class="screen-sub">${S.params.name ? esc(S.params.name) + "، " : ""}فيسبوك ما شاركنا إيميلك. اكتب إيميلك ورح نبعتلك رابط لتأكيده.</p>
    <div class="field"><label>الإيميل</label><input id="se-email" placeholder="name@example.com" type="email" dir="ltr" autocomplete="email" /></div>
    ${errorBanner()}
    <button class="btn" onclick="doSocialEmail()">إنشاء الحساب</button>
    <button class="link-btn" onclick="reset('login')">رجوع</button>
  `;
}

async function doSocialEmail() {
  const email = qs("se-email").value.trim();
  if (!email) { S.error = "اكتب إيميلك"; return render(); }
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/auth/social/complete", { pending: S.params.pending, email });
  S.busy = false;
  if (ok) { setToken(data.token, data.user.role); reset("home"); return; }
  const code = data && data.error && data.error.code;
  S.error = code === "EMAIL_IN_USE" ? "هذا الإيميل مسجّل عندنا. سجّل دخول بكلمة السر أول، أو استخدم إيميل غيره." : code === "BAD_STATE" ? "انتهت صلاحية الدخول. ابدأ من جديد." : errMsg(data, "تعذّر إنشاء الحساب");
  render();
}

function screenForgot() {
  const done = S.params.sent;
  return `
    ${backRow()}
    ${authLogoHtml()}
    <h1 class="screen-title">نسيت كلمة السر</h1>
    <p class="screen-sub">اكتب إيميل حسابك ورح نبعتلك رابط لتعيين كلمة سر جديدة.</p>
    ${done ? `<div class="card">${esc(done)}</div>` : `
      <div class="field"><label>الإيميل</label><input id="f-email" placeholder="name@example.com" type="email" dir="ltr" autocomplete="email" value="${esc(S.params.email || "")}" /></div>
      ${errorBanner()}
      <button class="btn" onclick="doForgot()">أرسل الرابط</button>`}
  `;
}

async function doForgot() {
  const email = qs("f-email").value.trim();
  S.params.email = email;
  if (!email) { S.error = "اكتب إيميلك"; return render(); }
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/auth/forgot-password", { email });
  S.busy = false;
  if (ok) S.params.sent = data.message || "إذا الإيميل مسجّل رح يوصلك رابط خلال دقائق.";
  else S.error = errMsg(data, "تعذّر الإرسال");
  render();
}

function screenLogin() {
  const draft = S.params.draft || {};
  return `
    <button class="back-btn" onclick="backToMap()">‹ رجوع للخريطة</button>
    ${authLogoHtml()}
    <h1 class="screen-title">تسجيل الدخول</h1>
    <p class="screen-sub">أهلًا فيك بدليلكم — دخّل بياناتك</p>
    <div class="field"><label>الإيميل</label><input id="f-email" type="email" placeholder="name@example.com" value="${esc(draft.email || "")}" /></div>
    <div class="field"><label>كلمة السر</label><input id="f-password" type="password" placeholder="••••••••" value="${esc(draft.password || "")}" /></div>
    ${errorBanner()}
    <button class="btn" onclick="doLogin()">دخول</button>
    ${socialButtonsHtml()}
    <button class="link-btn" onclick="go('forgot')">نسيت كلمة السر؟</button>
    <button class="link-btn" onclick="reset('register')">ما عندك حساب؟ سجل واحد جديد</button>
    ${followUsHtml(true)}
    ${legalLinksHtml()}
  `;
}

async function doLogin() {
  const email = qs("f-email").value.trim();
  const password = qs("f-password").value;
  S.params.draft = { email, password };
  if (!email) { S.error = "اكتب الإيميل"; return render(); }
  if (!password) { S.error = "اكتب كلمة السر"; return render(); }
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/auth/login", { email, password });
  S.busy = false;
  if (ok) {
    setToken(data.token, data.user.role);
    reset("home");
  } else {
    S.error = "الإيميل أو كلمة السر غير صحيحين، تأكد وجرّب من جديد";
    render();
  }
}

/** The full logo on the sign-in pages: the dark-lettered one on light themes, the white-lettered one on the dark theme (CSS picks). */
function authLogoHtml() {
  return `<img class="auth-logo on-light" src="${logoSrc("vertical", "color")}" alt="DALILACOM" /><img class="auth-logo on-dark" src="${logoSrc("vertical", "white")}" alt="" aria-hidden="true" />`;
}

function screenRegister() {
  const intent = S.params.intent || "CUSTOMER";
  const draft = S.params.draft || {};
  if (!S._regGeo) { S._regGeo = { countries: [], regions: [], cities: [], loading: true }; loadRegGeo(); }
  const g = S._regGeo;
  const countryOpts = g.countries.map((c) => `<option value="${esc(c.isoCode2)}" ${draft.country === c.isoCode2 ? "selected" : ""}>${esc(geoName(c))}</option>`).join("");
  const regionOpts = g.regions.map((c) => `<option value="${esc(c.id)}" ${draft.region === c.id ? "selected" : ""}>${esc(geoName(c))}</option>`).join("");
  const cityOpts = g.cities.map((c) => `<option value="${esc(c.id)}" ${draft.city === c.id ? "selected" : ""}>${esc(geoName(c))}</option>`).join("");
  const cityHint = g.regions.length && !draft.region ? "— اختر المحافظة أول —" : g.cities.length ? "— اختر المدينة —" : "— اختر الدولة أول —";
  return `
    <button class="back-btn" onclick="backToMap()">‹ رجوع للخريطة</button>
    <h1 class="screen-title">إنشاء حساب جديد</h1>
    <p class="screen-sub">${esc(t("reg.who"))}</p>
    <div class="intent-cards">
      <button class="intent-card ${intent === "MERCHANT" ? "on" : ""}" onclick="setRegisterIntent('MERCHANT')">
        <span class="ic">🏪</span><div><b>${esc(t("reg.bizTitle"))}</b><small>${esc(t("reg.bizSub"))}</small></div></button>
      <button class="intent-card ${intent === "CUSTOMER" ? "on" : ""}" onclick="setRegisterIntent('CUSTOMER')">
        <span class="ic">👤</span><div><b>${esc(t("reg.userTitle"))}</b><small>${esc(t("reg.userSub"))}</small></div></button>
    </div>
    ${intent === "MERCHANT" ? `<p class="muted" style="color:var(--primary);margin-bottom:12px">${esc(t("reg.bizNote"))}</p>` : ""}
    <div class="field"><label>الاسم الكامل</label><input id="f-name" placeholder="مثال: أحمد محمد" value="${esc(draft.name || "")}" /></div>
    <div class="field"><label>الإيميل</label><input id="f-email" type="email" placeholder="name@example.com" value="${esc(draft.email || "")}" /></div>
    <div class="field"><label>كلمة السر (8 أحرف على الأقل)</label><input id="f-password" type="password" placeholder="••••••••" value="${esc(draft.password || "")}" /></div>
    <div class="field"><label>الدولة</label><select id="f-country" onchange="regPickCountry()"><option value="">— اختر الدولة —</option>${countryOpts}</select></div>
    ${g.regions.length ? `<div class="field"><label>المحافظة</label><select id="f-region" onchange="regPickRegion()"><option value="">— اختر المحافظة —</option>${regionOpts}</select></div>` : ""}
    <div class="field"><label>المدينة</label><select id="f-city" ${g.cities.length ? "" : "disabled"}><option value="">${cityHint}</option>${cityOpts}</select></div>
    <div class="field"><label>${esc(t("ref.codeOptional"))}</label><input id="f-ref" placeholder="مثال: AB12CD" dir="ltr" autocapitalize="characters" value="${esc(draft.ref !== undefined ? draft.ref : storedJoin())}" /></div>
    ${errorBanner()}
    <button class="btn" onclick="doRegister()">إنشاء الحساب</button>
    ${socialButtonsHtml()}
    <button class="link-btn" onclick="reset('login')">عندك حساب أصلًا؟ سجل دخول</button>
    ${followUsHtml(true)}
    ${legalLinksHtml()}
  `;
}

function snapshotRegisterDraft() {
  S.params.draft = {
    name: qs("f-name") ? qs("f-name").value : (S.params.draft || {}).name,
    email: qs("f-email") ? qs("f-email").value : (S.params.draft || {}).email,
    password: qs("f-password") ? qs("f-password").value : (S.params.draft || {}).password,
    country: qs("f-country") ? qs("f-country").value : (S.params.draft || {}).country,
    region: qs("f-region") ? qs("f-region").value : (S.params.draft || {}).region,
    city: qs("f-city") ? qs("f-city").value : (S.params.draft || {}).city,
    ref: qs("f-ref") ? qs("f-ref").value : (S.params.draft || {}).ref,
  };
}

/** The lists on the sign-up page: country, then its governorates, then the cities of the chosen governorate (Syria is chosen first when it is there). */
async function loadRegGeo() {
  const { ok, data } = await api("GET", "/geo/countries");
  const g = S._regGeo;
  g.loading = false;
  g.countries = ok ? data : [];
  const draft = S.params.draft || (S.params.draft = {});
  if (!draft.country) { const sy = g.countries.find((c) => c.isoCode2 === "SY"); if (sy) draft.country = "SY"; }
  await loadRegRegions(draft.country);
  if (S.screen === "register") snapshotRegisterDraft(); // keep what the person already typed while the lists were loading
  render();
}

async function loadRegRegions(isoCode) {
  const g = S._regGeo;
  g.regions = [];
  g.cities = [];
  const country = g.countries.find((c) => c.isoCode2 === isoCode);
  if (!country) return;
  const regions = await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "REGION" }));
  if (regions.ok && regions.data.length) { g.regions = regions.data; return; }
  // a country with no governorates in our list: its cities come straight under it
  const cities = await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "CITY" }));
  if (cities.ok) g.cities = cities.data;
}

async function loadRegCities(regionId) {
  const g = S._regGeo;
  g.cities = [];
  if (!regionId) return;
  const { ok, data } = await api("GET", "/geo/units?" + new URLSearchParams({ parentId: regionId, level: "CITY" }));
  if (ok) g.cities = data;
}

async function regPickCountry() {
  snapshotRegisterDraft();
  S.params.draft.region = "";
  S.params.draft.city = "";
  await loadRegRegions(S.params.draft.country);
  render();
}

async function regPickRegion() {
  snapshotRegisterDraft();
  S.params.draft.city = "";
  await loadRegCities(S.params.draft.region);
  render();
}

function setRegisterIntent(intent) {
  snapshotRegisterDraft();
  S.params.intent = intent;
  render();
}

async function doRegister() {
  snapshotRegisterDraft();
  const fullName = qs("f-name").value.trim();
  const email = qs("f-email").value.trim();
  const password = qs("f-password").value;
  if (!fullName) { S.error = "اكتب اسمك"; return render(); }
  if (!email) { S.error = "اكتب الإيميل"; return render(); }
  if (password.length < 8) { S.error = "كلمة السر لازم تكون 8 أحرف أو أكثر"; return render(); }
  S.busy = true; S.error = null; render();
  const body = { email, password, fullName };
  const d = S.params.draft || {};
  if (d.country) body.countryCode = d.country;
  if (d.city) body.cityId = d.city;
  if (d.ref && d.ref.trim()) body.referralCode = d.ref.trim();
  const { ok, data } = await api("POST", "/auth/register", body);
  S.busy = false;
  if (ok) {
    forgetJoin();
    setToken(data.token, data.user.role);
    const wantsMerchant = S.params.intent === "MERCHANT";
    reset("home");
    if (wantsMerchant) go("merchantRegister");
  } else {
    S.error = errMsg(data, "تعذّر إنشاء الحساب");
    render();
  }
}

async function deleteMyAccount() {
  if (!confirm(t("profile.deleteConfirm"))) return;
  const password = prompt(t("profile.deletePassword"));
  if (password === null) return;
  const { ok, data } = await api("DELETE", "/profile/me", { confirm: true, password: password || undefined });
  if (!ok) return toast(errMsg(data, t("profile.deleteFailed")));
  clearToken();
  S.homeTab = "discover";
  reset("home");
  toast(t("profile.deleted"));
}

function doLogout() {
  api("POST", "/auth/logout");
  clearToken();
  S._mstat = null; S._ship = null; S._shipPick = {};
  S.homeTab = "discover";
  reset("home");
}

/* ================= HOME SHELL ================= */

const HOME_TABS = [
  { id: "discover", label: "tab.map", icon: "search" },
  { id: "store", label: "tab.store", icon: "store" },
  { id: "deals", label: "tab.deals", icon: "tag" },
  { id: "responder", label: "tab.responder", icon: "bot", hero: true },
  { id: "cart", label: "tab.cart", icon: "cart" },
  { id: "orders", label: "tab.orders", icon: "orders" },
  { id: "profile", label: "tab.account", icon: "user" },
];

function screenHomeShell() {
  const needsAccount = ["card", "cart", "orders", "profile"].includes(S.homeTab) && !S.token;
  const body = needsAccount ? guestPrompt(S.homeTab) : {
    card: tabCard,
    deals: tabDeals,
    discover: tabDiscover,
    cart: tabCart,
    orders: tabOrders,
    profile: tabProfile,
  }[S.homeTab]();
  return `
    <div>${body}</div>
    <div class="tabbar" id="home-tabbar">
      ${HOME_TABS.map((tab) => `
        <button class="${S.homeTab === tab.id ? "active" : ""} ${tab.hero ? "hero" : ""}" onclick="setHomeTab('${tab.id}')">
          ${ICON[tab.icon]}<span>${esc(t(tab.label))}</span>
        </button>`).join("")}
    </div>
  `;
}

/* ---- Card tab ---- */

function tabCard() {
  if (!S._card) S._card = { loading: true };
  loadCardIfNeeded();
  const c = S._card;
  if (c.loading) return spinner();
  if (!c.memberNumber) {
    const group = ((c.catalog && c.catalog.services) || []).find((g) => g.service === "MEMBERSHIP");
    return `
      <h1 class="screen-title">بطاقتي</h1>
      ${serviceIntroHtml(group ? group.plans : [], c.catalog ? c.catalog.creditName : "", "card", "subscribePlan")}
      ${errorBanner()}
    `;
  }
  const left = c.endDate ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) : null;
  const renewBtn = `<button class="btn small" onclick="openRenew()">${esc(t("card.renew"))}</button>`;
  const statusCard = c.status === "EXPIRED"
    ? `<div class="card"><strong>${esc(t("card.expired"))}</strong><div style="height:8px"></div>${renewBtn}</div>`
    : left !== null && (c.isTrial || left <= 7)
      ? `<div class="card"><strong>${esc(t(c.isTrial ? "card.trialLeft" : "card.endsSoon", { n: Math.max(left, 0) }))}</strong>${left <= 7 ? `<div style="height:8px"></div>${renewBtn}` : ""}</div>`
      : "";
  return `
    <button class="btn small outline" style="width:auto;margin-bottom:8px" onclick="setHomeTab('deals')">‹ ${esc(t("deals.back"))}</button>
    <h1 class="screen-title">بطاقتي</h1>
    ${statusCard}
    <div class="member-card">
      <div class="label">DALILACOM MEMBER</div>
      <div class="label" style="margin-top:10px">Member ID</div>
      <div class="member-number">${esc(c.memberNumber)}</div>
      <div class="label">Valid Until</div>
      <div style="font-size:13px;margin-top:2px">${esc((c.validUntil || "").slice(0, 10))}</div>
    </div>
    <div class="qr-wrap"><div id="qr-canvas"></div></div>
    <div class="otp-code">${fullCodeText(c.memberNumber, c.code)}</div>
    <div class="countdown">بيتجدد خلال ${c.secondsRemaining ?? 0} ثانية</div>
    ${errorBanner()}
  `;
}

async function loadCardIfNeeded() {
  if (S._cardLoaded === S.homeTab && S._card && !S._card.forceReload) return;
  S._cardLoaded = S.homeTab;
  S._card = { loading: true };
  const me = await api("GET", "/membership/me");
  if (!me.ok) {
    const catalog = await api("GET", "/plans/catalog");
    S._card = { loading: false, catalog: catalog.ok ? catalog.data : null };
    render();
    return;
  }
  S._card = { loading: false, memberNumber: me.data.memberNumber, validUntil: me.data.endDate, endDate: me.data.endDate, status: me.data.status, isTrial: !!me.data.isTrial };
  render();
  startQrLoop();
}

async function subscribePlan(planId) {
  if (!S.token) return go("login");
  S.busy = true; render();
  const { ok, data } = await api("POST", "/membership/subscribe", { planId });
  S.busy = false;
  if (ok) {
    S._card = { loading: true };
    S._cardLoaded = null;
    render();
    loadCardIfNeeded();
  } else {
    S.error = errMsg(data, "تعذّر الاشتراك بالعضوية");
    render();
  }
}

async function startQrLoop() {
  stopQrLoop();
  async function tick() {
    const { ok, data } = await api("GET", "/qr/mine");
    if (!ok) return;
    S._card.code = data.code;
    S._card.secondsRemaining = data.expiresInSeconds;
    renderQrOnly();
    let remaining = data.expiresInSeconds;
    S.qrTick = setInterval(() => {
      remaining -= 1;
      S._card.secondsRemaining = remaining;
      const el = document.querySelector(".countdown");
      if (el) el.textContent = tr(`بيتجدد خلال ${remaining} ثانية`);
      if (remaining <= 0) clearInterval(S.qrTick);
    }, 1000);
    S.qrTimer = setTimeout(tick, data.expiresInSeconds * 1000);
  }
  tick();
}

/** The code a cashier can type in one field: the member number's digits, then the 6-digit code that changes every 45 seconds ("5276 4426 0196 3873"). */
function fullCodeText(memberNumber, code) {
  const digits = String(memberNumber || "").replace(/\D/g, "") + String(code || "");
  return digits ? digits.replace(/(.{4})/g, "$1 ").trim() : "------";
}

/** The other way round: whatever the cashier typed (with spaces, dashes or the DLK- prefix) becomes the member number and the code. */
function parseFullCode(text) {
  const digits = latinDigits(String(text || "")).replace(/\D/g, "");
  if (digits.length < 7) return null;
  return { memberNumber: "DLK-" + digits.slice(0, -6), code: digits.slice(-6) };
}

function renderQrOnly() {
  const codeEl = document.querySelector(".otp-code");
  if (codeEl) codeEl.textContent = fullCodeText(S._card.memberNumber, S._card.code);
  const qrEl = qs("qr-canvas");
  if (qrEl && window.QRCode) {
    qrEl.innerHTML = "";
    new QRCode(qrEl, { text: `${S._card.memberNumber}:${S._card.code}`, width: 160, height: 160, colorDark: "#1c1413", colorLight: "#ffffff" });
  }
}

/* ---- Discover tab (map-first, usable without an account) ---- */

const DAMASCUS = { lat: 33.5138, lng: 36.2765 }; // only the starting view when nothing else is known
// Day names follow the current language (read at use time, so switching language updates every screen).
const DAY_LABEL = new Proxy({}, { get: (_, key) => (typeof key === "string" ? t("day." + key) : undefined) });
const DAY_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

function fmtClock(time) {
  const h = Number(time.slice(0, 2));
  return `${h % 12 || 12}:${time.slice(3, 5)} ${h >= 12 ? t("time.pm") : t("time.am")}`;
}

function openBadge(st) {
  if (!st || !st.hasHours) return "";
  if (st.isOpen) return `<span class="badge success">${esc(st.alwaysOpen ? t("hours.alwaysOpen") : t("hours.openUntil", { time: fmtClock(st.closesAt) }))}</span>`;
  const day = st.opensDay === "today" ? t("hours.today") : st.opensDay === "tomorrow" ? t("hours.tomorrow") : DAY_LABEL[st.opensDay] || "";
  return st.opensAt ? `<span class="badge danger">${esc(t("hours.opensAt", { day, time: fmtClock(st.opensAt) }))}</span>` : `<span class="badge danger">${esc(t("hours.closed"))}</span>`;
}

function readRecent() {
  try { return JSON.parse(localStorage.getItem("dlk_recent") || "[]"); } catch (e) { return []; }
}
function pushRecent(q) {
  q = (q || "").trim();
  if (!q) return;
  try { localStorage.setItem("dlk_recent", JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6))); } catch (e) {}
}

function discoverState() {
  if (!S._discover) {
    S._discover = {
      loading: true, query: "", categoryId: "", categories: [], merchants: [],
      openNow: false, discountsOnly: false, radiusKm: null,
      userLoc: null, locError: null, locAsked: false,
      favIds: [], suggest: null, showSuggest: false, areaDirty: false, bounds: null, browse: null,
    };
    loadCategories().then(() => searchMerchants());
    loadFavIds();
  }
  return S._discover;
}

// Filters, distance and ordering are applied client-side so toggling a chip never refetches.
function visibleMerchants(d) {
  let list = d.merchants.map((m) =>
    d.userLoc && m.latitude != null && m.longitude != null
      ? { ...m, distanceKm: haversineKm(d.userLoc.lat, d.userLoc.lng, m.latitude, m.longitude) }
      : m);
  if (d.openNow) list = list.filter((m) => m.openStatus && m.openStatus.isOpen);
  if (d.discountsOnly) list = list.filter((m) => (m.discounts || []).length > 0);
  if (d.radiusKm && d.userLoc) list = list.filter((m) => m.distanceKm != null && m.distanceKm <= d.radiusKm);
  return list.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.businessName.localeCompare(b.businessName));
}

function sheetHeights() {
  const H = (root() && root().clientHeight) || 640;
  // the thin strip sits just above the bottom tab bar (which covers the lowest part of the sheet)
  const map = document.getElementById("mapfull");
  const bar = document.querySelector(".tabbar");
  // (on a wide screen the tab bar is a rail at the side and covers nothing of the sheet)
  const barTop = bar ? bar.getBoundingClientRect().top : 0;
  const covered = map && bar && barTop > window.innerHeight / 2 ? Math.max(0, map.getBoundingClientRect().bottom - barTop) : bar ? 0 : 77;
  return { min: Math.round(covered) + 58, peek: 232, half: Math.round(H * 0.55), full: Math.max(320, H - 150) };
}

/* ---- Deals tab: the discount map ---- */

function dealsIntroHidden() {
  try { return localStorage.getItem("dalilacom.dealsIntro") === "hidden"; } catch (e) { return false; }
}
function dismissDealsIntro() { S._dealsIntro = false; render(); }
function hideDealsIntroForever() {
  try { localStorage.setItem("dalilacom.dealsIntro", "hidden"); } catch (e) {}
  dismissDealsIntro();
}

/** The card with our pages (social icons), the app download and the essential pages: opened by the "Follow us" chip on the map, so a visitor with no account sees them. */
function openLinks() { S._linksOpen = true; render(); }
function closeLinks() { S._linksOpen = false; render(); }
function linksModalHtml() {
  if (!S._linksOpen) return "";
  return `<div class="deals-intro" onclick="closeLinks()">
    <div class="deals-box" onclick="event.stopPropagation()">
      ${followUsHtml(true)}
      ${legalLinksHtml()}
      <button class="btn" onclick="closeLinks()">${esc(t("follow.close"))}</button>
    </div>
  </div>`;
}

function dealsIntroHtml() {
  if (!S._dealsIntro) return "";
  return `
    <div class="deals-intro" onclick="dismissDealsIntro()">
      <div class="deals-box" onclick="event.stopPropagation()">
        <div class="deals-emoji">🎁</div>
        <h2>${esc(t("deals.introTitle"))}</h2>
        <p>${esc(t("deals.introText"))}</p>
        <button class="btn" onclick="dismissDealsIntro()">${esc(t("deals.ok"))}</button>
        <button class="deals-never" onclick="hideDealsIntroForever()">${esc(t("deals.never"))}</button>
      </div>
    </div>`;
}

function tabDeals() {
  return dealsIntroHtml() + tabDiscover();
}

function tabDiscover() {
  const d = discoverState();
  const deals = S.homeTab === "deals";
  if (deals) d.discountsOnly = true;
  if (!d.locAsked) { d.locAsked = true; requestDiscoverLocation(); } // ask for the position as soon as the map opens
  const list = visibleMerchants(d);
  if (d.selectedId) list.sort((x, y) => (y.id === d.selectedId) - (x.id === d.selectedId));
  S._visible = list; // the pins on the map: all of them
  // the list below shows only the shop whose pin was touched (the pins stay), until the person asks for all of them again
  const picked = d.selectedId ? list.filter((m) => m.id === d.selectedId) : [];
  const sheetList = picked.length ? picked : list;
  if (d.selectedId && !picked.length) d.selectedId = null; // the touched shop is not among the results anymore
  const sheetPx = sheetHeights()[S._sheet || "peek"];
  return `
    ${linksModalHtml()}
    ${landmarkModalHtml()}
    <div class="mapfull ${S._sheet === "min" ? "sheet-min" : ""} ${S._route ? "routing" : ""} ${S._route && S._route.phase === "navigating" ? "navigating" : ""}" id="mapfull" style="--sheet-h:${sheetPx}px">
      <div id="discover-map-slot"></div>

      <div class="map-top">
        ${routeBarHtml()}
        <div class="map-search">
          <div class="searchbox">
            <span class="search-ico">🔍</span>
            <input id="disc-q" placeholder="${esc(t("search.placeholder"))}" value="${esc(d.query)}" autocomplete="off"
              oninput="onDiscoverQuery(this.value)" onfocus="onDiscoverFocus()" onblur="onDiscoverBlur()" onkeydown="if(event.key==='Enter'){onDiscoverSubmit()}" />
            ${d.query ? `<button class="clear-x" onmousedown="onDiscoverClear()">✕</button>` : ""}
            ${S.token ? "" : `<button class="login-pill" onclick="go('login')">${esc(t("login.pill"))}</button>`}
          </div>
          ${suggestHtml(d)}
        </div>
        <div class="float-chips">
          <button class="chip chip-links" onclick="openLinks()">🔗 ${esc(t("follow.us"))}</button>
          <button class="chip ${LM.on ? "active" : ""}" onclick="lmToggle()">🕌 ${esc(t("lm.chip"))}</button>
          <button class="chip ${!d.categoryId && !d.openNow && (deals || !d.discountsOnly) ? "active" : ""}" onclick="onDiscoverReset()">${esc(t("filter.all"))}</button>
          <button class="chip ${d.openNow ? "active" : ""}" onclick="toggleDiscoverFlag('openNow')">${esc(t("filter.openNow"))}</button>
          ${deals ? "" : `<button class="chip ${d.discountsOnly ? "active" : ""}" onclick="toggleDiscoverFlag('discountsOnly')">${esc(t("filter.discounts"))}</button>`}
          ${categoryChipsHtml(d)}
        </div>
        ${d.locError ? `<div class="float-note">📍 ${esc(d.locError)} <button class="chip" style="margin-top:6px" onclick="requestDiscoverLocation(true)">${esc(t("loc.retry"))}</button></div>` : ""}
      </div>

      <button id="area-btn" class="area-btn" style="display:${d.areaDirty ? "block" : "none"}" onclick="searchThisArea()">${esc(t("area.search"))}</button>
      <button class="map-fab" title="${esc(t("fab.myLocation"))}" onclick="requestDiscoverLocation(true)">📍</button>
      ${mapFabsHtml()}

      ${navBottomHtml()}
      <div class="sheet ${S._sheet === "min" ? "is-min" : ""}" id="sheet">
        <div class="sheet-handle" onpointerdown="sheetDragStart(event)" onclick="sheetToggle()"><span></span></div>
        <div class="sheet-head" onpointerdown="sheetDragStart(event)" onclick="sheetHeadTap(event)">
          <strong class="t-full">${esc(deals ? t("deals.sheetTitle") : d.userLoc ? t("sheet.nearby") : t("sheet.directory"))}</strong>
          <strong class="t-min">${esc(t("sheet.directory"))}</strong>
          <span class="badge info sheet-count">${esc(t("sheet.count", { n: sheetList.length }))}</span>
          <button class="sheet-collapse" onclick="sheetCollapse(event)" aria-label="${esc(t("sheet.collapse"))}" title="${esc(t("sheet.collapse"))}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
        ${(d.userLoc || d.bounds || deals) ? `<div class="sheet-chips">
          ${d.bounds ? `<button class="chip active" onclick="clearSearchArea()">${esc(t("area.clear"))}</button>` : ""}
          ${deals && !d.userLoc ? `<button class="chip" onclick="requestDiscoverLocation(true)">📍 ${esc(t("deals.locate"))}</button>` : ""}
          ${d.userLoc ? (deals ? [null, 1, 3, 5, 10, 25] : [null, 2, 5, 10, 25]).map((r) => `<button class="chip ${d.radiusKm === r ? "active" : ""}" onclick="setDiscoverRadius(${r})">${esc(r ? t("radius.km", { n: r }) : t("radius.any"))}</button>`).join("") : ""}
        </div>` : ""}
        <div class="sheet-list">
          ${picked.length ? `<button class="show-all" onclick="clearSelectedMerchant()">↩ ${esc(t("sheet.showAll", { n: list.length }))}</button>` : ""}
          ${d.loading ? spinner() : (sheetList.length ? sheetList.map(merchantRowHtml).join("") : `<div class="empty-state">${esc(d.radiusKm ? t("sheet.emptyRadius", { n: d.radiusKm }) : deals ? t("deals.empty") : t("sheet.empty"))}</div>`)}
        </div>
      </div>
      ${browseHtml(d)}
    </div>
  `;
}

// The sheet follows the finger and snaps to peek / half / full.
function sheetDragStart(e) {
  if (window.innerWidth >= 900) return; // the wide screens have a side panel, no line to pull
  const box = document.getElementById("mapfull");
  const sheet = document.getElementById("sheet");
  if (!box || !sheet) return;
  const heights = sheetHeights();
  const startY = e.clientY;
  const startH = sheet.getBoundingClientRect().height;
  let moved = false;
  sheet.classList.add("dragging");
  const move = (ev) => {
    const dy = ev.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    box.style.setProperty("--sheet-h", Math.min(heights.full, Math.max(heights.min, startH - dy)) + "px");
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    sheet.classList.remove("dragging");
    if (!moved) return;
    const h = parseFloat(box.style.getPropertyValue("--sheet-h"));
    S._sheet = Object.entries(heights).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
    box.style.setProperty("--sheet-h", heights[S._sheet] + "px");
    sheet.classList.toggle("is-min", S._sheet === "min");
    S._sheetMoved = true;
    setTimeout(() => { S._sheetMoved = false; }, 60);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** A tap on the title bar opens the list again when it is pulled down to the strip (a pull on it moves the sheet like the line above it). */
function sheetHeadTap(e) {
  if (S._sheetMoved || e.target.closest(".sheet-collapse")) return;
  if (S._sheet === "min") { S._sheet = "peek"; applySheetHeight(); }
}

function sheetToggle() {
  if (S._sheetMoved) return;
  const order = ["min", "peek", "half", "full"];
  S._sheet = order[(order.indexOf(S._sheet || "peek") + 1) % 4];
  applySheetHeight();
}

function applySheetHeight() {
  const box = document.getElementById("mapfull");
  if (box) box.style.setProperty("--sheet-h", sheetHeights()[S._sheet || "peek"] + "px");
  const sheet = document.getElementById("sheet");
  if (sheet) sheet.classList.toggle("is-min", S._sheet === "min");
  if (box) box.classList.toggle("sheet-min", S._sheet === "min");
  setTimeout(() => { if (S._map) S._map.invalidateSize(); }, 320);
}

/** The arrow in the title row: down to the thin strip (only "Places directory" stays), and up again from there. */
function sheetCollapse(e) {
  if (e) e.stopPropagation();
  S._sheet = S._sheet === "min" ? "peek" : "min";
  applySheetHeight();
}

// Tapping a pin brings that place to the top of the sheet.
function clearSelectedMerchant() {
  if (!S._discover || !S._discover.selectedId) return;
  S._discover.selectedId = null;
  S._mapKey = "";
  render();
  const list = document.querySelector(".sheet-list");
  if (list) list.scrollTop = 0;
}

function selectMerchant(id) {
  if (S._discover.selectedId === id) return clearSelectedMerchant(); // touching the same pin again brings the whole list back
  S._discover.selectedId = id;
  if (S._sheet === "full") S._sheet = "half";
  render();
  const list = document.querySelector(".sheet-list");
  if (list) list.scrollTop = 0;
}

function suggestHtml(d) {
  if (!d.showSuggest) return "";
  if (!d.query.trim()) {
    const recent = readRecent();
    if (!recent.length) return "";
    return `<div class="suggest-box"><div class="suggest-head">${esc(t("search.recent"))}</div>${recent.map((q) => `<div class="suggest-item" onmousedown="pickRecent('${esc(q).replace(/'/g, "&#39;")}')">🕘 ${esc(q)}</div>`).join("")}</div>`;
  }
  const s = d.suggest;
  if (!s || (!s.merchants.length && !s.categories.length)) return "";
  return `<div class="suggest-box">
    ${s.categories.map((c) => `<div class="suggest-item" onmousedown="pickCategory('${c.id}')">${esc(c.icon || "🗂️")} ${esc(c.path || c.name)}${c.merchantCount ? ` <span class="muted">· ${esc(t("browse.count", { n: c.merchantCount }))}</span>` : ""}</div>`).join("")}
    ${s.merchants.map((m) => `<div class="suggest-item" onmousedown="go('merchantDetail',{merchantId:'${m.id}'})">🏪 ${esc(m.businessName)}${m.category ? ` <span class="muted">· ${esc(catName(m.category))}</span>` : ""}</div>`).join("")}
  </div>`;
}

let suggestTimer = null;
function onDiscoverQuery(v) {
  const d = S._discover;
  d.query = v;
  d.showSuggest = true;
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    if (!d.query.trim()) { d.suggest = null; return searchMerchants(); }
    const { ok, data } = await api("GET", "/merchant/suggest?lang=" + LANG + "&q=" + encodeURIComponent(d.query.trim()));
    d.suggest = ok ? data : null;
    searchMerchants();
  }, 280);
}
function onDiscoverFocus() { S._discover.showSuggest = true; render(); }
function onDiscoverBlur() { setTimeout(() => { if (S._discover && S._discover.showSuggest) { S._discover.showSuggest = false; render(); } }, 200); }
function onDiscoverSubmit() { pushRecent(S._discover.query); S._discover.showSuggest = false; render(); }
function onDiscoverClear() { S._discover.query = ""; S._discover.suggest = null; searchMerchants(); }
function pickRecent(q) { S._discover.query = q; S._discover.showSuggest = false; pushRecent(q); searchMerchants(); }
function pickCategory(id) { S._discover.query = ""; S._discover.categoryId = id; S._discover.showSuggest = false; searchMerchants(); }
function onDiscoverReset() { Object.assign(S._discover, { categoryId: "", openNow: false, discountsOnly: S.homeTab === "deals" }); searchMerchants(); }
function toggleDiscoverFlag(flag) { S._discover[flag] = !S._discover[flag]; render(); }
function setDiscoverRadius(km) { S._discover.radiusKm = km; S._radiusFit = true; render(); }
function onDiscoverCategory(id) { S._discover.categoryId = S._discover.categoryId === id ? "" : id; searchMerchants(); }

/* The person's own opt-in to let nearby shops reach them: the page tells the server roughly where they are only while it is on. */
function shareLocationOn() {
  try { return localStorage.getItem("dlk_share_loc") === "1"; } catch (e) { return false; }
}

function reportLocation(loc) {
  if (S.token && shareLocationOn()) api("PUT", "/profile/location", { latitude: loc.lat, longitude: loc.lng });
}

async function setShareLocation(on) {
  try { localStorage.setItem("dlk_share_loc", on ? "1" : "0"); } catch (e) {}
  if (on) { if (S._discover && S._discover.userLoc) reportLocation(S._discover.userLoc); }
  else await api("DELETE", "/profile/location");
  render();
}

function requestDiscoverLocation(recenter) {
  const d = discoverState();
  if (!navigator.geolocation) { d.locError = t("loc.unsupported"); return render(); }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      d.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      d.locError = null;
      reportLocation(d.userLoc);
      if (recenter) S._centeredUser = false;
      render();
    },
    (err) => {
      d.locError = locErrorText(err && err.code);
      render();
    },
    // not high accuracy: on an iPhone that can wait a long time indoors and then fail; a minute-old fix is fine here
    { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
  );
}

// Why the position could not be had, with what to do about it on this device.
function locErrorText(code) {
  const ua = navigator.userAgent || "";
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok/i.test(ua)) return t("loc.inapp");
  if (code === 1) return /iPhone|iPad|iPod/i.test(ua) ? t("loc.deniedIos") : t("loc.denied");
  return t("loc.unavailable");
}

async function searchMerchants() {
  const d = S._discover;
  d.loading = true; render();
  const params = new URLSearchParams();
  if (d.query) params.set("q", d.query);
  if (d.categoryId) params.set("categoryId", d.categoryId);
  if (d.bounds) Object.entries(d.bounds).forEach(([k, v]) => params.set(k, v));
  const { ok, data } = await api("GET", "/merchant?" + params.toString());
  d.loading = false;
  d.areaDirty = false;
  d.merchants = ok ? data : [];
  S._mapKey = "";
  render();
}

// "Search this area": reload with the rectangle the map is currently showing.
function searchThisArea() {
  if (!S._map) return;
  const b = S._map.getBounds();
  S._discover.bounds = { minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() };
  searchMerchants();
}
function clearSearchArea() { S._discover.bounds = null; searchMerchants(); }

/* ---- the map itself: one Leaflet instance, kept alive across re-renders ---- */

function moveMap(fn) {
  S._ignoreMoveUntil = Date.now() + 700;
  fn();
}

/* ---- public places on the map: mosques, hospitals, parks, main streets (they belong to nobody's account) ---- */

const LM = { on: true, items: [], timer: null, drawn: "" };
try { if (localStorage.getItem("dlk_landmarks") === "off") LM.on = false; } catch (e) {}
// how close the map must be before a kind is drawn (mosques are many, so they wait for a closer view)
function lmMinZoom(slug) { return slug === "mosque" ? 14 : slug === "main_street" || slug === "hospital" || slug === "park" ? 12 : 13; }

function lmSchedule() {
  clearTimeout(LM.timer);
  LM.timer = setTimeout(lmFetch, 350);
}

async function lmFetch() {
  const map = S._map;
  if (!map || !S._lmLayer) return;
  if (!LM.on || map.getZoom() < 12) { LM.items = []; lmDraw(); return; }
  const b = map.getBounds();
  const params = new URLSearchParams({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast(), limit: 300 });
  const { ok, data } = await api("GET", "/landmarks?" + params.toString());
  LM.items = ok && data.items ? data.items : [];
  lmDraw();
}

function lmDraw() {
  const map = S._map;
  if (!map || !S._lmLayer) return;
  S._lmLayer.clearLayers();
  if (!LM.on) return;
  const z = map.getZoom();
  LM.items.forEach((p) => {
    if (z < lmMinZoom(p.kind.slug)) return;
    if (p.kind.geometry === "LINE" && Array.isArray(p.path)) {
      p.path.forEach((seg) => L.polyline(seg, { color: p.kind.color, weight: 5, opacity: 0.8 }).on("click", () => lmOpen(p.id)).addTo(S._lmLayer));
      if (z >= 14) {
        L.marker([p.latitude, p.longitude], { icon: L.divIcon({ className: "", html: `<span class="lm-street-label" style="border-color:${esc(p.kind.color)};color:${esc(p.kind.color)}">${esc(p.name)}</span>`, iconSize: [0, 0] }), zIndexOffset: -500 }).on("click", () => lmOpen(p.id)).addTo(S._lmLayer);
      }
      return;
    }
    const icon = L.divIcon({ className: "", html: `<div class="lm-pin" style="background:${esc(p.kind.color)}" title="${esc(p.name)}">${esc(p.kind.icon)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    L.marker([p.latitude, p.longitude], { icon, zIndexOffset: -500 }).on("click", () => lmOpen(p.id)).addTo(S._lmLayer);
  });
}

function lmToggle() {
  LM.on = !LM.on;
  try { localStorage.setItem("dlk_landmarks", LM.on ? "on" : "off"); } catch (e) {}
  render();
  if (LM.on) lmFetch(); else lmDraw();
}

function lmOpen(id) { S._lmOpen = LM.items.find((x) => x.id === id) || null; render(); }
function lmClose() { S._lmOpen = null; render(); }
function lmDirections(id) { const p = LM.items.find((x) => x.id === id); S._lmOpen = null; if (p) startRoute(p.id, "driving"); }

/* ---- claiming a public place: "this place is mine" ---- */

function shrinkJpeg(file, maxSide) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.85);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function lmClaimOpen(id) {
  const place = (LM.items.find((x) => x.id === id)) || (S._lmOpen && S._lmOpen.id === id ? S._lmOpen : null) || (S._lmSimilarPlace && S._lmSimilarPlace.id === id ? S._lmSimilarPlace : null);
  if (!place) return;
  if (!S.token) { S._lmOpen = null; S._lmSimilar = null; toast(t("lm.signIn")); go("login"); return; }
  S._lmOpen = null; S._lmSimilar = null;
  S._lmClaim = { place, claim: null, busy: false, error: "", loading: true };
  render();
  const { ok, data } = await api("GET", "/landmarks/" + id + "/my-claim");
  S._lmClaim.loading = false;
  S._lmClaim.claim = ok ? data.claim : null;
  render();
}
function lmClaimClose() { S._lmClaim = null; render(); }

async function lmClaimSubmit() {
  const c = S._lmClaim;
  if (!c || c.busy) return;
  const phone = qs("lmc-phone").value.trim();
  const files = [...(qs("lmc-files").files || [])].slice(0, 5);
  if (phone.length < 6) { c.error = t("lm.needPhone"); return render(); }
  if (!files.length) { c.error = t("lm.needPhoto"); return render(); }
  c.busy = true; c.error = ""; render();
  const made = await api("POST", "/landmarks/" + c.place.id + "/claims", { role: qs("lmc-role").value, phone, note: qs("lmc-note").value.trim() || null });
  if (!made.ok) { c.busy = false; c.error = errMsg(made.data, t("lm.failed")); return render(); }
  c.error = await lmUploadProof(made.data.id, files);
  c.busy = false;
  c.claim = { id: made.data.id, status: "PENDING" };
  render();
}

/** The photos go one by one (shrunk first); returns an error text, or "" when all went. */
async function lmUploadProof(claimId, files) {
  for (const f of files) {
    try {
      const blob = await shrinkJpeg(f, 1800);
      const res = await fetch(API_BASE + "/landmarks/claims/" + claimId + "/files?name=" + encodeURIComponent(f.name || "proof.jpg"), { method: "PUT", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + S.token }, body: blob });
      if (!res.ok) return errMsg(await res.json().catch(() => ({})), t("lm.photoFailed"));
    } catch (e) { return t("lm.photoFailed"); }
  }
  return "";
}

async function lmClaimWithdraw() {
  const c = S._lmClaim;
  if (!c || !c.claim) return;
  const { ok, data } = await api("POST", "/landmarks/claims/" + c.claim.id + "/withdraw");
  if (!ok) { c.error = errMsg(data, t("lm.failed")); return render(); }
  c.claim = null; render();
}

async function lmClaimResend() {
  const c = S._lmClaim;
  if (!c || !c.claim || c.busy) return;
  const files = [...(qs("lmc-files").files || [])].slice(0, 5);
  c.busy = true; c.error = ""; render();
  if (files.length) c.error = await lmUploadProof(c.claim.id, files);
  if (!c.error) {
    const { ok, data } = await api("POST", "/landmarks/claims/" + c.claim.id + "/resubmit", { note: (qs("lmc-note") && qs("lmc-note").value.trim()) || null });
    if (ok) c.claim = { ...c.claim, status: "PENDING" }; else c.error = errMsg(data, t("lm.failed"));
  }
  c.busy = false; render();
}

function landmarkClaimHtml() {
  const c = S._lmClaim;
  if (!c) return "";
  const p = c.place, cl = c.claim;
  let body;
  if (c.loading) body = spinner();
  else if (cl && cl.status === "PENDING") body = `<p>⏳ ${esc(t("lm.pending"))}</p><button class="btn ghost" onclick="lmClaimWithdraw()">${esc(t("lm.withdraw"))}</button>`;
  else if (cl && cl.status === "APPROVED") body = `<p>✅ ${esc(t("lm.approved"))}</p>`;
  else if (cl && cl.status === "NEEDS_INFO") body = `<p>❓ ${esc(t("lm.needsInfo"))}</p><p><b>${esc(cl.message || "")}</b></p>
      <div class="field"><label>${esc(t("lm.addPhotos"))}</label><input id="lmc-files" type="file" accept="image/*" multiple></div>
      <div class="field"><label>${esc(t("lm.note"))}</label><textarea id="lmc-note" rows="2" maxlength="600"></textarea></div>
      <button class="btn" ${c.busy ? "disabled" : ""} onclick="lmClaimResend()">${esc(t("lm.resend"))}</button>`;
  else body = `${cl && cl.status === "REJECTED" ? `<p class="error-banner">${esc(t("lm.rejected"))} ${esc(cl.message || "")}</p>` : ""}
      <p class="muted">${esc(t("lm.claimIntro"))}</p>
      <div class="field"><label>${esc(t("lm.role"))}</label><select id="lmc-role"><option value="MANAGER">${esc(t("lm.roleManager"))}</option><option value="OWNER">${esc(t("lm.roleOwner"))}</option><option value="AUTHORIZED">${esc(t("lm.roleAuthorized"))}</option></select></div>
      <div class="field"><label>${esc(t("lm.phone"))}</label><input id="lmc-phone" dir="ltr" inputmode="tel" placeholder="+963 9xx xxx xxx"></div>
      <div class="field"><label>${esc(t("lm.note"))}</label><textarea id="lmc-note" rows="2" maxlength="600" placeholder="مثال: أنا مدير المشفى منذ 2020"></textarea></div>
      <div class="field"><label>${esc(t("lm.photos"))}</label><input id="lmc-files" type="file" accept="image/*" multiple></div>
      <button class="btn" ${c.busy ? "disabled" : ""} onclick="lmClaimSubmit()">${esc(t("lm.send"))}</button>`;
  return `<div class="deals-intro" onclick="lmClaimClose()">
    <div class="deals-box lm-card" onclick="event.stopPropagation()" style="max-height:88vh;overflow:auto">
      <div class="lm-head"><span class="lm-ico" style="background:${esc(p.kind.color)}">${esc(p.kind.icon)}</span><div><h3>${esc(t("lm.claimTitle"))}</h3><small>${esc(p.name)}</small></div></div>
      ${c.error ? `<p class="error-banner">${esc(c.error)}</p>` : ""}
      ${body}
      <div class="lm-actions"><button class="btn ghost" onclick="lmClaimClose()">${esc(t("follow.close"))}</button></div>
    </div>
  </div>`;
}

/** Before a shop is registered: is there a public place of the same name close by? Then offer to claim it instead of a duplicate. */
async function lmCheckSimilar(name, lat, lng) {
  const params = new URLSearchParams({ name, lat, lng });
  const { ok, data } = await api("GET", "/landmarks/similar?" + params.toString());
  return ok && data.items ? data.items : [];
}

function landmarkSimilarHtml() {
  const m = S._lmSimilar;
  if (!m) return "";
  const first = m.items[0];
  return `<div class="deals-intro" onclick="S._lmSimilar=null;render()">
    <div class="deals-box lm-card" onclick="event.stopPropagation()">
      <div class="lm-head"><span class="lm-ico" style="background:#1b5fa6">${esc(first.kind.icon)}</span><div><h3>${esc(t("lm.similarTitle"))}</h3></div></div>
      <p>${esc(t("lm.similarText"))}</p>
      ${m.items.slice(0, 3).map((x) => `<p><b>${esc(x.kind.icon)} ${esc(x.name)}</b>${x.address ? `<br><small class="muted">${esc(x.address)}</small>` : ""}</p>`).join("")}
      <div class="lm-actions" style="flex-direction:column">
        <button class="btn" onclick="lmClaimFromSimilar(0)">${esc(t("lm.claimIt"))}</button>
        <button class="btn ghost" onclick="lmSimilarContinue()">${esc(t("lm.notSame"))}</button>
      </div>
    </div>
  </div>`;
}

async function lmClaimFromSimilar(i) {
  const x = S._lmSimilar && S._lmSimilar.items[i];
  if (!x) return;
  const { ok, data } = await api("GET", "/landmarks/" + x.id);
  if (!ok) return toast(t("lm.failed"));
  S._lmSimilarPlace = data;
  lmClaimOpen(x.id);
}
function lmSimilarContinue() { S._lmSimilarOk = true; S._lmSimilar = null; submitMerchantRegister(); }

function landmarkModalHtml() {
  const p = S._lmOpen;
  if (!p) return "";
  const phone = p.phone ? `<p>📞 <a href="tel:${esc(p.phone)}" dir="ltr">${esc(p.phone)}</a></p>` : "";
  return `<div class="deals-intro" onclick="lmClose()">
    <div class="deals-box lm-card" onclick="event.stopPropagation()">
      <div class="lm-head"><span class="lm-ico" style="background:${esc(p.kind.color)}">${esc(p.kind.icon)}</span><div><h3>${esc(p.name)}</h3><small>${esc(p.kind.name)}${p.sector ? " · " + esc(t(p.sector === "PUBLIC" ? "lm.public" : "lm.private")) : ""}</small></div></div>
      ${p.description ? `<p>${esc(p.description)}</p>` : ""}
      ${p.address ? `<p>📍 ${esc(p.address)}</p>` : ""}
      ${phone}
      ${p.claimable ? `<p class="lm-claim-note">🏥 ${esc(t("lm.claimable"))}</p>` : ""}
      <div class="lm-actions">
        ${p.claimable ? `<button class="btn outline" onclick="lmClaimOpen('${esc(p.id)}')">${esc(t("lm.claimBtn"))}</button>` : ""}
        <button class="btn" onclick="lmDirections('${esc(p.id)}')">🧭 ${esc(t("lm.directions"))}</button>
        <button class="btn ghost" onclick="lmClose()">${esc(t("follow.close"))}</button>
      </div>
    </div>
  </div>`;
}

function renderDiscoverMap() {
  const slot = document.getElementById("discover-map-slot");
  if (!slot || typeof L === "undefined") return;
  if (!S._map) {
    const el = document.createElement("div");
    el.style.cssText = "height:100%;width:100%";
    S._mapEl = el;
    const map = L.map(el, { attributionControl: false, zoomControl: false }).setView([DAMASCUS.lat, DAMASCUS.lng], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap").addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    S._cluster = typeof L.markerClusterGroup === "function" ? L.markerClusterGroup({ maxClusterRadius: 50 }) : L.layerGroup();
    map.addLayer(S._cluster);
    S._lmLayer = L.layerGroup().addTo(map); // under the shops' pins
    map.on("click", () => clearSelectedMerchant()); // a touch on the empty map (a pin does not pass its touch on)
    S._userLayer = L.layerGroup().addTo(map);
    map.on("moveend", () => {
      lmSchedule();
      if (Date.now() < (S._ignoreMoveUntil || 0)) return;
      if (S._discover) S._discover.areaDirty = true;
      const btn = document.getElementById("area-btn");
      if (btn) btn.style.display = "block";
    });
    S._map = map;
    S._mapKey = "";
    lmSchedule();
  }
  slot.appendChild(S._mapEl); // re-parenting keeps the view, zoom and markers
  S._map.invalidateSize();
  syncMapMarkers();
}

// The chosen distance is drawn as a circle around the user, and the camera moves to frame it.
function syncRadiusLayer() {
  const d = S._discover;
  const map = S._map;
  const key = d.radiusKm && d.userLoc ? `${d.radiusKm}|${d.userLoc.lat}|${d.userLoc.lng}` : "";
  if (key !== S._radiusDrawn) {
    S._radiusDrawn = key;
    if (S._radiusLayer) { map.removeLayer(S._radiusLayer); S._radiusLayer = null; }
    if (key) S._radiusLayer = L.circle([d.userLoc.lat, d.userLoc.lng], { radius: d.radiusKm * 1000, color: "#ba2a34", weight: 2, dashArray: "6 6", fillColor: "#ba2a34", fillOpacity: 0.06, interactive: false }).addTo(map);
  }
  if (!S._radiusFit) return;
  S._radiusFit = false;
  const sheetPx = sheetHeights()[S._sheet || "peek"];
  const pad = { paddingTopLeft: [20, 150], paddingBottomRight: [20, sheetPx + 20], animate: false };
  if (S._radiusLayer) {
    moveMap(() => map.fitBounds(S._radiusLayer.getBounds(), pad));
  } else if (d.userLoc) {
    // "Any distance": frame the user together with every place on the map.
    const pts = (S._visible || []).filter((m) => m.latitude != null && m.longitude != null).map((m) => [m.latitude, m.longitude]);
    pts.push([d.userLoc.lat, d.userLoc.lng]);
    moveMap(() => map.fitBounds(L.latLngBounds(pts), { ...pad, maxZoom: 15 }));
  }
}

function syncMapMarkers() {
  const d = S._discover;
  const map = S._map;
  const located = (S._visible || []).filter((m) => m.latitude != null && m.longitude != null);

  syncRouteLayer();
  syncRadiusLayer();
  S._userLayer.clearLayers();
  if (d.userLoc) {
    L.circleMarker([d.userLoc.lat, d.userLoc.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#1e6fe0", fillOpacity: 1 }).addTo(S._userLayer).bindPopup("موقعك");
  }

  const key = located.map((m) => m.id).join(",") + "|" + (d.selectedId || "");
  if (key !== S._mapKey) {
    S._mapKey = key;
    S._cluster.clearLayers();
    located.forEach((m) => {
      const hasDiscount = (m.discounts || []).length > 0;
      const selected = d.selectedId === m.id;
      // the pin carries the shop's logo, or the first letter of its name; a shop with a discount wears a small tag on top
      const size = selected ? 46 : 38;
      const bg = selected ? "#111" : hasDiscount ? "#ba2a34" : "#8a7a78";
      const inner = m.avatarUrl
        ? `<img src="${esc(m.avatarUrl)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;transform:rotate(45deg);background:#fff">`
        : `<span style="transform:rotate(45deg);font-weight:800;font-size:${selected ? 19 : 16}px;line-height:1">${esc((m.businessName || "?").trim().slice(0, 1).toUpperCase())}</span>`;
      const badge = hasDiscount ? `<span style="position:absolute;top:-9px;right:-9px;width:20px;height:20px;border-radius:50%;background:#ffb300;color:#111;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 2px 5px rgba(0,0,0,.4);z-index:2">🏷️</span>` : "";
      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:${size}px;height:${size}px"><div style="background:${bg};color:#fff;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.4);border:3px solid ${bg}">${inner}</div>${badge}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      });
      L.marker([m.latitude, m.longitude], { icon, zIndexOffset: selected ? 1000 : 0 }).on("click", () => selectMerchant(m.id)).addTo(S._cluster);
    });
    // Nothing known about the user yet: frame the merchants instead of showing an empty map.
    if (!d.userLoc && located.length && !S._fitted) {
      S._fitted = true;
      moveMap(() => map.fitBounds(L.latLngBounds(located.map((m) => [m.latitude, m.longitude])), { padding: [40, 40], maxZoom: 15, animate: false }));
    }
  }
  if (d.userLoc && !S._centeredUser) {
    S._centeredUser = true;
    moveMap(() => map.setView([d.userLoc.lat, d.userLoc.lng], 14, { animate: false }));
  }
}

function flattenCategories(cats) {
  const out = [];
  for (const c of cats) { out.push(c); for (const ch of c.children || []) out.push(ch); }
  return out;
}

function merchantRowHtml(m) {
  const saved = S._discover && S._discover.favIds.includes(m.id);
  const selected = S._discover && S._discover.selectedId === m.id;
  const hasCoords = m.latitude != null && m.longitude != null;
  return `
    <div class="card place-card clickable ${selected ? "selected" : ""}" onclick="go('merchantDetail', {merchantId:'${m.id}'})">
      <div class="title-line">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          ${avatarHtml(m.avatarUrl, m.businessName)}
          <div style="min-width:0"><strong>${esc(m.businessName)}</strong><p class="muted" style="margin:0">${esc(catName(m.category))}${m.branchName ? " · 🏬 " + esc(m.branchName) : ""}${m.address ? " · " + esc(m.address) : ""}</p></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${m.distanceKm != null ? `<span class="badge neutral">${m.distanceKm < 1 ? Math.round(m.distanceKm * 1000) + " " + esc(t("unit.m")) : m.distanceKm.toFixed(1) + " " + esc(t("unit.km"))}</span>` : ""}
          <button class="heart ${saved ? "on" : ""}" title="${esc(t("card.save"))}" onclick="event.stopPropagation();toggleFav('${m.id}')">${saved ? "♥" : "♡"}</button>
        </div>
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${openBadge(m.openStatus)}
        ${(m.discounts || []).map((dc) => `<span class="badge info">🏷️ ${esc(dc.title)} — ${dc.percent}%${dc.peopleLeft != null ? " · " + esc(t("disc.placesLeftShort", { n: dc.peopleLeft })) : ""}${dc.endDate ? ` · ⏳ ${countdownHtml(dc.endDate)}` : ""}</span>`).join("")}
      </div>
      <div class="place-card-actions">
        <button class="btn small" style="width:auto" onclick="event.stopPropagation();go('merchantDetail',{merchantId:'${m.id}'})">${esc(t("card.details"))}</button>
        ${hasCoords ? `<button class="btn small outline" style="width:auto" onclick="event.stopPropagation();startRoute('${m.id}')">${esc(t("card.directions"))}</button>` : ""}
      </div>
    </div>`;
}

async function loadCategories() {
  const { ok, data } = await api("GET", "/categories?lang=" + LANG);
  S._discover.categories = ok ? data : [];
}

/* ---- saved places ---- */

async function loadFavIds() {
  if (!S.token) return;
  const { ok, data } = await api("GET", "/favorites/ids");
  if (ok && S._discover) { S._discover.favIds = data; render(); }
}

async function toggleFav(id) {
  if (!S.token) return go("login");
  const d = discoverState();
  const saved = d.favIds.includes(id);
  d.favIds = saved ? d.favIds.filter((x) => x !== id) : [...d.favIds, id]; // optimistic
  render();
  const { ok } = await api(saved ? "DELETE" : "PUT", "/favorites/" + id);
  if (!ok) { d.favIds = saved ? [...d.favIds, id] : d.favIds.filter((x) => x !== id); render(); }
  if (S._favorites) S._favorites = null;
}

function screenFavorites() {
  if (!S._favorites) { S._favorites = { loading: true }; loadFavorites(); }
  const f = S._favorites;
  if (f.loading) return backRow() + spinner();
  return `
    ${backRow()}
    <h1 class="screen-title">أماكني المحفوظة</h1>
    ${f.list.length === 0 ? `<div class="empty-state">ما حفظت أي مكان بعد — اضغط ♡ على أي محل</div>` : f.list.map(merchantRowHtml).join("")}
  `;
}
async function loadFavorites() {
  const { ok, data } = await api("GET", "/favorites");
  S._favorites = { loading: false, list: ok ? data : [] };
  render();
}

/* ---- guests: everything account-bound explains itself instead of failing ---- */

function guestPrompt(tab) {
  const icons = { card: "💳", cart: "🛒", orders: "📦", profile: "👤" };
  const perks = { card: 3, cart: 2, orders: 2, profile: 3 }[tab];
  return `
    <div class="guest-prompt">
      <div class="guest-ico">${icons[tab]}</div>
      <h1 class="screen-title" style="margin:0">${esc(t(`guest.${tab}.title`))}</h1>
      <p class="screen-sub">${esc(t(`guest.${tab}.sub`))}</p>
      <ul>${Array.from({ length: perks }, (_, i) => `<li>✓ ${esc(t(`guest.${tab}.p${i + 1}`))}</li>`).join("")}</ul>
      <button class="btn" onclick="go('login')">${esc(t("guest.login"))}</button>
      <div style="height:10px"></div>
      <button class="btn outline" onclick="go('register')">${esc(t("guest.register"))}</button>
    </div>`;
}

/* ---- Cart tab ---- */

function tabCart() {
  if (!S._cart) { S._cart = { loading: true }; loadCart(); }
  const c = S._cart;
  if (c.loading) return `<h1 class="screen-title">سلتي</h1>${spinner()}`;
  const items = c.items || [];
  return `
    <h1 class="screen-title">سلتي</h1>
    ${items.length === 0 ? `<div class="empty-state">سلتك فاضية</div>` : items.map(cartItemHtml).join("")}
    ${items.length > 0 ? `
      ${(c.shipping || []).filter((x) => x.methods.length).map((x) => shipChoiceHtml(x, items)).join("")}
      <div class="divider"></div>
      ${shipTotal(c) > 0 ? `<div class="title-line"><span>${esc(t("ship.title"))}</span><span class="price">${fmt(shipTotal(c))}</span></div>` : ""}
      <div class="title-line"><strong>الإجمالي</strong><span class="price" style="color:var(--primary)">${fmt(c.totalCents + shipTotal(c))}</span></div>
      <div style="height:10px"></div>
      <button class="btn" onclick="doCheckout()">إتمام الطلب</button>
    ` : ""}
    ${errorBanner()}
  `;
}

/** What the chosen shipping methods cost, all shops together. */
function shipTotal(c) {
  const pick = S._shipPick || {};
  return (c.shipping || []).reduce((sum, x) => sum + ((x.methods.find((m) => m.id === pick[x.merchantId]) || {}).costCents || 0), 0);
}

function pickShip(merchantId, methodId) {
  S._shipPick = S._shipPick || {};
  S._shipPick[merchantId] = methodId;
  render();
}

function shipChoiceHtml(x, items) {
  const shop = (items.find((i) => i.product.merchant.id === x.merchantId) || { product: { merchant: { businessName: "" } } }).product.merchant.businessName;
  const pick = (S._shipPick || {})[x.merchantId];
  return `
    <div class="card ship-choice">
      <div class="section-title" style="margin-top:0">🚚 ${esc(t("ship.chooseFor", { shop }))}</div>
      ${x.methods.map((m) => `<label class="ship-opt ${pick === m.id ? "on" : ""}"><input type="radio" name="ship-${x.merchantId}" ${pick === m.id ? "checked" : ""} onchange="pickShip('${x.merchantId}','${m.id}')"><span>${esc(m.name)}</span><b>${m.costCents ? fmt(m.costCents) : esc(t("ship.free"))}</b></label>`).join("")}
    </div>`;
}

function cartItemHtml(i) {
  const discounted = i.unitPriceCents < i.regularPriceCents;
  return `
    <div class="card">
      <div class="title-line">
        <strong>${esc(i.product.name)}</strong>
        <button class="link-btn" style="padding:0" onclick="removeCartItem('${i.id}')">حذف</button>
      </div>
      <p class="muted">${esc(i.product.merchant.businessName)}</p>
      <p>${discounted ? `<span class="price strike">${fmt(i.regularPriceCents)}</span> <span class="price" style="color:var(--primary)">${fmt(i.unitPriceCents)}</span>` : `<span class="price">${fmt(i.unitPriceCents)}</span>`}</p>
      <div class="list-row" style="margin-top:8px">
        <div class="stepper">
          <button onclick="changeCartQty('${i.id}', ${i.quantity - 1})">−</button>
          <span>${i.quantity}</span>
          <button onclick="changeCartQty('${i.id}', ${i.quantity + 1})">+</button>
        </div>
        <span class="price">${fmt(i.lineTotalCents)}</span>
      </div>
    </div>`;
}

async function loadCart() {
  const { ok, data } = await api("GET", "/cart");
  S._cart = { loading: false, items: ok ? data.items : [], shipping: ok ? data.shipping || [] : [], totalCents: ok ? data.totalCents : 0 };
  // a shop with a single method needs no choosing
  S._shipPick = S._shipPick || {};
  (S._cart.shipping || []).forEach((x) => { if (x.methods.length === 1) S._shipPick[x.merchantId] = x.methods[0].id; });
  render();
}

async function removeCartItem(id) {
  await api("DELETE", "/cart/items/" + id);
  loadCart();
}
async function changeCartQty(id, qty) {
  if (qty <= 0) return removeCartItem(id);
  await api("PATCH", "/cart/items/" + id, { quantity: qty });
  loadCart();
}
async function addToCart(productId, quantity) {
  const { ok, data } = await api("POST", "/cart/items", { productId, quantity });
  return { ok, data };
}

async function doCheckout() {
  const pick = S._shipPick || {};
  const missing = ((S._cart && S._cart.shipping) || []).some((x) => x.methods.length && !x.methods.some((m) => m.id === pick[x.merchantId]));
  if (missing) { S.error = t("ship.pickAll"); return render(); }
  const shipping = {};
  ((S._cart && S._cart.shipping) || []).forEach((x) => { if (pick[x.merchantId]) shipping[x.merchantId] = pick[x.merchantId]; });
  S.busy = true; render();
  const { ok, data } = await api("POST", "/cart/checkout", { shipping });
  S.busy = false;
  if (ok) {
    S._cart = null;
    S._orders = null;
    S.homeTab = "orders";
    render();
  } else {
    S.error = errMsg(data, "تعذّر إتمام الطلب");
    S._cart.loading = false;
    render();
  }
}

/* ---- Orders tab ---- */

function tabOrders() {
  if (!S._orders) { S._orders = { loading: true }; loadOrders(); }
  const o = S._orders;
  if (o.loading) return `<h1 class="screen-title">طلباتي</h1>${spinner()}`;
  const list = o.list || [];
  return `
    <h1 class="screen-title">طلباتي</h1>
    ${list.length === 0 ? `<div class="empty-state">ما عندك طلبات بعد</div>` : list.map((ord) => `
      <div class="card clickable" onclick="go('orderDetail', {orderId:'${ord.id}'})">
        <div class="title-line"><strong>${esc(ord.orderNumber)}</strong>${orderBadge(ord.status)}</div>
        <p class="muted">${esc(ord.merchant ? ord.merchant.businessName : "")}</p>
        <p class="price">${fmt(ord.totalCents)}</p>
      </div>`).join("")}
  `;
}

async function loadOrders() {
  const { ok, data } = await api("GET", "/orders/mine");
  S._orders = { loading: false, list: ok ? data : [] };
  render();
}

/* ---- Profile tab ---- */

function tabProfile() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:50px">
      ${(() => {
        if (S._profile == null) { S._profile = {}; loadProfile(); }
        const p = S._profile;
        return `<div style="display:flex;justify-content:center">${avatarHtml(p.avatarUrl, p.fullName, "huge")}</div>
          <h1 class="screen-title" style="margin:10px 0 2px">${esc(p.fullName || t("profile.myAccount"))}</h1>
          ${p.bio ? `<p class="muted" style="margin:0 0 6px;max-width:260px">${esc(p.bio)}</p>` : ""}
          <button class="link-btn" onclick="go('profileEdit')">${esc(t("profile.edit"))}</button>`;
      })()}
      <div style="height:14px"></div>
      ${(() => { if (S.account == null) { S.account = {}; loadAccountInfo(); } return verifyBannerHtml(); })()}
      ${S.role === "MERCHANT"
        ? `<button class="btn" style="max-width:240px" onclick="S._mstat=null;go('merchantMode')">${esc(t("profile.merchantMode"))}</button>
           <div style="height:8px"></div>
           <button class="btn outline" style="max-width:240px" onclick="openStorePlans()">🛍️ ${esc(t("sp.title"))}</button>`
        : `<button class="btn outline" style="max-width:240px" onclick="go('merchantRegister')">${esc(t("profile.registerMerchant"))}</button>`}
      <div style="height:10px"></div>
      <label class="switch-row"><input type="checkbox" ${shareLocationOn() ? "checked" : ""} onchange="setShareLocation(this.checked)" /><span>${esc(t("profile.shareLocation"))}</span></label>
      <p class="muted" style="margin:0 0 10px">${esc(t("profile.shareLocationSub"))}</p>
      <button class="btn outline" style="max-width:240px" onclick="S._acct=null;go('account')">${esc(t("profile.account"))}</button>
      <div style="height:10px"></div>
      ${S.role === "MERCHANT" ? `<button class="btn outline" style="max-width:240px" onclick="S._myAds=null;go('myAds')">${esc(t("profile.myAds"))}</button>` : ""}
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('affiliateMine')">${esc(t("profile.affiliates"))}</button>
      <div style="height:10px"></div>
      ${(() => { if (S._refMe == null) { loadRefMe(); return ""; } return `<button class="btn outline" style="max-width:240px" onclick="go('marketing')">📣 ${esc(t(S._refMe.isMarketer ? "ref.title" : "ref.become"))}</button><div style="height:10px"></div>`; })()}
      <div style="height:10px"></div>
      ${S.role === "ADMIN" ? `<button class="btn" style="max-width:240px" onclick="S._adr=null;go('adminReview')">📣 ${esc(t("adr.title"))}</button><div style="height:10px"></div>` : ""}
      <button class="btn outline" style="max-width:240px" onclick="openDiscountHistory('mine')">🧾 ${esc(t("dh.titleMine"))}</button>
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('wallet')">${esc(t("profile.wallet"))}</button>
      <div style="height:14px"></div>
      ${followUsHtml(true)}
      <button class="btn secondary" style="max-width:240px" onclick="doLogout()">${esc(t("profile.logout"))}</button>
      <div style="height:10px"></div>
      <button class="link-btn" style="color:var(--danger, #b71c1c)" onclick="deleteMyAccount()">${esc(t("profile.deleteAccount"))}</button>
      ${legalLinksHtml()}
    </div>
  `;
}

/* ================= MARKETING: my referral link, the people I brought, what I earned ================= */

const JOIN_KEY = "dlk_join";

/** A link with ?join=CODE remembers the code until the person signs up (or signs in with Google or Facebook). */
function captureJoin() {
  const q = new URLSearchParams(location.search);
  const code = (q.get("join") || "").trim().toUpperCase();
  if (!code) return;
  try { localStorage.setItem(JOIN_KEY, code); } catch (e) {}
  q.delete("join");
  try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q.toString() : "")); } catch (e) {}
}
const storedJoin = () => { try { return localStorage.getItem(JOIN_KEY) || ""; } catch (e) { return ""; } };
const forgetJoin = () => { try { localStorage.removeItem(JOIN_KEY); } catch (e) {} };

/** A person who signed in or up with a social account claims the remembered code once. */
async function claimStoredJoin() {
  const code = storedJoin();
  if (!code || !S.token) return;
  forgetJoin();
  await api("POST", "/referral/use", { code });
  S._refMe = null;
}

async function loadRefMe() {
  const { ok, data } = await api("GET", "/referral/me");
  S._refMe = ok ? data : { isMarketer: false };
  render();
}

async function refUseCode() {
  const code = (qs("ref-code") || {}).value || "";
  if (!code.trim()) return;
  const { ok, data } = await api("POST", "/referral/use", { code: code.trim() });
  toast(ok && data.ok ? t("ref.ok") : data && data.reason === "ALREADY" ? t("ref.already") : t("ref.bad"));
  S._refMe = null;
  S._acct = null;
  if (S.screen === "account") loadAccount();
}

function refCopy(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(t("ref.copied")), () => prompt(t("ref.link"), text));
  else prompt(t("ref.link"), text);
}

/** The card shown on the account settings of a person who came without a code: "have a referral code?". */
function refEnterCardHtml() {
  const me = S._refMe;
  if (!me) { loadRefMe(); return ""; }
  if (me.isMarketer || me.referred) return "";
  return `<div class="card">
    <div class="section-title" style="margin-top:0">${esc(t("ref.enter"))}</div>
    <div class="field"><input id="ref-code" placeholder="مثال: AB12CD" dir="ltr" autocapitalize="characters" /></div>
    <button class="btn small" onclick="refUseCode()">${esc(t("ref.apply"))}</button>
  </div>`;
}

/** Not a marketer yet: ask to become one (online or in the field), or enter a referral code. */
function becomeMarketerHtml(me) {
  const req = me.request;
  const status = req && req.status === "PENDING" ? `<div class="card" style="border-color:var(--primary)">${esc(t("ref.pending"))}</div>`
    : req && req.status === "REJECTED" ? `<p class="muted">${esc(t("ref.rejected"))}</p>` : "";
  const form = req && req.status === "PENDING" ? "" : `
    <div class="card">
      <p class="muted">${esc(t("ref.becomeSub"))}</p>
      <div class="field"><label>${esc(t("ref.phone"))}</label><input id="ref-phone" placeholder="+963 9xx xxx xxx" dir="ltr" inputmode="tel" /></div>
      <div class="field"><label>${esc(t("ref.note"))}</label><input id="ref-note" placeholder="مثال: صاحب محل بحي المزة" /></div>
      <div class="intent-cards">
        <button class="intent-card" onclick="refRequest('ELECTRONIC')"><span class="ic">💻</span><div><b>${esc(t("ref.electronic"))}</b><small>${esc(t("ref.electronicSub"))}</small></div></button>
        <button class="intent-card" onclick="refRequest('FIELD')"><span class="ic">🚶</span><div><b>${esc(t("ref.field"))}</b><small>${esc(t("ref.fieldSub"))}</small></div></button>
      </div>
    </div>`;
  return `<h1 class="screen-title">📣 ${esc(t("ref.become"))}</h1>${status}${form}${refEnterCardHtml()}`;
}

async function refRequest(channel) {
  const phone = ((qs("ref-phone") || {}).value || "").trim();
  const note = ((qs("ref-note") || {}).value || "").trim();
  const { ok, data } = await api("POST", "/referral/request", { channel, phone: phone || undefined, note: note || undefined });
  toast(ok ? t("ref.sent") : errMsg(data, t("ref.bad")));
  S._refMe = null;
  render();
}

function screenMarketing() {
  const me = S._refMe;
  if (!me) { loadRefMe(); return backRow() + spinner(); }
  if (!me.isMarketer) return backRow() + becomeMarketerHtml(me);
  const cn = me.creditName || "";
  const manager = me.kind === "MANAGER";
  return `
    ${backRow()}
    <h1 class="screen-title">📣 ${esc(t("ref.title"))}</h1>
    <p class="screen-sub">${esc(t(manager ? "ref.subManager" : "ref.sub"))} <span class="badge neutral">${esc(t(me.channel === "FIELD" ? "ref.field" : "ref.electronic"))}</span></p>
    <div class="card">
      <div class="field"><label>${esc(t("ref.link"))}</label><input readonly dir="ltr" value="${esc(me.link)}" onclick="this.select()" /></div>
      <div class="row">
        <button class="btn small" onclick="refCopy('${esc(me.link)}')">${esc(t("ref.copy"))}</button>
        <button class="btn small outline" onclick="refCopy('${esc(me.code)}')">${esc(t("ref.code"))}: ${esc(me.code)}</button>
      </div>
    </div>
    <div class="card">
      <div class="list-row"><span>${esc(t("ref.people"))}</span><strong>${me.people}</strong></div>
      <div class="list-row"><span>${esc(t("ref.earned"))}</span><strong style="color:var(--primary)">${me.earned} ${esc(cn)}</strong></div>
      ${manager ? `<div class="list-row"><span>${esc(t("ref.teamPeople"))}</span><strong>${me.teamPeople}</strong></div>
      <div class="list-row"><span>${esc(t("ref.fromTeam"))}</span><strong>${me.earnedFromTeam} ${esc(cn)}</strong></div>` : ""}
    </div>
    ${manager ? `<div class="section-title">${esc(t("ref.team"))}</div>
      ${me.team.length ? me.team.map((m) => `<div class="card"><div class="title-line"><strong>${esc(m.name)}</strong>${m.active ? "" : `<span class="badge neutral">${esc(t("ref.off"))}</span>`}</div>
        <p class="muted">${esc(t("ref.memberRow", { n: m.people, e: m.earned + " " + cn }))}</p></div>`).join("") : `<p class="muted">${esc(t("ref.noTeam"))}</p>`}` : ""}
  `;
}

/* ================= ADMIN: review the announcements shops want to send ================= */

function screenAdminReview() {
  if (S.role !== "ADMIN") return backRow() + `<div class="empty-state">${esc(t("adr.adminOnly"))}</div>`;
  if (!S._adr) { S._adr = { loading: true, items: [], rejecting: null }; loadAdminReview(); }
  const a = S._adr;
  if (a.loading) return backRow() + `<h1 class="screen-title">${esc(t("adr.title"))}</h1>${spinner()}`;
  return `
    ${backRow()}
    <div class="adr-head">
      <h1 class="screen-title">${esc(t("adr.title"))}</h1>
      <button class="btn small outline" style="width:auto" onclick="S._adr=null;render()">↻ ${esc(t("adr.refresh"))}</button>
    </div>
    <div class="adr-hint">ℹ️ ${esc(t("adr.hint"))}</div>
    ${a.msg ? `<div class="adr-note">${esc(a.msg)}</div>` : ""}
    ${a.err ? `<div class="error-banner">${esc(a.err)}</div>` : ""}
    ${a.items.length ? a.items.map(adrCardHtml).join("") : `<div class="empty-state">✅ ${esc(t("adr.empty"))}</div>`}
  `;
}

function adrCardHtml(it) {
  const a = S._adr;
  const shop = (it.sender && ((it.sender.merchantProfile && it.sender.merchantProfile.businessName) || it.sender.email)) || "—";
  const where = it.scope === "RADIUS" ? t("adr.radius", { n: it.radiusKm != null ? it.radiusKm : "?" }) : it.scope === "FOLLOWERS" ? t("adr.followers") : t("adr.place");
  const verdict = it.aiVerdict === "OK" ? "ok" : it.aiVerdict === "REVIEW" ? "warn" : "none";
  const verdictText = t(verdict === "ok" ? "adr.aiOk" : verdict === "warn" ? "adr.aiReview" : "adr.aiNone");
  const reasons = (it.aiReasons || []).filter(Boolean);
  const busy = a.busyId === it.id;
  return `
    <div class="adr-card">
      <div class="adr-top">
        <div class="adr-av">${esc(String(shop).trim().slice(0, 1).toUpperCase())}</div>
        <div class="adr-shop"><b>${esc(shop)}</b><small>${esc(it.sender && it.sender.fullName ? it.sender.fullName : "")}</small></div>
      </div>
      <h3 class="adr-title">${esc(it.title)}</h3>
      <div class="adr-body">${esc(it.body)}</div>
      <div class="adr-chips">
        <span class="adr-chip">🎯 ${esc(t("adr.reach", { where, n: it.targeted }))}</span>
        ${it.productId ? `<span class="adr-chip">${esc(t("adr.hasProduct"))}</span>` : ""}
        ${it.discountId ? `<span class="adr-chip">${esc(t("adr.hasOffer"))}</span>` : ""}
      </div>
      <div class="adr-ai ${verdict}">
        <b>${verdict === "ok" ? "✓" : verdict === "warn" ? "⚠" : "•"} ${esc(t("adr.ai", { v: verdictText }))}</b>
        ${reasons.length ? `<ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      </div>
      ${a.rejecting === it.id ? `
        <div class="field"><label>${esc(t("adr.reason"))}</label><textarea id="adr-reason" rows="2" placeholder="${esc(t("adr.reasonPh"))}"></textarea></div>
        <div class="adr-actions">
          <button class="btn danger" ${busy ? "disabled" : ""} onclick="adrReject('${esc(it.id)}')">${esc(t("adr.confirmRefuse"))}</button>
          <button class="btn outline" onclick="S._adr.rejecting=null;render()">${esc(t("adr.cancel"))}</button>
        </div>` : `
        <div class="adr-actions">
          <button class="btn adr-ok" ${busy ? "disabled" : ""} onclick="adrApprove('${esc(it.id)}')">✓ ${esc(t("adr.publish"))}</button>
          <button class="btn outline adr-no" ${busy ? "disabled" : ""} onclick="S._adr.rejecting='${esc(it.id)}';render()">✕ ${esc(t("adr.refuse"))}</button>
        </div>`}
    </div>`;
}

async function loadAdminReview() {
  const { ok, data } = await api("GET", "/broadcasts?status=PENDING_REVIEW");
  const prev = S._adr || {};
  S._adr = { loading: false, items: ok ? data : [], rejecting: null, err: ok ? null : errMsg(data, t("adr.failed")), msg: prev.msg };
  render();
}

async function adrApprove(id) {
  S._adr.busyId = id; render();
  const { ok, data } = await api("POST", `/broadcasts/${id}/approve`);
  const msg = ok ? t("adr.published") : null;
  await loadAdminReview();
  S._adr.msg = msg; S._adr.err = ok ? null : errMsg(data, t("adr.failed"));
  render();
}

async function adrReject(id) {
  const reason = ((qs("adr-reason") || {}).value || "").trim();
  if (reason.length < 3) { S._adr.err = t("adr.needReason"); return render(); }
  S._adr.busyId = id; render();
  const { ok, data } = await api("POST", `/broadcasts/${id}/reject`, { reason });
  const msg = ok ? t("adr.refused") : null;
  await loadAdminReview();
  S._adr.msg = msg; S._adr.err = ok ? null : errMsg(data, t("adr.failed"));
  render();
}

/* ================= THE DISCOUNTS THAT WERE APPLIED: a list for the customer and one for the shop ================= */

function openDiscountHistory(mode) {
  S._dh = { mode, loading: true, items: [], summary: null };
  go("discountHistory");
  loadDiscountHistory();
}

async function loadDiscountHistory() {
  const mine = S._dh.mode === "mine";
  const { ok, data } = await api("GET", mine ? "/qr/transactions/mine" : "/qr/transactions/shop");
  if (!S._dh) return;
  const items = ok ? (mine ? data : data.items) : [];
  const summary = mine
    ? { count: items.length, billCents: items.reduce((n, x) => n + x.billAmountCents, 0), discountCents: items.reduce((n, x) => n + x.discountAmountCents, 0) }
    : ok ? data.summary : null;
  S._dh = { ...S._dh, loading: false, items, summary, failed: !ok };
  render();
}

function screenDiscountHistory() {
  if (!S._dh) { S._dh = { mode: "mine", loading: true, items: [], summary: null }; loadDiscountHistory(); }
  const d = S._dh;
  const mine = d.mode === "mine";
  const head = `${backRow()}<h1 class="screen-title">🧾 ${esc(t(mine ? "dh.titleMine" : "dh.titleShop"))}</h1>`;
  if (d.loading) return head + spinner();
  if (d.failed) return head + `<div class="error-banner">${esc(t("dh.failed"))}</div>`;
  const when = (iso) => new Date(iso).toLocaleString(LANG, { dateStyle: "medium", timeStyle: "short" });
  return `${head}
    <div class="card dh-sum">
      <div><b>${d.summary.count}</b><small>${esc(t("dh.count"))}</small></div>
      <div><b>${fmt(d.summary.billCents)}</b><small>${esc(t("dh.bills"))}</small></div>
      <div><b style="color:var(--primary)">${fmt(d.summary.discountCents)}</b><small>${esc(t(mine ? "dh.saved" : "dh.given"))}</small></div>
    </div>
    ${d.items.length ? d.items.map((x) => `
      <div class="card dh-item">
        <div class="title-line"><strong>${esc(mine ? (x.merchant && x.merchant.businessName) || "" : x.memberName || "")}</strong><small class="muted">${esc(when(x.createdAt))}</small></div>
        <div class="list-row"><span>${esc(t("dh.bill"))}</span><span>${fmt(x.billAmountCents)}</span></div>
        <div class="list-row"><span>${esc(t("dh.discount", { p: x.discountPercent }))}</span><span class="price" style="color:var(--primary)">− ${fmt(x.discountAmountCents)}</span></div>
        <div class="list-row"><strong>${esc(t("dh.final"))}</strong><strong>${fmt(x.finalAmountCents)}</strong></div>
        <button class="btn small outline" style="margin-top:8px" onclick="exportDocument('/invoices/discount/${esc(x.transactionRef)}')">📄 ${esc(t("dh.receipt"))}</button>
      </div>`).join("") : `<div class="empty-state">${esc(t(mine ? "dh.emptyMine" : "dh.emptyShop"))}</div>`}
  `;
}

/* ================= AFFILIATE — MY EARNINGS (customer side) ================= */

function screenAffiliateMine() {
  if (!S._affMine) { S._affMine = { loading: true }; loadAffiliateMine(); }
  const a = S._affMine;
  if (a.loading) return backRow() + spinner();
  const list = a.list || [];
  return `
    ${backRow()}
    <h1 class="screen-title">مسوّقياتي</h1>
    <p class="screen-sub">أصحاب الأنشطة اللي إنت مسوّق عندهم، وعمولاتك من كل واحد</p>
    ${list.length === 0 ? `<div class="empty-state">لسا ما انضممت كمسوّق لأي صاحب نشاط — صاحب النشاط هو اللي بضيفك لفريقه</div>` : list.map((x) => `
      <div class="card">
        <div class="title-line"><strong>${esc(x.merchant.businessName)}</strong><span class="badge ${x.isActive ? "success" : "neutral"}">${x.isActive ? "نشط" : "غير نشط"}</span></div>
        <p class="muted">عمولتك: ${x.commissionType === "PERCENT" ? x.commissionValue + "% من كل عملية" : fmt(x.commissionValue) + " لكل عملية"}</p>
        <p class="muted">زبائن أحلتهم: ${x.referredCount} — إجمالي عمولاتك: <strong style="color:var(--primary)">${fmt(x.totalCommissionCents)}</strong></p>
        ${x.sampleLink
          ? `<div class="field"><label>رابط الإحالة (انسخه وشاركه)</label><input readonly value="${esc(x.sampleLink)}" onclick="this.select()" /></div>`
          : `<p class="muted">كودك: <strong>${esc(x.referralCode)}</strong> — ما عند هالنشاط منتجات بعد لتولّد رابط</p>`}
      </div>`).join("")}
  `;
}

async function loadAffiliateMine() {
  const { ok, data } = await api("GET", "/affiliates/mine");
  const list = ok ? data : [];
  // Build one example shareable link per affiliation using any live product of that merchant —
  // the backend records which product a referral link pointed to, so the link needs a real one.
  await Promise.all(list.map(async (x) => {
    const prodRes = await api("GET", "/products?merchantId=" + x.merchant.id);
    const firstProduct = prodRes.ok && prodRes.data[0];
    if (firstProduct) {
      const url = new URL(location.href);
      url.search = `?product=${firstProduct.id}&ref=${x.referralCode}`;
      x.sampleLink = url.toString();
    }
  }));
  S._affMine = { loading: false, list };
  render();
}

/* ================= MERCHANT DETAIL ================= */

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = tr(message);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function shareMerchant() {
  const m = S._merchantDetail && S._merchantDetail.merchant;
  if (!m) return;
  const url = `${location.origin}${location.pathname}?merchant=${m.id}`;
  if (navigator.share) {
    navigator.share({ title: m.businessName, text: t("place.shareText", { name: m.businessName }), url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => toast(t("place.linkCopied")), () => prompt(t("place.copyLink"), url));
  } else {
    prompt(t("place.copyLink"), url);
  }
}

function hoursTable(m) {
  const hours = m.openingHours || {};
  if (!m.openStatus || !m.openStatus.hasHours) return "";
  // "Today" is the platform's day (Damascus), the same clock the server uses for open/closed.
  const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Damascus" })).getDay()];
  return `
    <div class="section-title">${esc(t("hours.title"))}</div>
    <div class="card hours-table">
      ${DAY_ORDER.map((day) => {
        const ranges = hours[day] || [];
        const text = ranges.length ? ranges.map((r) => (r.open === r.close ? t("hours.allDay") : `${fmtClock(r.open)} – ${fmtClock(r.close)}`)).join(t("hours.sep")) : t("hours.closed");
        return `<div class="hours-line ${day === todayKey ? "today" : ""}"><span>${DAY_LABEL[day]}</span><span class="${ranges.length ? "" : "muted"}">${text}</span></div>`;
      }).join("")}
    </div>`;
}

function screenMerchantDetail() {
  if (!S._merchantDetail || S._merchantDetail.id !== S.params.merchantId) {
    S._merchantDetail = { id: S.params.merchantId, loading: true, tab: "home", q: "", sort: "popular" };
    loadMerchantDetail(S.params.merchantId);
  }
  const m = S._merchantDetail;
  if (m.loading) return `<div class="store">${backRow()}${spinner()}</div>`;
  if (!m.merchant) return `<div class="store">${backRow()}<div class="error-banner">${esc(t("place.notFound"))}</div></div>`;
  const x = m.merchant;
  const hasCoords = x.latitude != null && x.longitude != null;
  const phone = (x.phone || "").trim();
  const wa = (x.whatsapp || "").replace(/\D/g, "");
  const saved = S._discover && S._discover.favIds.includes(x.id);
  const products = m.products || [];
  const avg = x.rating || 0; // the shop's own rating (from the people it delivered to)
  const votes = x.ratingCount || 0;
  const followers = x.followersCount || 0;
  const sold = products.reduce((n, p) => n + (p.soldCount || 0), 0);
  let hue = 0;
  for (const c of String(x.id)) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  const q = (m.q || "").trim().toLowerCase();
  const sorted = [...products].filter((p) => !q || p.name.toLowerCase().includes(q)).sort({
    popular: (p1, p2) => p2.soldCount - p1.soldCount,
    new: () => 0,
    rating: (p1, p2) => p2.rating - p1.rating,
    price_asc: (p1, p2) => p1.priceCents - p2.priceCents,
    price_desc: (p1, p2) => p2.priceCents - p1.priceCents,
  }[m.sort] || (() => 0));
  const deals = products.filter((p) => p.memberDiscountEnabled);
  let body;
  if (m.tab === "reviews") {
    body = `<section class="store-sec rv-sec">
      ${m.reviews ? `${reviewSummary(m.reviews.summary)}
        ${reviewAction("shop", x.id, m.reviews, x.businessName)}
        <div class="rv-list">${reviewList(m.reviews.items)}</div>` : ""}
    </section>`;
  } else if (m.tab === "about") {
    body = `
      <section class="store-sec">
        ${x.bio ? `<p class="place-bio" style="margin-top:0">${esc(x.bio)}</p>` : ""}
        ${x.address ? `<div class="place-row">📍 ${esc(x.address)}</div>` : ""}
        ${phone ? `<div class="place-row">📞 <a href="tel:${esc(phone)}">${esc(phone)}</a></div>` : ""}
        ${(x.branches || []).length ? `<div class="section-title">🏬 ${esc(t("br.shopBranches", { n: x.branches.length + (hasCoords ? 1 : 0) }))}</div>${x.branches.map((b) => `<div class="place-row"><b>${esc(b.name)}</b>${b.city || b.address ? " — " + esc([b.city, b.address].filter(Boolean).join("، ")) : ""}${b.phone ? ` · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ""} · <a href="https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}" target="_blank" rel="noopener">${esc(t("card.directions"))}</a></div>`).join("")}` : ""}
        ${(x.discounts || []).length ? `<div class="section-title">${esc(t("place.discounts"))}</div>${x.discounts.map((d) => customerDiscountCard(d)).join("")}` : ""}
        ${hoursTable(x)}
      </section>`;
  } else if (m.tab === "all") {
    body = `
      <div class="store-bar"><h2>${esc(t("shop.allProducts"))} <small>${sorted.length}</small></h2>
        <select class="store-sort" onchange="S._merchantDetail.sort=this.value;render()">
          ${[["popular", "الأكثر مبيعًا"], ["rating", "الأعلى تقييمًا"], ["price_asc", "السعر: من الأقل"], ["price_desc", "السعر: من الأعلى"]].map(([v, l]) => `<option value="${v}" ${m.sort === v ? "selected" : ""}>${esc(l)}</option>`).join("")}
        </select></div>
      ${sorted.length ? `<div class="store-grid">${sorted.map(storeCard).join("")}</div>` : `<div class="empty">${esc(t("place.noProducts"))}</div>`}`;
  } else {
    body = products.length ? `
      ${deals.length ? storeSection(t("store.deals"), deals, "deals-shop") : ""}
      <section class="store-sec">
        <div class="store-sec-head"><h2>${esc(t("shop.bestInShop"))}</h2><button onclick="S._merchantDetail.tab='all';render()">${esc(t("store.seeAll"))} ›</button></div>
        <div class="store-grid">${[...products].sort((p1, p2) => p2.soldCount - p1.soldCount).slice(0, 10).map(storeCard).join("")}</div>
      </section>` : `<div class="empty">${esc(t("place.noProducts"))}</div>`;
  }
  return `
    <div class="store shop-page">
      <div class="store-head">
        <button class="store-icon-btn" onclick="back()" aria-label="back">›</button>
        <b class="store-brand" style="font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.businessName)}</b>
        <form class="store-search" onsubmit="event.preventDefault();S._merchantDetail.tab='all';S._merchantDetail.q=qs('shop-q').value;render()">
          <input id="shop-q" type="search" value="${esc(m.q || "")}" placeholder="${esc(t("shop.searchIn"))}" />
          <button type="submit" aria-label="search">${ICON.search}</button>
        </form>
        <button class="store-icon-btn store-cart" onclick="storeToCart()" aria-label="cart">${ICON.bag}</button>
      </div>
      <div class="shop-cover" style="--h:${hue}">
        <div class="shop-id">
          ${avatarHtml(x.avatarUrl, x.businessName, "big")}
          <div class="shop-id-text">
            <h1>${esc(x.businessName)} <span class="shop-verified" title="${esc(t("shop.verified"))}">✓</span></h1>
            <p>${esc(catName(x.category))}${x.distanceKm != null ? " · " + x.distanceKm.toFixed(1) + " " + esc(t("unit.km")) : ""}</p>
            <div class="shop-stats">
              ${votes ? `<span><b class="star">★ ${avg.toFixed(1)}</b> (${votes})</span>` : ""}
              <span><b>${storeCount(followers)}</b> ${esc(t("shop.followers"))}</span>
              <span><b>${products.length}</b> ${esc(t("shop.products"))}</span>
              ${sold ? `<span><b>${storeCount(sold)}</b> ${esc(t("shop.sold"))}</span>` : ""}
              ${openBadge(x.openStatus)}
            </div>
          </div>
          <button class="shop-follow ${saved ? "on" : ""}" onclick="followShop('${x.id}')">${saved ? "✓ " + esc(t("place.saved")) : "+ " + esc(t("shop.follow"))}</button>
        </div>
      </div>
      <div class="shop-actions">
        ${phone ? `<a href="tel:${esc(phone)}"><span>📞</span>${esc(t("place.call"))}</a>` : ""}
        ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener"><span>💬</span>${esc(t("place.whatsapp"))}</a>` : ""}
        ${hasCoords ? `<button onclick="startRoute('${x.id}')"><span>🧭</span>${esc(t("place.directions"))}</button>` : ""}
        <button onclick="shareMerchant()"><span>📤</span>${esc(t("place.share"))}</button>
      </div>
      <div class="store-tabs">
        ${[["home", t("shop.tabHome")], ["all", t("shop.tabAll")], ["reviews", t("rv.title") + (votes ? ` (${votes})` : "")], ["about", t("shop.tabAbout")]].map(([id, label]) => `<button class="${m.tab === id ? "on" : ""}" onclick="S._merchantDetail.tab='${id}';render()">${esc(label)}</button>`).join("")}
      </div>
      ${body}
    </div>`;
}

/** Following a shop needs an account (a customer's or a shop's); a visitor is taken to sign in. */
async function followShop(id) {
  if (!S.token) { toast(t("rv.needAccountFollow")); return go("login"); }
  await toggleFav(id);
  if (S._merchantDetail && S._merchantDetail.merchant) {
    const saved = S._discover && S._discover.favIds.includes(id);
    S._merchantDetail.merchant.followersCount = Math.max(0, (S._merchantDetail.merchant.followersCount || 0) + (saved ? 1 : -1));
  }
  render();
}

/* ---- merchant: opening hours editor ---- */

function screenMerchantHours() {
  if (!S._hours) { S._hours = { loading: true }; loadMerchantHours(); }
  const h = S._hours;
  if (h.loading) return backRow() + spinner();
  return `
    ${backRow()}
    <h1 class="screen-title">ساعات العمل</h1>
    <p class="screen-sub">حدّد أيام دوامك وأوقاته — بيظهر للزبائن «مفتوح الآن» أو «مغلق». إذا سكّرت بعد منتصف الليل اكتب وقت إغلاق أصغر من الفتح (مثلًا 18:00 – 02:00).</p>
    ${errorBanner()}
    <div class="row" style="gap:8px;margin-bottom:10px">
      <button class="btn outline" onclick="hoursCopyToAll()">${esc(t("hours.copyAll"))}</button>
      <button class="btn outline" onclick="hoursAlways()">${esc(t("hours.always"))}</button>
    </div>
    ${DAY_ORDER.map((day) => {
      const x = h.days[day];
      return `<div class="card">
        <label class="row" style="gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" style="width:auto" ${x.on ? "checked" : ""} onchange="hoursSet('${day}','on',this.checked)" />
          <strong>${DAY_LABEL[day]}</strong>${x.on ? "" : `<span class="muted">مغلق</span>`}
        </label>
        ${x.on ? `<label class="row" style="gap:8px;align-items:center;cursor:pointer;margin-top:8px"><input type="checkbox" style="width:auto" ${x.open === x.close ? "checked" : ""} onchange="hoursDayAlways('${day}',this.checked)" /><span>${esc(t("hours.day24"))}</span></label>` : ""}
        ${x.on && x.open !== x.close ? `<div class="row" style="gap:8px;margin-top:8px">
          <div class="field" style="flex:1;margin:0"><label>من</label><input type="time" value="${x.open}" onchange="hoursSet('${day}','open',this.value)" /></div>
          <div class="field" style="flex:1;margin:0"><label>إلى</label><input type="time" value="${x.close}" onchange="hoursSet('${day}','close',this.value)" /></div>
        </div>` : ""}
      </div>`;
    }).join("")}
    <button class="btn" onclick="saveMerchantHours()">حفظ ساعات العمل</button>
    ${h.msg ? `<p class="muted" style="text-align:center;margin-top:8px">${esc(h.msg)}</p>` : ""}
  `;
}

async function loadMerchantHours() {
  const { ok, data } = await api("GET", "/merchant/me");
  const stored = (ok && data.openingHours) || {};
  const days = {};
  DAY_ORDER.forEach((day) => {
    const first = (stored[day] || [])[0];
    days[day] = { on: !!first, open: first ? first.open : "09:00", close: first ? first.close : "22:00" };
  });
  S._hours = { loading: false, days, msg: "" };
  render();
}

function hoursSet(day, field, value) {
  S._hours.days[day][field] = value;
  S._hours.msg = "";
  if (field === "on") render(); // every other field is already in state, so nothing typed is lost
}

function hoursCopyToAll() {
  const firstOn = DAY_ORDER.map((d) => S._hours.days[d]).find((x) => x.on);
  if (!firstOn) { S._hours.msg = "فعّل يوم واحد على الأقل أول"; return render(); }
  DAY_ORDER.forEach((d) => { S._hours.days[d] = { on: true, open: firstOn.open, close: firstOn.close }; });
  render();
}

/** Open around the clock, every day (open and close are the same time, which the server reads as 24 hours). */
function hoursAlways() {
  DAY_ORDER.forEach((d) => { S._hours.days[d] = { on: true, open: "00:00", close: "00:00" }; });
  S._hours.msg = "";
  render();
}

function hoursDayAlways(day, on) {
  const x = S._hours.days[day];
  if (on) { x.open = "00:00"; x.close = "00:00"; } else { x.open = "09:00"; x.close = "22:00"; }
  render();
}

async function saveMerchantHours() {
  const openingHours = {};
  DAY_ORDER.forEach((day) => {
    const x = S._hours.days[day];
    if (x.on && x.open && x.close) openingHours[day] = [{ open: x.open, close: x.close }];
  });
  const { ok, data } = await api("PUT", "/merchant/me/hours", { openingHours: Object.keys(openingHours).length ? openingHours : null });
  S.error = null;
  S._hours.msg = ok ? "✅ انحفظت ساعات العمل" : errMsg(data, "تعذّر الحفظ");
  render();
}

function backRow() {
  return `<button class="back-btn" onclick="back()">‹ رجوع</button>`;
}

// Opens the phone's maps app with real turn-by-turn directions — routing is Google Maps' job.
function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadMerchantDetail(id) {
  const [mRes, pRes, rvRes] = await Promise.all([api("GET", "/merchant/" + id), api("GET", "/store/products?limit=60&merchantId=" + id), api("GET", "/reviews/shops/" + id + "?limit=10")]);
  const merchant = mRes.ok ? mRes.data : null;
  const loc = S._discover && S._discover.userLoc;
  // /merchant/:id doesn't compute distance; derive it from the location the map view already asked for.
  if (merchant && loc && merchant.latitude != null && merchant.longitude != null) {
    merchant.distanceKm = haversineKm(loc.lat, loc.lng, merchant.latitude, merchant.longitude);
  }
  S._merchantDetail = { id, loading: false, merchant, products: pRes.ok ? pRes.data.items : [], reviews: rvRes.ok ? rvRes.data : null, tab: "home", q: "", sort: "popular" };
  render();
}

/* ================= PRODUCT DETAIL ================= */

/* ================= STORE: like a marketplace, every shop's products in one place ================= */

const storeSecName = (x) => (x ? (LANG === "ar" ? x.name : x.nameEn || x.name) : "");

function openStore() {
  S._store = null;
  go("store");
}

function storeState() {
  if (!S._store) {
    S._store = { loading: true, q: "", section: "", sort: "popular", home: null, items: [], total: 0, cartCount: 0, more: false, scope: "country", cityId: "", regionId: "", radiusKm: 10, pos: null, geo: null, locError: null, deals: false, scopeOpen: false };
    try { Object.assign(S._store, JSON.parse(localStorage.getItem("dlk_store_scope") || "{}")); } catch (e) {}
    if (S._store.scope === "radius") storeLocate().then(() => storeReload());
    if (S._store.scope === "city") storeLoadGeo();
    loadStoreHome();
    loadStoreCartCount();
  }
  return S._store;
}

/** The place filter as query parameters: the whole country (the default), one governorate/city, or some km around the shopper. */
function storeScopeParams(st, params) {
  if (st.scope === "city" && (st.cityId || st.regionId)) { params.set("scope", "city"); params.set("cityId", st.cityId || st.regionId); }
  else if (st.scope === "radius" && st.pos) { params.set("scope", "radius"); params.set("radiusKm", String(st.radiusKm)); params.set("lat", String(st.pos.lat)); params.set("lng", String(st.pos.lng)); }
  return params;
}

function storeSaveScope() {
  const st = S._store;
  try { localStorage.setItem("dlk_store_scope", JSON.stringify({ scope: st.scope, cityId: st.cityId, regionId: st.regionId, radiusKm: st.radiusKm })); } catch (e) {}
}

function storeReload() {
  const st = S._store;
  if (!st) return;
  loadStoreHome();
  if (st.q || st.section || st.deals) loadStoreList(false);
}

async function storeLocate() {
  const st = S._store;
  st.locError = null;
  try { st.pos = await locateUser(); }
  catch (e) { st.pos = null; st.locError = t("store.needLocation"); }
}

async function storeSetScope(scope) {
  const st = S._store;
  st.scope = scope;
  storeSaveScope();
  if (scope === "city") storeLoadGeo();
  if (scope === "radius" && !st.pos) { render(); await storeLocate(); }
  storeReload();
}

async function storeSetRadius(km) {
  const st = S._store;
  st.radiusKm = km;
  storeSaveScope();
  if (!st.pos) await storeLocate();
  storeReload();
}

/** The governorates of the shopper's country, and the cities of the chosen governorate. */
async function storeLoadGeo() {
  const st = S._store;
  if (!st.geo) st.geo = { regions: [], cities: [], loaded: false };
  const code = st.home ? st.home.country : "SY";
  const countries = await api("GET", "/geo/countries");
  const country = countries.ok ? countries.data.find((c) => c.isoCode2 === code) : null;
  if (country) {
    st.geo.countryName = LANG === "ar" ? country.nameArabic || country.name : country.nameEnglish || country.name;
    const regions = await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "REGION" }));
    if (regions.ok && regions.data.length) st.geo.regions = regions.data;
    else {
      const cities = await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "CITY" }));
      if (cities.ok) st.geo.cities = cities.data;
    }
  }
  if (st.regionId) await storeLoadCities(st.regionId);
  st.geo.loaded = true;
  render();
}

async function storeLoadCities(regionId) {
  const st = S._store;
  st.geo.cities = [];
  if (!regionId) return;
  const { ok, data } = await api("GET", "/geo/units?" + new URLSearchParams({ parentId: regionId, level: "CITY" }));
  if (ok) st.geo.cities = data;
}

async function storePickRegion(id) {
  const st = S._store;
  st.regionId = id;
  st.cityId = "";
  storeSaveScope();
  await storeLoadCities(id);
  storeReload();
}

function storePickCity(id) {
  const st = S._store;
  st.cityId = id;
  storeSaveScope();
  storeReload();
}

/** "Where": one slim line (the place being shown) that opens into the whole country / a city / around me. */
function storeScopeBar(st) {
  const g = st.geo;
  const unit = (x) => (LANG === "ar" ? x.nameArabic || x.name : x.nameEnglish || x.name);
  const countryLabel = st.countryName || (g && g.countryName) || (st.home ? st.home.country : "");
  const chosen = (list, id) => { const u = (list || []).find((x) => x.id === id); return u ? unit(u) : ""; };
  const where = st.scope === "city"
    ? `${countryLabel} · ${chosen(g && g.cities, st.cityId) || chosen(g && g.regions, st.regionId) || t("store.cityScope")}`
    : st.scope === "radius" ? `${t("store.aroundMe")} · ${st.radiusKm} ${t("unit.km")}` : countryLabel;
  const opt = (id, label) => `<button class="${st.scope === id ? "on" : ""}" onclick="storeSetScope('${id}')">${label}</button>`;
  let more = "";
  if (st.scope === "city") {
    more = !g || !g.loaded ? `<span class="muted">…</span>` : `
      ${g.regions.length ? `<select onchange="storePickRegion(this.value)"><option value="">${esc(t("store.allGovernorates"))}</option>${g.regions.map((r) => `<option value="${r.id}" ${st.regionId === r.id ? "selected" : ""}>${esc(unit(r))}</option>`).join("")}</select>` : ""}
      ${g.cities.length ? `<select onchange="storePickCity(this.value)"><option value="">${esc(t("store.allCities"))}</option>${g.cities.map((c) => `<option value="${c.id}" ${st.cityId === c.id ? "selected" : ""}>${esc(unit(c))}</option>`).join("")}</select>` : ""}`;
  } else if (st.scope === "radius") {
    more = [5, 10, 25, 50, 100].map((km) => `<button class="${st.radiusKm === km ? "on" : ""}" onclick="storeSetRadius(${km})">${km} ${esc(t("unit.km"))}</button>`).join("")
      + (st.locError ? `<span class="error-text">${esc(st.locError)}</span>` : "");
  }
  return `
    <div class="store-where">
      <button class="store-where-pill" onclick="storeToggleScope()">📍 ${esc(where)} <span>${st.scopeOpen ? "▴" : "▾"}</span></button>
      ${st.scopeOpen ? `<div class="store-where-panel">
        <div class="store-where-opts">${opt("country", "🌍 " + esc(countryLabel || t("store.country")))}${opt("city", "🏙️ " + esc(t("store.cityScope")))}${opt("radius", "📡 " + esc(t("store.aroundMe")))}</div>
        ${more ? `<div class="store-where-more">${more}</div>` : ""}
      </div>` : ""}
    </div>`;
}

async function loadStoreHome() {
  const [{ ok, data }, banners] = await Promise.all([
    api("GET", "/store/home?" + storeScopeParams(S._store || {}, new URLSearchParams())),
    api("GET", "/store/banners"),
  ]);
  const st = S._store;
  if (!st) return;
  if (banners.ok) st.banners = { list: banners.data.banners, seconds: banners.data.intervalSeconds, idx: 0 };
  st.loading = false;
  st.home = ok ? data : { sections: [], bestSellers: [], deals: [], newest: [] };
  if (ok && data.currency) S.currency = data.currency;
  render();
  if (ok && !st.countryName) {
    const countries = await api("GET", "/geo/countries");
    const c = countries.ok ? countries.data.find((x) => x.isoCode2 === data.country) : null;
    if (c && S._store === st) { st.countryName = LANG === "ar" ? geoName(c) : c.nameEnglish || c.name; render(); }
  }
}

async function loadStoreCartCount() {
  if (!S.token || !S._store) return;
  const { ok, data } = await api("GET", "/cart");
  if (ok && S._store) { S._store.cartCount = data.items.reduce((n, i) => n + i.quantity, 0); render(); }
}

async function loadStoreList(append) {
  const st = S._store;
  st.busy = true;
  if (!append) { st.items = []; st.total = 0; }
  render();
  const params = new URLSearchParams({ sort: st.sort, limit: "24", offset: String(append ? st.items.length : 0) });
  if (st.q) params.set("q", st.q);
  if (st.section) params.set("section", st.section);
  if (st.deals) params.set("deals", "1");
  storeScopeParams(st, params);
  const { ok, data } = await api("GET", "/store/products?" + params);
  st.busy = false;
  if (ok) { st.items = append ? st.items.concat(data.items) : data.items; st.total = data.total; }
  render();
}

/** A photo as a small JPEG (long side at most `max` px), so it travels fast on a weak connection. */
function downscaleImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

/** Sends raw image bytes (not JSON) with the signed-in person's token. */
async function postImage(path, blob) {
  const headers = { "Content-Type": "image/jpeg" };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  try {
    const res = await fetch(path, { method: "POST", headers, body: blob });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: t("photo.offline") } };
  }
}

function storeSearch(ev) {
  if (ev) ev.preventDefault();
  const st = S._store;
  st.byPhoto = null;
  st.q = qs("store-q").value.trim();
  st.deals = false;
  if (!st.q && !st.section) { render(); return; }
  loadStoreList(false);
}

function storePickSection(id) {
  const st = S._store;
  st.section = id;
  st.deals = false;
  if (!id && !st.q) { render(); return; }
  loadStoreList(false);
}

function storeSetSort(v) { S._store.sort = v; loadStoreList(false); }

function storeBack() {
  const st = S._store;
  if (st && (st.q || st.section || st.deals || st.byPhoto)) { st.q = ""; st.section = ""; st.deals = false; st.byPhoto = null; window.scrollTo(0, 0); render(); return; }
  S._store = null;
  back();
}

/** "See all" of a home row: the member deals, the best sellers or the newest, as a full list. */
function storeSeeAll(kind) {
  const st = S._store;
  st.q = ""; st.section = "";
  st.deals = kind === "deals";
  st.sort = kind === "new" ? "new" : "popular";
  loadStoreList(false);
}

function storeToggleScope() {
  S._store.scopeOpen = !S._store.scopeOpen;
  render();
}

function storeToCart() {
  if (!S.token) return go("login");
  S.homeTab = "cart";
  reset("home");
}

async function storeAdd(id, ev) {
  if (ev) ev.stopPropagation();
  if (!S.token) return go("login");
  const { ok, data } = await addToCart(id, 1);
  if (!ok) { S.error = errMsg(data, "تعذّرت إضافة المنتج للسلة"); render(); return; }
  S._cart = null;
  S.error = null;
  const st = S._store;
  if (st) { st.cartCount += 1; st.justAdded = id; render(); setTimeout(() => { if (S._store === st && st.justAdded === id) { st.justAdded = null; render(); } }, 1600); }
  else toast(t("store.addedToCart"));
}

/** The product picture: its photo when it has one, otherwise a soft tile with its icon (the shops' own photos replace it). */
function storePic(p) {
  if (p.imageUrl) return `<div class="store-pic"><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" /></div>`;
  return `<div class="store-pic" style="--h:${Number(p.hue) || 0}"><span class="store-emoji">${esc(p.icon || "🛍️")}</span></div>`;
}

/** The member discount in percent (0 when there is none). */
function storeOff(p) {
  return p.memberDiscountEnabled && p.priceCents > 0 ? Math.round((1 - p.memberPriceCents / p.priceCents) * 100) : 0;
}

/* ---------------- the big rotating banners ---------------- */

/** The slides: the Dalilacom brand slide first (moving), then the admin's banners (or the deals invitation while there are none). */
function storeSlideList(st, home) {
  const list = st.banners && st.banners.list ? st.banners.list : [];
  const rest = list.length ? list : [{ fallback: true, bg: "coral", title: t("store.heroBig"), subtitle: t("store.heroUpTo", { n: Math.max(0, ...home.deals.map(storeOff)) }), buttonText: t("store.shopNow"), target: { type: "deals" } }];
  return [{ brand: true }, ...rest, ...(list.length < 3 ? [{ invite: true }] : [])];
}

function storeSlider(st, home) {
  const list = storeSlideList(st, home);
  st.slides = list;
  const idx = Math.min(st.slideIdx || 0, list.length - 1);
  return `
    <div class="store-slider" id="store-slider">
      ${list.map((b, i) => b.invite ? `
        <button class="store-slide invite-slide ${i === idx ? "on" : ""}" onclick="storeBannerGo(${i})">
          <span class="bs-orb o1"></span><span class="bs-orb o2"></span>
          <span class="bs-logo"><img src="${logoSrc("vertical", "white")}" alt="" aria-hidden="true" /></span>
          <span class="bs-text">
            <h1>${esc(t("ads.inviteT"))}<br><em>${esc(t("ads.inviteS"))}</em></h1>
            <span class="btn-pill">${esc(t("ads.bookBanner"))}</span>
          </span>
        </button>` : b.brand ? `
        <button class="store-slide brand-slide ${i === idx ? "on" : ""}" onclick="storeBannerGo(${i})" aria-label="DALILACOM">
          <span class="bs-orb o1"></span><span class="bs-orb o2"></span><span class="bs-orb o3"></span>
          <span class="bs-logo"><img src="${logoSrc("vertical", "white")}" alt="DALILACOM" /></span>
          <span class="bs-text">
            <h1>${esc(t("store.brandTag1"))}<br><em>${esc(t("store.brandTag2"))}</em></h1>
            <span class="btn-pill">${esc(t("store.shopNow"))}</span>
          </span>
        </button>` : `
        <button class="store-slide bg-${esc(b.bg)} ${b.imageUrl ? "has-img" : ""} ${i === idx ? "on" : ""}" ${b.imageUrl ? `style="background-image:url('${esc(b.imageUrl)}')"` : ""} onclick="storeBannerGo(${i})">
          <span class="store-slide-text">
            <h1>${esc(b.title)}</h1>
            ${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ""}
            ${b.buttonText ? `<span class="btn-pill">${esc(b.buttonText)}</span>` : ""}
          </span>
        </button>`).join("")}
      ${list.length > 1 ? `
        <button class="store-slide-arrow prev" onclick="storeBannerStep(-1)" aria-label="prev">›</button>
        <button class="store-slide-arrow next" onclick="storeBannerStep(1)" aria-label="next">‹</button>
        <div class="store-dots">${list.map((_, i) => `<i class="${i === idx ? "on" : ""}" onclick="storeBannerShow(${i})"></i>`).join("")}</div>` : ""}
    </div>`;
}

/** Moves to another slide without redrawing the page (so a tap in progress, or a scroll, is not disturbed). */
function storeBannerShow(i) {
  const st = S._store;
  if (!st || !st.slides) return;
  const n = st.slides.length;
  st.slideIdx = ((i % n) + n) % n;
  document.querySelectorAll("#store-slider .store-slide").forEach((el, k) => el.classList.toggle("on", k === st.slideIdx));
  document.querySelectorAll("#store-slider .store-dots i").forEach((el, k) => el.classList.toggle("on", k === st.slideIdx));
  storeSliderRestart();
}

function storeBannerStep(d) { storeBannerShow(((S._store && S._store.slideIdx) || 0) + d); }

/** The slides change by themselves, as often as the admin set; the timer lives only while the store is on screen. */
function storeSliderRestart() {
  if (S._sliderTimer) { clearInterval(S._sliderTimer); S._sliderTimer = null; }
  const st = S._store;
  if (S.screen !== "store" || !st || !st.slides || st.slides.length < 2) return;
  S._sliderTimer = setInterval(() => {
    if (S.screen !== "store" || !S._store || !document.getElementById("store-slider")) { clearInterval(S._sliderTimer); S._sliderTimer = null; return; }
    const cur = S._store;
    cur.slideIdx = ((cur.slideIdx || 0) + 1) % cur.slides.length;
    document.querySelectorAll("#store-slider .store-slide").forEach((el, k) => el.classList.toggle("on", k === cur.slideIdx));
    document.querySelectorAll("#store-slider .store-dots i").forEach((el, k) => el.classList.toggle("on", k === cur.slideIdx));
  }, Math.max(2, Number(st.banners && st.banners.seconds) || 5) * 1000);
}

function storeBannerGo(i) {
  const b = S._store.slides && S._store.slides[i];
  if (!b) return;
  if (b.brand) { storeSeeAll("deals"); return; }
  if (b.invite) { openAdBooking("banner"); return; }
  if (b.id) api("POST", "/store/banners/" + b.id + "/click");
  const { type, value } = b.target || {};
  if (type === "product" && value) go("productDetail", { productId: value });
  else if (type === "section" && value) storePickSection(value);
  else if (type === "shop" && value) go("merchantDetail", { merchantId: value });
  else if (type === "deals") storeSeeAll("deals");
  else if (type === "url" && /^https:\/\//.test(value || "")) window.open(value, "_blank", "noopener");
}

/* ---------------- the advertising spaces beside the banner ---------------- */

/** A space nobody holds yet: a Dalilacom tile that invites people to advertise there, so no space is ever empty. */
function storeSlotPh(i) {
  const v = i % 3;
  return `
    <div class="store-slot is-ph ph-${v}" role="button" tabindex="0" onclick="openAdBooking('space')">
      <div class="ph-body">
        <img class="ph-logo" src="${logoSrc("vertical", "white")}" alt="" aria-hidden="true" />
        <span class="ph-text"><b>${esc(t("ads.ph" + v + "t"))}</b><small>${esc(t("ads.ph" + v + "s"))}</small></span>
        <span class="ph-cta">${esc(t("ads.phCta"))}</span>
      </div>
    </div>`;
}

/** Always six spaces: the held ones first, the rest are the invitation tiles. */
function storeSlotsHtml(home, from, to) {
  const list = home.slots || [];
  const out = [];
  for (let i = from; i < to; i++) out.push(list[i] ? storeSlot(list[i]) : storeSlotPh(i));
  return out.join("");
}

/** One space: a shop's paid product (marked as an ad) or, while nobody rented it, a best seller with an invitation to advertise. */
function storeSlot(sl) {
  const p = sl.product;
  const off = storeOff(p);
  return `
    <div class="store-slot ${sl.ad ? "is-ad" : ""}" role="button" tabindex="0" onclick="storeSlotOpen('${sl.adId || ""}','${p.id}')">
      ${sl.creativeUrl ? `<div class="store-pic"><img src="${esc(sl.creativeUrl)}" alt="" loading="lazy"></div>` : storePic(p)}
      ${sl.ad ? `<span class="store-slot-tag">${esc(t("ads.tag"))}</span>` : `<span class="store-slot-here" onclick="event.stopPropagation();openAdBooking()">📢 ${esc(t("ads.here"))}</span>`}
      <span class="store-slot-info">
        <b>${fmt(p.memberDiscountEnabled ? p.memberPriceCents : p.priceCents)}</b>
        ${off ? `<em>-${off}%</em>` : ""}
        <small>${esc(p.name)}</small>
      </span>
      <button class="store-bag" onclick="storeAdd('${p.id}', event)" aria-label="${esc(t("store.add"))}">${ICON.bag}</button>
    </div>`;
}

function storeSlotOpen(adId, productId) {
  if (adId) api("POST", "/ads/" + adId + "/click");
  go("productDetail", { productId });
}

/* ---------------- renting a space (shops) ---------------- */

function openAdBooking(kind) {
  if (!S.token) return go("login");
  S._adBook = null;
  S._adKind = kind === "banner" ? "banner" : "space";
  go("adBook");
}

/** The calendar of the store's advertising spaces: green = free, yellow = nearly full, red = full; grey = the chosen length does not fit. */
function adCalendarHtml(a) {
  if (!a.avail) return `<p class="muted">${esc(t("ads.cal.loading"))}</p>`;
  const first = new Date(a.avail[0].date + "T00:00:00Z");
  const weekStart = LANG === "ar" ? 6 : 0; // Saturday for Arabic, Sunday otherwise
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const names = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + ((weekStart + i) % 7))).toLocaleDateString(LANG, { weekday: "narrow", timeZone: "UTC" }));
  const sel = a.start ? String(a.start).slice(0, 10) : a.avail[0].date;
  const cells = a.avail.map((d, i) => {
    const day = new Date(d.date + "T00:00:00Z");
    const cls = d.free === 0 ? "full" : d.free <= 2 ? "few" : "ok";
    const month = day.getUTCDate() === 1 || i === 0 ? `<em>${esc(day.toLocaleDateString(LANG, { month: "short", timeZone: "UTC" }))}</em>` : "";
    return `<button class="cal-day ${cls} ${d.canStart ? "" : "blocked"} ${sel === d.date ? "sel" : ""}" ${d.canStart ? "" : "disabled"} title="${esc(t("ads.cal.free", { n: d.free }))}" onclick="adPickDay('${d.date}')">${month}<b>${day.getUTCDate()}</b></button>`;
  });
  return `<div class="cal">
    <div class="cal-head">${names.map((n) => `<span>${esc(n)}</span>`).join("")}</div>
    <div class="cal-grid">${'<span></span>'.repeat(lead)}${cells.join("")}</div>
    <div class="cal-legend"><span><i class="ok"></i>${esc(t("ads.cal.ok"))}</span><span><i class="few"></i>${esc(t("ads.cal.few"))}</span><span><i class="full"></i>${esc(t("ads.cal.full"))}</span><span><i class="blocked"></i>${esc(t("ads.cal.blocked"))}</span></div>
  </div>`;
}

function adPickDay(date) {
  const a = S._adBook;
  a.start = date === a.avail[0].date ? "" : date; // today means "now"
  a.error = null;
  render();
}

async function loadAdAvail() {
  const a = S._adBook;
  if (!a || S.role !== "MERCHANT" || !a.days) return;
  const days = a.days;
  const { ok, data } = await api("GET", "/ads/availability?days=" + days);
  if (S._adBook === a && a.days === days) { a.avail = ok ? data.days : null; render(); }
}

function screenAdBook() {
  if (!S._adBook) { S._adBook = { loading: true, productId: "", days: 0, start: "" }; loadAdBook(); }
  const a = S._adBook;
  if (a.loading) return `${backRow()}${spinner()}`;
  a.kind = a.kind || S._adKind || "space";
  if (S.role === "MERCHANT" && !a.done) {
    const seg = `<div class="wiz-seg" style="margin:6px 0 14px">
      <button class="${a.kind === "space" ? "on" : ""}" onclick="S._adBook.kind='space';S._adBook.error=null;render()">${esc(t("ads.kindSpace"))}</button>
      <button class="${a.kind === "banner" ? "on" : ""}" onclick="S._adBook.kind='banner';S._adBook.error=null;render()">${esc(t("ads.kindBanner"))}</button></div>`;
    if (a.kind === "banner") return `${backRow()}<h1 class="screen-title">${esc(t("ads.bookTitle"))}</h1>${seg}${screenBannerBooking(a)}`;
    a.seg = seg;
  }
  if (S.role !== "MERCHANT") {
    return `${backRow()}
      <h1 class="screen-title">${esc(t("ads.bookTitle"))}</h1>
      <p class="screen-sub">${esc(t("ads.needShop"))}</p>
      <button class="btn" style="max-width:260px" onclick="go('merchantRegister')">${esc(t("profile.registerMerchant"))}</button>`;
  }
  if (a.done) {
    return `${backRow()}
      <div class="success-banner" style="margin-top:12px">${esc(a.done.autoApprove ? t("ads.doneLive") : t("ads.doneWaiting"))}</div>${a.imageProblem ? `<div class="error-banner" style="margin-top:8px">${esc(t("ads.imgLater"))}</div>` : ""}
      <div style="height:14px"></div>
      <button class="btn" style="max-width:260px" onclick="S._myAds=null;back();go('myAds')">${esc(t("profile.myAds"))}</button>`;
  }
  const pk = a.packages || [];
  const chosen = pk.find((p) => p.days === a.days);
  const enough = chosen ? a.balance >= chosen.credits : true;
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(t("ads.bookTitle"))}</h1>
    ${a.seg || ""}
    <p class="screen-sub">${esc(t("ads.bookSub"))}</p>
    ${!a.products.length ? `<div class="error-banner">${esc(t("ads.noProducts"))}</div>` : `
    <div class="field"><label>${esc(t("ads.pickProduct"))}</label>
      <select onchange="S._adBook.productId=this.value;render()">
        <option value="">—</option>
        ${a.products.map((p) => `<option value="${p.id}" ${a.productId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
      </select></div>
    <div class="field"><label>${esc(t("ads.pickDays"))}</label>
      <div class="ad-packs">${pk.map((p) => `
        <button class="ad-pack ${a.days === p.days ? "on" : ""}" onclick="S._adBook.days=${p.days};S._adBook.avail=null;loadAdAvail();render()">
          <b>${esc(t("ads.daysN", { n: p.days }))}</b><span>${p.credits} ${esc(a.creditName)}</span>
        </button>`).join("")}</div></div>
    <div class="field"><label>${esc(t("ads.pickStart"))}</label>${adCalendarHtml(a)}</div>
    ${adImageHtml("space")}
    <div class="card" style="margin-top:6px">
      <div class="list-row"><span>${esc(t("ads.yourBalance"))}</span><span class="price">${a.balance} ${esc(a.creditName)}</span></div>
      ${chosen ? `<div class="list-row"><span>${esc(t("ads.price"))}</span><span class="price" style="color:var(--primary)">${chosen.credits} ${esc(a.creditName)}</span></div>` : ""}
      ${!a.autoApprove ? `<p class="muted" style="margin:8px 0 0">${esc(t("ads.reviewNote"))}</p>` : ""}
    </div>
    ${a.error ? `<div class="error-banner">${esc(a.error)}</div>` : ""}
    ${a.nextAvailable ? `<button class="btn outline" style="margin-top:8px" onclick="S._adBook.start='${esc(a.nextAvailable)}';S._adBook.nextAvailable=null;S._adBook.error=null;render()">${esc(t("ads.useNext", { when: new Date(a.nextAvailable).toLocaleString(LANG, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }))}</button>` : ""}
    ${!enough ? `<button class="btn outline" style="margin-top:8px" onclick="go('wallet')">${esc(t("ads.topUp"))}</button>` : ""}
    <div style="height:12px"></div>
    <button class="btn" ${!a.productId || !a.days || a.busy || !enough ? "disabled" : ""} onclick="submitAdBooking()">${esc(a.busy ? t("ads.booking") : t("ads.book"))}</button>`}`;
}

/* ---------------- the picture of an ad booking: the exact size is written, and the photo is cut to it here ---------------- */

const AD_SIZES = { banner: [1600, 600], space: [800, 500] }; // the server tells the same sizes in /ads/packages
function adSize(kind) { const s = (S._adBook && S._adBook.sizes) || null; return s && s[kind] ? [s[kind].width, s[kind].height] : AD_SIZES[kind]; }
S._adImg = S._adImg || {};

/** The photo brought to exactly w x h: "fill" cuts the edges and keeps the middle, "whole" keeps all of it on a plain background. */
function fitAdPhoto(file, w, h, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        const cover = Math.max(w / img.width, h / img.height);
        if (mode === "whole") {
          // the photo whole, centred; the edges are filled with a soft copy of itself so no empty bars show
          ctx.filter = "blur(24px)";
          ctx.drawImage(img, (w - img.width * cover) / 2, (h - img.height * cover) / 2, img.width * cover, img.height * cover);
          ctx.filter = "none";
          const fit = Math.min(w / img.width, h / img.height);
          ctx.drawImage(img, (w - img.width * fit) / 2, (h - img.height * fit) / 2, img.width * fit, img.height * fit);
        } else {
          ctx.drawImage(img, (w - img.width * cover) / 2, (h - img.height * cover) / 2, img.width * cover, img.height * cover);
        }
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.86);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function adImageRebuild(kind) {
  const im = S._adImg[kind];
  if (!im || !im.file) return;
  const [w, h] = adSize(kind);
  try {
    const blob = await fitAdPhoto(im.file, w, h, im.mode);
    if (im.url) URL.revokeObjectURL(im.url);
    im.blob = blob; im.url = URL.createObjectURL(blob); im.error = "";
  } catch (e) { im.error = t("ads.imgReadFail"); }
  render();
}
function adImagePicked(kind, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  S._adImg[kind] = { file, mode: "fill", blob: null, url: "", error: "" };
  adImageRebuild(kind);
}
function adImageMode(kind, mode) { if (S._adImg[kind]) { S._adImg[kind].mode = mode; adImageRebuild(kind); } }
function adImageClear(kind) { if (S._adImg[kind] && S._adImg[kind].url) URL.revokeObjectURL(S._adImg[kind].url); S._adImg[kind] = null; render(); }

/** The picture part of a booking form: the written size, the picker, and the preview as the store will show it. */
function adImageHtml(kind) {
  const [w, h] = adSize(kind);
  const im = S._adImg[kind];
  return `<div class="field ad-image"><label>${esc(t("ads.imgLabel"))}</label>
    <p class="muted" style="margin:0 0 6px">${esc(t("ads.imgSize", { w, h }))} ${esc(t("ads.imgAuto"))}</p>
    <input type="file" accept="image/*" onchange="adImagePicked('${kind}', this)">
    ${im && im.error ? `<div class="error-banner" style="margin-top:6px">${esc(im.error)}</div>` : ""}
    ${im && im.url ? `<div class="ad-preview" style="aspect-ratio:${w} / ${h}"><img src="${esc(im.url)}" alt=""></div>
      <div class="chips-row" style="margin-top:6px">
        <button class="chip ${im.mode === "fill" ? "active" : ""}" onclick="adImageMode('${kind}','fill')">${esc(t("ads.imgFill"))}</button>
        <button class="chip ${im.mode === "whole" ? "active" : ""}" onclick="adImageMode('${kind}','whole')">${esc(t("ads.imgWhole"))}</button>
        <button class="chip" onclick="adImageClear('${kind}')">✕ ${esc(t("ads.imgRemove"))}</button>
      </div>` : ""}
  </div>`;
}

/** Sends the prepared picture of a booking (raw JPEG). Returns an error text, or "" when it went (or there was none). */
async function adImageUpload(kind, bookingId) {
  const im = S._adImg[kind];
  if (!im || !im.blob) return "";
  const path = kind === "banner" ? "/ads/banners/" + bookingId + "/image" : "/ads/" + bookingId + "/image";
  try {
    const res = await fetch(API_BASE + path, { method: "PUT", headers: { "Content-Type": "image/jpeg", "Accept-Language": LANG, Authorization: "Bearer " + S.token }, body: im.blob });
    if (!res.ok) return errMsg(await res.json().catch(() => ({})), t("ads.imgUploadFail"));
  } catch (e) { return t("ads.imgUploadFail"); }
  adImageClear(kind);
  return "";
}

/** From "my ads": add or change the picture of a booking that is still waiting. */
function adImageAddOpen(kind, id) { S._adImg[kind] = null; S._adImgFor = { kind, id, busy: false, error: "" }; render(); }
function adImageAddClose() { S._adImgFor = null; render(); }
async function adImageAddSend() {
  const f = S._adImgFor;
  if (!f || f.busy) return;
  const im = S._adImg[f.kind];
  if (!im || !im.blob) { f.error = t("ads.imgPick"); return render(); }
  f.busy = true; f.error = ""; render();
  const err = await adImageUpload(f.kind, f.id);
  f.busy = false;
  if (err) { f.error = err; return render(); }
  S._adImgFor = null;
  loadMyAds();
}
function adImageAddHtml() {
  const f = S._adImgFor;
  if (!f) return "";
  S._adBook = S._adBook || {};
  return `<div class="deals-intro" onclick="adImageAddClose()">
    <div class="deals-box lm-card" onclick="event.stopPropagation()" style="max-height:88vh;overflow:auto">
      <h3>${esc(t("ads.imgAddTitle"))}</h3>
      ${f.error ? `<p class="error-banner">${esc(f.error)}</p>` : ""}
      ${adImageHtml(f.kind)}
      <div class="lm-actions"><button class="btn" ${f.busy ? "disabled" : ""} onclick="adImageAddSend()">${esc(t("ads.imgSend"))}</button><button class="btn ghost" onclick="adImageAddClose()">${esc(t("follow.close"))}</button></div>
    </div>
  </div>`;
}

/** A big banner: choose the length, leave a number, pay; the team calls to agree what the banner says. */
function screenBannerBooking(a) {
  const pk = a.bannerPackages || [];
  const chosen = pk.find((p) => p.days === a.bannerDays);
  const enough = chosen ? a.balance >= chosen.credits : true;
  const starts = [["", t("ads.startNow")]];
  for (let d = 1; d <= 14; d++) {
    const dt = new Date(); dt.setDate(dt.getDate() + d); dt.setHours(0, 0, 0, 0);
    starts.push([dt.toISOString(), d === 1 ? t("ads.tomorrow") : dt.toLocaleDateString(LANG, { weekday: "long", day: "numeric", month: "short" })]);
  }
  if (a.bannerDone) {
    return `<div class="success-banner">${esc(t("ads.bannerDone"))}</div>${a.imageProblem ? `<div class="error-banner" style="margin-top:8px">${esc(t("ads.imgLater"))}</div>` : ""}<div style="height:14px"></div>
      <button class="btn" style="max-width:260px" onclick="S._myAds=null;back();go('myAds')">${esc(t("profile.myAds"))}</button>`;
  }
  if (!pk.length) return `<div class="error-banner">${esc(t("ads.noBannerPacks"))}</div>`;
  return `
    <p class="screen-sub">${esc(t("ads.bannerSub"))}</p>
    <div class="field"><label>${esc(t("ads.pickDays"))}</label>
      <div class="ad-packs">${pk.map((p) => `
        <button class="ad-pack ${a.bannerDays === p.days ? "on" : ""}" onclick="S._adBook.bannerDays=${p.days};render()">
          <b>${esc(t("ads.daysN", { n: p.days }))}</b><span>${p.credits} ${esc(a.creditName)}</span>
        </button>`).join("")}</div></div>
    <div class="field"><label>${esc(t("ads.pickStart"))}</label>
      <select onchange="S._adBook.bannerStart=this.value">${starts.map(([v, l]) => `<option value="${esc(v)}" ${a.bannerStart === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
    <div class="field"><label>${esc(t("ads.phone"))} *</label>
      <input type="tel" inputmode="tel" value="${esc(a.phone || "")}" oninput="S._adBook.phone=this.value" placeholder="+963 9xx xxx xxx"></div>
    <div class="field"><label>${esc(t("ads.whatsapp"))}</label>
      <input type="tel" inputmode="tel" value="${esc(a.whatsapp || "")}" oninput="S._adBook.whatsapp=this.value" placeholder="+963 9xx xxx xxx"></div>
    ${adImageHtml("banner")}
    <div class="field"><label>${esc(t("ads.note"))}</label>
      <textarea rows="3" maxlength="600" oninput="S._adBook.note=this.value" placeholder="${esc(t("ads.notePh"))}">${esc(a.note || "")}</textarea></div>
    <div class="card" style="margin-top:6px">
      <div class="list-row"><span>${esc(t("ads.yourBalance"))}</span><span class="price">${a.balance} ${esc(a.creditName)}</span></div>
      ${chosen ? `<div class="list-row"><span>${esc(t("ads.price"))}</span><span class="price" style="color:var(--primary)">${chosen.credits} ${esc(a.creditName)}</span></div>` : ""}
      <p class="muted" style="margin:8px 0 0">${esc(t("ads.bannerNote"))}</p>
    </div>
    ${a.error ? `<div class="error-banner">${esc(a.error)}</div>` : ""}
    ${!enough ? `<button class="btn outline" style="margin-top:8px" onclick="go('wallet')">${esc(t("ads.topUp"))}</button>` : ""}
    <div style="height:12px"></div>
    <button class="btn" ${!a.bannerDays || !(a.phone || "").trim() || a.busy || !enough ? "disabled" : ""} onclick="submitBannerBooking()">${esc(a.busy ? t("ads.booking") : t("ads.bookBannerSend"))}</button>`;
}

async function submitBannerBooking() {
  const a = S._adBook;
  a.busy = true; a.error = null; render();
  const body = { days: a.bannerDays, phone: a.phone.trim() };
  if (a.bannerStart) body.start = a.bannerStart;
  if ((a.whatsapp || "").trim()) body.whatsapp = a.whatsapp.trim();
  if ((a.note || "").trim()) body.note = a.note.trim();
  const { ok, data } = await api("POST", "/ads/banners", body);
  a.busy = false;
  if (ok) {
    a.bannerDone = true;
    const problem = await adImageUpload("banner", data.id);
    if (problem) a.imageProblem = problem;
  } else a.error = errMsg(data, t("ads.failed"));
  render();
}

async function loadAdBook() {
  const [pk, mine, me] = await Promise.all([api("GET", "/ads/packages"), S.role === "MERCHANT" ? api("GET", "/products/mine") : Promise.resolve({ ok: true, data: [] }), S.role === "MERCHANT" ? api("GET", "/merchant/me") : Promise.resolve({ ok: false })]);
  const a = S._adBook;
  if (!a) return;
  a.loading = false;
  a.packages = pk.ok ? pk.data.packages : [];
  a.creditName = pk.ok ? pk.data.creditName : "";
  a.balance = pk.ok ? pk.data.balance || 0 : 0;
  a.autoApprove = pk.ok ? pk.data.autoApprove : false;
  a.bannerPackages = pk.ok ? pk.data.bannerPackages || [] : [];
  if (pk.ok && pk.data.sizes) a.sizes = pk.data.sizes;
  if (a.bannerPackages.length) a.bannerDays = a.bannerPackages[0].days;
  if (me.ok) { a.phone = me.data.phone || ""; a.whatsapp = me.data.whatsapp || ""; }
  a.products = mine.ok ? mine.data.filter((p) => p.isActive && p.stock > 0) : [];
  if (a.packages.length) a.days = a.packages[0].days;
  render();
  loadAdAvail();
}

async function submitAdBooking() {
  const a = S._adBook;
  a.busy = true; a.error = null; a.nextAvailable = null;
  render();
  const body = { productId: a.productId, days: a.days };
  if (a.start) body.start = a.start;
  const { ok, data } = await api("POST", "/ads", body);
  a.busy = false;
  if (ok) {
    a.done = { autoApprove: data.status === "ACTIVE" };
    const hadPicture = !!(S._adImg.space && S._adImg.space.blob);
    const problem = await adImageUpload("space", data.id);
    if (problem) a.imageProblem = problem;
    else if (hadPicture) a.done.autoApprove = false; // a picture sent with it waits to be looked at, even when the booking was approved by itself
  }
  else {
    a.error = errMsg(data, t("ads.failed"));
    if (data && data.error && data.error.details && data.error.details.nextAvailable) a.nextAvailable = data.error.details.nextAvailable;
  }
  render();
}

function screenMyAds() {
  if (!S._myAds) { S._myAds = { loading: true }; loadMyAds(); }
  const m = S._myAds;
  if (m.loading) return `${backRow()}<h1 class="screen-title">${esc(t("profile.myAds"))}</h1>${spinner()}`;
  const day = (d) => new Date(d).toLocaleDateString(LANG, { day: "numeric", month: "short" });
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(t("profile.myAds"))}</h1>
    <button class="btn" style="max-width:260px;margin-bottom:12px" onclick="openAdBooking()">📢 ${esc(t("ads.bookCta"))}</button>
    ${errorBanner()}
    ${(m.banners || []).length ? `<div class="section-title">${esc(t("ads.myBanners"))}</div>${m.banners.map((b) => `
      <div class="card">
        <div class="title-line"><strong>${esc(t("ads.daysN", { n: b.days }))}</strong><span class="badge ${b.status === "SCHEDULED" ? "success" : b.status === "PENDING" || b.status === "CONTACTED" ? "warning" : "neutral"}">${esc(t("ads.bb." + b.status))}</span></div>
        <p class="muted">${new Date(b.requestedStart).toLocaleDateString(LANG, { day: "numeric", month: "short" })} · ${b.credits} · ${esc(b.phone)}</p>
        ${b.rejectionReason ? `<p class="muted">${esc(b.rejectionReason)}</p>` : ""}
        ${b.status === "PENDING" || b.status === "CONTACTED" ? `<button class="btn outline small" style="width:auto" onclick="adImageAddOpen('banner','${b.id}')">🖼️ ${esc(t(b.hasImage ? "ads.imgChange" : "ads.imgAdd"))}</button> ` : ""}${b.hasImage ? `<span class="muted">✓ ${esc(t("ads.imgSent"))}</span> ` : ""}
        ${b.status === "PENDING" ? `<button class="btn outline small" style="width:auto" onclick="cancelMyBanner('${b.id}')">${esc(t("ads.cancel"))}</button>` : ""}
      </div>`).join("")}<div class="section-title">${esc(t("ads.mySpaces"))}</div>` : ""}
    ${m.list.length === 0 ? `<div class="empty-state">${esc(t("ads.none"))}</div>` : m.list.map((a) => `
      <div class="card">
        <div class="title-line"><strong>${esc(a.product.name)}</strong><span class="badge ${a.state === "LIVE" ? "success" : a.state === "PENDING" || a.state === "SCHEDULED" ? "warning" : "neutral"}">${esc(t("ads.state." + a.state))}</span></div>
        <p class="muted">${esc(t("ads.daysN", { n: a.days }))} · ${day(a.startsAt)} → ${day(a.endsAt)} · ${a.credits}</p>
        <p class="muted">👁 ${a.impressions} · 👆 ${a.clicks}</p>
        ${a.rejectionReason ? `<p class="muted">${esc(a.rejectionReason)}</p>` : ""}
        ${a.state === "PENDING" ? `<button class="btn outline small" style="width:auto" onclick="adImageAddOpen('space','${a.id}')">🖼️ ${esc(t(a.hasImage ? "ads.imgChange" : "ads.imgAdd"))}</button> ` : ""}${a.hasImage ? `<span class="muted">✓ ${esc(t("ads.imgSent"))}</span> ` : ""}
        ${a.state === "PENDING" ? `<button class="btn outline small" style="width:auto" onclick="cancelMyAd('${a.id}')">${esc(t("ads.cancel"))}</button>` : ""}
      </div>`).join("")}`;
}

async function loadMyAds() {
  const [{ ok, data }, banners] = await Promise.all([api("GET", "/ads/mine"), api("GET", "/ads/banners/mine")]);
  S._myAds = { loading: false, list: ok ? data : [], banners: banners.ok ? banners.data : [] };
  render();
}

async function cancelMyBanner(id) {
  if (!confirm(t("ads.cancelConfirm"))) return;
  const { ok, data } = await api("POST", "/ads/banners/" + id + "/cancel");
  if (!ok) S.error = errMsg(data, t("ads.failed"));
  loadMyAds();
}

async function cancelMyAd(id) {
  if (!confirm(t("ads.cancelConfirm"))) return;
  const { ok, data } = await api("POST", "/ads/" + id + "/cancel");
  if (!ok) S.error = errMsg(data, t("ads.failed"));
  loadMyAds();
}

/* ---------------- a product from a photo (for shops that are not used to typing) ---------------- */

function openProductWizard() {
  S._pcat = null; S._wiz = { step: "photos", photos: [], specs: [], stock: "", condition: "NEW", section: "", categoryId: "", name: "", description: "", price: "", alternatives: [], busy: false, error: null };
  go("productWizard");
  if (!S._wizSections) api("GET", "/store/sections?all=1").then((r) => { if (r.ok) { S._wizSections = r.data; render(); } });
}

const voiceOk = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** Fills a field by voice: tap the microphone, say it, and the words are added. */
function wizVoice(field) {
  const w = S._wiz;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return;
  if (S._rec) { try { S._rec.stop(); } catch (e) {} S._rec = null; w.listening = null; render(); return; }
  const rec = new Rec();
  rec.lang = LANG === "ar" ? "ar-SY" : "en-US";
  rec.interimResults = false;
  rec.onresult = (e) => {
    const said = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
    if (said) w[field] = ((w[field] || "") + " " + said).trim();
  };
  rec.onend = () => { S._rec = null; w.listening = null; render(); };
  rec.onerror = () => { S._rec = null; w.listening = null; render(); };
  S._rec = rec;
  w.listening = field;
  rec.start();
  render();
}

function screenProductWizard() {
  if (!S._wiz) openProductWizard();
  const w = S._wiz;
  if (S.role !== "MERCHANT") return `${backRow()}<div class="error-banner">${esc(t("ads.needShop"))}</div>`;
  const stepNo = { photos: 1, analyzing: 2, form: 3, done: 3 }[w.step];
  const head = `${backRow()}<div class="wiz-steps">${[1, 2, 3].map((n) => `<i class="${n <= stepNo ? "on" : ""}"></i>`).join("")}</div>`;

  if (w.step === "photos") {
    return `${head}
      <h1 class="screen-title">${esc(t("wiz.photoTitle"))}</h1>
      <p class="screen-sub">${esc(t("wiz.photoSub"))}</p>
      <div class="info-banner">${esc(t("photo.rules"))}</div>
      <div class="wiz-photos">
        ${w.photos.map((p, i) => `<div class="wiz-photo"><img src="${esc(p.preview)}" alt=""><button onclick="wizRemovePhoto(${i})" aria-label="x">✕</button>${i === 0 ? `<span>${esc(t("wiz.mainPhoto"))}</span>` : ""}</div>`).join("")}
        ${w.photos.length < 4 ? `<label class="wiz-add"><input type="file" accept="image/*" multiple onchange="wizPickFiles(this)" hidden><b>🖼️</b><span>${esc(t("wiz.pickPhoto"))}</span></label>` : ""}
      </div>
      ${w.uploading ? `<p class="muted" style="text-align:center">${esc(t("wiz.uploading"))}</p>` : ""}
      ${w.error ? `<div class="error-banner">${esc(w.error)}</div>` : ""}
      <button class="btn wiz-go" ${w.photos.length === 0 || w.uploading ? "disabled" : ""} onclick="wizAnalyze()">${esc(t("wiz.next"))} ›</button>
      <button class="link-btn" style="display:block;margin:10px auto 0" onclick="go('productEdit', {productId:null})">${esc(t("wiz.manual"))}</button>`;
  }
  if (w.step === "analyzing") {
    return `${head}<div class="wiz-wait"><div class="spinner"></div><h2>${esc(t("wiz.analyzing"))}</h2><p class="muted">${esc(t("wiz.analyzingSub"))}</p></div>`;
  }
  if (w.step === "done") {
    return `${head}
      <div class="wiz-done"><div class="wiz-done-ico">${w.moderation === "REJECTED" ? "⚠️" : w.moderation === "PENDING" ? "⏳" : "🎉"}</div>
        <h1>${esc(t(w.moderation === "REJECTED" ? "wiz.rejectedTitle" : w.moderation === "PENDING" ? "wiz.pendingTitle" : "wiz.doneTitle"))}</h1>
        <p class="muted">${esc(w.moderation === "REJECTED" ? t("wiz.rejectedSub", { why: w.moderationNote || "" }) : t(w.moderation === "PENDING" ? "wiz.pendingSub" : "wiz.doneSub"))}</p>
        <button class="btn" onclick="openProductWizard()">📷 ${esc(t("wiz.another"))}</button>
        <div style="height:10px"></div>
        ${w.moderation === "APPROVED" || !w.moderation
          ? `<button class="btn outline" onclick="go('productDetail',{productId:'${w.createdId}'})">${esc(t("wiz.viewIt"))}</button>`
          : `<button class="btn outline" onclick="go('productEdit',{productId:'${w.createdId}'})">${esc(t("wiz.editIt"))}</button>`}
        <div style="height:10px"></div>
        <button class="btn secondary" onclick="backToShop()">🏪 ${esc(t("wiz.backToShop"))}</button>
        <div style="height:10px"></div>
        <button class="btn secondary" onclick="backToAccount()">👤 ${esc(t("wiz.backToAccount"))}</button>
      </div>`;
  }
  const cur = S.currency || "EUR";
  const mic = (field) => (voiceOk() ? `<button type="button" class="wiz-mic ${w.listening === field ? "on" : ""}" onclick="wizVoice('${field}')" aria-label="mic">${w.listening === field ? "⏺" : "🎤"}</button>` : "");
  return `${head}
    <h1 class="screen-title">${esc(t("wiz.reviewTitle"))}</h1>
    ${w.aiAvailable === false ? `<div class="info-banner">${esc(t("wiz.noAi"))}</div>` : `<p class="screen-sub">${esc(t("wiz.reviewSub"))}</p>`}
    ${w.quota ? `<p class="muted" style="font-size:12px;margin:0 0 8px">✨ ${esc(w.quota.subscription && w.quota.subscription.left > 0 ? t("ai.subLeft", { n: w.quota.subscription.left, total: w.quota.subscription.uses, date: new Date(w.quota.subscription.endDate).toLocaleDateString(LANG, { day: "numeric", month: "short" }) }) : w.quota.freeLeft > 0 ? t("ai.freeLeft", { n: w.quota.freeLeft, total: w.quota.freePerMonth }) : w.quota.creditsPerUse > 0 ? t("ai.paidPer", { n: w.quota.creditsPerUse, balance: w.quota.balance }) : t("ai.noMore"))}</p>` : ""}
    <div class="wiz-top">${w.photos.slice(0, 4).map((p) => `<img src="${esc(p.preview)}" alt="">`).join("")}</div>

    <div class="field"><label>${esc(t("wiz.name"))}</label>
      <div class="wiz-row"><input value="${esc(w.name)}" oninput="S._wiz.name=this.value" placeholder="${esc(t("wiz.namePh"))}">${mic("name")}</div>
      ${w.alternatives.length ? `<div class="wiz-chips">${w.alternatives.map((n) => `<button onclick="S._wiz.name='${esc(n).replace(/'/g, "&#39;")}';render()">${esc(n)}</button>`).join("")}</div>` : ""}</div>

    <div class="field"><label>${esc(t("wiz.section"))}</label>
      ${pcatPickerHtml(w.categoryId, "wizPickCategory")}</div>

    <div class="field"><label>${esc(t("wiz.condition"))}</label>
      <div class="wiz-seg"><button class="${w.condition === "NEW" ? "on" : ""}" onclick="S._wiz.condition='NEW';render()">${esc(t("wiz.cond.NEW"))}</button><button class="${w.condition === "USED" ? "on" : ""}" onclick="S._wiz.condition='USED';render()">${esc(t("wiz.cond.USED"))}</button></div></div>

    <div class="field"><label>${esc(t("wiz.description"))}</label>
      <div class="wiz-row"><textarea rows="4" oninput="S._wiz.description=this.value" placeholder="${esc(t("wiz.descPh"))}">${esc(w.description)}</textarea>${mic("description")}</div>
      <button class="link-btn" onclick="wizAutoDescription()">✨ ${esc(t("wiz.autoDesc"))}</button></div>

    <div class="field"><label>${esc(t("wiz.specs"))}</label>
      ${w.specs.map((x, i) => `<div class="wiz-spec"><input value="${esc(x.label)}" onchange="S._wiz.specs[${i}].label=this.value" placeholder="${esc(t("wiz.specLabel"))}"><input value="${esc(x.value)}" onchange="S._wiz.specs[${i}].value=this.value" placeholder="${esc(t("wiz.specValue"))}"><button onclick="S._wiz.specs.splice(${i},1);render()" aria-label="x">✕</button></div>`).join("")}
      <button class="link-btn" onclick="S._wiz.specs.push({label:'',value:''});render()">+ ${esc(t("wiz.addSpec"))}</button></div>

    <div class="field"><label>${esc(t("wiz.price"))} (${esc(cur === "USD" ? "$" : cur === "EUR" ? "€" : cur)})</label>
      <input class="wiz-price" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(w.price)}" oninput="S._wiz.price=this.value" placeholder="0.00">
      ${w.priceHint ? `<p class="muted" style="margin:6px 0 0">💡 ${esc(t("wiz.priceHint", { min: fmt(w.priceHint.min), max: fmt(w.priceHint.max) }))}</p>` : ""}</div>

    <div class="field"><label>${esc(t("wiz.stock"))}</label>
      <input type="number" inputmode="numeric" min="1" value="${esc(w.stock)}" oninput="S._wiz.stock=this.value" placeholder="${esc(t("wiz.stockPh"))}"></div>

    ${w.error ? `<div class="error-banner">${esc(w.error)}</div>` : ""}
    <button class="btn wiz-go" ${w.busy ? "disabled" : ""} onclick="wizPublish()">✅ ${esc(w.busy ? t("wiz.publishing") : t("wiz.publish"))}</button>`;
}

async function wizPickFiles(input) {
  const w = S._wiz;
  const files = Array.from(input.files || []).slice(0, 4 - w.photos.length);
  input.value = "";
  if (!files.length) return;
  w.uploading = true; w.error = null; render();
  for (const file of files) {
    try {
      const blob = await downscaleImage(file, 1280, 0.82);
      const { ok, data } = await postImage("/products/photos", blob);
      if (ok) w.photos.push({ id: data.id, url: data.url, preview: URL.createObjectURL(blob) });
      else w.error = errMsg(data, t("photo.failed"));
    } catch (e) { w.error = t("photo.failed"); }
  }
  w.uploading = false;
  render();
}

/** Back to merchant mode (the shop's own screen), as if its button had just been pressed. */
function backToShop() {
  S.homeTab = "profile";
  S.stack = [{ screen: "home", params: {}, homeTab: "profile", merchantTab: "redeem" }];
  S.merchantTab = "catalog"; S.screen = "merchantMode"; S.params = {}; S.error = null; S._catalog = null;
  render();
}

/** Back to the account tab, as if it had just been pressed. */
function backToAccount() {
  S.homeTab = "profile";
  reset("home");
}

/* ---- monthly AI packages: a fixed price for a number of uses ---- */

async function openAiPlans() {
  S._aip = { loading: true, packages: [], quota: null, busy: null, error: null };
  go("aiPlans");
  const { ok, data } = await api("GET", "/products/ai-packages");
  S._aip.loading = false;
  if (ok) { S._aip.packages = data.packages; S._aip.quota = data.quota; }
  else S._aip.error = errMsg(data, t("photo.failed"));
  render();
}

function screenAiPlans() {
  if (!S._aip) { openAiPlans(); return spinner(); }
  const f = S._aip;
  if (f.loading) return `${backRow()}<h1 class="screen-title">${esc(t("ai.plansTitle"))}</h1>${spinner()}`;
  const q = f.quota;
  const sub = q && q.subscription;
  const day = (iso) => new Date(iso).toLocaleDateString(LANG, { day: "numeric", month: "short", year: "numeric" });
  return `
    ${backRow()}
    <h1 class="screen-title">✨ ${esc(t("ai.plansTitle"))}</h1>
    <p class="screen-sub">${esc(t("ai.plansSub"))}</p>
    ${sub ? `<div class="card ai-current"><b>${esc(sub.name)}</b><p style="margin:4px 0 0">${esc(t("ai.subLeft", { n: sub.left, total: sub.uses, date: day(sub.endDate) }))}</p>
      <label class="switch-row" style="margin-top:8px"><span>${esc(t("ai.autoRenew"))}</span><span class="switch"><input type="checkbox" ${sub.autoRenew ? "checked" : ""} onchange="setAiAutoRenew(this.checked)" /><span class="track"></span></span></label>
      <p class="muted" style="margin:4px 0 0;font-size:12px">${esc(sub.autoRenew ? t("ai.autoRenewOn") : t("ai.autoRenewOff"))}</p></div>` : `<div class="info-banner">${esc(t("ai.noPlan"))}</div>`}
    ${q ? `<p class="muted">${esc(t("ai.balanceLine", { n: q.balance }))} · <a onclick="S._wallet=null;go('wallet')">${esc(t("ai.topUp"))}</a></p>` : ""}
    ${f.error ? `<div class="error-banner">${esc(f.error)}</div>` : ""}
    ${f.packages.map((p) => `
      <div class="card ai-pack">
        <div class="title-line"><strong>${esc(LANG === "ar" ? p.name : t("ai.pkg." + p.id) === "ai.pkg." + p.id ? p.name : t("ai.pkg." + p.id))}</strong><span class="price" style="color:var(--primary)">${esc(t("ai.price", { n: p.credits }))}</span></div>
        <p class="muted" style="margin:6px 0">${esc(t("ai.packLine", { uses: p.uses, days: p.days }))}</p>
        <button class="btn" ${f.busy ? "disabled" : ""} onclick="buyAiPackage('${p.id}')">${esc(f.busy === p.id ? t("ai.buying") : sub ? t("ai.addMore") : t("ai.buy"))}</button>
      </div>`).join("")}
    ${f.packages.length === 0 ? `<div class="empty-state">${esc(t("ai.noPackages"))}</div>` : ""}
    <p class="muted" style="font-size:12px">${esc(t("ai.plansNote"))}</p>`;
}

async function setAiAutoRenew(on) {
  const f = S._aip;
  f.error = null;
  const { ok, data } = await api("PATCH", "/products/ai-subscription", { autoRenew: on });
  if (ok) f.quota = data.quota; else f.error = errMsg(data, t("photo.failed"));
  render();
}

async function buyAiPackage(id) {
  const f = S._aip;
  const pack = f.packages.find((p) => p.id === id);
  if (!pack || !confirm(t("ai.confirmBuy", { name: pack.name, n: pack.credits }))) return;
  f.busy = id; f.error = null; render();
  const { ok, data } = await api("POST", "/products/ai-subscribe", { packageId: id });
  f.busy = null;
  if (ok) { f.quota = data.quota; S._pm = null; toast(t("ai.bought")); }
  else f.error = errMsg(data, t("photo.failed"));
  render();
}

/* ---- editing a product photo: tidy it, remove the background, studio light, change the colour — and go back ---- */

const PHOTO_COLORS = { red: "#d32f2f", blue: "#1976d2", green: "#2e7d32", black: "#111111", white: "#f5f5f5", gold: "#d4af37", silver: "#b0b7bd", pink: "#ec7fa9", purple: "#7b3fa0", orange: "#f57c00", yellow: "#f2c200", brown: "#7b4a2d", gray: "#8a8a8a", beige: "#d9c3a0", navy: "#1b2a5a" };

async function openPhotoMenu(ctx, url) {
  S._pm = { ctx, url, busy: false, error: null, quota: (S._pm && S._pm.quota) || null };
  render();
  const { ok, data } = await api("GET", "/products/ai-quota");
  if (ok && S._pm) { S._pm.quota = data; render(); }
}
function closePhotoMenu() { S._pm = null; render(); }

/** Swaps one photo for its edited copy in whichever screen is being edited; the old one is remembered for undo. */
function replacePhoto(oldUrl, data) {
  const m = S._pm;
  if (m.ctx === "wiz") {
    const p = S._wiz.photos.find((x) => x.url === oldUrl);
    if (p) { p.id = data.id; p.url = data.url; p.preview = data.url; p.enhanced = true; }
  } else {
    const im = S._prodEdit.images;
    const i = im.indexOf(oldUrl);
    if (i >= 0) im[i] = data.url;
  }
  m.url = data.url;
}

async function photoDo(action, color) {
  const m = S._pm;
  if (!m || m.busy) return;
  if (m.ctx === "pe") snapshotProdEditDraft();
  m.busy = true; m.error = null; render();
  const id = m.url.split("/").pop();
  const { ok, data } = await api("POST", `/products/photos/${id}/edit`, color ? { action, color } : { action });
  m.busy = false;
  if (!ok) { m.error = errMsg(data, t("photo.failed")); return render(); }
  S._photoHist = S._photoHist || {};
  S._photoHist[data.url] = [...(S._photoHist[m.url] || []), m.url];
  replacePhoto(m.url, data);
  if (data.quota) m.quota = { ...(m.quota || {}), ...data.quota };
  render();
}

function photoUndo() {
  const m = S._pm;
  const stack = (S._photoHist || {})[m.url] || [];
  if (!stack.length) return;
  const prev = stack[stack.length - 1];
  const rest = stack.slice(0, -1);
  const pid = prev.split("/").pop();
  replacePhoto(m.url, { id: pid, url: prev });
  S._photoHist[prev] = rest;
  render();
}

function photoMenuHtml() {
  const m = S._pm;
  if (!m) return "";
  const q = m.quota;
  const aiOff = q && q.photoEdit === false;
  const hasUndo = ((S._photoHist || {})[m.url] || []).length > 0;
  const quotaLine = !q ? "" : q.subscription && q.subscription.left > 0 ? t("ai.subLeft", { n: q.subscription.left, total: q.subscription.uses, date: new Date(q.subscription.endDate).toLocaleDateString(LANG, { day: "numeric", month: "short" }) }) : q.freeLeft > 0 ? t("ai.freeLeft", { n: q.freeLeft, total: q.freePerMonth }) : q.creditsPerUse > 0 ? t("ai.paidPer", { n: q.creditsPerUse, balance: q.balance }) : t("ai.noMore");
  const btn = (label, fn, ai) => `<button class="pm-act" ${m.busy || (ai && aiOff) ? "disabled" : ""} onclick="${fn}">${label}</button>`;
  return `
    <div class="pm-overlay" onclick="closePhotoMenu()">
      <div class="pm-box" onclick="event.stopPropagation()">
        <div class="pm-head"><b>${esc(t("ai.editTitle"))}</b><button class="link-btn" onclick="closePhotoMenu()" aria-label="x">✕</button></div>
        <div class="pm-img"><img src="${esc(m.url)}" alt="">${m.busy ? `<div class="pm-wait"><div class="spinner"></div><span>${esc(t("ai.working"))}</span></div>` : ""}</div>
        ${quotaLine ? `<p class="pm-quota">✨ ${esc(quotaLine)}</p>` : ""}
        ${aiOff ? `<p class="muted" style="font-size:12px">${esc(t("ai.unavailable"))}</p>` : ""}
        ${m.error ? `<div class="error-banner">${esc(m.error)}</div>` : ""}
        ${btn("🧼 " + esc(t("ai.clean")), "photoDo('clean')", false)}
        ${btn("✂️ " + esc(t("ai.whiteBg")), "photoDo('white_bg')", true)}
        ${btn("💡 " + esc(t("ai.studio")), "photoDo('studio')", true)}
        <div class="pm-colors"><span>🎨 ${esc(t("ai.recolor"))}</span>
          <div>${Object.entries(PHOTO_COLORS).map(([k, hex]) => `<button class="pm-dot" style="background:${hex}" title="${esc(t("color." + k))}" aria-label="${esc(t("color." + k))}" ${m.busy || aiOff ? "disabled" : ""} onclick="photoDo('recolor','${k}')"></button>`).join("")}</div>
        </div>
        ${hasUndo ? `<button class="pm-act pm-undo" ${m.busy ? "disabled" : ""} onclick="photoUndo()">↩️ ${esc(t("ai.undo"))}</button>` : ""}
        <button class="link-btn" style="display:block;margin:8px auto" onclick="S._pm=null;openAiPlans()">📦 ${esc(t("ai.plansTitle"))}</button>
        <button class="btn" onclick="closePhotoMenu()">${esc(t("ai.done"))}</button>
      </div>
    </div>`;
}

function wizRemovePhoto(i) { S._wiz.photos.splice(i, 1); render(); }

/** The AI looks at the first photo and suggests the words; whatever it cannot do, the shop simply types or says. */
async function wizAnalyze() {
  const w = S._wiz;
  w.step = "analyzing"; w.error = null; render();
  const { ok, data } = await api("POST", "/products/ai-draft", { photoId: w.photos[0].id });
  w.step = "form";
  if (ok) {
    w.aiAvailable = data.available;
    w.priceHint = data.priceHint;
    w.quota = data.quota || null;
    const d = data.draft;
    if (d) {
      w.name = d.name; w.alternatives = d.alternatives || []; w.description = d.description || ""; w.specs = d.specs || [];
      if (d.section) w.section = d.section;
      if (data.productCategoryId && !w.categoryId) { w.categoryId = data.productCategoryId; if (S._pcat && S._pcat.tree.length) pcatPick("wizPickCategory", data.productCategoryId); }
      if (d.condition) w.condition = d.condition;
    } else if (data.available) w.error = t("wiz.aiMiss");
  } else { w.aiAvailable = false; w.error = errMsg(data, null); }
  render();
}

/** No AI needed: a plain sentence from what was chosen, for a shop that would rather not write. */
function wizAutoDescription() {
  const w = S._wiz;
  if (!w.name) { w.error = t("wiz.needName"); render(); return; }
  const parts = [t("wiz.autoLine", { name: w.name, cond: t("wiz.cond." + w.condition) })];
  w.specs.filter((x) => x.label && x.value).forEach((x) => parts.push(`${x.label}: ${x.value}.`));
  w.description = parts.join(" ");
  w.error = null;
  render();
}

function wizPickCategory(id) { S._wiz.categoryId = id; render(); }

async function wizPublish() {
  const w = S._wiz;
  const price = Number(String(w.price).replace(",", "."));
  if (!w.name.trim()) { w.error = t("wiz.needName"); return render(); }
  if (!w.categoryId) { w.error = t("wiz.needSection"); return render(); }
  if (!(price > 0)) { w.error = t("wiz.needPrice"); return render(); }
  const stock = parseInt(latinDigits(String(w.stock)), 10);
  if (!(stock >= 1)) { w.error = t("wiz.needStock"); return render(); }
  if (!(await shipGuard())) return;
  w.busy = true; w.error = null; render();
  const body = {
    name: w.name.trim(), description: w.description.trim() || undefined, priceCents: Math.round(price * 100), stock,
    productCategoryId: w.categoryId, condition: w.condition, images: w.photos.map((p) => p.url),
    specs: w.specs.filter((x) => x.label.trim() && x.value.trim()).map((x) => ({ label: x.label.trim(), value: x.value.trim() })),
  };
  const { ok, data } = await api("POST", "/products", body);
  w.busy = false;
  if (ok) { w.step = "done"; w.createdId = data.id; w.moderation = data.moderation; w.moderationNote = data.moderationNote; S._catalog = null; }
  else w.error = errMsg(data, t("wiz.failed"));
  render();
}

/* ---------------- ratings and comments (everyone reads; only people who received the order write) ---------------- */

const starsText = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

/** The big average, the bars (how many gave 5, 4, ...) and the number of ratings. */
function reviewSummary(sum) {
  if (!sum || !sum.count) return `<p class="muted" style="margin:6px 0">${esc(t("rv.none"))}</p>`;
  return `
    <div class="rv-sum">
      <div class="rv-avg"><b>${sum.average.toFixed(1)}</b><span class="star">${starsText(sum.average)}</span><small>${esc(t("rv.count", { n: sum.count }))}</small></div>
      <div class="rv-bars">${[5, 4, 3, 2, 1].map((k) => `<div><span>${k}★</span><i><u style="width:${Math.round((sum.distribution[k] / sum.count) * 100)}%"></u></i><em>${sum.distribution[k]}</em></div>`).join("")}</div>
    </div>`;
}

function reviewList(items, shopField) {
  return (items || []).map((r) => `
    <div class="rv-item">
      <div class="rv-head"><span class="star">${starsText(r.stars)}</span><b>${esc(shopField ? r[shopField] : r.name)}</b>${r.verified ? `<small class="rv-ok">✓ ${esc(t("rv.verified"))}</small>` : ""}<small class="muted">${new Date(r.createdAt).toLocaleDateString(LANG, { day: "numeric", month: "short", year: "numeric" })}</small></div>
      ${r.comment ? `<p>${esc(r.comment)}</p>` : ""}
    </div>`).join("");
}

/** The note and the button under a summary: write when allowed, otherwise say who may. */
function reviewAction(kind, id, data, title) {
  if (!S.token) return `<p class="muted rv-note">${esc(t("rv.needBuy"))}</p>`;
  if (!data.canReview) return `<p class="muted rv-note">${esc(t("rv.needBuy"))}</p>`;
  return `<button class="btn outline rv-write" onclick="openReview('${kind}','${id}','${esc(title).replace(/'/g, "&#39;")}',${data.mine ? data.mine.stars : 0},'${esc((data.mine && data.mine.comment) || "").replace(/'/g, "&#39;").replace(/\n/g, " ")}')">✍️ ${esc(data.mine ? t("rv.edit") : t("rv.write"))}</button>`;
}

/** The little window: choose the stars, write a few words, send. */
function openReview(kind, id, title, stars, comment) {
  S._rv = { kind, id, title, stars: stars || 0, comment: comment || "", busy: false, error: null };
  renderReviewModal();
}

function closeReview() { S._rv = null; renderReviewModal(); }

function renderReviewModal() {
  let box = document.getElementById("rv-modal");
  if (!S._rv) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement("div"); box.id = "rv-modal"; document.body.appendChild(box); }
  const r = S._rv;
  box.innerHTML = `
    <div class="rv-back" onclick="closeReview()"></div>
    <div class="rv-card">
      <h3>${esc(r.title)}</h3>
      <div class="rv-pick">${[1, 2, 3, 4, 5].map((n) => `<button class="${n <= r.stars ? "on" : ""}" onclick="S._rv.stars=${n};renderReviewModal()" aria-label="${n}">★</button>`).join("")}</div>
      <textarea rows="4" maxlength="1000" placeholder="${esc(t("rv.placeholder"))}" oninput="S._rv.comment=this.value">${esc(r.comment)}</textarea>
      ${r.error ? `<div class="error-banner">${esc(r.error)}</div>` : ""}
      <div class="rv-actions"><button class="btn outline" onclick="closeReview()">${esc(t("rv.cancel"))}</button><button class="btn" ${r.busy || !r.stars ? "disabled" : ""} onclick="submitReview()">${esc(t("rv.send"))}</button></div>
    </div>`;
  trDom(box);
}

async function submitReview() {
  const r = S._rv;
  r.busy = true; r.error = null; renderReviewModal();
  const path = { product: "/reviews/products/", shop: "/reviews/shops/", customer: "/reviews/customers/" }[r.kind] + r.id;
  const { ok, data } = await api("PUT", path, { stars: r.stars, comment: r.comment.trim() || undefined });
  if (!ok) { r.busy = false; r.error = errMsg(data, t("rv.failed")); return renderReviewModal(); }
  S._rv = null;
  renderReviewModal();
  toast(t("rv.thanks"));
  // the pages that show reviews or "rate me" buttons load again
  S._productDetail = null; S._merchantDetail = null; S._orderDetail = null; S._orders = null; S._mOrders = null;
  render();
}

/** The product page's pictures: the big one and a row of small ones to pick from. */
function storeGallery(prod, idx) {
  const imgs = prod.images && prod.images.length ? prod.images : [];
  if (!imgs.length) return `<div class="pd-pic">${storePic(prod)}</div>`;
  const cur = Math.min(idx, imgs.length - 1);
  return `
    <div class="pd-pic">
      <div class="pd-main"><div class="store-pic"><img src="${esc(imgs[cur])}" alt="${esc(prod.name)}" /></div></div>
      ${imgs.length > 1 ? `<div class="pd-thumbs">${imgs.map((u, i) => `<button class="${i === cur ? "on" : ""}" onclick="storePickImage(${i})"><img src="${esc(u)}" alt="" /></button>`).join("")}</div>` : ""}
    </div>`;
}

function storePickImage(i) {
  S._productDetail.imgIdx = i;
  render();
}

function storeCount(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k+" : String(n); }

function storePrice(p) {
  return p.memberDiscountEnabled
    ? `<div class="store-price sale"><b>${fmt(p.memberPriceCents)}</b><s>${fmt(p.priceCents)}</s></div><div class="store-off">${esc(t("store.offLabel", { n: storeOff(p) }))}</div>`
    : `<div class="store-price"><b>${fmt(p.priceCents)}</b></div>`;
}

function storeCard(p) {
  const added = S._store && S._store.justAdded === p.id;
  return `
    <div class="store-card" onclick="go('productDetail',{productId:'${p.id}'})">
      <div class="store-card-img">
        ${storePic(p)}
        ${p.images && p.images[1] ? `<img class="store-alt" src="${esc(p.images[1])}" alt="" loading="lazy" />` : ""}
        ${p.soldCount >= 8000 ? `<span class="store-tag hot">${esc(t("store.best"))}</span>` : ""}
        <button class="store-bag ${added ? "done" : ""}" onclick="storeAdd('${p.id}', event)" aria-label="${esc(t("store.add"))}">${added ? "✓" : ICON.bag}</button>
      </div>
      <div class="store-card-body">
        <div class="store-name">${esc(p.name)}</div>
        ${storePrice(p)}
        ${p.section ? `<div class="store-hash">#${esc(storeSecName(p.section))}</div>` : ""}
        <div class="store-meta">${p.ratingCount ? `<span class="star">★ ${p.rating.toFixed(1)}</span>` : ""}${p.soldCount ? `<span>${esc(t("store.soldShort", { n: storeCount(p.soldCount) }))}</span>` : ""}</div>
      </div>
    </div>`;
}

function storeSection(title, items, kind) {
  if (!items || !items.length) return "";
  return `
    <section class="store-sec">
      <div class="store-sec-head"><h2>${esc(title)}</h2><button onclick="storeSeeAll('${kind}')">${esc(t("store.seeAll"))} ›</button></div>
      <div class="store-grid">${items.slice(0, 10).map(storeCard).join("")}</div>
    </section>`;
}

function screenStore() {
  const st = storeState();
  const home = st.home;
  const sections = home ? home.sections : [];
  const filtering = !!(st.q || st.section || st.deals || st.byPhoto);
  const activeSection = sections.find((x) => x.id === st.section);
  let body;
  if (st.loading) body = spinner();
  else if (filtering) {
    const title = st.byPhoto ? t("photo.resultsFor", { name: st.byPhoto.title || "" }) : st.q ? `${t("store.resultsFor")} «${st.q}»` : st.deals ? t("store.deals") : storeSecName(activeSection) || t("store.best");
    body = `
      ${st.byPhoto ? `<div class="photo-seen">${st.byPhoto.preview ? `<img src="${esc(st.byPhoto.preview)}" alt="">` : ""}<span>${esc(t("photo.seen"))}: <b>${esc(st.byPhoto.title || "")}</b></span></div>` : ""}
      <div class="store-bar"><h2>${esc(title)} <small>${st.total ? st.total : ""}</small></h2>
        ${st.byPhoto ? "" : `<select class="store-sort" onchange="storeSetSort(this.value)">
          ${[["popular", "الأكثر مبيعًا"], ["new", "الأحدث"], ["rating", "الأعلى تقييمًا"], ["price_asc", "السعر: من الأقل"], ["price_desc", "السعر: من الأعلى"]].map(([v, l]) => `<option value="${v}" ${st.sort === v ? "selected" : ""}>${esc(l)}</option>`).join("")}
        </select>`}</div>
      ${st.busy && !st.items.length ? spinner() : st.items.length
        ? `<div class="store-grid">${st.items.map(storeCard).join("")}</div>
           ${st.items.length < st.total ? `<div class="store-more"><button class="btn outline" ${st.busy ? "disabled" : ""} onclick="loadStoreList(true)">${esc(t("store.more"))}</button></div>` : ""}`
        : `<div class="empty">${esc(t("store.noResults"))}</div>`}`;
  } else {
    body = `
      <div class="store-hero">
        <div class="store-picks">${storeSlotsHtml(home, 0, 3)}</div>
        ${storeSlider(st, home)}
        <div class="store-picks">${storeSlotsHtml(home, 3, 6)}</div>
      </div>
      <div class="store-slotstrip">${storeSlotsHtml(home, 0, 6)}</div>
      <div class="store-adstrip"><span>📢 ${esc(home.adOffer ? t("ads.pitch", { price: home.adOffer.fromCredits, name: home.adOffer.creditName, days: home.adOffer.days }) : t("ads.pitchGeneric"))}</span><span class="store-adstrip-btns"><button onclick="openAdBooking('space')">${esc(t("ads.bookCta"))}</button><button onclick="openAdBooking('banner')">${esc(t("ads.bookBanner"))}</button></span></div>
      <div class="store-circles">${sections.map((x) => `
        <button onclick="storePickSection('${x.id}')"><span><img src="${esc(x.image)}" alt="" loading="lazy"></span><em>${esc(storeSecName(x))}</em></button>`).join("")}</div>
      ${storeSection(t("store.best"), home.bestSellers, "best")}
      ${storeSection(t("store.deals"), home.deals, "deals")}
      ${storeSection(t("store.newest"), home.newest, "new")}
      ${!home.bestSellers.length && !home.newest.length ? `<div class="empty">${esc(t("store.noResults"))}</div>` : ""}
      ${followUsHtml(false)}
      ${legalLinksHtml()}`;
  }
  return `
    <div class="store">
      <div class="store-head">
        <button class="store-icon-btn" onclick="storeBack()" aria-label="back">›</button>
        <b class="store-brand">${esc(t("tab.store"))}</b>
        <form class="store-search" onsubmit="storeSearch(event)">
          <input id="store-q" type="search" value="${esc(st.q)}" placeholder="${esc(t("store.searchPlaceholder"))}" />
          <button type="submit" aria-label="search">${ICON.search}</button>
        </form>
        <button class="store-icon-btn store-cart" onclick="storeToCart()" aria-label="cart">${ICON.bag}${st.cartCount ? `<span class="store-badge">${st.cartCount}</span>` : ""}</button>
      </div>
      <div class="store-tabs">
        <button class="${!st.section && !st.deals ? "on" : ""}" onclick="storePickSection('')">${esc(t("store.all"))}</button>
        ${sections.map((x) => `<button class="${st.section === x.id ? "on" : ""}" onclick="storePickSection('${x.id}')">${esc(storeSecName(x))}</button>`).join("")}
      </div>
      ${storeScopeBar(st)}
      ${errorBanner()}
      ${body}
    </div>`;
}

function screenProductDetail() {
  if (!S._productDetail || S._productDetail.id !== S.params.productId) {
    S._productDetail = { id: S.params.productId, loading: true, qty: 1 };
    loadProductDetail(S.params.productId);
  }
  const p = S._productDetail;
  if (p.loading) return `<div class="store">${backRow()}${spinner()}</div>`;
  if (!p.product) return `<div class="store">${backRow()}<div class="error-banner">هذا المنتج غير متوفر</div></div>`;
  const prod = p.product;
  const available = prod.stock > 0;
  const off = storeOff(prod);
  return `
    <div class="store">
      <div class="pd-crumbs"><button onclick="back()">‹ ${esc(t("tab.store"))}</button>${prod.section ? ` / <span>${esc(storeSecName(prod.section))}</span>` : ""}</div>
      <div class="pd">
        ${storeGallery(prod, p.imgIdx || 0)}
        <div class="pd-info">
          <h1 class="pd-title">${esc(prod.name)}</h1>
          <div class="pd-rate">
            ${prod.ratingCount ? `<span class="star">${"★".repeat(Math.round(prod.rating))}${"☆".repeat(5 - Math.round(prod.rating))}</span> <b>${prod.rating.toFixed(1)}</b> <span>${esc(t("store.ratings", { n: prod.ratingCount }))}</span>` : ""}
            ${prod.soldCount ? `<span class="dot">·</span><span>${esc(t("store.soldShort", { n: storeCount(prod.soldCount) }))}</span>` : ""}
          </div>
          <div class="pd-price-box">
            ${prod.memberDiscountEnabled
              ? `<b class="sale">${fmt(prod.memberPriceCents)}</b><s>${fmt(prod.priceCents)}</s><span class="store-tag off inline">-${off}%</span>
                 <div class="pd-member">⭐ ${esc(t("store.memberPrice"))}</div>`
              : `<b>${fmt(prod.priceCents)}</b>`}
          </div>
          ${prod.description ? `<p class="pd-desc">${esc(prod.description)}</p>` : ""}
          ${(prod.specs && prod.specs.length) || prod.condition ? `<div class="pd-specs">
            ${prod.condition ? `<div><span>${esc(t("wiz.condition"))}</span><b>${esc(t("wiz.cond." + prod.condition))}</b></div>` : ""}
            ${(prod.specs || []).map((x) => `<div><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join("")}
          </div>` : ""}
          <div class="pd-rows">
            <div><span>${esc(t("store.soldBy"))}</span><a onclick="go('merchantDetail',{merchantId:'${prod.merchant.id}'})">${esc(prod.merchant.name)}</a></div>
            <div><span>${esc(t("store.availability"))}</span>${available ? `<b class="${prod.stock <= 5 ? "low" : "ok"}">✓ ${esc(t("store.stockCount", { n: prod.stock }))}</b>` : `<b class="low">${esc(t("store.unavailable"))}</b>`}</div>
          </div>
          ${(prod.shipping || []).length ? `<div class="pd-ship"><b>🚚 ${esc(t("ship.methods"))}</b>${prod.shipping.map((m) => `<div><span>${esc(m.name)}</span><span>${m.costCents ? fmt(m.costCents) : esc(t("ship.free"))}</span></div>`).join("")}</div>` : ""}
          ${available ? `
            <div class="stepper"><button onclick="changeProductQty(-1)">−</button><span>${p.qty}</span><button onclick="changeProductQty(1)">+</button></div>
            <div class="pd-actions">
              <button class="btn" ${p.adding ? "disabled" : ""} onclick="addProductToCart(false)">${ICON.bag} ${esc(t("store.add"))}</button>
              <button class="btn outline" ${p.adding ? "disabled" : ""} onclick="addProductToCart(true)">${esc(t("store.buyNow"))}</button>
            </div>
            ${p.added ? `<div class="success-banner">${esc(t("store.addedToCart"))} ✓ <button class="link-btn" style="padding:0" onclick="storeToCart()">${esc(t("store.goToCart"))}</button></div>` : ""}` : ""}
          ${errorBanner()}
        </div>
      </div>
      <section class="store-sec rv-sec">
        <div class="store-sec-head"><h2>${esc(t("rv.title"))}</h2></div>
        ${p.reviews ? `${reviewSummary(p.reviews.summary)}
          ${reviewAction("product", prod.id, p.reviews, prod.name)}
          <div class="rv-list">${reviewList(p.reviews.items)}</div>
          ${p.reviews.items.length < p.reviews.summary.count ? `<button class="btn outline" style="width:auto;margin:10px auto 0;display:block" onclick="moreProductReviews()">${esc(t("store.more"))}</button>` : ""}` : ""}
      </section>
      ${prod.related && prod.related.length ? `<section class="store-sec"><div class="store-sec-head"><h2>${esc(t("store.related"))}</h2></div><div class="store-grid">${prod.related.map(storeCard).join("")}</div></section>` : ""}
    </div>`;
}

async function loadProductDetail(id) {
  const [{ ok, data }, rv] = await Promise.all([api("GET", "/store/products/" + id), api("GET", "/reviews/products/" + id + "?limit=10")]);
  S._productDetail = { id, loading: false, product: ok ? data : null, qty: 1, reviews: rv.ok ? rv.data : null };
  render();
}

async function moreProductReviews() {
  const p = S._productDetail;
  const { ok, data } = await api("GET", `/reviews/products/${p.id}?limit=10&offset=${p.reviews.items.length}`);
  if (ok) { p.reviews.items = p.reviews.items.concat(data.items); render(); }
}

function changeProductQty(delta) {
  const p = S._productDetail;
  const next = p.qty + delta;
  if (next >= 1 && next <= p.product.stock) { p.qty = next; render(); }
}

async function addProductToCart(thenCart) {
  if (!S.token) return go("login");
  const p = S._productDetail;
  p.adding = true; render();
  const { ok, data } = await addToCart(p.id, p.qty);
  p.adding = false;
  if (ok) { p.added = true; S._cart = null; S.error = null; if (S._store) S._store.cartCount += p.qty; if (thenCart) return storeToCart(); }
  else { S.error = errMsg(data, "تعذّرت إضافة المنتج للسلة"); }
  render();
}

/* ================= ORDER DETAIL ================= */

function screenOrderDetail() {
  if (!S._orderDetail || S._orderDetail.id !== S.params.orderId) {
    S._orderDetail = { id: S.params.orderId, loading: true };
    loadOrderDetail(S.params.orderId);
  }
  const o = S._orderDetail;
  if (o.loading) return backRow() + spinner();
  if (!o.order) return backRow() + `<div class="error-banner">الطلب غير موجود</div>`;
  const ord = o.order;
  const canCancel = (ORDER_TRANSITIONS[ord.status] || []).includes("CANCELLED");
  return `
    ${backRow()}
    <div class="title-line"><h1 class="screen-title">${esc(ord.orderNumber)}</h1>${orderBadge(ord.status)}</div>
    <p class="screen-sub">${esc(ord.merchant ? ord.merchant.businessName : "")}</p>
    ${ord.cancelReason ? `<p class="muted">سبب الإلغاء: ${esc(ord.cancelReason)}</p>` : ""}
    <div class="section-title">المنتجات</div>
    ${(ord.items || []).map((it) => `
      <div class="list-row" style="padding:6px 0">
        <span>${esc(it.productName)} × ${it.quantity}</span>
        <span class="price">${fmt(it.unitPriceCents * it.quantity)}</span>
      </div>`).join("")}
    <div class="divider"></div>
    ${ord.shippingName ? `<div class="list-row" style="padding:6px 0"><span>🚚 ${esc(ord.shippingName)}</span><span class="price">${ord.shippingCents ? fmt(ord.shippingCents) : esc(t("ship.free"))}</span></div>` : ""}
    <div class="title-line"><strong>الإجمالي</strong><span class="price" style="color:var(--primary)">${fmt(ord.totalCents)}</span></div>
    ${ord.memberDiscountCents > 0 ? `<p class="muted">وفّرت ${fmt(ord.memberDiscountCents)} بسعر أعضاء دليلكم</p>` : ""}
    ${ord.status === "DELIVERED" && ord.rated ? `
      <div class="section-title">${esc(t("rv.rateTitle"))}</div>
      <div class="rv-rate-list">
        <button class="btn outline" onclick="openReview('shop','${ord.merchant.id}','${esc(ord.merchant.businessName).replace(/'/g, "&#39;")}',0,'')">🏪 ${esc(t("rv.rateShop"))} ${ord.rated.shop ? "✓" : ""}</button>
        ${(ord.items || []).map((it) => `<button class="btn outline" onclick="openReview('product','${it.productId}','${esc(it.productName).replace(/'/g, "&#39;")}',0,'')">📦 ${esc(it.productName)} ${ord.rated.products.includes(it.productId) ? "✓" : ""}</button>`).join("")}
      </div>` : ""}
    ${ord.status === "DELIVERED" && ord.customer ? `
      <div class="section-title">${esc(t("rv.customerTitle"))}</div>
      <p class="muted">${ord.customerRating.ratingCount ? `<span class="star">${starsText(ord.customerRating.rating)}</span> ${ord.customerRating.rating.toFixed(1)} (${ord.customerRating.ratingCount})` : esc(t("rv.customerNone"))}</p>
      <button class="btn outline" onclick="openReview('customer','${ord.customer.id}','${esc(ord.customer.fullName).replace(/'/g, "&#39;")}',0,'')">⭐ ${esc(ord.ratedCustomer ? t("rv.edit") : t("rv.rateCustomer"))}</button>` : ""}
    <button class="btn outline" style="margin-top:10px" onclick="exportDocument('/invoices/order/${ord.id}')">📄 تصدير الفاتورة PDF</button>
    ${canCancel ? `<div style="height:16px"></div><button class="btn danger" ${S.busy ? "disabled" : ""} onclick="cancelOrder()">إلغاء الطلب</button>` : ""}
    ${errorBanner()}
  `;
}

async function loadOrderDetail(id) {
  const { ok, data } = await api("GET", "/orders/" + id);
  S._orderDetail = { id, loading: false, order: ok ? data : null };
  render();
}

async function cancelOrder() {
  S.busy = true; render();
  const { ok, data } = await api("POST", `/orders/${S._orderDetail.id}/cancel`);
  S.busy = false;
  if (ok) { S._orderDetail.order = data; S._orders = null; }
  else S.error = errMsg(data, "تعذّر إلغاء الطلب");
  render();
}

/* ================= MERCHANT REGISTER ================= */

function screenMerchantRegister() {
  if (!S._merchReg) { S._merchReg = { categories: [] }; pickReset(null, null); api("GET", "/categories?lang=" + LANG).then((r) => { S._merchReg.categories = r.ok ? r.data : []; render(); }); }
  const m = S._merchReg;
  return `
    ${backRow()}
    <h1 class="screen-title">سجّل كصاحب نشاط</h1>
    <p class="screen-sub">بيصير حسابك صاحب نشاط بعد موافقة الإدارة، وبعدها بيظهر محلك على الخريطة</p>
    <div class="section-title">${esc(t("mp.secName"))}</div>
    <div class="field"><label>اسم المحل</label><input id="mr-name" placeholder="مثال: مطعم الياسمين" value="${esc(m.name || "")}" /></div>
    <div class="section-title">${esc(t("mp.secProfession"))}</div>
    ${categoryPickerHtml(m.categories, m.selectedCat, "selectMerchCategory")}
    <div class="section-title">${esc(t("mp.secContact"))}</div>
    <div class="field"><label>${esc(t("mp.address"))}</label><input id="mr-address" placeholder="${esc(t("mp.addressPh"))}" value="${esc(m.address || "")}" /></div>
    ${catIsOnline(m.categories, m.selectedCat) ? `<div class="info-banner">${esc(t("cat.onlineNote"))}</div>` : pickerHtml()}
    <div class="row">
      <div class="field"><label>الهاتف (اختياري)</label><input id="mr-phone" placeholder="+963 9xx xxx xxx" value="${esc(m.phone || "")}" /></div>
      <div class="field"><label>واتساب (اختياري)</label><input id="mr-whatsapp" placeholder="مثال: 963912345678" value="${esc(m.whatsapp || "")}" /></div>
    </div>
    ${errorBanner()}
    <button class="btn" ${S.busy ? "disabled" : ""} onclick="submitMerchantRegister()">سجّل</button>
  `;
}

function snapshotMerchRegDraft() {
  const m = S._merchReg;
  m.name = qs("mr-name") ? qs("mr-name").value : m.name;
  m.address = qs("mr-address") ? qs("mr-address").value : m.address;
  m.phone = qs("mr-phone") ? qs("mr-phone").value : m.phone;
  m.whatsapp = qs("mr-whatsapp") ? qs("mr-whatsapp").value : m.whatsapp;
}

function selectMerchCategory(id) {
  snapshotMerchRegDraft();
  S._merchReg.selectedCat = id;
  render();
}

async function submitMerchantRegister() {
  snapshotMerchRegDraft();
  const businessName = qs("mr-name").value.trim();
  const categoryId = S._merchReg.selectedCat;
  if (!businessName || !categoryId) { S.error = "عبّي اسم المحل واختر تصنيف"; return render(); }
  const address = qs("mr-address").value.trim();
  const phone = qs("mr-phone").value.trim();
  const whatsapp = (qs("mr-whatsapp").value || "").replace(/\D/g, "");
  const online = catIsOnline(S._merchReg.categories, categoryId);
  const pin = !online && S._pick && S._pick.lat != null ? { latitude: S._pick.lat, longitude: S._pick.lng } : {};
  if (!online && !pin.latitude && !address) { S.error = t("addr.need"); return render(); } // a place that is not pinned must be written down
  const proposed = S._catSugOpen && (S._catSug || "").trim().length >= 2 ? { suggestedCategory: S._catSug.trim() } : {};
  if (pin.latitude && !S._lmSimilarOk) {
    const similar = await lmCheckSimilar(businessName, pin.latitude, pin.longitude);
    if (similar.length) { S._lmSimilar = { items: similar }; return render(); }
  }
  S._lmSimilarOk = false;
  S.busy = true; render();
  const { ok, data } = await api("POST", "/merchant/register", { businessName, categoryId, address: address || undefined, phone: phone || undefined, whatsapp: whatsapp || undefined, ...pin, ...proposed });
  S.busy = false;
  if (ok) {
    S.role = "MERCHANT";
    localStorage.setItem("dlk_role", "MERCHANT");
    S._merchReg = null;
    S._catSug = ""; S._catSugOpen = false;
    S._onboarding = null;
    back();
    toast(data.approvalStatus === "APPROVED" ? "✅ انقبل نشاطك وصار على الخريطة" : data.approvalStatus === "REJECTED" ? tr("ما انقبل نشاطك:") + " " + (data.reason || tr("غير مناسب للنشر")) : "وصلنا طلبك وهو قيد المراجعة، بنخبرك بالنتيجة");
  } else {
    S.error = errMsg(data, "تعذّر تسجيل حساب النشاط");
    render();
  }
}

/* ---- merchant: pin the shop on the map ---- */

// One Leaflet instance kept alive across re-renders (re-parented into #pick-slot each time).
function pickerHtml(label) {
  const p = S._pick || {};
  return `
    <div class="field">
      <label>${label ? esc(label) : "موقع نشاطك على الخريطة — بهالطريقة بيلاقيك الزبائن"}</label>
      <div id="pick-slot" class="pick-map"></div>
      <div class="row" style="margin-top:6px;gap:8px;align-items:center">
        <button class="btn small outline" style="width:auto;flex:none" onclick="pickUseMyLocation()">📍 استخدم موقعي الحالي</button>
        <span id="pick-coords" class="muted" style="font-size:12px">${p.lat != null ? p.lat.toFixed(5) + "، " + p.lng.toFixed(5) : "اضغط على الخريطة لتحديد المكان"}</span>
      </div>
    </div>`;
}

function pickSet(lat, lng, recenter) {
  S._pick = { lat, lng };
  if (S._pickMap) {
    if (!S._pickMarker) {
      S._pickMarker = L.marker([lat, lng], { draggable: true }).addTo(S._pickMap);
      S._pickMarker.on("dragend", () => { const ll = S._pickMarker.getLatLng(); pickSet(ll.lat, ll.lng, false); fillAddressFromPin(ll.lat, ll.lng); });
    } else {
      S._pickMarker.setLatLng([lat, lng]);
    }
    if (recenter) S._pickMap.setView([lat, lng], 16);
  }
  const el = document.getElementById("pick-coords");
  if (el) el.textContent = lat.toFixed(5) + "، " + lng.toFixed(5);
}

function renderPicker() {
  const slot = document.getElementById("pick-slot");
  if (!slot || typeof L === "undefined") return;
  if (!S._pickMap) {
    const el = document.createElement("div");
    el.style.cssText = "height:100%;width:100%";
    S._pickEl = el;
    const map = L.map(el, { attributionControl: false }).setView([DAMASCUS.lat, DAMASCUS.lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    map.on("click", (e) => { pickSet(e.latlng.lat, e.latlng.lng, false); fillAddressFromPin(e.latlng.lat, e.latlng.lng); });
    S._pickMap = map;
  }
  slot.appendChild(S._pickEl);
  S._pickMap.invalidateSize();
  const p = S._pick || {};
  if (p.lat != null) {
    pickSet(p.lat, p.lng, !S._pickCentered);
    S._pickCentered = true;
  } else if (S._pickMarker) {
    S._pickMap.removeLayer(S._pickMarker);
    S._pickMarker = null;
  }
}

function pickReset(lat, lng) {
  S._pick = lat != null ? { lat, lng } : {};
  S._pickCentered = false;
  if (S._pickMap && S._pickMarker) { S._pickMap.removeLayer(S._pickMarker); S._pickMarker = null; }
}

/**
 * The place the person pinned, in words: the address field fills itself in, replacing whatever was typed.
 */
let _revTimer = null;
function fillAddressFromPin(lat, lng) {
  clearTimeout(_revTimer);
  _revTimer = setTimeout(async () => {
    const { ok, data } = await api("GET", "/geo/reverse?lat=" + lat + "&lng=" + lng + "&lang=" + LANG);
    if (!ok || !data || !data.address) return;
    // placing the pin is an explicit choice: the address always becomes the pinned place's, whatever was typed before
    const el = qs("mr-address") || qs("mp-address") || qs("br-address");
    if (el) {
      el.value = data.address;
      S._autoAddr = data.address;
      if (S._merchReg && qs("mr-address")) S._merchReg.address = data.address;
      if (S._mprof && qs("mp-address")) S._mprof.address = data.address;
      if (S._br && S._br.form && qs("br-address")) S._br.form.address = data.address;
    }
    const city = qs("br-city");
    if (city && data.city) {
      city.value = data.city;
      S._autoCity = data.city;
      if (S._br && S._br.form) S._br.form.city = data.city;
    }
  }, 700);
}

function pickUseMyLocation() {
  if (!navigator.geolocation) return toast("المتصفح ما بيدعم تحديد الموقع");
  navigator.geolocation.getCurrentPosition(
    (pos) => { pickSet(pos.coords.latitude, pos.coords.longitude, true); fillAddressFromPin(pos.coords.latitude, pos.coords.longitude); },
    () => toast("ما قدرنا نحدد موقعك — اضغط على الخريطة لتحدده بإيدك"),
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

/* ---- merchant: edit the public listing ---- */

function screenMerchantProfile() {
  if (!S._mprof) { S._mprof = { loading: true }; loadMerchantProfile(); }
  const m = S._mprof;
  if (m.loading) return backRow() + spinner();
  return `
    ${backRow()}
    <h1 class="screen-title">بيانات المحل ومكانه</h1>
    <p class="screen-sub">هي اللي بتظهر للزبائن على الخريطة وبصفحة محلك</p>
    <div class="section-title">${esc(t("mp.secName"))}</div>
    <div class="field"><label>اسم المحل</label><input id="mp-name" placeholder="مثال: مطعم الياسمين" value="${esc(m.name || "")}" /></div>
    <div class="section-title">${esc(t("mp.secProfession"))}</div>
    ${m.suggestion && m.suggestion.status === "PENDING" ? `<div class="info-banner">${esc(t("cat.sugPending", { name: m.suggestion.name }))}</div>` : ""}
    ${m.suggestion && m.suggestion.status === "REJECTED" ? `<div class="error-banner">${esc(t("cat.sugRejected", { name: m.suggestion.name }))}${m.suggestion.note ? " — " + esc(m.suggestion.note) : ""}</div>` : ""}
    ${categoryPickerHtml(m.categories || [], m.categoryId, "mprofCategory", "sendCategorySuggestion()")}
    <div class="section-title">${esc(t("mp.secContact"))}</div>
    <div class="field"><label>${esc(t("mp.address"))}</label><input id="mp-address" placeholder="${esc(t("mp.addressPh"))}" value="${esc(m.address || "")}" /></div>
    ${catIsOnline(m.categories || [], m.categoryId) ? `<div class="info-banner">${esc(t("cat.onlineNote"))}</div>` : pickerHtml()}
    <div class="row">
      <div class="field"><label>الهاتف</label><input id="mp-phone" placeholder="+963 9xx xxx xxx" value="${esc(m.phone || "")}" /></div>
      <div class="field"><label>واتساب (مع رمز الدولة)</label><input id="mp-whatsapp" placeholder="مثال: 963912345678" value="${esc(m.whatsapp || "")}" /></div>
    </div>
    ${errorBanner()}
    <button class="btn" onclick="saveMerchantProfile()">حفظ</button>
    ${m.msg ? `<p class="muted" style="text-align:center;margin-top:8px">${esc(m.msg)}</p>` : ""}
  `;
}

async function loadMerchantProfile() {
  const [me, cats] = await Promise.all([api("GET", "/merchant/me"), api("GET", "/categories?lang=" + LANG)]);
  const d = me.ok ? me.data : {};
  S._mprof = { loading: false, suggestion: d.categorySuggestion || null, name: d.businessName, categoryId: d.categoryId, address: d.address, phone: d.phone, whatsapp: d.whatsapp, categories: cats.ok ? cats.data : [], msg: "" };
  pickReset(d.latitude != null ? d.latitude : null, d.longitude != null ? d.longitude : null);
  render();
}

function snapshotMprof() {
  const m = S._mprof;
  [["name", "mp-name"], ["address", "mp-address"], ["phone", "mp-phone"], ["whatsapp", "mp-whatsapp"]].forEach(([k, id]) => { if (qs(id)) m[k] = qs(id).value; });
}
async function sendCategorySuggestion() {
  const name = (S._catSug || "").trim();
  if (name.length < 2) { toast(t("cat.sugNeed")); return; }
  const { ok, data } = await api("POST", "/merchant/category-suggestions", { name });
  if (ok) { S._catSug = ""; S._catSugOpen = false; S._mprof = null; toast(t("cat.sugSent")); }
  else toast(errMsg(data, t("photo.failed")));
  render();
}

function mprofCategory(id) { snapshotMprof(); S._mprof.categoryId = id; render(); }

async function saveMerchantProfile() {
  snapshotMprof();
  const m = S._mprof;
  const body = { businessName: (m.name || "").trim(), ...(m.categoryId ? { categoryId: m.categoryId } : {}), address: (m.address || "").trim() || null, phone: (m.phone || "").trim() || null, whatsapp: (m.whatsapp || "").replace(/\D/g, "") || null };
  if (S._pick && S._pick.lat != null && !catIsOnline(m.categories || [], m.categoryId)) { body.latitude = S._pick.lat; body.longitude = S._pick.lng; }
  if (!catIsOnline(m.categories || [], m.categoryId) && body.latitude == null && !body.address) { S.error = t("addr.need"); return render(); }
  S.error = null;
  const { ok, data } = await api("PATCH", "/merchant/me", body);
  m.msg = ok ? "✅ انحفظت بيانات المحل" : "";
  if (!ok) S.error = errMsg(data, "تعذّر الحفظ");
  S._onboarding = null;
  render();
}

/* ---- merchant: what's left before the shop shows up on the map ---- */

function merchantChecklistHtml() {
  if (!S._onboarding) S._onboarding = { steps: null, at: 0 };
  const o = S._onboarding;
  if (!o.fetching && Date.now() - o.at > 15000) { o.fetching = true; loadOnboarding(); }
  if (!o.steps) return "";
  const done = Object.values(o.steps).filter(Boolean).length;
  if (done === 5 && o.steps.approved) return "";
  const item = (ok, label, action) => `<div class="check-item ${ok ? "ok" : ""}" ${ok ? "" : `onclick="${action}"`}><span>${ok ? "✅" : "⬜"}</span> ${label}</div>`;
  return `
    <div class="card checklist slim">
      <div class="title-line" onclick="S._checklistOpen=!S._checklistOpen;render()" style="cursor:pointer"><strong>جهّز محلك ليظهر للزبائن</strong><span class="badge ${o.steps.approved ? "success" : "warning"}">${done}/5 ${S._checklistOpen ? "▴" : "▾"}</span></div>
      <div class="check-line"><i style="width:${done * 20}%"></i></div>
      ${!S._checklistOpen ? "" : `${o.steps.approved ? "" : `<p class="muted" style="margin:4px 0 8px">⏳ طلبك بانتظار موافقة الإدارة — ما رح يظهر محلك على الخريطة قبلها.</p>`}
      ${item(o.steps.location, "حدّد موقع نشاطك على الخريطة", "S._mprof=null;go('merchantProfile')")}
      ${item(o.steps.hours, "حدّد ساعات العمل", "S._hours=null;go('merchantHours')")}
      ${item(o.steps.discount, "أضف حسم للأعضاء", "setMerchantTab('catalog')")}
      ${item(o.steps.product, "أضف أول منتج", "setMerchantTab('catalog')")}
      ${item(o.steps.approved, "موافقة الإدارة", "")}`}
    </div>`;
}

async function loadOnboarding() {
  const { ok, data } = await api("GET", "/merchant/me");
  const prev = S._onboarding && S._onboarding.steps;
  const steps = ok ? data.onboarding : prev;
  S._onboarding = { steps, at: Date.now(), fetching: false };
  if (JSON.stringify(steps) !== JSON.stringify(prev)) render();
}

/* ---- in-app route: the road, distance and time, drawn on the map ---- */

function fmtDuration(seconds) {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m >= 60) return t("dur.hm", { h: Math.floor(m / 60), m: m % 60 });
  return m === 1 ? t("dur.min1") : m === 2 ? t("dur.min2") : m <= 10 ? t("dur.min3to10", { n: m }) : t("dur.min", { n: m });
}
function fmtDistance(meters) {
  return meters < 1000 ? `${meters} ${t("unit.m")}` : `${(meters / 1000).toFixed(1)} ${t("unit.km")}`;
}

function locateUser() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/* ---- directions: choose car or walking, then "start trip" gives live turn-by-turn guidance ---- */

async function fetchRouteOption(from, dest, mode) {
  const q = new URLSearchParams({ fromLat: from.lat, fromLng: from.lng, toLat: dest.lat, toLng: dest.lng, mode });
  const { ok, data } = await api("GET", "/route?" + q.toString());
  return ok ? data : { error: errMsg(data, t("route.failed")) };
}

async function startRoute(merchantId, mode) {
  const d = discoverState();
  const lmPlace = (typeof LM !== "undefined" ? LM.items : []).find((x) => x.id === merchantId);
  const m = d.merchants.find((x) => x.id === merchantId) || (S._merchantDetail && S._merchantDetail.merchant) || (lmPlace && { businessName: lmPlace.name, latitude: lmPlace.latitude, longitude: lmPlace.longitude });
  if (!m || m.latitude == null) return;
  if (!d.userLoc) {
    try { d.userLoc = await locateUser(); S._centeredUser = true; }
    catch (e) { return toast(t("route.needLocation")); }
  }
  endNavigationQuietly();
  S._route = { merchantId, mode: mode || "driving", phase: "preview", name: m.businessName, dest: { lat: m.latitude, lng: m.longitude }, loading: true };
  d.selectedId = merchantId;
  S.stack = []; S.screen = "home"; S.params = {}; S.homeTab = "discover"; S._sheet = "peek";
  render();
  // both ways are asked at once so the person can compare the times before choosing
  const [driving, walking] = await Promise.all([fetchRouteOption(d.userLoc, S._route.dest, "driving"), fetchRouteOption(d.userLoc, S._route.dest, "walking")]);
  if (!S._route) return; // cancelled meanwhile
  S._route.loading = false;
  S._route.options = { driving, walking };
  const chosen = S._route.options[S._route.mode];
  if (chosen && !chosen.error) S._route.data = chosen; else S._route.error = (chosen && chosen.error) || t("route.failed");
  render();
}

function setRouteMode(mode) {
  const r = S._route;
  if (!r || r.mode === mode || r.phase === "navigating" || !r.options) return;
  r.mode = mode;
  const chosen = r.options[mode];
  r.data = chosen && !chosen.error ? chosen : null;
  r.error = chosen && chosen.error ? chosen.error : null;
  render();
}

function cancelRoute() { endNavigationQuietly(); S._route = null; render(); }

function routeOptionHtml(r, mode, icon, label) {
  const o = r.options && r.options[mode];
  const detail = !o ? "…" : o.error ? "—" : `<b>${fmtDuration(o.durationSeconds)}</b><small>${fmtDistance(o.distanceMeters)}</small>`;
  return `<button class="route-opt ${r.mode === mode ? "active" : ""}" onclick="setRouteMode('${mode}')"><span class="route-opt-ico">${icon}</span><span class="route-opt-text">${esc(label)}</span><span class="route-opt-val">${detail}</span></button>`;
}

function routeBarHtml() {
  const r = S._route;
  if (!r) return "";
  if (r.phase === "navigating") return navBannerHtml();
  const status = r.loading ? `<div class="muted" style="padding:6px 2px">${esc(t("route.calculating"))}</div>` : r.error ? `<div style="color:var(--danger);padding:6px 2px">${esc(r.error)}</div>` : "";
  return `
    <div class="route-bar">
      <div class="route-title"><span>${esc(t("route.to", { name: r.name }))}</span><button class="route-x" onclick="cancelRoute()">✕</button></div>
      <div class="route-opts">
        ${routeOptionHtml(r, "driving", "🚗", t("nav.drive"))}
        ${routeOptionHtml(r, "walking", "🚶", t("nav.walk"))}
      </div>
      ${status}
      <button class="btn route-start" ${r.data ? "" : "disabled"} onclick="startNavigation()">▶ ${esc(t("nav.start"))}</button>
      <a class="route-google" href="${directionsUrl(r.dest.lat, r.dest.lng)}" target="_blank" rel="noopener">${esc(t("route.google"))}</a>
    </div>`;
}

function syncRouteLayer() {
  const map = S._map;
  if (!map) return;
  const r = S._route;
  const key = r && r.data ? `${r.merchantId}|${r.mode}|${r.data.distanceMeters}|${r.data.geometry.length}` : "";
  if (key === S._routeDrawn) return;
  S._routeDrawn = key;
  if (S._routeLayer) { map.removeLayer(S._routeLayer); S._routeLayer = null; }
  if (!r || !r.data || !r.data.geometry.length) return;
  S._routeLayer = L.polyline(r.data.geometry, { color: r.mode === "walking" ? "#1e6fe0" : "#ba2a34", weight: 6, opacity: 0.9, dashArray: r.mode === "walking" ? "1 10" : null, lineCap: "round" }).addTo(map);
  if (!(S._nav && S._nav.follow)) moveMap(() => map.fitBounds(S._routeLayer.getBounds(), { padding: [50, 50], animate: false }));
}

/* -- the live trip -- */

const NAV_ARROWS = { left: "↰", right: "↱", "slight left": "↖", "slight right": "↗", "sharp left": "⬉", "sharp right": "⬈", straight: "↑", uturn: "↶" };

function navArrow(step) {
  if (!step) return "↑";
  if (step.type === "arrive") return "📍";
  if (step.type === "depart") return "🚩";
  if (step.type === "roundabout" || step.type === "rotary") return "⟳";
  return NAV_ARROWS[step.modifier] || "↑";
}

function navInstruction(step) {
  if (!step) return "";
  const onto = step.name ? " " + t("nav.on", { name: step.name }) : "";
  const stay = step.name ? " " + t("nav.stay", { name: step.name }) : "";
  const side = /left/.test(step.modifier) ? "left" : /right/.test(step.modifier) ? "right" : "";
  const ord = (n) => { const w = t("nav.ord." + n); return w === "nav.ord." + n ? String(n) : w; };
  switch (step.type) {
    case "arrive": return side ? t("nav.arrive." + side) : t("nav.arrive");
    case "depart": return t("nav.depart") + stay;
    case "roundabout": case "rotary": return step.exit ? t("nav.roundabout", { n: ord(step.exit) }) + onto : t("nav.roundaboutEnter");
    case "exit roundabout": case "exit rotary": return t("nav.roundaboutExit") + onto;
    case "merge": return t("nav.merge") + stay;
    case "on ramp": case "off ramp": return t("nav.ramp") + onto;
    case "fork": return (side ? t("nav.fork." + side) : t("nav.continue")) + onto;
    case "end of road": return (side ? t("nav.endofroad." + side) : t("nav.continue")) + onto;
    case "new name": case "continue": return (step.modifier && step.modifier !== "straight" ? t("nav.turn." + step.modifier) + onto : t("nav.continue") + stay);
    default: return t("nav.turn." + (step.modifier || "straight")) + (step.modifier === "straight" || !step.modifier ? stay : onto); // turn, and anything unknown
  }
}

/** A distance the way a person says it ("200 metres", "a kilometre and a half"), so the voice does not read "م". */
function spokenDistance(m) {
  if (m < 1000) return t("nav.say.m", { n: Math.max(50, Math.round(m / 50) * 50) });
  const km = Math.round(m / 500) / 2;
  const key = "nav.say.km." + km;
  const special = t(key);
  if (special !== key) return special;
  return Number.isInteger(km) ? t("nav.say.km", { n: km }) : t("nav.say.kmHalf", { n: Math.floor(km) });
}

function metersBetween(a, b) { return haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000; }

/** Distance from a point to the drawn route (the nearest segment), in metres. */
function distanceToRoute(pos, geometry) {
  if (!geometry.length) return Infinity;
  const k = Math.cos((pos.lat * Math.PI) / 180);
  const px = pos.lng * k * 111320, py = pos.lat * 110540;
  let best = Infinity;
  for (let i = 0; i < geometry.length - 1; i++) {
    const ax = geometry[i][1] * k * 111320, ay = geometry[i][0] * 110540;
    const bx = geometry[i + 1][1] * k * 111320, by = geometry[i + 1][0] * 110540;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
    if (d < best) best = d;
  }
  return best;
}

function navVoiceOn() { try { return localStorage.getItem("dlk_nav_voice") !== "0"; } catch (e) { return true; } }

function navSpeak(text) {
  const n = S._nav;
  if (!n || !n.voice || !text || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG === "ar" ? "ar-SA" : "en-US";
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

async function requestNavWakeLock() {
  try { if (navigator.wakeLock) S._navLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}

function startNavigation() {
  const r = S._route;
  if (!r || !r.data || r.phase === "navigating") return;
  if (!navigator.geolocation) return toast(t("route.needLocation"));
  const steps = r.data.steps || [];
  r.phase = "navigating";
  S._nav = { idx: Math.min(1, Math.max(0, steps.length - 1)), pos: null, heading: null, acc: null, off: 0, lastReroute: 0, spoke: {}, voice: navVoiceOn(), follow: true, arrived: false, dist: null, remM: r.data.distanceMeters, remS: r.data.durationSeconds, rerouting: false };
  S._nav.watch = navigator.geolocation.watchPosition(onNavPosition, onNavError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  requestNavWakeLock();
  if (S._map) S._map.on("dragstart", navUserDragged);
  if (S._userLayer && S._map) S._map.removeLayer(S._userLayer); // the live marker replaces the "you are here" dot
  navSpeak(navInstruction(steps[0]));
  render();
}

function navUserDragged() {
  if (!S._nav) return;
  S._nav.follow = false;
  const b = document.getElementById("nav-recenter");
  if (b) b.style.display = "inline-flex";
}

function navRecenter() {
  const n = S._nav;
  if (!n) return;
  n.follow = true;
  const b = document.getElementById("nav-recenter");
  if (b) b.style.display = "none";
  if (n.pos && S._map) moveMap(() => S._map.setView([n.pos.lat, n.pos.lng], 17, { animate: true }));
}

function onNavError() {
  toast(t("nav.noGps"));
}

async function onNavPosition(p) {
  const n = S._nav, r = S._route;
  if (!n || !r || r.phase !== "navigating" || !r.data || n.arrived) return;
  const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
  n.pos = pos;
  n.acc = p.coords.accuracy;
  if (p.coords.heading != null && !isNaN(p.coords.heading)) n.heading = p.coords.heading;
  const walking = r.mode === "walking";
  const steps = r.data.steps || [];

  // off the road for a few readings in a row: ask for a new route from here
  const off = distanceToRoute(pos, r.data.geometry);
  const limit = Math.max(walking ? 45 : 70, (n.acc || 0) * 1.5);
  n.off = off > limit ? n.off + 1 : 0;
  if (n.off >= 3 && Date.now() - n.lastReroute > 15000) return navReroute(pos);

  // arrived? the shop itself can sit well off the road, so the end of the route counts too
  const endStep = steps[steps.length - 1];
  const toEnd = endStep ? metersBetween(pos, { lat: endStep.location[0], lng: endStep.location[1] }) : Infinity;
  if (Math.min(metersBetween(pos, r.dest), toEnd) < Math.max(walking ? 20 : 35, n.acc || 0)) {
    n.arrived = true;
    navSpeak(t("nav.arrive"));
    drawNavMarker();
    render();
    return;
  }

  // passed the manoeuvre we were heading to?
  let moved = false;
  while (n.idx < steps.length - 1 && metersBetween(pos, { lat: steps[n.idx].location[0], lng: steps[n.idx].location[1] }) < (walking ? 15 : 25)) { n.idx++; moved = true; }
  const next = steps[n.idx];
  n.dist = next ? metersBetween(pos, { lat: next.location[0], lng: next.location[1] }) : 0;

  // what is left
  let remM = n.dist, remS = 0;
  const speed = r.data.distanceMeters / Math.max(1, r.data.durationSeconds);
  for (let k = n.idx; k < steps.length; k++) { remM += steps[k].distanceMeters; remS += steps[k].durationSeconds; }
  n.remM = remM;
  n.remS = remS + n.dist / Math.max(0.5, speed);

  // voice: once when it is near, and once at the manoeuvre
  if (next) {
    const key = n.idx;
    const near = walking ? 40 : 180;
    if (n.dist < near && !n.spoke[key + "n"]) { n.spoke[key + "n"] = true; navSpeak(t("nav.say.in", { d: spokenDistance(n.dist) }) + " " + navInstruction(next)); }
    else if (moved && !n.spoke[key]) { n.spoke[key] = true; navSpeak(navInstruction(next)); }
  }

  drawNavMarker();
  if (moved) render(); else updateNavUi();
}

async function navReroute(pos) {
  const n = S._nav, r = S._route;
  if (!n || !r) return;
  n.lastReroute = Date.now();
  n.off = 0;
  n.rerouting = true;
  updateNavUi();
  const data = await fetchRouteOption(pos, r.dest, r.mode);
  if (!S._nav || !S._route) return;
  n.rerouting = false;
  if (data.error) return updateNavUi();
  r.data = data;
  r.options = { ...(r.options || {}), [r.mode]: data };
  n.idx = Math.min(1, Math.max(0, (data.steps || []).length - 1));
  n.spoke = {};
  navSpeak(t("nav.rerouted"));
  render();
}

function drawNavMarker() {
  const n = S._nav, map = S._map;
  if (!n || !map || !n.pos) return;
  const html = `<div class="nav-me"><div class="nav-me-dot"></div>${n.heading != null ? `<div class="nav-me-arrow" style="transform:rotate(${Math.round(n.heading)}deg)"></div>` : ""}</div>`;
  const icon = L.divIcon({ className: "nav-me-wrap", html, iconSize: [34, 34], iconAnchor: [17, 17] });
  if (!S._navMarker) S._navMarker = L.marker([n.pos.lat, n.pos.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  else { S._navMarker.setLatLng([n.pos.lat, n.pos.lng]); S._navMarker.setIcon(icon); }
  if (n.follow) moveMap(() => map.setView([n.pos.lat, n.pos.lng], Math.max(map.getZoom(), 17), { animate: true }));
}

function navEtaText(n) {
  const eta = new Date(Date.now() + (n.remS || 0) * 1000).toLocaleTimeString(LANG === "ar" ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  return t("nav.eta", { time: eta });
}

/** Updates the numbers on screen without redrawing the whole map screen on every GPS reading. */
function updateNavUi() {
  const n = S._nav, r = S._route;
  if (!n || !r || !r.data) return;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const step = (r.data.steps || [])[n.idx];
  set("nav-dist", n.rerouting ? t("nav.rerouting") : n.dist == null ? t("nav.waitGps") : fmtDistance(Math.round(n.dist)));
  set("nav-instr", navInstruction(step));
  set("nav-arrow", navArrow(step));
  set("nav-eta", navEtaText(n));
  set("nav-rem", `${fmtDuration(n.remS)} · ${fmtDistance(Math.round(n.remM))}`);
}

function navBannerHtml() {
  const r = S._route, n = S._nav;
  if (!r || !n || !r.data) return "";
  if (n.arrived) {
    return `<div class="nav-banner arrived"><div class="nav-arrow">📍</div><div class="nav-text"><strong>${esc(t("nav.arrive"))}</strong><span>${esc(r.name)}</span></div><button class="chip active" onclick="finishNavigation()">${esc(t("nav.done"))}</button></div>`;
  }
  const step = (r.data.steps || [])[n.idx];
  return `<div class="nav-banner">
    <div class="nav-arrow" id="nav-arrow">${navArrow(step)}</div>
    <div class="nav-text"><strong id="nav-dist">${esc(n.rerouting ? t("nav.rerouting") : n.dist == null ? t("nav.waitGps") : fmtDistance(Math.round(n.dist)))}</strong><span id="nav-instr">${esc(navInstruction(step))}</span></div>
  </div>`;
}

function navBottomHtml() {
  const r = S._route, n = S._nav;
  if (!r || r.phase !== "navigating" || !n || n.arrived) return "";
  return `<div class="nav-bottom">
    <div class="nav-stats"><strong id="nav-eta">${esc(navEtaText(n))}</strong><span id="nav-rem">${esc(fmtDuration(n.remS))} · ${esc(fmtDistance(Math.round(n.remM)))}</span></div>
    <div class="nav-actions">
      <button class="chip" id="nav-recenter" style="display:${n.follow ? "none" : "inline-flex"}" onclick="navRecenter()">🎯</button>
      <button class="chip" onclick="toggleNavVoice()">${n.voice ? "🔊" : "🔇"}</button>
      <button class="chip nav-end" onclick="endNavigation()">${esc(t("nav.end"))}</button>
    </div>
  </div>`;
}

function toggleNavVoice() {
  const n = S._nav;
  if (!n) return;
  n.voice = !n.voice;
  try { localStorage.setItem("dlk_nav_voice", n.voice ? "1" : "0"); } catch (e) {}
  if (!n.voice && "speechSynthesis" in window) window.speechSynthesis.cancel();
  render();
}

/** Stops listening to the GPS and clears the live marker; the route itself stays unless the caller drops it. */
function endNavigationQuietly() {
  const n = S._nav;
  if (n && n.watch != null) navigator.geolocation.clearWatch(n.watch);
  if (S._map) S._map.off("dragstart", navUserDragged);
  if (S._navMarker && S._map) { S._map.removeLayer(S._navMarker); }
  S._navMarker = null;
  if (S._userLayer && S._map && !S._map.hasLayer(S._userLayer)) S._map.addLayer(S._userLayer);
  try { if (S._navLock) S._navLock.release(); } catch (e) {}
  S._navLock = null;
  if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  S._nav = null;
  if (S._route && S._route.phase === "navigating") S._route.phase = "preview";
}

function endNavigation() { endNavigationQuietly(); render(); }
function finishNavigation() { endNavigationQuietly(); S._route = null; render(); }

/* ---- account: email verification nudge (only when mail can actually be delivered) ---- */

async function loadAccountInfo() {
  if (!S.token) return;
  const { ok, data } = await api("GET", "/auth/me");
  S.account = ok ? { email: data.user.email, emailVerified: data.user.emailVerified, emailDeliveryEnabled: data.emailDeliveryEnabled } : {};
  render();
}

function verifyBannerHtml() {
  const a = S.account;
  if (!a || a.emailVerified || !a.emailDeliveryEnabled) return "";
  return `<div class="card" style="text-align:right;width:100%"><strong>${esc(t("verify.title"))}</strong>
    <p class="muted" style="margin:4px 0 8px">${esc(t("verify.sub"))}</p>
    <button class="btn small outline" style="width:auto" onclick="resendVerification()">${esc(t("verify.resend"))}</button></div><div style="height:12px"></div>`;
}

async function resendVerification() {
  const { ok } = await api("POST", "/auth/resend-verification", { email: S.account.email });
  toast(ok ? t("verify.sent") : t("verify.failed"));
}

/* ================= ACCOUNT PROFILE: photo + description ================= */

// A round profile photo, or the first letter of the name when there is none.
function avatarHtml(url, name, cls) {
  const extra = cls ? " " + cls : "";
  return url
    ? `<img class="avatar${extra}" src="${esc(url)}" alt="">`
    : `<div class="avatar${extra}">${esc((name || "?").slice(0, 1))}</div>`;
}

async function loadProfile() {
  const { ok, data } = await api("GET", "/profile/me");
  S._profile = ok ? data : { failed: true };
  render();
}

/* ================= ACCOUNT SETTINGS: email, password, phone, place, addresses ================= */

function screenAccount() {
  if (!S._acct) { S._acct = { loading: true, addr: null }; loadAccount(); }
  const a = S._acct;
  if (a.loading) return backRow() + `<h1 class="screen-title">إعدادات الحساب</h1>${spinner()}`;
  const p = a.profile;
  const unitName = (u) => geoName(u);
  const opt = (value, label, chosen) => `<option value="${esc(value)}" ${String(chosen || "") === String(value) ? "selected" : ""}>${esc(label)}</option>`;
  const note = a.msg ? `<div class="card" style="border-color:var(--primary)">${esc(a.msg)}</div>` : "";
  const err = a.err ? `<div class="error-banner">${esc(a.err)}</div>` : "";
  const f = a.addr;
  const LABELS = { HOME: "البيت", WORK: "العمل", OTHER: "غير ذلك" };
  return `
    ${backRow()}
    <h1 class="screen-title">إعدادات الحساب</h1>
    ${note}${err}
    ${lookAndLanguageHtml()}
    ${refEnterCardHtml()}

    <div class="card">
      <div class="section-title" style="margin-top:0">الإيميل</div>
      <p dir="ltr" style="margin:4px 0;text-align:right"><strong>${esc(p.email)}</strong></p>
      <p class="muted">${p.emailVerified ? "✅ مؤكَّد" : "⚠️ غير مؤكَّد"}</p>
      ${a.emailDelivery ? `
        <div class="divider"></div>
        <div class="field"><label>الإيميل الجديد</label><input id="ac-newemail" placeholder="name@example.com" type="email" dir="ltr" autocomplete="email" /></div>
        <div class="field"><label>كلمة السر للتأكيد</label><input id="ac-email-pw" placeholder="••••••••" type="password" autocomplete="current-password" /></div>
        <p class="muted">رح نبعت رابط تأكيد للإيميل الجديد، وتنبيه للقديم. بعد التأكيد بتسجّل دخول من جديد بالإيميل الجديد.</p>
        <button class="btn small" onclick="acctChangeEmail()">تغيير الإيميل</button>` : `<p class="muted">تغيير الإيميل مش متوفر حاليًا (خدمة البريد غير مفعّلة بعد).</p>`}
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">كلمة السر</div>
      <div class="field"><label>كلمة السر الحالية</label><input id="ac-pw-old" placeholder="••••••••" type="password" autocomplete="current-password" /></div>
      <div class="field"><label>كلمة السر الجديدة (8 أحرف على الأقل)</label><input id="ac-pw-new" placeholder="8 أحرف على الأقل" type="password" autocomplete="new-password" /></div>
      <div class="field"><label>أعد كتابة الجديدة</label><input id="ac-pw-new2" placeholder="••••••••" type="password" autocomplete="new-password" /></div>
      <button class="btn small" onclick="acctChangePassword()">تغيير كلمة السر</button>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">رقم الهاتف</div>
      <div class="field"><input id="ac-phone" inputmode="tel" dir="ltr" placeholder="+963 9xx xxx xxx" value="${esc(p.phone || "")}" /></div>
      <button class="btn small" onclick="acctSavePhone()">حفظ</button>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">بلدي ومدينتي</div>
      <p class="muted">بتأثر على الأسعار والضريبة بالفواتير.</p>
      <div class="field"><label>البلد</label>
        <select id="ac-country" onchange="acctPickProfileCountry(this.value)">${opt("", "— اختر —", p.countryCode)}${a.countries.map((c) => opt(c.isoCode2, unitName(c), p.countryCode)).join("")}</select></div>
      ${(a.regions || []).length ? `<div class="field"><label>المحافظة</label>
        <select id="ac-region" onchange="acctPickProfileRegion(this.value)">${opt("", "— اختر —", a.regionId)}${a.regions.map((c) => opt(c.id, unitName(c), a.regionId)).join("")}</select></div>` : ""}
      <div class="field"><label>المدينة</label>
        <select id="ac-city">${opt("", "— اختر —", p.cityId)}${a.cities.map((c) => opt(c.id, unitName(c), p.cityId)).join("")}</select></div>
      <div class="field"><label>الرقم الضريبي (اختياري)</label><input id="ac-vat" placeholder="مثال: DE123456789" dir="ltr" value="${esc(p.vatNumber || "")}" /></div>
      <button class="btn small" onclick="acctSaveLocation()">حفظ</button>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">عناويني</div>
      ${a.addresses.length ? a.addresses.map((ad) => `
        <div style="padding:8px 0;border-top:1px solid var(--border)">
          <div class="title-line"><strong>${esc(LABELS[ad.label] || "عنوان")}</strong>${ad.isDefault ? `<span class="badge success">الأساسي</span>` : ""}</div>
          <p class="muted">${esc([ad.street, ad.buildingNumber, ad.area && unitName(ad.area), ad.city && unitName(ad.city), ad.region && unitName(ad.region), unitName(ad.country)].filter(Boolean).join("، "))}</p>
          <div class="row">
            ${ad.isDefault ? "" : `<button class="btn small outline" onclick="acctDefaultAddress('${ad.id}')">اجعله الأساسي</button>`}
            <button class="btn small outline" onclick="acctDeleteAddress('${ad.id}')">حذف</button>
          </div>
        </div>`).join("") : `<p class="muted">ما عندك عناوين محفوظة</p>`}
      ${f ? `
        <div class="divider"></div>
        <div class="field"><label>النوع</label>
          <select id="ad-label">${["HOME", "WORK", "OTHER"].map((k) => opt(k, LABELS[k], f.label)).join("")}</select></div>
        <div class="field"><label>البلد</label>
          <select id="ad-country" onchange="acctAddrPick('country', this.value)">${opt("", "— اختر —", f.countryId)}${a.allCountries.map((c) => opt(c.id, unitName(c), f.countryId)).join("")}</select></div>
        ${f.regions.length ? `<div class="field"><label>المحافظة / المنطقة</label>
          <select id="ad-region" onchange="acctAddrPick('region', this.value)">${opt("", "— اختر —", f.regionId)}${f.regions.map((u) => opt(u.id, unitName(u), f.regionId)).join("")}</select></div>` : ""}
        ${f.cities.length ? `<div class="field"><label>المدينة</label>
          <select id="ad-city" onchange="acctAddrPick('city', this.value)">${opt("", "— اختر —", f.cityId)}${f.cities.map((u) => opt(u.id, unitName(u), f.cityId)).join("")}</select></div>` : ""}
        ${f.areas.length ? `<div class="field"><label>الحي</label>
          <select id="ad-area" onchange="acctAddrPick('area', this.value)">${opt("", "— اختر —", f.areaId)}${f.areas.map((u) => opt(u.id, unitName(u), f.areaId)).join("")}</select></div>` : ""}
        <div class="field"><label>الشارع</label><input id="ad-street" placeholder="مثال: شارع الثورة" value="${esc(f.street)}" /></div>
        <div class="row">
          <div class="field"><label>رقم البناء</label><input id="ad-building" placeholder="مثال: 12" value="${esc(f.buildingNumber)}" /></div>
          <div class="field"><label>الرمز البريدي</label><input id="ad-postal" placeholder="مثال: 10115" dir="ltr" value="${esc(f.postalCode)}" /></div>
        </div>
        <label class="switch-row"><input id="ad-default" type="checkbox" ${f.isDefault ? "checked" : ""} /><span>اجعله عنواني الأساسي</span></label>
        <div class="row">
          <button class="btn small" onclick="acctSaveAddress()">حفظ العنوان</button>
          <button class="btn small outline" onclick="S._acct.addr=null;render()">إلغاء</button>
        </div>` : `<div style="height:8px"></div><button class="btn small" onclick="acctNewAddress()">➕ إضافة عنوان</button>`}
    </div>
  `;
}

async function loadAccount() {
  const [me, addresses, countries, auth] = await Promise.all([api("GET", "/profile/me"), api("GET", "/addresses"), api("GET", "/geo/countries"), api("GET", "/auth/me")]);
  if (!me.ok) { S._acct = null; return render(); }
  const list = countries.ok ? countries.data : [];
  S._acct = { loading: false, emailDelivery: auth.ok && !!auth.data.emailDeliveryEnabled, profile: me.data, addresses: addresses.ok ? addresses.data : [], countries: list, allCountries: list, cities: [], addr: null };
  await acctLoadCities(me.data.countryCode);
  render();
}

/** The governorates of the country, and the cities of the chosen governorate (the saved city's governorate is found from its parent). */
async function acctLoadCities(isoCode) {
  const a = S._acct;
  const country = a.countries.find((c) => c.isoCode2 === isoCode);
  a.regions = [];
  a.cities = [];
  if (!country) return;
  const regions = await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "REGION" }));
  if (regions.ok && regions.data.length) {
    a.regions = regions.data;
    if (a.profile && a.profile.cityId && !a.regionId) {
      const city = await api("GET", "/geo/units/" + a.profile.cityId);
      if (city.ok && city.data.parentId) a.regionId = city.data.parentId;
    }
    if (a.regionId) {
      const cities = await api("GET", "/geo/units?" + new URLSearchParams({ parentId: a.regionId, level: "CITY" }));
      if (cities.ok) a.cities = cities.data;
    }
    return;
  }
  const cities = await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "CITY" }));
  if (cities.ok) a.cities = cities.data;
}

function acctDone(message, error) {
  S._acct.msg = message || null;
  S._acct.err = error || null;
  render();
  window.scrollTo(0, 0);
}

async function acctChangePassword() {
  const current = qs("ac-pw-old").value, next = qs("ac-pw-new").value, again = qs("ac-pw-new2").value;
  if (!current || !next) return acctDone(null, "اكتب كلمة السر الحالية والجديدة");
  if (next.length < 8) return acctDone(null, "كلمة السر الجديدة لازم تكون 8 أحرف على الأقل");
  if (next !== again) return acctDone(null, "كلمتا السر الجديدتان غير متطابقتين");
  // a wrong current password answers 401 like an expired session, so call fetch directly and keep the visitor signed in
  const res = await fetch(API_BASE + "/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Language": LANG, Authorization: "Bearer " + S.token },
    body: JSON.stringify({ currentPassword: current, newPassword: next }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return acctDone(null, res.status === 401 ? "كلمة السر الحالية غير صحيحة" : errMsg(data, "تعذّر تغيير كلمة السر"));
  if (data.token) S.token = data.token, localStorage.setItem("dlk_token", data.token); // this device stays signed in
  S._acct = null;
  S._acct = { loading: true, addr: null, msg: "تم تغيير كلمة السر ✅" };
  loadAccount().then(() => { S._acct.msg = "تم تغيير كلمة السر ✅"; render(); });
  render();
}

async function acctChangeEmail() {
  const newEmail = qs("ac-newemail").value.trim();
  const password = qs("ac-email-pw").value;
  if (!newEmail || !password) return acctDone(null, "اكتب الإيميل الجديد وكلمة السر");
  const { ok, data } = await api("POST", "/auth/change-email", { newEmail, password });
  if (!ok) return acctDone(null, errMsg(data, "تعذّر طلب تغيير الإيميل"));
  acctDone(data.message || "أرسلنا رابط التأكيد للبريد الجديد");
}

async function acctSavePhone() {
  const { ok, data } = await api("PATCH", "/profile/me", { phone: qs("ac-phone").value.trim() });
  if (!ok) return acctDone(null, errMsg(data, "تعذّر حفظ الرقم"));
  S._acct.profile = data;
  acctDone("تم حفظ الرقم ✅");
}

async function acctPickProfileCountry(isoCode) {
  S._acct.profile.countryCode = isoCode || null;
  S._acct.profile.cityId = null;
  S._acct.regionId = null;
  await acctLoadCities(isoCode);
  render();
}

async function acctPickProfileRegion(regionId) {
  const a = S._acct;
  a.regionId = regionId || null;
  a.profile.cityId = null;
  a.cities = [];
  if (regionId) {
    const { ok, data } = await api("GET", "/geo/units?" + new URLSearchParams({ parentId: regionId, level: "CITY" }));
    if (ok) a.cities = data;
  }
  render();
}

async function acctSaveLocation() {
  const countryCode = qs("ac-country").value || null;
  const cityId = qs("ac-city").value || null;
  const vatNumber = qs("ac-vat").value.trim() || null;
  const { ok, data } = await api("PATCH", "/profile/me", { countryCode, cityId, vatNumber });
  if (!ok) return acctDone(null, errMsg(data, "تعذّر الحفظ"));
  S._acct.profile = data;
  S._store = null; // another country: another shops list and another money
  loadMarket();
  acctDone("تم الحفظ ✅");
}

/* ---- addresses ---- */

function acctNewAddress() {
  const a = S._acct;
  a.addr = { label: "HOME", countryId: "", regionId: "", cityId: "", areaId: "", regions: [], cities: [], areas: [], street: "", buildingNumber: "", postalCode: "", isDefault: a.addresses.length === 0 };
  render();
}

/** One step down the place pickers: choosing a country loads its governorates, a governorate its cities, a city its areas. */
async function acctAddrPick(level, id) {
  const f = S._acct.addr;
  f.street = qs("ad-street") ? qs("ad-street").value : f.street;
  f.buildingNumber = qs("ad-building") ? qs("ad-building").value : f.buildingNumber;
  f.postalCode = qs("ad-postal") ? qs("ad-postal").value : f.postalCode;
  f.isDefault = qs("ad-default") ? qs("ad-default").checked : f.isDefault;
  f.label = qs("ad-label") ? qs("ad-label").value : f.label;
  const units = async (params) => { const { ok, data } = await api("GET", "/geo/units?" + new URLSearchParams(params)); return ok ? data : []; };
  if (level === "country") {
    Object.assign(f, { countryId: id, regionId: "", cityId: "", areaId: "", regions: id ? await units({ countryId: id, level: "REGION" }) : [], cities: [], areas: [] });
  } else if (level === "region") {
    Object.assign(f, { regionId: id, cityId: "", areaId: "", cities: id ? await units({ parentId: id }) : [], areas: [] });
  } else if (level === "city") {
    Object.assign(f, { cityId: id, areaId: "", areas: id ? await units({ parentId: id }) : [] });
  } else {
    f.areaId = id;
  }
  render();
}

async function acctSaveAddress() {
  const f = S._acct.addr;
  const body = {
    countryId: f.countryId,
    label: qs("ad-label").value,
    street: qs("ad-street").value.trim() || undefined,
    buildingNumber: qs("ad-building").value.trim() || undefined,
    postalCode: qs("ad-postal").value.trim() || undefined,
    isDefault: qs("ad-default").checked,
  };
  if (!body.countryId) return acctDone(null, "اختر البلد");
  if (f.regionId) body.regionId = f.regionId;
  if (f.cityId) body.cityId = f.cityId;
  if (f.areaId) body.areaId = f.areaId;
  const { ok, data } = await api("POST", "/addresses", body);
  if (!ok) return acctDone(null, errMsg(data, "تعذّر حفظ العنوان"));
  const list = await api("GET", "/addresses");
  S._acct.addresses = list.ok ? list.data : S._acct.addresses;
  S._acct.addr = null;
  acctDone("تم حفظ العنوان ✅");
}

async function acctDefaultAddress(id) {
  const { ok, data } = await api("PATCH", "/addresses/" + id, { isDefault: true });
  if (!ok) return acctDone(null, errMsg(data, "تعذّر التنفيذ"));
  const list = await api("GET", "/addresses");
  if (list.ok) S._acct.addresses = list.data;
  acctDone("تم ✅");
}

async function acctDeleteAddress(id) {
  if (!confirm("حذف هذا العنوان؟")) return;
  const { ok, data } = await api("DELETE", "/addresses/" + id);
  if (!ok) return acctDone(null, errMsg(data, "تعذّر الحذف"));
  S._acct.addresses = S._acct.addresses.filter((a) => a.id !== id);
  acctDone("تم الحذف ✅");
}

function screenProfileEdit() {
  if (S._profile == null) { S._profile = {}; loadProfile(); }
  if (S._profile.failed) return backRow() + `<div class="error-banner">تعذّر تحميل ملفك الشخصي — جرّب لاحقاً</div>`;
  if (!S._profile.id) return backRow() + spinner();
  const p = S._profile;
  return `
    ${backRow()}
    <h1 class="screen-title">ملفي الشخصي</h1>
    <div style="text-align:center;margin:8px 0 16px">
      <div style="display:flex;justify-content:center">${avatarHtml(p.avatarUrl, p.fullName, "huge")}</div>
      <div class="row" style="justify-content:center;gap:8px;margin-top:12px">
        <label class="btn small outline" style="width:auto;cursor:pointer">📷 ${p.avatarUrl ? "تغيير الصورة" : "إضافة صورة"}<input type="file" accept="image/*" hidden onchange="uploadAvatar(this.files[0])" /></label>
        ${p.avatarUrl ? `<button class="btn small outline" style="width:auto" onclick="removeAvatar()">حذف الصورة</button>` : ""}
      </div>
    </div>
    <div class="field"><label>الاسم</label><input id="pf-name" placeholder="مثال: أحمد محمد" value="${esc(p.fullName || "")}" /></div>
    <div class="field"><label>نبذة عنك أو عن محلك (بتظهر للزبائن وعلى الفواتير)</label><textarea id="pf-bio" placeholder="نبذة قصيرة عنك، مثال: أحب اكتشاف المحلات الجديدة" rows="4" maxlength="500">${esc(p.bio || "")}</textarea></div>
    ${errorBanner()}
    <button class="btn" onclick="saveProfile()">حفظ</button>
    ${p.msg ? `<p class="muted" style="text-align:center;margin-top:8px">${esc(p.msg)}</p>` : ""}
  `;
}

function snapshotProfile() {
  const p = S._profile;
  if (qs("pf-name")) p.fullName = qs("pf-name").value;
  if (qs("pf-bio")) p.bio = qs("pf-bio").value;
}

async function saveProfile() {
  snapshotProfile();
  const p = S._profile;
  S.error = null;
  const { ok, data } = await api("PATCH", "/profile/me", { fullName: (p.fullName || "").trim(), bio: (p.bio || "").trim() || null });
  if (ok) S._profile = { ...data, msg: "✅ انحفظ ملفك الشخصي" };
  else { S.error = errMsg(data, "تعذّر الحفظ"); }
  render();
}

// The photo is cropped to a centred square and shrunk to 512px before it is uploaded.
// (Read as a data: URL — the page's CSP allows data: images but not blob: ones.)
function squareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.86);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadAvatar(file) {
  if (!file) return;
  snapshotProfile();
  S.error = null;
  try {
    const blob = await squareJpeg(file, 512);
    const res = await fetch(API_BASE + "/profile/avatar", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + S.token },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) S._profile = { ...S._profile, ...data, msg: "✅ انحفظت الصورة" };
    else S.error = errMsg(data, "تعذّر رفع الصورة");
  } catch (e) {
    S.error = "تعذّرت قراءة الصورة — جرّب صورة ثانية";
  }
  render();
}

async function removeAvatar() {
  snapshotProfile();
  const { ok, data } = await api("DELETE", "/profile/avatar");
  if (ok) S._profile = { ...S._profile, ...data, msg: "" };
  render();
}

/* ================= PRINTABLE DOCUMENTS (invoice, receipt, ...) → PDF ================= */

// The server builds the document (with the issuing account's name + photo). It is shown through the
// browser's own print engine, which shapes Arabic correctly; choose "Save as PDF" to get the file.
async function exportDocument(path) {
  // The document opens in its own window (opened in the click's own turn, so it is not blocked): it carries a visible
  // "print / save as PDF" button and tries the print dialog by itself. When no window can be opened, the page prints it.
  const win = window.open("", "_blank");
  if (win) win.document.write(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:32px;text-align:center">${esc(t("doc.loading"))}</body>`);
  let res;
  try { res = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + S.token, "Accept-Language": LANG } }); } catch (e) { if (win) win.close(); return toast("تعذّر الاتصال بالسيرفر"); }
  if (!res.ok) { if (win) win.close(); return toast("تعذّر تجهيز المستند"); }
  const html = await res.text();
  if (win) {
    const bar = `<div class="no-print" style="position:sticky;top:0;z-index:5;padding:10px;background:#222;text-align:center"><button onclick="window.print()" style="padding:10px 22px;border:0;border-radius:8px;background:#ba2a34;color:#fff;font:700 15px sans-serif;cursor:pointer">🖨️ ${esc(t("doc.print"))}</button></div><style>@media print{.no-print{display:none!important}}</style>`;
    win.document.open();
    win.document.write(html.replace(/<body([^>]*)>/i, (m) => m + bar));
    win.document.close();
    win.document.title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "DALILACOM";
    setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 700);
    return;
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = document.getElementById("print-root");
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = parsed.querySelector("style").textContent;
  root.appendChild(style);
  root.appendChild(document.importNode(parsed.querySelector(".doc"), true));
  const previousTitle = document.title;
  document.title = parsed.title; // becomes the default file name of the saved PDF
  await Promise.all([...root.querySelectorAll("img")].map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
  const cleanup = () => { root.innerHTML = ""; document.title = previousTitle; window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

/* ================= SECTIONS BROWSER, CATEGORY PICKER, LANGUAGE ================= */

// id -> { node, parent } for a category tree (sections > professions > specialties).
function indexTree(tree) {
  const map = new Map();
  const walk = (nodes, parent) => nodes.forEach((n) => { map.set(n.id, { node: n, parent }); walk(n.children || [], n); });
  walk(tree || [], null);
  return map;
}
function catIndex() { return indexTree(discoverState().categories); }

// The category's name in the current language (the places API returns the base Arabic name).
function catName(category) {
  if (!category) return "";
  const hit = catIndex().get(category.id);
  return hit ? hit.node.name : category.name;
}

function openBrowse() { discoverState().browse = { trail: [] }; render(); }
function closeBrowse() { discoverState().browse = null; render(); }
function browseInto(id) { discoverState().browse.trail.push(id); render(); }
function browseBack() {
  const b = discoverState().browse;
  if (b.trail.length) { b.trail.pop(); render(); } else closeBrowse();
}
function selectCategory(id) {
  const d = discoverState();
  d.categoryId = id; d.browse = null; d.query = ""; d.suggest = null; d.showSuggest = false;
  searchMerchants();
}

function browseHtml(d) {
  if (!d.browse) return "";
  const index = catIndex();
  const currentId = d.browse.trail[d.browse.trail.length - 1];
  const current = currentId ? index.get(currentId) : null;
  const nodes = current ? current.node.children || [] : d.categories;
  const crumbs = d.browse.trail.map((id) => index.get(id) && index.get(id).node.name).filter(Boolean);
  const tile = (n) => {
    const hasKids = (n.children || []).length > 0;
    return `<button class="browse-tile ${n.merchantCount ? "" : "empty"}" onclick="${hasKids ? `browseInto('${n.id}')` : `selectCategory('${n.id}')`}">
      <span class="bt-ico">${esc(n.icon || "📍")}</span>
      <span class="bt-name">${esc(n.name)}</span>
      <span class="bt-count">${n.merchantCount ? esc(t("browse.count", { n: n.merchantCount })) : esc(t("browse.soon"))}${hasKids ? " ›" : ""}</span>
    </button>`;
  };
  return `
    <div class="browse">
      <div class="browse-head">
        <button class="browse-back" onclick="browseBack()">${esc(t("browse.back"))}</button>
        <div class="browse-title">${esc(crumbs.length ? crumbs.join(" › ") : t("browse.title"))}</div>
        <button class="browse-x" title="${esc(t("browse.close"))}" onclick="closeBrowse()">✕</button>
      </div>
      <div class="browse-body">
        ${current ? `<button class="browse-all" onclick="selectCategory('${current.node.id}')">${esc(current.node.icon || "")} ${esc(t("browse.all", { name: current.node.name }))} <span class="muted">· ${esc(t("browse.count", { n: current.node.merchantCount }))}</span></button>` : ""}
        <div class="browse-grid">${nodes.map(tile).join("")}</div>
      </div>
    </div>`;
}

// The quick filter row: a button for the full browser, the chosen category (removable), then the sections.
function categoryChipsHtml(d) {
  const index = catIndex();
  const picked = d.categoryId ? index.get(d.categoryId) : null;
  const pickedChip = picked
    ? `<button class="chip active" onclick="onDiscoverReset()">${esc(picked.node.icon || "")} ${esc(picked.node.name)} ✕</button>`
    : "";
  const sections = d.categories
    .filter((c) => !picked || c.id !== picked.node.id)
    .map((c) => `<button class="chip ${d.categoryId === c.id ? "active" : ""}" onclick="onDiscoverCategory('${c.id}')">${esc(c.icon || "")} ${esc(c.name)}</button>`)
    .join("");
  return `<button class="chip" onclick="openBrowse()">${esc(t("filter.sections"))}</button>${pickedChip}${sections}`;
}

// Section > profession > specialty as cascading selects, for the merchant forms. `pick(id)` receives the
// most specific choice made so far ('' when cleared).
/** Is the chosen profession one that works online (the shop then needs no place on the map)? */
function catIsOnline(tree, id) {
  const e = id ? indexTree(tree).get(id) : null;
  return !!(e && e.node.online);
}

let _catTimer = null;
/** Types a few letters of the profession: the closest professions appear at once, with where each one sits. */
function catSearch(q, pick) {
  clearTimeout(_catTimer);
  const box = document.getElementById("cat-hits");
  if (!box) return;
  if (q.trim().length < 2) { box.innerHTML = ""; return; }
  _catTimer = setTimeout(async () => {
    const { ok, data } = await api("GET", "/categories/search?q=" + encodeURIComponent(q.trim()) + "&lang=" + LANG);
    const el = document.getElementById("cat-hits");
    if (!el) return;
    el.innerHTML = ok && data.length
      ? data.map((h) => `<button type="button" class="cat-hit" onclick="catPickHit('${pick}','${h.id}')"><span>${esc((h.icon ? h.icon + " " : "") + h.name)}</span><small>${esc(h.path)}</small></button>`).join("")
      : `<p class="muted" style="margin:6px 0">${esc(t("cat.noHit"))}</p>`;
  }, 250);
}
function catPickHit(pick, id) { window[pick](id); }

/* ---- the category a product is filed under (not the shop's profession): search first, then browse, or add one ---- */

function pcatEnsure() {
  const c = S._pcat;
  if (c && c.lang === LANG && (c.tree.length || c.loading)) return;
  S._pcat = { lang: LANG, tree: [], loading: true, path: [], q: "", adding: false, addName: "", error: null };
  api("GET", "/product-categories?lang=" + LANG).then((r) => { S._pcat.tree = r.ok ? r.data : []; S._pcat.loading = false; render(); });
}

function pcatPath(id) {
  const index = indexTree(S._pcat.tree);
  const names = [];
  for (let cur = index.get(id); cur; cur = cur.parent ? index.get(cur.parent.id) : null) names.unshift(cur.node.name);
  return names.join(" › ");
}

let _pcatTimer = null;
function pcatSearch(q, pick) {
  clearTimeout(_pcatTimer);
  const box = document.getElementById("pc-hits");
  if (!box) return;
  if (q.trim().length < 2) { box.innerHTML = ""; return; }
  _pcatTimer = setTimeout(async () => {
    const { ok, data } = await api("GET", "/product-categories/search?q=" + encodeURIComponent(q.trim()) + "&lang=" + LANG);
    const el = document.getElementById("pc-hits");
    if (!el) return;
    el.innerHTML = ok && data.length
      ? data.map((h) => `<button type="button" class="cat-hit" onclick="pcatPick('${pick}','${h.id}')"><span>${esc((h.icon ? h.icon + " " : "") + h.name)}</span><small>${esc(h.path)}</small></button>`).join("")
      : `<p class="muted" style="margin:6px 0">${esc(t("pc.noHit"))}</p>`;
  }, 250);
}

/** Choosing a category also opens it, so its sub-categories can narrow it down. */
function pcatPick(pick, id) {
  const index = indexTree(S._pcat.tree);
  const path = [];
  for (let cur = index.get(id); cur; cur = cur.parent ? index.get(cur.parent.id) : null) path.unshift(cur.node.id);
  S._pcat.path = path;
  S._pcat.error = null;
  window[pick](id);
}

function pcatDrill(pick, id) { if (id) pcatPick(pick, id); else { S._pcat.path = []; render(); } }

function pcatPickerHtml(selectedId, pick) {
  pcatEnsure();
  const c = S._pcat;
  if (c.loading) return spinner();
  const index = indexTree(c.tree);
  const here = c.path.length ? index.get(c.path[c.path.length - 1]) : null;
  const level = here ? here.node.children || [] : c.tree;
  const crumbs = [`<button type="button" class="link-btn" onclick="pcatDrill('${pick}',null)">${esc(t("pc.all"))}</button>`, ...c.path.map((id) => `<button type="button" class="link-btn" onclick="pcatDrill('${pick}','${id}')">${esc(index.get(id).node.name)}</button>`)].join(" › ");
  return `
    <div class="field cat-search"><label>${esc(t("pc.search"))}</label>
      <input id="pc-q" type="search" autocomplete="off" placeholder="${esc(t("pc.searchPh"))}" oninput="pcatSearch(this.value,'${pick}')" />
      <div id="pc-hits" class="cat-hits"></div></div>
    ${selectedId && index.get(selectedId) ? `<div class="info-banner">✓ ${esc(pcatPath(selectedId))}</div>` : ""}
    <div class="muted" style="font-size:12px;margin:4px 0">${esc(t("pc.browse"))}</div>
    <div class="muted" style="font-size:13px;margin-bottom:6px">${crumbs}</div>
    <div class="chip-row" style="flex-wrap:wrap">${level.map((n) => `<button type="button" class="chip ${selectedId === n.id ? "active" : ""}" onclick="pcatPick('${pick}','${n.id}')">${esc((n.icon ? n.icon + " " : "") + n.name)}</button>`).join("")}</div>
    <div class="cat-suggest">
      <button type="button" class="link-btn" onclick="S._pcat.adding=!S._pcat.adding;render()">+ ${esc(t("pc.add"))}</button>
      ${c.adding ? `
        <p class="muted" style="margin:6px 0">${esc(here ? t("pc.addUnder", { name: here.node.name }) : t("pc.addNeed"))}</p>
        ${here ? `<input id="pc-add" value="${esc(c.addName)}" maxlength="40" placeholder="${esc(t("pc.addPh"))}" oninput="S._pcat.addName=this.value" />
        <button type="button" class="btn small" style="margin-top:6px" onclick="pcatAdd('${pick}')">${esc(t("pc.addSend"))}</button>` : ""}
        ${c.error ? `<div class="error-banner">${esc(c.error)}</div>` : ""}` : ""}
    </div>`;
}

async function pcatAdd(pick) {
  const c = S._pcat;
  const parentId = c.path[c.path.length - 1];
  const name = (c.addName || "").trim();
  if (name.length < 2) { c.error = t("pc.addShort"); return render(); }
  const { ok, data } = await api("POST", "/product-categories", { name, parentId });
  if (!ok) { c.error = errMsg(data, t("pc.addFailed")); return render(); }
  c.addName = ""; c.adding = false; c.error = null;
  const r = await api("GET", "/product-categories?lang=" + LANG);
  if (r.ok) c.tree = r.data;
  toast(t("pc.added"));
  pcatPick(pick, data.id);
}

/** "I could not find my profession": the shop writes it, picks the closest one below, and the admin decides. */
function catSuggestHtml(onSend) {
  return `
    <div class="cat-suggest">
      <button type="button" class="link-btn" onclick="S._catSugOpen=!S._catSugOpen;render()">${esc(t("cat.notFound"))}</button>
      ${S._catSugOpen ? `
        <input id="cat-sug" value="${esc(S._catSug || "")}" maxlength="60" placeholder="${esc(t("cat.sugPh"))}" oninput="S._catSug=this.value" />
        <p class="muted" style="margin:6px 0">${esc(t("cat.sugNote"))}</p>
        ${onSend ? `<button type="button" class="btn small" onclick="${onSend}">${esc(t("cat.sugSend"))}</button>` : ""}` : ""}
    </div>`;
}

function categoryPickerHtml(tree, selectedId, pick, onSend) {
  const index = indexTree(tree);
  const chain = [];
  for (let e = selectedId ? index.get(selectedId) : null; e; e = e.parent ? index.get(e.parent.id) : null) chain.unshift(e.node);
  const labels = ["picker.section", "picker.profession", "picker.specialty"];
  let options = tree || [];
  let parentId = "";
  let html = "";
  for (let depth = 0; depth < 3 && options.length; depth++) {
    const chosen = chain[depth];
    html += `<div class="field"><label>${esc(t(labels[depth]))}</label>
      <select class="cat-select" onchange="${pick}(this.value || '${parentId}')">
        <option value="">${esc(t("picker.choose"))}</option>
        ${options.map((n) => `<option value="${n.id}" ${chosen && chosen.id === n.id ? "selected" : ""}>${esc((n.icon ? n.icon + " " : "") + n.name)}</option>`).join("")}
      </select></div>`;
    if (!chosen) break;
    parentId = chosen.id;
    options = chosen.children || [];
  }
  const search = `<div class="field cat-search"><label>${esc(t("cat.search"))}</label>
    <input id="cat-q" type="search" autocomplete="off" placeholder="${esc(t("cat.searchPh"))}" oninput="catSearch(this.value,'${pick}')" />
    <div id="cat-hits" class="cat-hits"></div></div>`;
  return search + `<div class="muted" style="font-size:12px;margin:-4px 0 6px">${esc(t("cat.orBrowse"))}</div>` + html + catSuggestHtml(onSend);
}

function toggleLangMenu() { S._langMenu = !S._langMenu; render(); }
function langMenuHtml() {
  if (!S._langMenu) return "";
  return `<div class="lang-menu">${Object.entries(LANGS).map(([code, l]) => `<button class="${code === LANG ? "active" : ""}" onclick="setLang('${code}')">${esc(l.name)}</button>`).join("")}</div>`;
}

function setLang(code) {
  if (!LANGS[code]) return;
  LANG = code;
  try { localStorage.setItem("dlk_lang", code); } catch (e) {}
  applyLang();
  S._langMenu = false;
  saveAccountLanguage();
  if (S._discover) {
    S._discover.suggest = null;
    loadCategories().then(() => render()); // names come back in the new language
  }
  render();
}

/* ================= PRICING PAGE ================= */

/** What a plan costs, in the wallet's own unit. */
function planPriceText(plan, credit) {
  return plan.priceCredits === null ? t("pricing.notPriced") : plan.priceCredits === 0 ? t("pricing.free") : t("pricing.credits", { n: plan.priceCredits, credit });
}

function planCardHtml(plan, credit, action) {
  return `<div class="card plan-card">
    <div class="title-line"><strong>${esc(plan.name)}</strong><span class="price">${esc(planPriceText(plan, credit))}</span></div>
    ${plan.description ? `<p class="muted" style="margin:2px 0 6px">${esc(plan.description)}</p>` : ""}
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">
      <span class="badge neutral">${esc(t("pricing.days", { n: plan.durationDays }))}</span>
      ${plan.trialDays > 0 ? `<span class="badge success">${esc(t("pricing.trial", { n: plan.trialDays }))}</span>` : ""}
      ${plan.priceFrom === "country" ? `<span class="badge info">${esc(t("pricing.yourCountry"))}</span>` : ""}
      ${plan.monthlyBroadcastLimit ? `<span class="badge neutral">${esc(t("pricing.broadcasts", { n: plan.monthlyBroadcastLimit }))}</span>` : ""}
    </div>
    ${plan.features.length ? `<ul class="plan-features">${plan.features.map((f) => `<li class="${f.included ? "" : "off"}">${f.included ? "\u2714" : "\u2718"} ${esc(f.text)}</li>`).join("")}</ul>` : ""}
    ${action ? `<button class="btn small" ${S.busy ? "disabled" : ""} onclick="${action.fn}('${plan.id}')">${esc(action.label)}</button>` : ""}
  </div>`;
}

/**
 * A service's own welcome: what it is, the free period and the price after it, then the plans. "Continue" starts the
 * free period (the server grants it once per account); when it ends the person renews from the same plans.
 */
function serviceIntroHtml(plans, credit, kind, fn) {
  if (!plans.length) return `<div class="empty-state">${esc(t("pricing.empty"))}</div>`;
  const lead = plans.find((p) => p.trialDays > 0) || plans[0];
  const price = planPriceText(lead, credit);
  const line = lead.trialDays > 0
    ? t("intro.trial", { n: lead.trialDays, price, days: lead.durationDays })
    : t("intro.noTrial", { price, days: lead.durationDays });
  return `
    <div class="card intro-card">
      <h2>${esc(t(`intro.${kind}.title`))}</h2>
      <p>${esc(t(`intro.${kind}.body`))}</p>
      <p><strong>${esc(line)}</strong></p>
      ${lead.trialDays > 0 ? `<p class="muted">${esc(t("intro.afterContinue"))}</p>` : ""}
    </div>
    ${plans.map((plan) => planCardHtml(plan, credit, plan.priceCredits === null ? null : { fn, label: t(plan.trialDays > 0 ? "intro.continue" : "pricing.subscribe") })).join("")}`;
}

/** The card's own renewal page: only the membership plans, nothing else. */
function openRenew() {
  S._pricing = null;
  go("pricing");
}

function screenPricing() {
  if (!S._pricing) { S._pricing = { loading: true }; loadPricing(); }
  const p = S._pricing;
  const header = `${backRow()}<h1 class="screen-title">${esc(t("pricing.renewTitle"))}</h1><p class="screen-sub">${esc(t("pricing.renewSub"))}</p>`;
  if (p.loading) return header + spinner();
  const group = ((p.catalog && p.catalog.services) || []).find((g) => g.service === "MEMBERSHIP");
  if (!group || !group.plans.length) return header + `<div class="empty-state">${esc(t("pricing.empty"))}</div>`;
  const credit = p.catalog.creditName;
  return header + group.plans.map((plan) => planCardHtml(plan, credit, plan.source === "catalog" && plan.priceCredits !== null ? { fn: "subscribeFromPricing", label: t("pricing.renew") } : null)).join("") + errorBanner();
}

async function loadPricing() {
  const { ok, data } = await api("GET", "/plans/catalog");
  S._pricing = { loading: false, catalog: ok ? data : null };
  render();
}

async function subscribeFromPricing(planId) {
  if (!S.token) return go("login");
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/membership/subscribe", { planId });
  S.busy = false;
  if (ok) {
    toast(t("pricing.subscribed"));
    S._card = { loading: true }; S._cardLoaded = null; S._pricing = null;
    reset("home"); setHomeTab("card");
  } else {
    S.error = errMsg(data, t("pricing.failed"));
    render();
  }
}

/* ================= MERCHANT MODE SHELL ================= */

const MERCHANT_TABS = [
  { id: "redeem", label: "تأكيد حسم", icon: "scan" },
  { id: "orders", label: "طلبات واردة", icon: "orders" },
  { id: "catalog", label: "الكتالوج", icon: "box" },
  { id: "promo", label: "إعلاناتي", icon: "bell" },
];

/** Merchant mode opens only once the admin has approved the shop: until then the shop owner sees where the request stands. */
function screenMerchantModeShell() {
  if (!S._mstat) { S._mstat = { loading: true }; loadMerchantStatus(); }
  const m = S._mstat;
  if (m.loading) return `<button class="back-btn" onclick="back()">‹ ${esc(t("shop.backToAccount"))}</button>${spinner()}`;
  if (m.noShop) {
    // an account made a business account (for example by the admin) but no shop was ever registered: the form is the way forward
    return `
      <button class="back-btn" onclick="back()">‹ ${esc(t("shop.backToAccount"))}</button>
      <div class="guest-prompt">
        <div class="guest-ico">🏪</div>
        <h1 class="screen-title" style="margin:0">${esc(t("shop.noneTitle"))}</h1>
        <p class="screen-sub">${esc(t("shop.noneSub"))}</p>
        <button class="btn" onclick="S._mstat=null;go('merchantRegister')">${esc(t("shop.noneButton"))}</button>
      </div>`;
  }
  if (m.approvalStatus !== "APPROVED") {
    const refused = m.approvalStatus === "REJECTED";
    return `
      <button class="back-btn" onclick="back()">‹ ${esc(t("shop.backToAccount"))}</button>
      <div class="guest-prompt">
        <div class="guest-ico">${refused ? "⛔" : "⏳"}</div>
        <h1 class="screen-title" style="margin:0">${esc(t(refused ? "shop.refusedTitle" : "shop.pendingTitle"))}</h1>
        <p class="screen-sub">${esc(t(refused ? "shop.refusedSub" : "shop.pendingSub"))}</p>
        ${refused && m.rejectionReason ? `<div class="error-banner">${esc(m.rejectionReason)}</div>` : ""}
        <button class="btn" onclick="S._mstat=null;render()">${esc(t("shop.refresh"))}</button>
        <div style="height:10px"></div>
        <button class="btn outline" onclick="back()">${esc(t("shop.backToAccount"))}</button>
      </div>`;
  }
  const body = { redeem: tabRedeem, orders: tabMerchantOrders, catalog: tabCatalog, promo: tabPromo }[S.merchantTab]();
  return `
    <button class="back-btn" onclick="back()">‹ رجوع لحساب الزبون</button>
    ${merchantChecklistHtml()}
    <div>${body}</div>
    <button class="scan-fab" onclick="openScanner()" aria-label="${esc(t("scan.title"))}" title="${esc(t("scan.title"))}">📷</button>
    <div class="tabbar">
      ${MERCHANT_TABS.map((t) => `
        <button class="${S.merchantTab === t.id ? "active" : ""}" onclick="setMerchantTab('${t.id}')">
          ${ICON[t.icon]}<span>${esc(t.label)}</span>
        </button>`).join("")}
    </div>
  `;
}

async function loadMerchantStatus() {
  const { ok, status, data } = await api("GET", "/merchant/me");
  S._mstat = { loading: false, approvalStatus: ok ? data.approvalStatus : "PENDING", rejectionReason: ok ? data.rejectionReason : null, noShop: !ok && status === 404 };
  render();
}

/* ---- the shop's store: it opens when a plan is chosen ---- */

async function openStorePlans() {
  S._sp = { loading: true, data: null, busy: false, error: null };
  go("storePlans");
  const { ok, data } = await api("GET", "/merchant/store-plans");
  S._sp.loading = false;
  S._sp.data = ok ? data : null;
  if (!ok) S._sp.error = errMsg(data, t("sp.failed"));
  render();
}

function screenStorePlans() {
  if (!S._sp) { openStorePlans(); return spinner(); }
  const sp = S._sp;
  const head = `${backRow()}<h1 class="screen-title">🛍️ ${esc(t("sp.title"))}</h1>`;
  if (sp.loading) return head + spinner();
  const d = sp.data;
  if (!d) return head + `<div class="error-banner">${esc(sp.error || t("sp.failed"))}</div>`;
  const credit = d.creditName || "";
  const price = (p) => (p.priceCredits === null ? t("pricing.notPriced") : p.priceCredits === 0 ? t("pricing.free") : t("pricing.credits", { n: p.priceCredits, credit }));
  const day = (iso) => new Date(iso).toLocaleDateString(LANG, { day: "numeric", month: "short", year: "numeric" });
  const open = `<button class="btn" onclick="S.merchantTab='catalog';S._catalog=null;go('merchantMode')">${esc(t("sp.open"))}</button>`;
  const current = d.current && d.active
    ? `<div class="card"><strong>${esc(t("sp.current", { name: d.current.name }))}</strong>${d.current.endsAt ? `<p class="muted" style="margin:4px 0 0">${esc(t("sp.until", { date: day(d.current.endsAt) }))} · ${countdownHtml(d.current.endsAt)}</p>` : ""}<div style="height:10px"></div>${open}</div>`
    : "";
  const intro = !d.required ? `<div class="card"><p>${esc(t("sp.noPlansYet"))}</p>${open}</div>` : !d.active ? `<p class="screen-sub">${esc(t("sp.choose"))}</p>` : `<div class="section-title">${esc(t("sp.change"))}</div>`;
  const plans = d.plans.map((p) => `
    <div class="card plan-card">
      <div class="title-line"><strong>${esc(p.name)}</strong><span class="price">${esc(price(p))}</span></div>
      ${p.description ? `<p class="muted" style="margin:2px 0 6px">${esc(p.description)}</p>` : ""}
      <span class="badge neutral">${esc(t("pricing.days", { n: p.durationDays }))}</span>
      ${p.features.length ? `<ul class="plan-features">${p.features.map((f) => `<li class="${f.included ? "" : "off"}">${f.included ? "\u2714" : "\u2718"} ${esc(f.text)}</li>`).join("")}</ul>` : ""}
      ${p.priceCredits === null ? "" : `<button class="btn small" ${sp.busy ? "disabled" : ""} onclick="chooseStorePlan('${p.id}')">${esc(t(d.active && d.current && d.current.id === p.id ? "sp.renew" : "sp.choose.btn"))}</button>`}
    </div>`).join("");
  return `${head}${current}${intro}${plans}${sp.error ? `<div class="error-banner">${esc(sp.error)}</div>` : ""}`;
}

async function chooseStorePlan(planId) {
  const sp = S._sp;
  const first = !sp.data.active;
  sp.busy = true; sp.error = null; render();
  const { ok, data } = await api("POST", "/merchant/store-plans/subscribe", { planId });
  sp.busy = false;
  if (!ok) { sp.error = errMsg(data, t("sp.failed")); return render(); }
  sp.data = data;
  S._onboarding = null;
  toast(t("sp.chosen"));
  if (first) { S.merchantTab = "catalog"; S._catalog = null; S._mstat = null; go("merchantMode"); }
  else render();
}

/* ---- branches: other places of the same shop, maybe in another city ---- */

async function openBranches() {
  S._br = { loading: true, list: [], form: null, busy: false, error: null };
  go("merchantBranches");
  const { ok, data } = await api("GET", "/merchant/branches");
  S._br.loading = false;
  S._br.list = ok ? data : [];
  render();
}

function branchForm(b) {
  S._br.form = { id: b ? b.id : null, name: b ? b.name : "", city: b ? b.city || "" : "", address: b ? b.address || "" : "", phone: b ? b.phone || "" : "" };
  S._br.error = null;
  pickReset(b ? b.latitude : null, b ? b.longitude : null);
  render();
}

function screenBranches() {
  if (!S._br) { openBranches(); return spinner(); }
  const f = S._br;
  if (f.loading) return `${backRow()}<h1 class="screen-title">${esc(t("br.title"))}</h1>${spinner()}`;
  if (f.form) {
    const x = f.form;
    return `
      ${backRow()}
      <h1 class="screen-title">${esc(x.id ? t("br.edit") : t("br.add"))}</h1>
      <div class="field"><label>${esc(t("br.name"))}</label><input value="${esc(x.name)}" maxlength="60" placeholder="${esc(t("br.namePh"))}" oninput="S._br.form.name=this.value"></div>
      <div class="field"><label>${esc(t("br.city"))}</label><input id="br-city" placeholder="مثال: دمشق" value="${esc(x.city)}" maxlength="60" oninput="S._br.form.city=this.value"></div>
      <div class="field"><label>${esc(t("br.address"))}</label><input id="br-address" placeholder="${esc(t("mp.addressPh"))}" value="${esc(x.address)}" maxlength="200" oninput="S._br.form.address=this.value"></div>
      ${pickerHtml(t("br.pickLabel"))}
      <div class="field"><label>${esc(t("br.phone"))}</label><input type="tel" value="${esc(x.phone)}" maxlength="30" placeholder="+963 9xx xxx xxx" oninput="S._br.form.phone=this.value"></div>
      ${f.error ? `<div class="error-banner">${esc(f.error)}</div>` : ""}
      <button class="btn" ${f.busy ? "disabled" : ""} onclick="saveBranch()">${esc(f.busy ? t("br.saving") : t("br.save"))}</button>
      <button class="link-btn" style="display:block;margin:8px auto" onclick="S._br.form=null;render()">${esc(t("br.cancel"))}</button>`;
  }
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(t("br.title"))}</h1>
    <p class="screen-sub">${esc(t("br.sub"))}</p>
    ${f.list.length ? f.list.map((b) => `
      <div class="card">
        <div class="title-line"><strong>🏬 ${esc(b.name)}</strong>
          <span><button class="link-btn" onclick="branchForm(S._br.list.find((z) => z.id === '${b.id}'))">${esc(t("br.edit"))}</button>
          <button class="link-btn" onclick="deleteBranch('${b.id}')">${esc(t("br.delete"))}</button></span></div>
        <p class="muted" style="margin:4px 0 0">${esc([b.city, b.address].filter(Boolean).join(" · "))}${b.phone ? " · " + esc(b.phone) : ""}</p>
      </div>`).join("") : `<p class="muted">${esc(t("br.none"))}</p>`}
    <button class="btn" onclick="branchForm(null)">+ ${esc(t("br.add"))}</button>`;
}

async function saveBranch() {
  const f = S._br;
  const x = f.form;
  if (x.name.trim().length < 2) { f.error = t("br.needName"); return render(); }
  if (!S._pick || S._pick.lat == null) { f.error = t("br.needPin"); return render(); }
  const body = { name: x.name.trim(), city: x.city.trim() || null, address: x.address.trim() || null, phone: x.phone.trim() || null, latitude: S._pick.lat, longitude: S._pick.lng };
  f.busy = true; f.error = null; render();
  const { ok, data } = x.id ? await api("PATCH", "/merchant/branches/" + x.id, body) : await api("POST", "/merchant/branches", body);
  f.busy = false;
  if (!ok) { f.error = errMsg(data, t("br.failed")); return render(); }
  f.form = null;
  toast(t("br.saved"));
  const list = await api("GET", "/merchant/branches");
  f.list = list.ok ? list.data : f.list;
  render();
}

async function deleteBranch(id) {
  if (!confirm(t("br.confirmDel"))) return;
  const { ok, data } = await api("DELETE", "/merchant/branches/" + id);
  if (!ok) return toast(errMsg(data, t("br.failed")));
  S._br.list = S._br.list.filter((b) => b.id !== id);
  render();
}

/* ---- shipping methods: how the shop sends orders, and what it costs ---- */

async function openShipping() {
  S._ship = { loading: true, rows: [], error: null, busy: false };
  go("shippingMethods");
  const { ok, data } = await api("GET", "/merchant/shipping-methods");
  S._ship.loading = false;
  S._ship.rows = ok && data.length ? data.map((m) => ({ name: m.name, cost: String(m.costCents / 100) })) : [{ name: "", cost: "" }];
  render();
}

/** A shop must list at least one shipping method before it can add a product; if it has none, send it to add them. */
async function shipGuard() {
  const { ok, data } = await api("GET", "/merchant/shipping-methods");
  if (ok && data.length) return true;
  toast(t("ship.need"));
  openShipping();
  return false;
}

function screenShipping() {
  if (!S._ship) { openShipping(); return spinner(); }
  const f = S._ship;
  if (f.loading) return `${backRow()}<h1 class="screen-title">${esc(t("ship.title"))}</h1>${spinner()}`;
  const cur = S.currency === "USD" ? "$" : S.currency === "EUR" ? "€" : S.currency || "";
  const presets = ["ship.pickup", "ship.local", "ship.country"];
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(t("ship.title"))}</h1>
    <p class="screen-sub">${esc(t("ship.sub"))}</p>
    <div class="chips-row">${presets.map((k) => `<button class="chip" onclick="shipAddPreset('${k}')">+ ${esc(t(k))}</button>`).join("")}</div>
    ${f.rows.map((r, i) => `
      <div class="ship-row">
        <input value="${esc(r.name)}" oninput="S._ship.rows[${i}].name=this.value" placeholder="${esc(t("ship.namePh"))}">
        <input type="number" inputmode="decimal" min="0" step="0.01" value="${esc(r.cost)}" oninput="S._ship.rows[${i}].cost=this.value" placeholder="${esc(t("ship.costPh", { cur }))}">
        <button class="link-btn" onclick="S._ship.rows.splice(${i},1);render()" aria-label="x">✕</button>
      </div>`).join("")}
    ${f.rows.length < 8 ? `<button class="link-btn" onclick="S._ship.rows.push({name:'',cost:''});render()">+ ${esc(t("ship.add"))}</button>` : ""}
    <p class="muted">${esc(t("ship.freeNote"))}</p>
    ${f.error ? `<div class="error-banner">${esc(f.error)}</div>` : ""}
    <button class="btn" ${f.busy ? "disabled" : ""} onclick="saveShipping()">${esc(f.busy ? t("ship.saving") : t("ship.save"))}</button>`;
}

function shipAddPreset(k) {
  const f = S._ship;
  const name = t(k);
  if (f.rows.length === 1 && !f.rows[0].name && !f.rows[0].cost) f.rows = [];
  if (!f.rows.some((r) => r.name === name) && f.rows.length < 8) f.rows.push({ name, cost: k === "ship.pickup" ? "0" : "" });
  render();
}

async function saveShipping() {
  const f = S._ship;
  const rows = f.rows.filter((r) => r.name.trim() || String(r.cost).trim());
  const methods = rows.map((r) => ({ name: r.name.trim(), costCents: Math.round(Number(String(latinDigits(r.cost) || "0").replace(",", ".")) * 100) }));
  if (!methods.length || methods.some((m) => m.name.length < 2 || !(m.costCents >= 0))) { f.error = t("ship.invalid"); return render(); }
  f.busy = true; f.error = null; render();
  const { ok, data } = await api("PUT", "/merchant/shipping-methods", { methods });
  f.busy = false;
  if (!ok) { f.error = errMsg(data, t("ship.failed")); return render(); }
  back();
  toast(t("ship.saved"));
}

/* ---- Announcements tab: a notice to people around the shop, reviewed by the platform before it goes out ---- */

const PROMO_STATUS = { PENDING_REVIEW: "بانتظار مراجعة دليلكم", SENT: "تم النشر", REJECTED: "مرفوض" };
const PROMO_ERRORS = {
  SHOP_HAS_NO_LOCATION: "حدّد موقع محلك أولًا من «بيانات المحل ومكانه»",
  RADIUS_TOO_LARGE: "المسافة أكبر من المسموح لمتجرك",
  BROADCAST_LIMIT: "وصلت لحد إعلانات باقتك هذا الشهر",
  MERCHANT_NOT_APPROVED: "لازم تتم الموافقة على محلك أولًا",
  AUDIENCE_TOO_LARGE: "الجمهور كبير جدًا — صغّر المسافة",
  INSUFFICIENT_BALANCE: "رصيد محفظتك لا يكفي لهذا الإعلان — اشحن المحفظة أولًا",
};

function promoError(data, fallback) {
  const code = data && data.error && data.error.code;
  return PROMO_ERRORS[code] || errMsg(data, fallback);
}

function tabPromo() {
  if (!S._promo) { S._promo = { loading: true, audience: "radius", regionId: "", regions: [], cityId: "", radius: "5", title: "", body: "", productId: "", discountId: "" }; loadPromo(); }
  const p = S._promo;
  if (p.loading) return `<h1 class="screen-title">إعلاناتي</h1>${spinner()}`;
  const option = (value, label, chosen) => `<option value="${esc(value)}" ${chosen === value ? "selected" : ""}>${esc(label)}</option>`;
  return `
    <h1 class="screen-title">إعلاناتي</h1>
    <p class="screen-sub">أرسل إشعارًا لمن حول محلك — يراجعه فريق دليلكم قبل أن يصل لأحد</p>
    <div class="card">
      <div class="field"><label>لمن تريد الإرسال؟</label>
        <select id="pr-audience" onchange="promoRead(); render()">${option("radius", "حول محلي", p.audience)}${option("city", "مدينة", p.audience)}${option("followers", "متابعيّ", p.audience)}</select></div>
      ${p.audience === "city"
        ? `<div class="field"><label>${esc(t("promo.region"))}</label><select id="pr-region" onchange="promoRegion(this.value)">${option("", "— " + t("promo.pickRegion") + " —", p.regionId)}${(p.regions || []).map((c) => option(c.id, geoName(c), p.regionId)).join("")}</select></div>
          ${p.regionId ? `<div class="field"><label>${esc(t("promo.city"))}</label><select id="pr-city">${option("", "— " + t("promo.pickCity") + " —", p.cityId)}${(p.cities || []).map((c) => option(c.id, geoName(c), p.cityId)).join("")}</select></div>` : ""}`
        : p.audience === "followers" ? "" : `<div class="field"><label>المسافة حول محلك (كم)</label><input id="pr-radius" placeholder="مثال: 5" inputmode="decimal" value="${esc(p.radius)}" /></div>`}
      <div class="field"><label>العنوان</label><input id="pr-title" placeholder="مثال: خصم 20% على كل المنتجات" maxlength="100" value="${esc(p.title)}" /></div>
      <div class="field"><label>النص</label><textarea id="pr-body" placeholder="مثال: العرض لمدة 3 أيام فقط، زورونا!" maxlength="500" rows="3">${esc(p.body)}</textarea></div>
      <div class="field"><label>إرفاق منتج (اختياري)</label>
        <select id="pr-product">${option("", "— بدون —", p.productId)}${(p.products || []).map((x) => option(x.id, x.name, p.productId)).join("")}</select></div>
      <div class="field"><label>إرفاق عرض (اختياري)</label>
        <select id="pr-discount">${option("", "— بدون —", p.discountId)}${(p.discounts || []).map((x) => option(x.id, `${x.title} — ${x.percent}%`, p.discountId)).join("")}</select></div>
      ${p.info ? `<p class="muted">${esc(p.info)}</p>` : ""}
      ${p.error ? `<div class="error-banner">${esc(p.error)}</div>` : ""}
      <div class="row">
        <button class="btn outline" onclick="promoPreview()">كم شخص سيصل؟</button>
        <button class="btn" onclick="promoSend()">أرسل للمراجعة</button>
      </div>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0">إعلاناتك السابقة</div>
      ${(p.history || []).length ? p.history.map((b) => `
        <div style="padding:8px 0;border-top:1px solid var(--border)">
          <div class="title-line"><strong>${esc(b.title)}</strong>
            <span class="badge ${b.status === "SENT" ? "success" : "neutral"}">${esc(PROMO_STATUS[b.status] || b.status)}</span></div>
          <p class="muted">${esc(b.body)}</p>
          ${b.status === "SENT" ? `<p class="muted">وصل إلى ${b.delivered} شخص</p>` : ""}
          ${b.creditsCharged > 0 ? `<p class="muted">${b.status === "REJECTED" ? "أُعيد لمحفظتك" : "دفعت"} ${b.creditsCharged}</p>` : ""}
          ${b.status === "REJECTED" && b.reviewNote ? `<p class="muted">السبب: ${esc(b.reviewNote)}</p>` : ""}
        </div>`).join("") : `<p class="muted">لا إعلانات بعد</p>`}
    </div>
  `;
}

async function loadPromo() {
  const [history, me, products, countries] = await Promise.all([api("GET", "/broadcasts"), api("GET", "/merchant/me"), api("GET", "/products/mine"), api("GET", "/geo/countries")]);
  // the governorates first, like the sign-up page; the cities come once a governorate is chosen
  const country = countries.ok && countries.data.length ? countries.data[0] : null;
  const regions = country ? await api("GET", "/geo/units?" + new URLSearchParams({ countryId: country.id, level: "REGION" })) : { ok: false };
  Object.assign(S._promo, {
    loading: false,
    regions: regions.ok ? regions.data : [],
    cities: [],
    history: history.ok ? history.data : [],
    discounts: me.ok ? (me.data.discounts || []).filter((d) => d.isActive !== false) : [],
    products: products.ok ? products.data.filter((x) => x.isActive !== false) : [],
  });
  render();
}

/** A governorate was chosen: its cities are loaded (and the old city choice is dropped). */
async function promoRegion(regionId) {
  promoRead(true);
  const p = S._promo;
  p.regionId = regionId;
  p.cityId = "";
  p.cities = [];
  render();
  if (!regionId) return;
  const { ok, data } = await api("GET", "/geo/units?" + new URLSearchParams({ parentId: regionId, level: "CITY" }));
  if (S._promo === p && p.regionId === regionId) { p.cities = ok ? data : []; render(); }
}

/** Reads the form into the state so a re-render never loses what was typed; returns who it is for, or null when something is missing. */
function promoRead(quiet) {
  const p = S._promo;
  p.audience = qs("pr-audience").value;
  if (qs("pr-radius")) p.radius = qs("pr-radius").value;
  if (qs("pr-city")) p.cityId = qs("pr-city").value;
  p.title = qs("pr-title").value;
  p.body = qs("pr-body").value;
  p.productId = qs("pr-product").value;
  p.discountId = qs("pr-discount").value;
  p.error = null;
  if (quiet) return null; // only saving what was typed: no checks, no message
  if (p.audience === "followers") return { followers: true };
  if (p.audience === "city") {
    if (!p.cityId) { p.error = "اختر المدينة"; return null; }
    return { geoUnitId: p.cityId };
  }
  const radiusKm = parseFloat(latinDigits(p.radius));
  if (!radiusKm || radiusKm <= 0) { p.error = "اكتب المسافة بالكيلومتر"; return null; }
  return { radiusKm };
}

async function promoPreview() {
  const target = promoRead();
  const p = S._promo;
  if (target) {
    const { ok, data } = await api("POST", "/broadcasts/preview", target);
    if (ok) {
      const cost = data.price > 0 ? `تكلفة هذا الإعلان ${data.price} من رصيدك (رصيدك ${data.balance})` : "";
      p.info = `سيصل لنحو ${data.count} شخص — المتبقّي لك هذا الشهر: ${data.remainingThisMonth} من ${data.limit}` + (cost ? " — " + cost : "");
    }
    else { p.info = null; p.error = promoError(data, "تعذّر الحساب"); }
  }
  render();
}

async function promoSend() {
  const target = promoRead();
  const p = S._promo;
  if (target && (!p.title.trim() || !p.body.trim())) p.error = "اكتب العنوان والنص";
  if (target && !p.error) {
    // beyond the plan's included announcements each one is paid from the wallet: say so before it is taken
    const quote = await api("POST", "/broadcasts/preview", target);
    if (quote.ok && quote.data.price > 0 && !confirm(`سيُخصم ${quote.data.price} من رصيد محفظتك لهذا الإعلان. متابعة؟`)) { render(); return; }
    const body = { ...target, title: p.title.trim(), body: p.body.trim() };
    if (p.productId) body.productId = p.productId;
    if (p.discountId) body.discountId = p.discountId;
    const { ok, data } = await api("POST", "/broadcasts", body);
    if (ok) {
      p.info = data.status === "REJECTED" ? `رُفض الإعلان: ${(data.reasons || []).join(" — ")}` : "وصل الإعلان لفريق دليلكم للمراجعة، وسيُنشر فور الموافقة";
      if (data.status !== "REJECTED") { p.title = ""; p.body = ""; p.productId = ""; p.discountId = ""; }
      const history = await api("GET", "/broadcasts");
      if (history.ok) p.history = history.data;
    } else {
      p.info = null;
      p.error = promoError(data, "تعذّر الإرسال");
    }
  }
  render();
}

/* ---------------- the shop's discount system ---------------- */

const DISC_PERCENTS = [5, 10, 15, 20, 25, 30, 40, 50];

/** What a discount covers, in a sentence (works for the shop's own list and for the public cards). */
function discScopeText(d) {
  if (d.scope === "SECTION" && d.section) return t("disc.onSection", { name: LANG === "ar" ? d.section.name : d.section.nameEn });
  if (d.scope === "PRODUCTS" && d.productNames && d.productNames.length) return t("disc.onProducts", { names: d.productNames.slice(0, 3).join("، ") + (d.productNames.length > 3 ? "…" : "") });
  return t("disc.onAll");
}

/** A live countdown to a date: it ticks every second wherever it is on the page. */
function countdownText(endIso) {
  const ms = new Date(endIso).getTime() - Date.now();
  if (!(ms > 0)) return t("cd.ended");
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const hh = String(Math.floor((total % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return (d ? d + " " + t("cd.day") + " " : "") + hh + ":" + mm + ":" + ss;
}
function countdownHtml(endIso) {
  return endIso ? `<span class="cd" data-end="${esc(endIso)}">${esc(countdownText(endIso))}</span>` : "";
}
setInterval(() => document.querySelectorAll(".cd[data-end]").forEach((el) => { el.textContent = countdownText(el.dataset.end); }), 1000);

/** A discount as a customer sees it: the percent, what it covers, until when, how many times. */
function customerDiscountCard(d) {
  const bits = [discScopeText(d)];
  if (d.endDate) bits.push(t("disc.until", { date: new Date(d.endDate).toLocaleDateString(LANG, { day: "numeric", month: "short" }) }));
  if (d.perCustomerLimit) bits.push(t("disc.perCustomer", { n: d.perCustomerLimit }));
  if (d.myTimesLeft != null) bits.push(t("disc.timesLeft", { n: d.myTimesLeft }));
  if (d.maxCustomers && d.peopleLeft != null) bits.push(t("disc.placesLeft", { n: d.peopleLeft, max: d.maxCustomers }));
  const bar = d.maxCustomers && d.peopleLeft != null ? `<div class="disc-left" title="${esc(t("disc.placesLeft", { n: d.peopleLeft, max: d.maxCustomers }))}"><i style="width:${Math.max(0, Math.min(100, (d.peopleLeft / d.maxCustomers) * 100))}%"></i></div>` : "";
  const clock = d.endDate ? `<div class="disc-cd">⏳ ${esc(t("cd.endsIn"))} ${countdownHtml(d.endDate)}</div>` : "";
  return `<div class="disc-card"><b>${d.percent}%</b><div><strong>${esc(d.title)}</strong>${d.description ? `<p>${esc(d.description)}</p>` : ""}<small>${esc(bits.join(" · "))}</small>${clock}${bar}</div></div>`;
}

const DISC_STATE = { PENDING: "disc.st.PENDING", REJECTED: "disc.st.REJECTED", PAUSED: "disc.st.PAUSED", SCHEDULED: "disc.st.SCHEDULED", LIVE: "disc.st.LIVE", ENDED: "disc.st.ENDED" };

function screenDiscounts() {
  if (!S._disc) { S._disc = { loading: true }; loadDiscounts(); }
  const d = S._disc;
  if (d.loading) return `${backRow()}<h1 class="screen-title">${esc(t("disc.title"))}</h1>${spinner()}`;
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(t("disc.title"))}</h1>
    <p class="screen-sub">${esc(t("disc.sub"))}</p>
    <button class="btn" onclick="openDiscountForm(null)">➕ ${esc(t("disc.new"))}</button>
    <div style="height:12px"></div>
    ${errorBanner()}
    ${d.list.length === 0 ? `<div class="empty-state">${esc(t("disc.none"))}</div>` : d.list.map((x) => `
      <div class="card disc-item">
        <div class="title-line"><strong>🏷️ ${esc(x.title)} — ${x.percent}%</strong><span class="badge ${x.state === "LIVE" ? "success" : x.state === "PENDING" || x.state === "SCHEDULED" ? "warning" : "neutral"}">${esc(t(DISC_STATE[x.state]))}</span></div>
        <p class="muted">${esc(discScopeText(x))}</p>
        <p class="muted">${x.startDate ? esc(t("disc.from", { date: new Date(x.startDate).toLocaleDateString(LANG, { day: "numeric", month: "short" }) })) + " " : ""}${x.endDate ? esc(t("disc.until", { date: new Date(x.endDate).toLocaleDateString(LANG, { day: "numeric", month: "short" }) })) : esc(t("disc.noEnd"))}</p>
        <p class="muted">${x.perCustomerLimit ? esc(t("disc.perCustomer", { n: x.perCustomerLimit })) : esc(t("disc.perCustomerAny"))} · ${x.maxCustomers ? esc(t("disc.maxPeople", { n: x.maxCustomers })) : esc(t("disc.maxPeopleAny"))}</p>
        ${x.description ? `<p>${esc(x.description)}</p>` : ""}
        ${x.rejectionReason ? `<div class="error-banner">${esc(t("disc.refusedBecause"))} ${esc(x.rejectionReason)}</div>` : ""}
        ${x.status === "APPROVED" ? `<p class="muted">📊 ${esc(t("disc.stats", { uses: x.uses, people: x.customers }))}</p>` : ""}
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          ${x.status === "APPROVED" && x.state !== "ENDED" ? `<button class="btn small outline" style="width:auto" onclick="discToggle('${x.id}',${x.isActive ? "false" : "true"})">${esc(x.isActive ? t("disc.pause") : t("disc.resume"))}</button>` : ""}
          ${x.state === "LIVE" ? `<button class="btn small outline" style="width:auto" onclick="discEndNow('${x.id}')">${esc(t("disc.endNow"))}</button>` : ""}
          <button class="btn small outline" style="width:auto" onclick="openDiscountForm('${x.id}')">${esc(t("disc.edit"))}</button>
          <button class="btn small danger" style="width:auto" onclick="discDelete('${x.id}')">${esc(t("disc.delete"))}</button>
        </div>
      </div>`).join("")}`;
}

async function loadDiscounts() {
  const [list, mine, sections] = await Promise.all([api("GET", "/merchant/discounts"), api("GET", "/products/mine"), api("GET", "/store/sections?all=1")]);
  S._disc = { loading: false, list: list.ok ? list.data : [], products: mine.ok ? mine.data.filter((p) => p.isActive) : [], sections: sections.ok ? sections.data : [] };
  render();
}

async function discToggle(id, active) {
  const { ok, data } = await api("PATCH", "/merchant/discounts/" + id, { isActive: active });
  if (!ok) S.error = errMsg(data, t("disc.failed"));
  loadDiscounts();
}

async function discEndNow(id) {
  if (!confirm(t("disc.endConfirm"))) return;
  const { ok, data } = await api("PATCH", "/merchant/discounts/" + id, { endNow: true });
  if (!ok) S.error = errMsg(data, t("disc.failed"));
  loadDiscounts();
}

async function discDelete(id) {
  if (!confirm(t("disc.deleteConfirm"))) return;
  const { ok, data } = await api("DELETE", "/merchant/discounts/" + id);
  if (!ok) S.error = errMsg(data, t("disc.failed"));
  loadDiscounts();
}

function openDiscountForm(id) {
  const x = id && S._disc ? S._disc.list.find((d) => d.id === id) : null;
  const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
  S._df = x
    ? { id: x.id, title: x.title, percent: x.percent, scope: x.scope, section: x.scopeSection || "", productIds: x.productIds || [], start: day(x.startDate), endPreset: x.endDate ? "custom" : "none", end: day(x.endDate), maxCustomers: x.maxCustomers || "", perCustomer: x.perCustomerLimit || "", description: x.description || "" }
    : { id: null, title: "", percent: 10, scope: "ALL", section: "", productIds: [], start: "", endPreset: "none", end: "", maxCustomers: "", perCustomer: "", description: "" };
  S._df.busy = false; S._df.error = null;
  go("discountForm");
}

function screenDiscountForm() {
  if (!S._df) return screenDiscounts();
  const f = S._df;
  const sections = (S._disc && S._disc.sections) || [];
  const products = (S._disc && S._disc.products) || [];
  const chip = (label, on, fn) => `<button class="chip ${on ? "active" : ""}" onclick="${fn}">${esc(label)}</button>`;
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(f.id ? t("disc.editTitle") : t("disc.new"))}</h1>
    ${f.id ? `<div class="info-banner">${esc(t("disc.editNote"))}</div>` : ""}

    <div class="field"><label>${esc(t("disc.name"))}</label><input value="${esc(f.title)}" oninput="S._df.title=this.value" placeholder="${esc(t("disc.namePh"))}"></div>

    <div class="field"><label>${esc(t("disc.percent"))}</label>
      <div class="chips-row">${DISC_PERCENTS.map((p) => chip(p + "%", f.percent === p, `S._df.percent=${p};render()`)).join("")}</div>
      <input type="number" inputmode="numeric" min="1" max="100" value="${esc(f.percent)}" placeholder="مثال: 15" oninput="S._df.percent=Number(this.value)||0" style="margin-top:8px"></div>

    <div class="field"><label>${esc(t("disc.scope"))}</label>
      <div class="chips-row">
        ${chip(t("disc.scopeAll"), f.scope === "ALL", "S._df.scope='ALL';render()")}
        ${chip(t("disc.scopeSection"), f.scope === "SECTION", "S._df.scope='SECTION';render()")}
        ${chip(t("disc.scopeProducts"), f.scope === "PRODUCTS", "S._df.scope='PRODUCTS';render()")}
      </div>
      ${f.scope === "SECTION" ? `<input value="${esc(f.section)}" maxlength="60" oninput="S._df.section=this.value" placeholder="${esc(t("disc.sectionPh"))}" style="margin-top:8px">` : ""}
      ${f.scope === "PRODUCTS" ? `<div class="disc-products">${products.length ? products.map((p) => `<label><input type="checkbox" ${f.productIds.includes(p.id) ? "checked" : ""} onchange="discToggleProduct('${p.id}',this.checked)"> ${esc(p.name)}</label>`).join("") : `<p class="muted">${esc(t("disc.noProducts"))}</p>`}</div>` : ""}
    </div>

    <div class="field"><label>${esc(t("disc.period"))}</label>
      <div class="row">
        <div class="field"><label class="muted">${esc(t("disc.startsOn"))}</label><input type="date" value="${esc(f.start)}" onchange="S._df.start=this.value"></div>
      </div>
      <label class="muted">${esc(t("disc.endsOn"))}</label>
      <div class="chips-row">
        ${[["none", t("disc.noEnd")], ["7", t("disc.week")], ["14", t("disc.twoWeeks")], ["30", t("disc.month")], ["90", t("disc.threeMonths")], ["custom", t("disc.customDate")]].map(([k, l]) => chip(l, f.endPreset === k, `discEndPreset('${k}')`)).join("")}
      </div>
      <input type="date" value="${esc(f.end)}" onchange="S._df.end=this.value;S._df.endPreset='custom';render()" style="margin-top:8px">
      ${f.end ? `<p class="muted" style="margin:6px 0 0">${esc(t("disc.endsAt", { date: f.end }))}</p>` : ""}
    </div>

    <div class="field"><label>${esc(t("disc.limits"))}</label>
      <label class="muted">${esc(t("disc.perCustomerLabel"))}</label>
      <div class="chips-row">${[["", t("disc.noLimit")], [1, "1"], [2, "2"], [3, "3"], [5, "5"], [10, "10"]].map(([v, l]) => chip(l, String(f.perCustomer) === String(v), `S._df.perCustomer='${v}';render()`)).join("")}</div>
      <input type="number" inputmode="numeric" min="1" max="1000" value="${esc(f.perCustomer)}" placeholder="${esc(t("disc.orType"))}" oninput="S._df.perCustomer=this.value" style="margin-top:6px">
      <label class="muted" style="margin-top:8px;display:block">${esc(t("disc.maxPeopleLabel"))}</label>
      <div class="chips-row">${[["", t("disc.noLimit")], [10, "10"], [25, "25"], [50, "50"], [100, "100"], [500, "500"]].map(([v, l]) => chip(l, String(f.maxCustomers) === String(v), `S._df.maxCustomers='${v}';render()`)).join("")}</div>
      <input type="number" inputmode="numeric" min="1" max="1000000" value="${esc(f.maxCustomers)}" placeholder="${esc(t("disc.orType"))}" oninput="S._df.maxCustomers=this.value" style="margin-top:6px">
    </div>

    <div class="field"><label>${esc(t("disc.notes"))}</label>
      <textarea rows="3" maxlength="500" oninput="S._df.description=this.value" placeholder="${esc(t("disc.notesPh"))}">${esc(f.description)}</textarea></div>

    ${f.error ? `<div class="error-banner">${esc(f.error)}</div>` : ""}
    <p class="muted">${esc(t("disc.reviewNote"))}</p>
    <button class="btn" ${f.busy ? "disabled" : ""} onclick="saveDiscount()">${esc(f.busy ? t("disc.sending") : t("disc.send"))}</button>`;
}

function discToggleProduct(id, on) {
  const f = S._df;
  f.productIds = on ? [...new Set([...f.productIds, id])] : f.productIds.filter((x) => x !== id);
}

function discEndPreset(k) {
  const f = S._df;
  f.endPreset = k;
  if (k === "none") f.end = "";
  else if (k !== "custom") {
    const from = f.start ? new Date(f.start) : new Date();
    from.setDate(from.getDate() + Number(k));
    f.end = from.toISOString().slice(0, 10);
  }
  render();
}

async function saveDiscount() {
  const f = S._df;
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const body = {
    title: f.title.trim(), percent: Number(f.percent), description: f.description.trim() || null, scope: f.scope,
    scopeSection: f.scope === "SECTION" ? (f.section || "").trim() || null : null, productIds: f.scope === "PRODUCTS" ? f.productIds : [],
    startDate: f.start ? new Date(f.start + "T00:00:00").toISOString() : null,
    endDate: f.end ? new Date(f.end + "T23:59:59").toISOString() : null,
    maxCustomers: num(f.maxCustomers), perCustomerLimit: num(f.perCustomer),
  };
  if (body.title.length < 2) { f.error = t("disc.needName"); return render(); }
  if (!(body.percent >= 1 && body.percent <= 100)) { f.error = t("disc.needPercent"); return render(); }
  if (f.scope === "SECTION" && !body.scopeSection) { f.error = t("disc.needSection"); return render(); }
  f.busy = true; f.error = null; render();
  const res = f.id ? await api("PATCH", "/merchant/discounts/" + f.id, body) : await api("POST", "/merchant/discounts", body);
  f.busy = false;
  if (!res.ok) { f.error = errMsg(res.data, t("disc.failed")); return render(); }
  S._disc = null; S._catalog = null;
  back();
  toast(t("disc.sent"));
}

/* ---- Redeem tab ---- */

function tabRedeem() {
  if (!S._redeem) S._redeem = { phase: "input", memberNumber: "", code: "" };
  const r = S._redeem;
  if (r.phase === "input") {
    return `
      <h1 class="screen-title">تأكيد حسم</h1>
      <p class="screen-sub">دخّل بيانات عضوية الزبون</p>
      <div class="field"><label>${esc(t("rd.full"))}</label><input id="rd-full" dir="ltr" inputmode="numeric" autocomplete="off" placeholder="0000 0000 0000 0000" value="${esc(r.full || "")}" /><p class="muted" style="margin:4px 0 0">${esc(t("rd.fullHint"))}</p></div>
      ${errorBanner()}
      <button class="btn" ${S.busy ? "disabled" : ""} onclick="verifyRedeem()">تحقق</button>
      <button class="btn outline" style="margin-top:10px" onclick="openDiscountHistory('shop')">🧾 ${esc(t("dh.titleShop"))}</button>
    `;
  }
  if (r.phase === "verified") {
    return `
      <h1 class="screen-title">تأكيد حسم</h1>
      <p><strong>العضو:</strong> ${esc(r.memberName)}</p>
      ${(r.discounts || []).length ? `
        <div class="section-title">${esc(t("disc.pickAtTill"))}</div>
        <div class="disc-pick">${r.discounts.map((d) => `
          <button class="${r.discountId === d.id ? "on" : ""}" ${d.eligible ? "" : "disabled"} onclick="S._redeem.discountId='${d.id}';S._redeem.discountPercent=${d.percent};render()">
            <b>${d.percent}%</b><span>${esc(d.title)}</span>
            <small>${esc(discScopeText(d))}${d.eligible ? (d.remainingForMember !== null ? " · " + esc(t("disc.leftForMember", { n: d.remainingForMember })) : "") : " · " + esc(t("disc.used"))}</small>
          </button>`).join("")}</div>
        ${r.discounts.every((d) => !d.eligible) ? `<div class="error-banner">${esc(t("disc.allUsed"))}</div>` : ""}` : `<p style="color:var(--primary)"><strong>نسبة الحسم:</strong> ${r.discountPercent}%</p>`}
      <div class="field"><label>قيمة الفاتورة</label><input id="rd-bill" type="number" placeholder="0.00" value="${esc(r.billText || "")}" /></div>
      ${errorBanner()}
      <button class="btn" ${S.busy ? "disabled" : ""} onclick="confirmRedeem()">تأكيد الحسم</button>
      <button class="btn outline" onclick="resetRedeem()">إلغاء</button>
    `;
  }
  const rec = r.receipt;
  return `
    <h1 class="screen-title" style="color:var(--success)">تم تأكيد الحسم ✓</h1>
    <div class="card">
      <p class="muted">رقم العملية</p><p style="font-family:monospace;font-size:12px">${esc(rec.transactionRef)}</p>
      <div class="divider"></div>
      <div class="list-row"><span>قيمة الفاتورة</span><span class="price">${fmt(rec.billAmountCents)}</span></div>
      <div class="list-row"><span>نسبة الحسم</span><span>${rec.discountPercent}%</span></div>
      <div class="list-row"><span>قيمة الحسم</span><span class="price">${fmt(rec.discountAmountCents)}</span></div>
      <div class="divider"></div>
      <div class="list-row"><strong>المبلغ النهائي</strong><span class="price" style="color:var(--primary)">${fmt(rec.finalAmountCents)}</span></div>
    </div>
    <button class="btn outline" style="margin-bottom:10px" onclick="exportDocument('/invoices/discount/${esc(rec.transactionRef)}')">📄 تصدير الإيصال PDF</button>
    <button class="btn" onclick="resetRedeem()">عملية جديدة</button>
  `;
}

function resetRedeem() {
  S._redeem = { phase: "input", memberNumber: "", code: "" };
  render();
}

async function verifyRedeem() {
  const full = qs("rd-full").value.trim();
  S._redeem.full = full;
  const parsed = parseFullCode(full);
  if (!parsed) { S.error = t("rd.fullBad"); return render(); }
  const { memberNumber, code } = parsed;
  S._redeem.memberNumber = memberNumber;
  S._redeem.code = code;
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/qr/verify", { memberNumber, code });
  S.busy = false;
  if (ok) {
    const all = data.discounts || [];
    const first = all.find((d) => d.eligible);
    S._redeem = { phase: "verified", memberNumber, code, memberName: data.member.fullName, discountPercent: first ? first.percent : data.discount ? data.discount.percent : 0, discounts: all, discountId: first ? first.id : null };
  } else {
    S.error = errMsg(data, "الكود غير صالح أو منتهي");
  }
  render();
}

async function confirmRedeem() {
  const billText = qs("rd-bill").value;
  S._redeem.billText = billText;
  const billAmountCents = Math.round(parseFloat(latinDigits(billText)) * 100);
  if (!billAmountCents || billAmountCents <= 0) { S.error = "دخّل قيمة فاتورة صحيحة"; return render(); }
  S.busy = true; S.error = null; render();
  const r = S._redeem;
  const { ok, data } = await api("POST", "/qr/redeem", { memberNumber: r.memberNumber, code: r.code, billAmountCents, ...(r.discountId ? { discountId: r.discountId } : {}) });
  S.busy = false;
  if (ok) { r.phase = "done"; r.receipt = data; }
  else S.error = errMsg(data, "تعذّر تأكيد الحسم");
  render();
}

/* ---- the camera that reads a member's card code (from anywhere in the shop's side of the app) ---- */

let scanState = null;

async function openScanner() {
  closeScanner();
  const box = document.createElement("div");
  box.id = "scan-modal";
  box.innerHTML = `
    <div class="scan-back" onclick="closeScanner()"></div>
    <div class="scan-card">
      <video id="scan-video" playsinline muted></video>
      <div class="scan-frame"></div>
      <p id="scan-msg">${esc(t("scan.hint"))}</p>
      <button class="btn outline" onclick="closeScanner()">${esc(t("rv.cancel"))}</button>
    </div>`;
  document.body.appendChild(box);
  const msg = document.getElementById("scan-msg");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
    const video = document.getElementById("scan-video");
    video.srcObject = stream;
    await video.play();
    scanState = { stream, stop: false, since: Date.now() };
    let detector = null;
    if ("BarcodeDetector" in window) { try { detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) {} }
    if (!detector && !window.jsQR) await new Promise((res) => { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js"; sc.onload = res; sc.onerror = res; document.head.appendChild(sc); });
    const canvas = document.createElement("canvas");
    const loop = async () => {
      if (!scanState || scanState.stop) return;
      let text = null;
      try {
        if (detector) { const found = await detector.detect(video); if (found.length) text = found[0].rawValue; }
        else if (window.jsQR && video.videoWidth) {
          // two tries each round: the whole picture, then a smaller copy (a phone screen shown to a laptop camera often reads better smaller)
          const vw = video.videoWidth, vh = video.videoHeight;
          for (const maxW of [vw, 640]) {
            const k = Math.min(1, maxW / vw);
            canvas.width = Math.round(vw * k); canvas.height = Math.round(vh * k);
            const g = canvas.getContext("2d", { willReadFrequently: true });
            g.drawImage(video, 0, 0, canvas.width, canvas.height);
            const hit = jsQR(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" }); // a card shown in dark mode is light on dark
            if (hit) { text = hit.data; break; }
            if (vw <= 640) break;
          }
        }
      } catch (e) {}
      if (text && /^[^:]+:\d{6}$/.test(text.trim())) { closeScanner(); return onScanned(text.trim()); }
      if (Date.now() - scanState.since > 8000) { const m = document.getElementById("scan-msg"); if (m) m.textContent = t("scan.tip"); }
      requestAnimationFrame(() => setTimeout(loop, 90));
    };
    loop();
  } catch (e) {
    msg.textContent = t("scan.denied");
  }
}

function closeScanner() {
  if (scanState) { scanState.stop = true; try { scanState.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {} scanState = null; }
  const box = document.getElementById("scan-modal");
  if (box) box.remove();
}

/** The code of the card ("DLK-...:123456") was read: go to the till screen and check it at once. */
function onScanned(text) {
  const [memberNumber, code] = text.split(":");
  S.merchantTab = "redeem";
  S._redeem = { phase: "input", memberNumber, code };
  render();
  S.busy = false;
  api("POST", "/qr/verify", { memberNumber, code }).then(({ ok, data }) => {
    if (ok) {
      const all = data.discounts || [];
      const first = all.find((d) => d.eligible);
      S._redeem = { phase: "verified", memberNumber, code, memberName: data.member.fullName, discountPercent: first ? first.percent : data.discount ? data.discount.percent : 0, discounts: all, discountId: first ? first.id : null };
    } else S.error = errMsg(data, "الكود غير صالح أو منتهي");
    render();
  });
}

/* ---- Merchant Orders tab ---- */

function tabMerchantOrders() {
  if (!S._mOrders) { S._mOrders = { loading: true }; loadMerchantOrders(); }
  const o = S._mOrders;
  if (o.loading) return `<h1 class="screen-title">طلبات واردة</h1>${spinner()}`;
  const list = o.list || [];
  return `
    <h1 class="screen-title">طلبات واردة</h1>
    ${list.length === 0 ? `<div class="empty-state">ما في طلبات بعد</div>` : list.map((ord) => {
      const next = (ORDER_TRANSITIONS[ord.status] || []).filter((s) => s !== "CANCELLED");
      const canCancel = (ORDER_TRANSITIONS[ord.status] || []).includes("CANCELLED");
      return `
      <div class="card">
        <div class="title-line"><strong>${esc(ord.orderNumber)}</strong>${orderBadge(ord.status)}</div>
        <p class="muted">${esc(ord.user ? ord.user.fullName : "")}${ord.customerRating && ord.customerRating.ratingCount ? ` · <span class="star">★ ${ord.customerRating.rating.toFixed(1)}</span> (${ord.customerRating.ratingCount})` : ""}</p>
        <p class="price">${fmt(ord.totalCents)}</p>
        ${ord.status === "DELIVERED" && ord.user ? `<button class="btn small outline" style="width:auto;margin-top:6px" onclick="openReview('customer','${ord.user.id}','${esc(ord.user.fullName).replace(/'/g, "&#39;")}',0,'')">⭐ ${esc(ord.ratedCustomer ? t("rv.edit") : t("rv.rateCustomer"))}</button>` : ""}
        ${(next.length || canCancel) ? `<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px">
          ${next.map((s) => `<button class="btn small" style="width:auto" onclick="advanceMerchantOrder('${ord.id}','${s}')">${esc(ORDER_ACTION_LABEL[s] || s)}</button>`).join("")}
          ${canCancel ? `<button class="btn small outline" style="width:auto" onclick="cancelMerchantOrder('${ord.id}')">إلغاء</button>` : ""}
        </div>` : ""}
      </div>`;
    }).join("")}
    ${errorBanner()}
  `;
}

async function loadMerchantOrders() {
  const { ok, data } = await api("GET", "/orders/merchant");
  S._mOrders = { loading: false, list: ok ? data : [] };
  render();
}

async function advanceMerchantOrder(id, status) {
  await api("PATCH", `/orders/${id}/status`, { status });
  S._mOrders = null;
  render();
  loadMerchantOrders();
}

async function cancelMerchantOrder(id) {
  const reason = prompt("سبب الإلغاء؟");
  if (!reason || reason.trim().length < 3) return;
  const { ok, data } = await api("PATCH", `/orders/${id}/status`, { status: "CANCELLED", cancelReason: reason.trim() });
  if (!ok) { S.error = errMsg(data, "تعذّر إلغاء الطلب"); render(); }
  S._mOrders = null;
  render();
  loadMerchantOrders();
}

/* ---- Catalog tab ---- */

function tabCatalog() {
  if (!S._catalog) { S._catalog = { loading: true }; loadCatalog(); }
  const c = S._catalog;
  if (c.loading) return `<h1 class="screen-title">الكتالوج</h1>${spinner()}`;
  return `
    <h1 class="screen-title">الكتالوج</h1>
    <div class="row" style="margin-bottom:12px">
      <button class="btn outline" onclick="S._mprof=null;go('merchantProfile')">📍 بيانات المحل ومكانه</button>
      <button class="btn outline" onclick="S._hours=null;go('merchantHours')">🕒 ساعات العمل</button>
    </div>
    <button class="btn outline" style="margin-bottom:12px" onclick="openBranches()">🏬 ${esc(t("br.title"))}</button>
    <button class="btn outline" style="margin-bottom:12px" onclick="openShipping()">🚚 ${esc(t("ship.title"))}</button>
    <button class="btn outline" style="margin-bottom:12px" onclick="openAiPlans()">✨ ${esc(t("ai.plansTitle"))}</button>
    <div class="card">
      <div class="section-title" style="margin-top:0">${esc(t("disc.title"))}</div>
      ${(c.discounts || []).length ? c.discounts.map((d) => `<p style="color:var(--primary)">🏷️ ${esc(d.title)} — ${d.percent}%</p>`).join("") : `<p class="muted">${esc(t("disc.none"))}</p>`}
      <button class="btn" style="margin-top:8px" onclick="S._disc=null;go('discounts')">🏷️ ${esc(t("disc.open"))}</button>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">المسوّقين</div>
      ${(c.affiliates || []).length ? c.affiliates.map((af) => `
        <div style="padding:6px 0;border-top:1px solid var(--border)">
          <div class="title-line">
            <strong>${esc(af.user.fullName)}</strong>
            <span class="badge ${af.isActive ? "success" : "neutral"}">${af.isActive ? "نشط" : "معطّل"}</span>
          </div>
          <p class="muted">${esc(af.user.email)} — ${af.commissionType === "PERCENT" ? af.commissionValue + "%" : fmt(af.commissionValue)} لكل عملية</p>
          <p class="muted">زبائن أحالهم: ${af.referredCount} — إجمالي عمولاته: ${fmt(af.totalCommissionCents)}</p>
          <button class="btn small ${af.isActive ? "outline" : ""}" onclick="toggleCatalogAffiliate('${af.id}', ${!af.isActive})">${af.isActive ? "تعطيل" : "تفعيل"}</button>
        </div>`).join("") : `<p class="muted">ما عندك مسوّقين بعد</p>`}
      <div class="divider"></div>
      <div class="field"><label>بريد المسوّق (لازم يكون عنده حساب بالتطبيق)</label><input id="aff-email" placeholder="marketer@example.com" value="${esc(c.affEmail || "")}" /></div>
      <div class="row">
        <div class="field">
          <label>نوع العمولة</label>
          <select id="aff-type">
            <option value="PERCENT" ${c.affType === "FIXED" ? "" : "selected"}>نسبة %</option>
            <option value="FIXED" ${c.affType === "FIXED" ? "selected" : ""}>مبلغ ثابت</option>
          </select>
        </div>
        <div class="field"><label>القيمة</label><input id="aff-value" placeholder="10" value="${esc(c.affValue || "")}" /></div>
      </div>
      <button class="btn small" onclick="addCatalogAffiliate()">إضافة مسوّق</button>
    </div>

    ${c.storeClosed ? `<div class="card" style="border-color:var(--primary)"><strong>${esc(t("sp.closedTitle"))}</strong><p class="muted" style="margin:4px 0 10px">${esc(t("sp.closedSub"))}</p><button class="btn" onclick="openStorePlans()">🛍️ ${esc(t("sp.choose.btn"))}</button></div>` : `<button class="btn wiz-start" onclick="openProductWizard()">📷 ${esc(t("wiz.start"))}</button>`}
    ${c.storeClosed ? "" : `<p class="muted" style="margin:6px 0 0;text-align:center">${esc(t("wiz.startSub"))}</p>`}
    <div class="title-line" style="margin:16px 0 8px">
      <strong>المنتجات</strong>
      ${c.storeClosed ? "" : `<button class="btn small" style="width:auto" onclick="go('productEdit', {productId:null})">+ منتج جديد</button>`}
    </div>
    ${(c.products || []).length === 0 ? `<div class="empty-state">ما في منتجات بعد</div>` : c.products.map((p) => `
      <div class="card clickable" onclick="go('productEdit', {productId:'${p.id}'})">
        <div class="title-line"><strong>${esc(p.name)}</strong><span class="badge ${p.isActive ? "success" : "neutral"}">${p.isActive ? "نشط" : "غير نشط"}</span></div>
        ${p.moderation === "PENDING" ? `<p class="info-banner">⏳ ${esc(t("rev.pending"))}</p>` : ""}
        ${p.moderation === "REJECTED" ? `<p class="error-banner">⚠️ ${esc(t("rev.rejected", { why: p.moderationNote || "" }))}</p>` : ""}
        <p class="muted">${fmt(p.priceCents)} — مخزون: ${p.stock}</p>
      </div>`).join("")}
    ${errorBanner()}
  `;
}

async function loadCatalog() {
  const [meRes, prodRes, affRes] = await Promise.all([
    api("GET", "/merchant/me"),
    api("GET", "/products/mine"),
    api("GET", "/affiliates"),
  ]);
  S._catalog = {
    loading: false,
    storeClosed: !!(meRes.ok && meRes.data.storePlan && meRes.data.storePlan.required && !meRes.data.storePlan.active),
    discounts: meRes.ok ? meRes.data.discounts : [],
    products: prodRes.ok ? prodRes.data : [],
    affiliates: affRes.ok ? affRes.data : [],
  };
  render();
}

async function addCatalogAffiliate() {
  const userEmail = qs("aff-email").value.trim();
  const commissionType = qs("aff-type").value;
  const commissionValue = parseInt(latinDigits(qs("aff-value").value), 10);
  S._catalog.affEmail = userEmail;
  S._catalog.affType = commissionType;
  S._catalog.affValue = qs("aff-value").value;
  if (!userEmail || !commissionValue || commissionValue <= 0 || (commissionType === "PERCENT" && commissionValue > 100)) {
    S.error = "دخّل بريد المسوّق وقيمة عمولة صحيحة (نسبة لحد 100)";
    return render();
  }
  const { ok, data } = await api("POST", "/affiliates", { userEmail, commissionType, commissionValue });
  if (!ok) { S.error = errMsg(data, "تعذّرت إضافة المسوّق"); return render(); }
  S._catalog.affEmail = "";
  S._catalog.affValue = "";
  S._catalog = null;
  render();
  loadCatalog();
}

async function toggleCatalogAffiliate(id, nextActive) {
  await api("PATCH", "/affiliates/" + id, { isActive: nextActive });
  S._catalog = null;
  render();
  loadCatalog();
}

async function addCatalogDiscount() {
  const title = qs("cat-disc-title").value.trim();
  const percentText = qs("cat-disc-percent").value;
  S._catalog.discTitle = title;
  S._catalog.discPercent = percentText;
  const percent = parseInt(latinDigits(percentText), 10);
  if (!title || !percent || percent < 1 || percent > 100) { S.error = "دخّل عنوان الحسم ونسبة بين 1 و100"; return render(); }
  const { ok, data } = await api("POST", "/merchant/discounts", { title, percent });
  if (!ok) { S.error = errMsg(data, "تعذّرت إضافة الحسم"); return render(); }
  S._catalog = null;
  render();
  loadCatalog();
}

/* ================= PRODUCT EDIT ================= */

function screenProductEdit() {
  const productId = S.params.productId;
  if (!S._prodEdit || S._prodEdit.productId !== productId) {
    S._pcat = null; S._prodEdit = { productId, loading: true, isNew: !productId, categories: [], name: "", description: "", price: "", stock: "", sku: "", memberDiscountEnabled: false, memberPrice: "", isActive: true, selectedCat: null, images: [] };
    initProductEdit(productId);
  }
  const p = S._prodEdit;
  if (p.loading) return backRow() + spinner();
  return `
    ${backRow()}
    <h1 class="screen-title">${p.isNew ? "منتج جديد" : "تعديل المنتج"}</h1>
    <div class="field"><label>اسم المنتج</label><input id="pe-name" placeholder="مثال: قميص قطن أبيض" value="${esc(p.name)}" /></div>
    <div class="field"><label>الوصف (اختياري)</label><input id="pe-desc" placeholder="وصف قصير للمنتج، مثال: قميص قطن 100% مريح" value="${esc(p.description)}" /></div>
    <div class="row">
      <div class="field"><label>السعر</label><input id="pe-price" placeholder="مثال: 25.00" value="${esc(p.price)}" /></div>
      <div class="field"><label>المخزون</label><input id="pe-stock" inputmode="numeric" value="${esc(p.stock)}" placeholder="${esc(t("pe.stockPh"))}" /></div>
    </div>
    <div class="field"><label>SKU (اختياري)</label><input id="pe-sku" placeholder="مثال: SH-001" value="${esc(p.sku)}" /></div>
    <div class="section-title">${esc(t("pe.photos"))}</div>
    <div class="pe-photos">
      ${(p.images || []).map((u, i) => `
        <div class="pe-photo">
          <img src="${esc(u)}" alt="" loading="lazy">
          ${i === 0 ? `<span class="pe-main">${esc(t("wiz.mainPhoto"))}</span>` : `<button class="pe-btn" onclick="peMainPhoto(${i})">★</button>`}
          <button class="pe-x" onclick="peRemovePhoto(${i})" aria-label="x">✕</button>
        </div>`).join("")}
      ${(p.images || []).length < 6 ? `<label class="wiz-add"><input type="file" accept="image/*" multiple onchange="peAddPhotos(this)" hidden><b>📷</b><span>${esc(t(p.uploading ? "wiz.uploading" : "pe.addPhoto"))}</span></label>` : ""}
    </div>
    <div class="info-banner">${esc(t("photo.rules"))}</div>
    <div class="section-title">${esc(t("pc.title"))}</div>
    ${pcatPickerHtml(p.productCategoryId, "selectProdCategory")}
    <div class="switch-row">
      <span>حسم أعضاء دليلكم</span>
      <label class="switch"><input type="checkbox" id="pe-member-toggle" ${p.memberDiscountEnabled ? "checked" : ""} onchange="toggleMemberDiscount(this.checked)" /><span class="track"></span></label>
    </div>
    ${p.memberDiscountEnabled ? `<div class="field"><label>سعر العضو</label><input id="pe-member-price" placeholder="مثال: 20.00" value="${esc(p.memberPrice)}" /></div>` : ""}
    ${!p.isNew ? `
      <div class="switch-row">
        <span>المنتج نشط</span>
        <label class="switch"><input type="checkbox" id="pe-active-toggle" ${p.isActive ? "checked" : ""} onchange="toggleProdActive(this.checked)" /><span class="track"></span></label>
      </div>` : ""}
    ${errorBanner()}
    <button class="btn" ${S.busy ? "disabled" : ""} onclick="saveProduct()">حفظ</button>
  `;
}

async function initProductEdit(productId) {
  const catsRes = await api("GET", "/categories?lang=" + LANG);
  const categories = catsRes.ok ? catsRes.data : [];
  if (!productId) {
    S._prodEdit = { ...S._prodEdit, loading: false, categories };
    return render();
  }
  const prodRes = await api("GET", "/products/" + productId);
  if (!prodRes.ok) { S._prodEdit = { ...S._prodEdit, loading: false, categories, notFound: true }; return render(); }
  const prod = prodRes.data;
  S._prodEdit = {
    productId, isNew: false, loading: false, categories,
    name: prod.name, description: prod.description || "", price: (prod.priceCents / 100).toString(),
    stock: String(prod.stock), sku: "", memberDiscountEnabled: prod.memberDiscountEnabled,
    memberPrice: prod.memberPriceCents != null ? (prod.memberPriceCents / 100).toString() : "",
    isActive: prod.isActive, selectedCat: prod.categoryId || null, productCategoryId: prod.productCategoryId || null,
    images: Array.isArray(prod.images) && prod.images.length ? prod.images : prod.imageUrl ? [prod.imageUrl] : [],
  };
  render();
}

function snapshotProdEditDraft() {
  const p = S._prodEdit;
  p.name = qs("pe-name") ? qs("pe-name").value : p.name;
  p.description = qs("pe-desc") ? qs("pe-desc").value : p.description;
  p.price = qs("pe-price") ? qs("pe-price").value : p.price;
  p.stock = qs("pe-stock") ? qs("pe-stock").value : p.stock;
  p.sku = qs("pe-sku") ? qs("pe-sku").value : p.sku;
  if (qs("pe-member-price")) p.memberPrice = qs("pe-member-price").value;
}

/** The photos of a product being edited: add, remove, make one the main (first) one, or improve it for Google. */
async function peAddPhotos(input) {
  const p = S._prodEdit;
  snapshotProdEditDraft();
  const files = Array.from(input.files || []).slice(0, 6 - (p.images || []).length);
  input.value = "";
  if (!files.length) return;
  p.uploading = true; S.error = null; render();
  for (const file of files) {
    try {
      const blob = await downscaleImage(file, 1280, 0.82);
      const { ok, data } = await postImage("/products/photos", blob);
      if (ok) p.images.push(data.url);
      else S.error = errMsg(data, t("photo.failed"));
    } catch (e) { S.error = t("photo.failed"); }
  }
  p.uploading = false;
  render();
}
function peRemovePhoto(i) { snapshotProdEditDraft(); S._prodEdit.images.splice(i, 1); render(); }
function peMainPhoto(i) { snapshotProdEditDraft(); const im = S._prodEdit.images; im.unshift(im.splice(i, 1)[0]); render(); }
function selectProdCategory(id) {
  snapshotProdEditDraft();
  S._prodEdit.productCategoryId = id;
  render();
}
function toggleMemberDiscount(checked) {
  snapshotProdEditDraft();
  S._prodEdit.memberDiscountEnabled = checked;
  render();
}
function toggleProdActive(checked) {
  S._prodEdit.isActive = checked;
}

async function saveProduct() {
  const p = S._prodEdit;
  snapshotProdEditDraft();
  const name = p.name.trim();
  const description = p.description.trim();
  const priceCents = Math.round(parseFloat(latinDigits(p.price)) * 100);
  const stock = parseInt(latinDigits(p.stock), 10);
  const sku = p.sku.trim();
  if (!name || !priceCents || priceCents <= 0 || isNaN(stock) || stock < 0) { S.error = "تأكد من اسم المنتج والسعر والمخزون"; return render(); }
  if (p.isNew && !(await shipGuard())) return;
  let memberPriceCents = null;
  if (p.memberDiscountEnabled) {
    memberPriceCents = Math.round(parseFloat(latinDigits(p.memberPrice)) * 100);
    if (!memberPriceCents || memberPriceCents <= 0 || memberPriceCents >= priceCents) { S.error = "سعر العضو لازم يكون أقل من السعر الأصلي"; return render(); }
  }
  const payload = {
    name, description: description || undefined, priceCents, productCategoryId: p.productCategoryId || undefined,
    stock, sku: sku || undefined, memberDiscountEnabled: p.memberDiscountEnabled, memberPriceCents: memberPriceCents || undefined,
    images: (p.images || []).filter((u) => /^\/store\/photos\/[0-9a-f-]{36}$/.test(u)),
  };
  S.busy = true; S.error = null; render();
  let res;
  if (p.isNew) res = await api("POST", "/products", payload);
  else res = await api("PATCH", "/products/" + p.productId, { ...payload, isActive: p.isActive });
  S.busy = false;
  if (res.ok) {
    S._catalog = null;
    back();
    if (res.data.moderation === "PENDING") toast(t("rev.pending"));
    else if (res.data.moderation === "REJECTED") toast(t("rev.rejected", { why: res.data.moderationNote || "" }));
  } else { S.error = errMsg(res.data, "تعذّر حفظ المنتج"); render(); }
}


/* ================= WALLET ================= */

function screenWallet() {
  if (!S._wallet) { S._wallet = { loading: true }; loadWallet(); }
  const w = S._wallet;
  if (w.loading) return backRow() + spinner();
  const m = w.methods;
  const locals = m.localWallets || [];
  return `
    ${backRow()}
    <h1 class="screen-title">محفظتي</h1>
    <div class="member-card" style="margin-bottom:14px">
      <div class="label">${esc(m.creditName)}</div>
      <div class="member-number" style="font-size:30px">${w.balance}</div>
      <div class="label">1 USD = ${m.creditsPerUsd} ${esc(m.creditName)}</div>
    </div>
    <div class="section-title">شحن الرصيد</div>
    <div class="card">
      <div class="field"><label>طريقة الدفع</label>
        <select id="tp-method" onchange="onTopupMethod()">
          ${m.usdtTrc20Address ? `<option value="USDT_TRC20">USDT (شبكة TRC20) — تحقق تلقائي</option>` : ""}
          ${locals.map((l) => `<option value="${esc(l.key)}">${esc(l.label)}${l.auto ? " — تحقق تلقائي" : ""}</option>`).join("")}
        </select>
      </div>
      <div id="tp-hint" class="muted" style="margin-bottom:10px;line-height:1.7"></div>
      <div class="field"><label id="tp-ref-label">رقم العملية</label><input id="tp-ref" placeholder="مثال: رقم العملية من تطبيق الدفع" /></div>
      <div class="field" id="tp-amount-row"><label>المبلغ اللي دفعته</label><input id="tp-amount" placeholder="مثال: 50" type="number" /></div>
      ${errorBanner()}
      ${S._walletMsg ? `<div class="success-banner">${esc(S._walletMsg)}</div>` : ""}
      <button class="btn" ${w.submitting ? "disabled" : ""} onclick="submitTopup()">تأكيد الشحن</button>
    </div>
    <div class="section-title">الحركات</div>
    ${(w.topups || []).map((t) => `
      <div class="card"><div class="title-line"><strong>${esc(t.method)}</strong>
        <span class="badge ${t.status === "APPROVED" ? "success" : t.status === "REJECTED" ? "danger" : "warning"}">${t.status === "APPROVED" ? "مقبول" : t.status === "REJECTED" ? "مرفوض" : "بانتظار التأكيد"}</span></div>
        <p class="muted" style="overflow-wrap:anywhere">${esc(t.reference)}${t.amountCredits ? " — +" + t.amountCredits : ""}</p></div>`).join("")}
    ${(w.transactions || []).map((t) => `
      <div class="list-row" style="padding:5px 0"><span class="muted">${esc(t.type)} ${esc(t.ref || "")}</span>
      <span class="price" style="color:${t.amount >= 0 ? "var(--success)" : "var(--danger)"}">${t.amount > 0 ? "+" : ""}${t.amount}</span></div>`).join("")}
  `;
}

async function loadWallet() {
  const [w, m, t] = await Promise.all([api("GET", "/wallet"), api("GET", "/wallet/methods"), api("GET", "/wallet/topups")]);
  S._wallet = { loading: false, balance: w.ok ? w.data.balance : 0, transactions: w.ok ? w.data.transactions : [], methods: m.ok ? m.data : { creditName: "", creditsPerUsd: 0, localWallets: [] }, topups: t.ok ? t.data : [] };
  render();
  onTopupMethod();
}

function onTopupMethod() {
  const sel = qs("tp-method");
  if (!sel) return;
  const m = S._wallet.methods;
  const usdt = sel.value === "USDT_TRC20";
  qs("tp-amount-row").style.display = usdt ? "none" : "block";
  qs("tp-ref-label").textContent = tr(usdt ? "رقم التحويل (txid — 64 خانة)" : "رقم العملية");
  if (usdt) {
    qs("tp-hint").innerHTML = `حوّل USDT عبر شبكة <b>TRC20</b> لهالعنوان، وبعدين الصق الـ txid — بنتحقق من الشبكة تلقائيًا وبينضاف الرصيد فورًا:<br><b style="direction:ltr;display:block;overflow-wrap:anywhere;user-select:all">${esc(m.usdtTrc20Address)}</b>`;
    trDom(qs("tp-hint"));
  } else {
    const l = (m.localWallets || []).find((x) => x.key === sel.value);
    qs("tp-hint").innerHTML = l ? `حوّل لحساب <b style="user-select:all">${esc(l.accountNumber)}</b>${l.instructions ? " — " + esc(l.instructions) : ""}<br>بعد التحويل دخّل رقم العملية والمبلغ، والإدارة بتأكد وبيضاف رصيدك.` : "";
    trDom(qs("tp-hint"));
  }
}

function restoreTopupDraft(d) {
  render();
  if (!S._wallet || S._wallet.loading) return;
  qs("tp-method").value = d.method;
  qs("tp-ref").value = d.reference;
  qs("tp-amount").value = d.amount;
  onTopupMethod();
}

async function submitTopup() {
  const method = qs("tp-method").value;
  const reference = qs("tp-ref").value.trim();
  const amountText = qs("tp-amount").value;
  const draft = { method, reference, amount: amountText };
  const amount = parseFloat(latinDigits(amountText));
  if (!reference) { S.error = "دخّل رقم العملية"; return restoreTopupDraft(draft); }
  const body = { method, reference };
  if (method !== "USDT_TRC20") {
    if (!amount) { S.error = "دخّل المبلغ اللي دفعته"; return restoreTopupDraft(draft); }
    body.amountClaimed = amount;
  }
  S.error = null; S._walletMsg = null;
  const { ok, data } = await api("POST", "/wallet/topups", body);
  if (ok) {
    S._walletMsg = data.status === "APPROVED" ? `تم! انضاف ${data.amountCredits} لرصيدك` : "انرسل الطلب — بانتظار تأكيد الإدارة";
    S._wallet = null;
    return render();
  }
  S.error = errMsg(data, "تعذّر الشحن");
  restoreTopupDraft(draft);
}

/* ================= AUTO-RESPONDER ================= */

function screenResponder() {
  if (SOON.responder) return `${backRow()}<div class="center-pad"><h1 class="screen-title">🤖 ${esc(t("tab.responder"))}</h1><p class="muted" style="text-align:center">${esc(t("soon.responder"))}</p></div>`;
  if (!S._resp) { S._resp = { loading: true, tab: "overview" }; loadResponder(); }
  const r = S._resp;
  if (r.loading) return backRow() + spinner();
  const tabs = [["overview", "الحالة"], ["channels", "القنوات"], ["rules", "القواعد"], ["inbox", "الوارد"]];
  return `
    ${backRow()}
    <h1 class="screen-title">🤖 المجيب الآلي</h1>
    <div class="chip-row" style="margin:10px 0 14px">
      ${tabs.map(([id, label]) => `<button class="chip ${r.tab === id ? "active" : ""}" onclick="setRespTab('${id}')">${label}</button>`).join("")}
    </div>
    ${{ overview: respOverview, channels: respChannels, rules: respRules, inbox: respInbox }[r.tab]()}
  `;
}

async function loadResponder() {
  const [st, ch, cn, ru, ib, sx] = await Promise.all([
    api("GET", "/responder/status"), api("GET", "/responder/channels"), api("GET", "/responder/connections"),
    api("GET", "/responder/rules"), api("GET", "/responder/inbox"), api("GET", "/responder/stats"),
  ]);
  const tab = (S._resp && S._resp.tab) || "overview";
  const keep = S._resp || {};
  S._resp = { loading: false, tab, notice: keep.notice, ruleDraft: keep.ruleDraft, posts: keep.posts, selectedPosts: keep.selectedPosts, postsError: keep.postsError, status: st.ok ? st.data : null, channels: ch.ok ? ch.data : [], connections: cn.ok ? cn.data : [], rules: ru.ok ? ru.data : [], inbox: ib.ok ? ib.data : [], stats: sx.ok ? sx.data : null };
  render();
}

function setRespTab(tab) { S._resp.tab = tab; S.error = null; render(); }

function respStatusBadge(st) {
  const map = { TRIAL: ["info", "تجربة مجانية"], ACTIVE: ["success", "فعّالة"], EXPIRED: ["danger", "منتهية"], OFF: ["neutral", "غير مفعّلة"] };
  const [cls, label] = map[st] || ["neutral", st];
  return `<span class="badge ${cls}">${label}</span>`;
}

function respOverview() {
  const st = S._resp.status;
  if (!st) return `<div class="error-banner">تعذّر تحميل الحالة</div>`;
  const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000));
  const endInfo = st.status === "TRIAL" ? `تنتهي التجربة بعد ${daysLeft(st.trialEndsAt)} يوم` : st.status === "ACTIVE" ? `الاشتراك ساري لحد ${String(st.periodEnd).slice(0, 10)}` : "";
  const firstVisit = !st.running && st.status !== "EXPIRED";
  const price = `${st.price} ${st.creditName}`;
  const welcome = firstVisit ? `
    <div class="card intro-card">
      <h2>${esc(t("intro.responder.title"))}</h2>
      <p>${esc(t("intro.responder.body"))}</p>
      <p><strong>${esc(st.trialAvailable ? t("intro.trial", { n: st.trialDays, price, days: st.periodDays }) : t("intro.noTrial", { price, days: st.periodDays }))}</strong></p>
      ${st.trialAvailable ? `<p class="muted">${esc(t("intro.afterContinue"))}</p>` : ""}
    </div>` : "";
  const sx = S._resp.stats;
  const stats = sx && st.running ? `<p class="muted" style="margin:4px 0 0">آخر 30 يوم: أُرسل ${sx.sent} · بانتظار ردّك ${sx.needsReview} · فشل ${sx.failed}</p>` : "";
  return `
    ${welcome}
    <div class="card">
      <div class="title-line"><strong>حالة الخدمة</strong>${respStatusBadge(st.status)}</div>
      ${stats}
      <p class="muted" style="margin-top:6px">${esc(endInfo)}</p>
      ${st.status === "EXPIRED" ? `<div class="error-banner">خلصت المدة — الردود الآلية موقوفة. ادفع لتكمل الخدمة.</div>` : ""}
      <p class="muted">رصيدك: <b>${st.balance}</b> ${esc(st.creditName)} · ردود AI هالفترة: ${st.aiRepliesUsed}/${st.aiReplyLimit}</p>
      ${errorBanner()}
      ${!st.running && st.trialAvailable ? `<button class="btn" onclick="respActivate()">${esc(t("intro.continue"))}</button>` : ""}
      ${!st.running && !st.trialAvailable ? `<button class="btn" onclick="respActivate()">فعّل مقابل ${st.price} ${esc(st.creditName)} / ${st.periodDays} يوم</button>` : ""}
      ${st.running && st.status === "ACTIVE" ? `<button class="btn outline" onclick="respRenew()">جدّد ${st.periodDays} يوم إضافي (${st.price} ${esc(st.creditName)})</button>` : ""}
      ${st.status === "TRIAL" ? `<button class="btn outline" onclick="respRenew()">اشترك من هلق (${st.price} ${esc(st.creditName)})</button>` : ""}
      <div style="height:8px"></div>
      <button class="btn secondary" onclick="go('wallet')">💰 اشحن رصيدك</button>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0">عن نشاطك (بيساعد الذكاء الاصطناعي يرد صح)</div>
      <div class="field"><label>وصف النشاط</label><input id="rp-desc" placeholder="مثال: مطعم مأكولات شرقية، دوام من 10 صباحًا حتى 11 مساءً" value="${esc(st.businessDescription || "")}" /></div>
      <div class="field"><label>نبرة الرد (رسمي، ودود...)</label><input id="rp-tone" placeholder="مثال: ودّي ومحترم" value="${esc(st.tone || "")}" /></div>
      <div class="field"><label>إذا ما انطبقت أي قاعدة</label>
        <select id="rp-fb" onchange="S._resp.status.fallbackMode = this.value; render()">
          <option value="OFF" ${st.fallbackMode === "OFF" ? "selected" : ""}>ما أرد (أتجاهل الرسالة)</option>
          <option value="AI" ${st.fallbackMode === "AI" ? "selected" : ""}>الذكاء الاصطناعي يجاوب من معلومات نشاطي</option>
          <option value="TEMPLATE" ${st.fallbackMode === "TEMPLATE" ? "selected" : ""}>نص ثابت</option>
        </select></div>
      ${st.fallbackMode === "TEMPLATE" ? `<div class="field"><label>نص الرد الاحتياطي ({name} = اسم الزبون)</label><textarea id="rp-fbtext" placeholder="مثال: شكرًا لتواصلك! بنرد عليك بأقرب وقت." rows="3">${esc(st.fallbackReply || "")}</textarea></div>` : ""}
      <button class="btn small" onclick="respSaveProfile()">حفظ</button>
    </div>`;
}

async function respActivate() {
  S.error = null;
  const { ok, data } = await api("POST", "/responder/activate");
  if (!ok) S.error = errMsg(data, "تعذّر التفعيل") + (data.needed ? ` (المطلوب ${data.needed}، رصيدك ${data.balance})` : "");
  S._resp = { loading: true, tab: "overview" }; render(); loadResponder();
}
async function respRenew() {
  S.error = null;
  const { ok, data } = await api("POST", "/responder/renew");
  if (!ok) S.error = errMsg(data, "تعذّر التجديد") + (data.needed ? ` (المطلوب ${data.needed}، رصيدك ${data.balance})` : "");
  S._resp = { loading: true, tab: "overview" }; render(); loadResponder();
}
async function respSaveProfile() {
  const body = { businessDescription: qs("rp-desc").value.trim(), tone: qs("rp-tone").value.trim(), fallbackMode: qs("rp-fb").value };
  if (qs("rp-fbtext")) body.fallbackReply = qs("rp-fbtext").value.trim();
  const { ok, data } = await api("PATCH", "/responder/profile", body);
  if (!ok) { S.error = errMsg(data, "تعذّر الحفظ"); return render(); }
  S.error = null;
  loadResponder();
}

function respChannels() {
  const r = S._resp;
  return `
    ${errorBanner()}
    ${r.notice ? `<div class="card">${esc(r.notice)}</div>` : ""}
    <div class="section-title" style="margin-top:0">القنوات المتاحة</div>
    ${r.channels.map((c) => `
      <div class="card">
        <div class="title-line"><strong>${esc(c.name)}</strong>${c.connectable ? "" : `<span class="badge neutral">قريبًا</span>`}</div>
        ${c.driver === "FACEBOOK" || c.driver === "INSTAGRAM" ? `
          <button class="btn" onclick="respMetaLink()">ربط بحساب فيسبوك (الأسهل)</button>
          <p class="muted">بتسجّل دخول بفيسبوك وبتختار صفحتك، ما في داعي لأي أرقام أو رموز.</p>
          <div class="muted" style="margin:8px 0">أو يدويًا:</div>` : ""}
        ${c.connectable ? `
          ${c.fields.map((f) => `<div class="field"><label>${esc(f.label)}</label><input id="cf-${c.id}-${f.key}" ${f.secret ? 'type="password"' : ""} autocomplete="off" /></div>`).join("")}
          <button class="btn small" onclick="respConnect('${c.id}', ${JSON.stringify(c.fields.map((f) => f.key)).replace(/"/g, "&quot;")})">ربط</button>`
        : `<p class="muted">الربط بحسابات ميتا بيحتاج موافقة منهم — لسا مو متاح.</p>`}
      </div>`).join("")}
    <div class="section-title">اتصالاتي</div>
    ${r.connections.length === 0 ? `<div class="empty-state">ما في قنوات مربوطة</div>` : r.connections.map((c) => `
      <div class="card">
        <div class="title-line"><strong>${esc(c.channel)}</strong><span class="badge ${c.isActive ? "success" : "neutral"}">${c.isActive ? "شغّالة" : "موقوفة"}</span></div>
        ${c.externalAccountId ? `<p class="muted">@${esc(c.externalAccountId)}</p>` : ""}
        ${c.hookUrl ? `<div class="field"><label>رابط استقبال الرسائل (الصقه بالمنصة)</label><input readonly value="${esc(c.hookUrl)}" onclick="this.select()" /></div>` : ""}
        <button class="btn small outline" onclick="respToggleConn('${c.id}', ${!c.isActive})">${c.isActive ? "إيقاف" : "تشغيل"}</button>
      </div>`).join("")}`;
}

/** Starts "Continue with Facebook" from the browser: no phone app can take the link over here, and the dialog comes back to /app/. */
async function respMetaLink() {
  S.error = null;
  const { ok, data } = await api("GET", "/responder/meta/oauth/start?platform=web");
  if (!ok) { S.error = errMsg(data, "تعذّر بدء الربط"); return render(); }
  location.href = data.url;
}

async function respConnect(channelId, keys) {
  const credentials = {};
  keys.forEach((k) => { const v = qs(`cf-${channelId}-${k}`).value.trim(); if (v) credentials[k] = v; });
  S.error = null;
  const { ok, data } = await api("POST", "/responder/connections", { channelId, credentials });
  if (!ok) { S.error = errMsg(data, "تعذّر الربط"); return render(); }
  loadResponder();
}
async function respToggleConn(id, isActive) {
  await api("PATCH", "/responder/connections/" + id, { isActive });
  loadResponder();
}

function respRules() {
  const r = S._resp;
  const d = r.ruleDraft || {};
  const socialConns = (r.connections || []).filter((c) => c.supportsPosts);
  const posts = r.posts || [];
  const picked = r.selectedPosts || [];
  return `
    ${errorBanner()}
    ${r.rules.map((x) => `
      <div class="card">
        <div class="title-line"><strong>${esc(x.name)}</strong><span class="badge ${x.mode === "AI" ? "info" : "neutral"}">${x.mode === "AI" ? "ذكاء اصطناعي" : "رد ثابت"}</span></div>
        <p class="muted">كلمات: ${x.keywords.map(esc).join("، ")}${x.postIds && x.postIds.length ? ` · 📌 محصورة بـ ${x.postIds.length} منشور` : ""}</p>
        ${x.replyTemplate ? `<p class="muted">الرد: ${esc(x.replyTemplate)}</p>` : ""}
        <div class="row" style="margin-top:8px;gap:6px">
          <button class="btn small outline" style="width:auto" onclick="respRuleToggle('${x.id}', ${!x.isActive})">${x.isActive ? "إيقاف" : "تشغيل"}</button>
          <button class="btn small danger" style="width:auto" onclick="respRuleDelete('${x.id}')">حذف</button>
        </div>
      </div>`).join("")}
    <div class="card">
      <div class="section-title" style="margin-top:0">قاعدة جديدة</div>
      <div class="field"><label>اسم القاعدة</label><input id="ru-name" placeholder="مثال: سؤال عن السعر" value="${esc(d.name || "")}" /></div>
      <div class="field"><label>كلمات مفتاحية (مفصولة بفاصلة)</label><input id="ru-keys" placeholder="سعر، كم، price" value="${esc(d.keys || "")}" /></div>
      <div class="field"><label>نوع الرد</label>
        <select id="ru-mode"><option value="FIXED" ${d.mode !== "AI" ? "selected" : ""}>رد ثابت</option><option value="AI" ${d.mode === "AI" ? "selected" : ""}>ذكاء اصطناعي</option></select></div>
      <div class="field"><label>نص الرد (استخدم {name} لاسم الزبون)</label><input id="ru-reply" placeholder="مثال: أهلًا {name}، سعر المنتج 25" value="${esc(d.reply || "")}" /></div>
      <div class="field"><label>تعليمات للذكاء الاصطناعي (اختياري)</label><input id="ru-ai" placeholder="مثال: جاوب عن المواعيد والأسعار باختصار" value="${esc(d.ai || "")}" /></div>
      <div class="field"><label>القناة</label>
        <select id="ru-channel"><option value="">كل القنوات</option>${r.channels.filter((c) => c.connectable).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
      ${socialConns.length ? `
      <div class="field"><label>منشورات محددة (فيسبوك / إنستغرام) — اتركها فاضية لتنطبق على كل شي</label>
        <select id="ru-conn">${socialConns.map((c) => `<option value="${c.id}" ${d.conn === c.id ? "selected" : ""}>${esc(c.channel)}${c.externalAccountId ? " — " + esc(c.externalAccountId) : ""}</option>`).join("")}</select>
        <button class="btn small outline" style="width:auto;margin-top:6px" onclick="respLoadPosts()">تحميل منشوراتي</button>
        ${r.postsError ? `<p class="muted" style="color:#b71c1c">${esc(r.postsError)}</p>` : ""}
        ${posts.map((p) => `
          <label class="row" style="gap:8px;align-items:flex-start;margin-top:8px;font-size:13px">
            <input type="checkbox" style="width:auto" ${picked.includes(p.id) ? "checked" : ""} onchange="respTogglePost('${esc(p.id)}')" />
            <span>${esc((p.text || "").slice(0, 90))}<br><span class="muted">${String(p.createdAt || "").slice(0, 10)}</span></span>
          </label>`).join("")}
        ${picked.length ? `<p class="muted">📌 ${picked.length} منشور محدد — القاعدة بتردّ على التعليقات عليهم بس.</p>` : ""}
      </div>` : ""}
      <p class="muted" style="margin-bottom:8px">الشكاوى ما بتنرد آليًا أبدًا — بتنتظر ردك بصندوق الوارد.</p>
      <button class="btn" onclick="respAddRule()">إضافة القاعدة</button>
    </div>`;
}

async function respAddRule() {
  const keywords = qs("ru-keys").value.split(/[,،]/).map((k) => k.trim()).filter(Boolean);
  const body = { name: qs("ru-name").value.trim(), keywords, mode: qs("ru-mode").value, replyTemplate: qs("ru-reply").value.trim(), aiInstructions: qs("ru-ai").value.trim(), channelId: qs("ru-channel").value || null, postIds: S._resp.selectedPosts || [] };
  if (!body.name || keywords.length === 0) { S.error = "اكتب اسم القاعدة وكلمة مفتاحية وحدة عالأقل"; return render(); }
  S.error = null;
  const { ok, data } = await api("POST", "/responder/rules", body);
  if (!ok) { S.error = errMsg(data, "تعذّر الحفظ"); return render(); }
  S._resp.ruleDraft = null; S._resp.posts = []; S._resp.selectedPosts = [];
  loadResponder();
}

// The rule form is rebuilt on every render, so its fields are snapshotted into state first.
function snapshotRuleDraft() {
  const d = {};
  [["name", "ru-name"], ["keys", "ru-keys"], ["mode", "ru-mode"], ["reply", "ru-reply"], ["ai", "ru-ai"], ["conn", "ru-conn"]].forEach(([k, id]) => { const el = qs(id); if (el) d[k] = el.value; });
  S._resp.ruleDraft = d;
}
async function respLoadPosts() {
  snapshotRuleDraft();
  const connId = qs("ru-conn") && qs("ru-conn").value;
  if (!connId) return;
  S._resp.postsError = null; S._resp.posts = []; S._resp.selectedPosts = [];
  const { ok, data } = await api("GET", "/responder/connections/" + connId + "/posts");
  if (ok) S._resp.posts = data; else S._resp.postsError = errMsg(data, "تعذّر جلب المنشورات");
  render();
}
function respTogglePost(id) {
  const cur = S._resp.selectedPosts || [];
  S._resp.selectedPosts = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  snapshotRuleDraft();
  render();
}
async function respRuleToggle(id, isActive) { await api("PATCH", "/responder/rules/" + id, { isActive }); loadResponder(); }
async function respRuleDelete(id) { await api("DELETE", "/responder/rules/" + id); loadResponder(); }

function respInbox() {
  const r = S._resp;
  const label = { SENT: ["success", "انرد"], NEEDS_REVIEW: ["warning", "بانتظار ردك"], FAILED: ["danger", "فشل الإرسال"], SKIPPED: ["neutral", "تجاهلناها"] };
  const reason = { complaint: "شكوى", ai_unavailable: "الذكاء الاصطناعي غير متاح", empty_template: "نص الرد فاضي", no_matching_rule: "ما في قاعدة مطابقة", subscription_inactive: "الاشتراك منتهي" };
  return `
    ${errorBanner()}
    ${r.inbox.length === 0 ? `<div class="empty-state">ما وصل رسائل بعد</div>` : r.inbox.map((i) => {
      const [cls, text] = label[i.status];
      return `<div class="card">
        <div class="title-line"><strong>${esc(i.authorName)}</strong><span class="badge ${cls}">${text}</span></div>
        <p class="muted">${esc(i.channel)} · ${String(i.createdAt).slice(0, 16).replace("T", " ")}${i.reason ? " · " + esc(reason[i.reason] || i.reason) : ""}</p>
        <p>${esc(i.message)}</p>
        ${i.reply ? `<p style="color:var(--primary)">↩ ${esc(i.reply)}</p>` : ""}
        ${i.status === "NEEDS_REVIEW" || i.status === "FAILED" ? `
          <div class="field" style="margin-top:8px"><input id="ib-${i.id}" placeholder="اكتب ردك..." /></div>
          <button class="btn small" onclick="respSendInbox('${i.id}')">إرسال</button>` : ""}
      </div>`;
    }).join("")}`;
}

async function respSendInbox(id) {
  const reply = qs("ib-" + id).value.trim();
  if (!reply) return;
  const { ok, data } = await api("POST", `/responder/inbox/${id}/send`, { reply });
  if (!ok) { S.error = errMsg(data, "تعذّر الإرسال"); return render(); }
  S.error = null;
  loadResponder();
}

/* ---------------- boot ---------------- */

function qs(id) { return document.getElementById(id); }

function wireUpAfterRender() {
  if (S.screen === "home" && S.homeTab === "card" && S._card && S._card.memberNumber) {
    renderQrOnly();
  }
  if (S.screen === "home" && (S.homeTab === "discover" || S.homeTab === "deals") && S._discover) {
    renderDiscoverMap();
  }
  if (S.screen === "merchantRegister" || S.screen === "merchantProfile" || S.screen === "merchantBranches") renderPicker();
  if (S.screen === "store" && S._store && S._store.slides && S._store.slides.length > 1) { if (!S._sliderTimer) storeSliderRestart(); }
  else if (S._sliderTimer) { clearInterval(S._sliderTimer); S._sliderTimer = null; }
}

// A merchant's affiliate shares a link like "...?product=ID&ref=CODE" — opening it tracks the
// referral (if signed in) and drops the visitor straight onto that product.
async function bootReferralCapture() {
  const params = new URLSearchParams(location.search);
  const productId = params.get("product");
  const code = params.get("ref");
  if (!productId || !code || !S.token) return false;
  await api("POST", "/affiliates/click", { productId, code });
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  S.stack = [];
  S.screen = "home";
  S.params = {};
  go("productDetail", { productId });
  return true;
}

// A shared place link ("...?merchant=ID") opens that place's page directly — works for guests too.
function bootMerchantLink() {
  const id = new URLSearchParams(location.search).get("merchant");
  if (!id) return false;
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  S.stack = [];
  S.screen = "home";
  S.homeTab = "discover";
  S.params = {};
  go("merchantDetail", { merchantId: id });
  return true;
}

/** Back from the Facebook dialog (started by respMetaLink): show the result on the channels tab. */
function bootMetaReturn() {
  const q = new URLSearchParams(location.search);
  if (q.get("meta") !== "1") return false;
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  if (!S.token) return false;
  S.stack = [];
  S.params = {};
  S._resp = { loading: true, tab: "channels", notice: q.get("ok") === "1" ? "تم ربط الصفحة ✅" : null };
  if (q.get("ok") !== "1") S.error = "تعذّر ربط الصفحة. جرّب من جديد.";
  go("responder");
  loadResponder(); // go() only loads when there is no state yet, and this state is already marked as loading
  return true;
}

loadMarket();
captureJoin();
loadSocialLinks();
loadAppDownloadLink();

bootSocialReturn().then((social) => {
  if (social) return;
  if (bootMetaReturn()) return;
  bootReferralCapture().then((handled) => {
    if (!handled && !bootMerchantLink()) render();
  });
});

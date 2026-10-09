// Same-origin — this page is served by the API itself (public/app/), so no CORS/base-URL needed.
const API_BASE = "";

initLanguage(); // language files are loaded by now (index.html order)

// A phone/keyboard set to Arabic or Persian types its own digit shapes, which parseInt/parseFloat reject.
// Every number typed into a form goes through latinDigits() first. (Built from char codes so no Arabic text sits in the code.)
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
  const fieldError = Object.values((data.error.details && data.error.details.fieldErrors) || {}).flat()[0];
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
    if (!S.token) return go("login");
    S._resp = null;
    return go("responder");
  }
  // the store is a whole screen of its own: guests may browse it too
  if (tab === "store") return openStore();
  if (tab !== "card") stopQrLoop();
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

async function render() {
  const el = root();
  if (!el) return;
  el.classList.toggle("map-mode", S.screen === "home" && S.homeTab === "discover");
  document.body.classList.toggle("navigating", !!(S._route && S._route.phase === "navigating"));
  const active = document.activeElement;
  const keepFocus = active && active.id === "disc-q" ? active.selectionStart : null;
  el.innerHTML = renderScreen();
  wireUpAfterRender();
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
    case "productEdit": return screenProductEdit();
    case "affiliateMine": return screenAffiliateMine();
    case "wallet": return screenWallet();
    case "responder": return screenResponder();
    case "favorites": return screenFavorites();
    case "store": return screenStore();
    case "productWizard": return screenProductWizard();
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
  if (!p.google && !p.facebook) return "";
  const link = (provider, key) => `<a class="btn outline social-btn" href="/auth/social/${provider}/start?platform=web&lang=${encodeURIComponent(LANG)}">${esc(t(key))}</a>`;
  return `<div class="social-or">${esc(t("social.or"))}</div>${p.google ? link("google", "social.google") : ""}${p.facebook ? link("facebook", "social.facebook") : ""}`;
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
    <img class="auth-logo" src="/brand/logo.png" alt="DALILACOM" />
    <h1 class="screen-title">أكمل تسجيلك</h1>
    <p class="screen-sub">${S.params.name ? esc(S.params.name) + "، " : ""}فيسبوك ما شاركنا إيميلك. اكتب إيميلك ورح نبعتلك رابط لتأكيده.</p>
    <div class="field"><label>الإيميل</label><input id="se-email" type="email" dir="ltr" autocomplete="email" /></div>
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
    <img class="auth-logo" src="/brand/logo.png" alt="DALILACOM" />
    <h1 class="screen-title">نسيت كلمة السر</h1>
    <p class="screen-sub">اكتب إيميل حسابك ورح نبعتلك رابط لتعيين كلمة سر جديدة.</p>
    ${done ? `<div class="card">${esc(done)}</div>` : `
      <div class="field"><label>الإيميل</label><input id="f-email" type="email" dir="ltr" autocomplete="email" value="${esc(S.params.email || "")}" /></div>
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
    <img class="auth-logo" src="/brand/logo.png" alt="DALILACOM" />
    <h1 class="screen-title">تسجيل الدخول</h1>
    <p class="screen-sub">أهلًا فيك بدليلكم — دخّل بياناتك</p>
    <div class="field"><label>الإيميل</label><input id="f-email" type="email" placeholder="name@example.com" value="${esc(draft.email || "")}" /></div>
    <div class="field"><label>كلمة السر</label><input id="f-password" type="password" placeholder="••••••••" value="${esc(draft.password || "")}" /></div>
    ${errorBanner()}
    <button class="btn" onclick="doLogin()">دخول</button>
    ${socialButtonsHtml()}
    <button class="link-btn" onclick="go('forgot')">نسيت كلمة السر؟</button>
    <button class="link-btn" onclick="reset('register')">ما عندك حساب؟ سجل واحد جديد</button>
  `;
}

async function doLogin() {
  const email = qs("f-email").value.trim();
  const password = qs("f-password").value;
  S.params.draft = { email, password };
  if (!email || !password) { S.error = "دخّل الإيميل وكلمة السر"; return render(); }
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/auth/login", { email, password });
  S.busy = false;
  if (ok) {
    setToken(data.token, data.user.role);
    reset("home");
  } else {
    S.error = "بيانات الدخول غير صحيحة";
    render();
  }
}

function screenRegister() {
  const intent = S.params.intent || "CUSTOMER";
  const draft = S.params.draft || {};
  if (!S._regGeo) { S._regGeo = { countries: [], regions: [], cities: [], loading: true }; loadRegGeo(); }
  const g = S._regGeo;
  const countryOpts = g.countries.map((c) => `<option value="${esc(c.isoCode2)}" ${draft.country === c.isoCode2 ? "selected" : ""}>${esc(c.nameArabic || c.name)}</option>`).join("");
  const regionOpts = g.regions.map((c) => `<option value="${esc(c.id)}" ${draft.region === c.id ? "selected" : ""}>${esc(c.nameArabic || c.name)}</option>`).join("");
  const cityOpts = g.cities.map((c) => `<option value="${esc(c.id)}" ${draft.city === c.id ? "selected" : ""}>${esc(c.nameArabic || c.name)}</option>`).join("");
  const cityHint = g.regions.length && !draft.region ? "— اختر المحافظة أول —" : g.cities.length ? "— اختر المدينة —" : "— اختر الدولة أول —";
  return `
    <button class="back-btn" onclick="backToMap()">‹ رجوع للخريطة</button>
    <h1 class="screen-title">إنشاء حساب جديد</h1>
    <p class="screen-sub">بدك تسجّل كـ:</p>
    <div class="chip-row">
      <button class="chip ${intent === "CUSTOMER" ? "active" : ""}" onclick="setRegisterIntent('CUSTOMER')">زائر</button>
      <button class="chip ${intent === "MERCHANT" ? "active" : ""}" onclick="setRegisterIntent('MERCHANT')">تاجر</button>
    </div>
    ${intent === "MERCHANT" ? `<p class="muted" style="color:var(--primary);margin-bottom:12px">رح نطلب منك بيانات محلك بعد إنشاء الحساب</p>` : ""}
    <div class="field"><label>الاسم الكامل</label><input id="f-name" placeholder="اسمك" value="${esc(draft.name || "")}" /></div>
    <div class="field"><label>الإيميل</label><input id="f-email" type="email" placeholder="name@example.com" value="${esc(draft.email || "")}" /></div>
    <div class="field"><label>كلمة السر (8 أحرف على الأقل)</label><input id="f-password" type="password" placeholder="••••••••" value="${esc(draft.password || "")}" /></div>
    <div class="field"><label>الدولة</label><select id="f-country" onchange="regPickCountry()"><option value="">— اختر الدولة —</option>${countryOpts}</select></div>
    ${g.regions.length ? `<div class="field"><label>المحافظة</label><select id="f-region" onchange="regPickRegion()"><option value="">— اختر المحافظة —</option>${regionOpts}</select></div>` : ""}
    <div class="field"><label>المدينة</label><select id="f-city" ${g.cities.length ? "" : "disabled"}><option value="">${cityHint}</option>${cityOpts}</select></div>
    ${errorBanner()}
    <button class="btn" onclick="doRegister()">إنشاء الحساب</button>
    ${socialButtonsHtml()}
    <button class="link-btn" onclick="reset('login')">عندك حساب أصلًا؟ سجل دخول</button>
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
  if (!fullName || !email || password.length < 8) { S.error = "عبّي كل الحقول (كلمة السر 8 أحرف ع الأقل)"; return render(); }
  S.busy = true; S.error = null; render();
  const body = { email, password, fullName };
  const d = S.params.draft || {};
  if (d.country) body.countryCode = d.country;
  if (d.city) body.cityId = d.city;
  const { ok, data } = await api("POST", "/auth/register", body);
  S.busy = false;
  if (ok) {
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
  S.homeTab = "discover";
  reset("home");
}

/* ================= HOME SHELL ================= */

const HOME_TABS = [
  { id: "discover", label: "tab.map", icon: "search" },
  { id: "store", label: "tab.store", icon: "store" },
  { id: "card", label: "tab.card", icon: "card" },
  { id: "responder", label: "tab.responder", icon: "bot", hero: true },
  { id: "cart", label: "tab.cart", icon: "cart" },
  { id: "orders", label: "tab.orders", icon: "orders" },
  { id: "profile", label: "tab.account", icon: "user" },
];

function screenHomeShell() {
  const needsAccount = ["card", "cart", "orders", "profile"].includes(S.homeTab) && !S.token;
  const body = needsAccount ? guestPrompt(S.homeTab) : {
    card: tabCard,
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
    <div class="otp-code">${(c.code || "------").split("").join(" ")}</div>
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

function renderQrOnly() {
  const codeEl = document.querySelector(".otp-code");
  if (codeEl) codeEl.textContent = (S._card.code || "------").split("").join(" ");
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
  if (st.isOpen) return `<span class="badge success">${esc(t("hours.openUntil", { time: fmtClock(st.closesAt) }))}</span>`;
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
  return { peek: 232, half: Math.round(H * 0.55), full: Math.max(320, H - 150) };
}

function tabDiscover() {
  const d = discoverState();
  if (!d.locAsked) { d.locAsked = true; requestDiscoverLocation(); } // ask for the position as soon as the map opens
  const list = visibleMerchants(d);
  if (d.selectedId) list.sort((x, y) => (y.id === d.selectedId) - (x.id === d.selectedId));
  S._visible = list;
  const sheetPx = sheetHeights()[S._sheet || "peek"];
  return `
    <div class="mapfull ${S._route ? "routing" : ""} ${S._route && S._route.phase === "navigating" ? "navigating" : ""}" id="mapfull" style="--sheet-h:${sheetPx}px">
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
          <button class="chip ${!d.categoryId && !d.openNow && !d.discountsOnly ? "active" : ""}" onclick="onDiscoverReset()">${esc(t("filter.all"))}</button>
          <button class="chip ${d.openNow ? "active" : ""}" onclick="toggleDiscoverFlag('openNow')">${esc(t("filter.openNow"))}</button>
          <button class="chip ${d.discountsOnly ? "active" : ""}" onclick="toggleDiscoverFlag('discountsOnly')">${esc(t("filter.discounts"))}</button>
          ${categoryChipsHtml(d)}
        </div>
        ${d.locError ? `<div class="float-note">📍 ${esc(d.locError)}</div>` : ""}
      </div>

      <button id="area-btn" class="area-btn" style="display:${d.areaDirty ? "block" : "none"}" onclick="searchThisArea()">${esc(t("area.search"))}</button>
      <button class="map-fab" title="${esc(t("fab.myLocation"))}" onclick="requestDiscoverLocation(true)">📍</button>
      <button class="map-fab theme-fab" title="${esc(currentTheme() === "dark" ? t("fab.lightMode") : t("fab.darkMode"))}" onclick="toggleTheme()">${currentTheme() === "dark" ? "☀️" : "🌙"}</button>
      <button class="map-fab lang-fab" title="${esc(t("fab.language"))}" onclick="toggleLangMenu()">🌐</button>
      ${langMenuHtml()}

      ${navBottomHtml()}
      <div class="sheet" id="sheet">
        <div class="sheet-handle" onpointerdown="sheetDragStart(event)" onclick="sheetToggle()"><span></span></div>
        <div class="sheet-head">
          <strong>${esc(d.userLoc ? t("sheet.nearby") : t("sheet.directory"))}</strong>
          <span class="badge info">${esc(t("sheet.count", { n: list.length }))}</span>
        </div>
        ${(d.userLoc || d.bounds) ? `<div class="sheet-chips">
          ${d.bounds ? `<button class="chip active" onclick="clearSearchArea()">${esc(t("area.clear"))}</button>` : ""}
          ${d.userLoc ? [null, 2, 5, 10, 25].map((r) => `<button class="chip ${d.radiusKm === r ? "active" : ""}" onclick="setDiscoverRadius(${r})">${esc(r ? t("radius.km", { n: r }) : t("radius.any"))}</button>`).join("") : ""}
        </div>` : ""}
        <div class="sheet-list">
          ${d.loading ? spinner() : (list.length ? list.map(merchantRowHtml).join("") : `<div class="empty-state">${esc(d.radiusKm ? t("sheet.emptyRadius", { n: d.radiusKm }) : t("sheet.empty"))}</div>`)}
        </div>
      </div>
      ${browseHtml(d)}
    </div>
  `;
}

// The sheet follows the finger and snaps to peek / half / full.
function sheetDragStart(e) {
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
    box.style.setProperty("--sheet-h", Math.min(heights.full, Math.max(120, startH - dy)) + "px");
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    sheet.classList.remove("dragging");
    if (!moved) return;
    const h = parseFloat(box.style.getPropertyValue("--sheet-h"));
    S._sheet = Object.entries(heights).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
    box.style.setProperty("--sheet-h", heights[S._sheet] + "px");
    S._sheetMoved = true;
    setTimeout(() => { S._sheetMoved = false; }, 60);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function sheetToggle() {
  if (S._sheetMoved) return;
  const order = ["peek", "half", "full"];
  S._sheet = order[(order.indexOf(S._sheet || "peek") + 1) % 3];
  const box = document.getElementById("mapfull");
  if (box) box.style.setProperty("--sheet-h", sheetHeights()[S._sheet] + "px");
}

// Tapping a pin brings that place to the top of the sheet.
function selectMerchant(id) {
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
function onDiscoverReset() { Object.assign(S._discover, { categoryId: "", openNow: false, discountsOnly: false }); searchMerchants(); }
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
    () => {
      d.locError = t("loc.denied");
      render();
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
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
    S._userLayer = L.layerGroup().addTo(map);
    map.on("moveend", () => {
      if (Date.now() < (S._ignoreMoveUntil || 0)) return;
      if (S._discover) S._discover.areaDirty = true;
      const btn = document.getElementById("area-btn");
      if (btn) btn.style.display = "block";
    });
    S._map = map;
    S._mapKey = "";
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
      const size = selected ? 36 : 28;
      const bg = selected ? "#111" : hasDiscount ? "#ba2a34" : "#8a7a78";
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${bg};color:#fff;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.4);border:2px solid #fff"><span style="transform:rotate(45deg);font-size:${selected ? 16 : 13}px">${hasDiscount ? "🏷️" : "📍"}</span></div>`,
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
          <div style="min-width:0"><strong>${esc(m.businessName)}</strong><p class="muted" style="margin:0">${esc(catName(m.category))}${m.address ? " · " + esc(m.address) : ""}</p></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${m.distanceKm != null ? `<span class="badge neutral">${m.distanceKm < 1 ? Math.round(m.distanceKm * 1000) + " " + esc(t("unit.m")) : m.distanceKm.toFixed(1) + " " + esc(t("unit.km"))}</span>` : ""}
          <button class="heart ${saved ? "on" : ""}" title="${esc(t("card.save"))}" onclick="event.stopPropagation();toggleFav('${m.id}')">${saved ? "♥" : "♡"}</button>
        </div>
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${openBadge(m.openStatus)}
        ${(m.discounts || []).map((dc) => `<span class="badge info">🏷️ ${esc(dc.title)} — ${dc.percent}%</span>`).join("")}
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
      ${tab === "profile" ? `<div style="height:10px"></div><button class="btn secondary" onclick="openStore()">${esc(t("profile.store"))}</button>` : ""}
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
      <div class="divider"></div>
      <div class="title-line"><strong>الإجمالي</strong><span class="price" style="color:var(--primary)">${fmt(c.totalCents)}</span></div>
      <div style="height:10px"></div>
      <button class="btn" onclick="doCheckout()">إتمام الطلب</button>
    ` : ""}
    ${errorBanner()}
  `;
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
  S._cart = { loading: false, items: ok ? data.items : [], totalCents: ok ? data.totalCents : 0 };
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
  S.busy = true; render();
  const { ok, data } = await api("POST", "/cart/checkout");
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
        ? `<button class="btn" style="max-width:240px" onclick="go('merchantMode')">${esc(t("profile.merchantMode"))}</button>`
        : `<button class="btn outline" style="max-width:240px" onclick="go('merchantRegister')">${esc(t("profile.registerMerchant"))}</button>`}
      <div style="height:10px"></div>
      <label class="switch-row"><input type="checkbox" ${shareLocationOn() ? "checked" : ""} onchange="setShareLocation(this.checked)" /><span>${esc(t("profile.shareLocation"))}</span></label>
      <p class="muted" style="margin:0 0 10px">${esc(t("profile.shareLocationSub"))}</p>
      <button class="btn outline" style="max-width:240px" onclick="S._acct=null;go('account')">${esc(t("profile.account"))}</button>
      <div style="height:10px"></div>
      <button class="btn" style="max-width:240px" onclick="openStore()">${esc(t("profile.store"))}</button>
      ${S.role === "MERCHANT" ? `<div style="height:10px"></div><button class="btn outline" style="max-width:240px" onclick="S._myAds=null;go('myAds')">${esc(t("profile.myAds"))}</button>` : ""}
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('affiliateMine')">${esc(t("profile.affiliates"))}</button>
      <div style="height:10px"></div>
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('wallet')">${esc(t("profile.wallet"))}</button>
      <div style="height:14px"></div>
      <button class="btn secondary" style="max-width:240px" onclick="doLogout()">${esc(t("profile.logout"))}</button>
      <div style="height:10px"></div>
      <button class="link-btn" style="color:var(--danger, #b71c1c)" onclick="deleteMyAccount()">${esc(t("profile.deleteAccount"))}</button>
    </div>
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
    <p class="screen-sub">التجار اللي إنت مسوّق عندهم، وعمولاتك من كل واحد</p>
    ${list.length === 0 ? `<div class="empty-state">لسا ما انضممت كمسوّق لأي تاجر — التاجر هو اللي بضيفك لفريقه</div>` : list.map((x) => `
      <div class="card">
        <div class="title-line"><strong>${esc(x.merchant.businessName)}</strong><span class="badge ${x.isActive ? "success" : "neutral"}">${x.isActive ? "نشط" : "غير نشط"}</span></div>
        <p class="muted">عمولتك: ${x.commissionType === "PERCENT" ? x.commissionValue + "% من كل عملية" : fmt(x.commissionValue) + " لكل عملية"}</p>
        <p class="muted">زبائن أحلتهم: ${x.referredCount} — إجمالي عمولاتك: <strong style="color:var(--primary)">${fmt(x.totalCommissionCents)}</strong></p>
        ${x.sampleLink
          ? `<div class="field"><label>رابط الإحالة (انسخه وشاركه)</label><input readonly value="${esc(x.sampleLink)}" onclick="this.select()" /></div>`
          : `<p class="muted">كودك: <strong>${esc(x.referralCode)}</strong> — ما عند هالتاجر منتجات بعد لتولّد رابط</p>`}
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
  const rated = products.filter((p) => p.ratingCount > 0);
  const votes = rated.reduce((n, p) => n + p.ratingCount, 0);
  const avg = votes ? rated.reduce((n, p) => n + p.rating * p.ratingCount, 0) / votes : 0;
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
  if (m.tab === "about") {
    body = `
      <section class="store-sec">
        ${x.bio ? `<p class="place-bio" style="margin-top:0">${esc(x.bio)}</p>` : ""}
        ${x.address ? `<div class="place-row">📍 ${esc(x.address)}</div>` : ""}
        ${phone ? `<div class="place-row">📞 <a href="tel:${esc(phone)}">${esc(phone)}</a></div>` : ""}
        ${(x.discounts || []).length ? `<div class="section-title">${esc(t("place.discounts"))}</div>${x.discounts.map((d) => `<div class="badge info" style="margin-bottom:6px">🏷️ ${esc(d.title)} — ${d.percent}%</div>`).join("")}` : ""}
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
              ${avg ? `<span><b class="star">★ ${avg.toFixed(1)}</b> (${votes})</span>` : ""}
              <span><b>${products.length}</b> ${esc(t("shop.products"))}</span>
              ${sold ? `<span><b>${storeCount(sold)}</b> ${esc(t("shop.sold"))}</span>` : ""}
              ${openBadge(x.openStatus)}
            </div>
          </div>
          <button class="shop-follow ${saved ? "on" : ""}" onclick="toggleFav('${x.id}')">${saved ? "✓ " + esc(t("place.saved")) : "+ " + esc(t("shop.follow"))}</button>
        </div>
      </div>
      <div class="shop-actions">
        ${phone ? `<a href="tel:${esc(phone)}"><span>📞</span>${esc(t("place.call"))}</a>` : ""}
        ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener"><span>💬</span>${esc(t("place.whatsapp"))}</a>` : ""}
        ${hasCoords ? `<button onclick="startRoute('${x.id}')"><span>🧭</span>${esc(t("place.directions"))}</button>` : ""}
        <button onclick="shareMerchant()"><span>📤</span>${esc(t("place.share"))}</button>
      </div>
      <div class="store-tabs">
        ${[["home", t("shop.tabHome")], ["all", t("shop.tabAll")], ["about", t("shop.tabAbout")]].map(([id, label]) => `<button class="${m.tab === id ? "on" : ""}" onclick="S._merchantDetail.tab='${id}';render()">${esc(label)}</button>`).join("")}
      </div>
      ${body}
    </div>`;
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
    ${DAY_ORDER.map((day) => {
      const x = h.days[day];
      return `<div class="card">
        <label class="row" style="gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" style="width:auto" ${x.on ? "checked" : ""} onchange="hoursSet('${day}','on',this.checked)" />
          <strong>${DAY_LABEL[day]}</strong>${x.on ? "" : `<span class="muted">مغلق</span>`}
        </label>
        ${x.on ? `<div class="row" style="gap:8px;margin-top:8px">
          <div class="field" style="flex:1;margin:0"><label>من</label><input type="time" value="${x.open}" onchange="hoursSet('${day}','open',this.value)" /></div>
          <div class="field" style="flex:1;margin:0"><label>إلى</label><input type="time" value="${x.close}" onchange="hoursSet('${day}','close',this.value)" /></div>
        </div>` : ""}
      </div>`;
    }).join("")}
    <button class="btn outline" onclick="hoursCopyToAll()">نسخ أول يوم مفتوح لكل الأيام</button>
    <div style="height:10px"></div>
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
  const [mRes, pRes] = await Promise.all([api("GET", "/merchant/" + id), api("GET", "/store/products?limit=60&merchantId=" + id)]);
  const merchant = mRes.ok ? mRes.data : null;
  const loc = S._discover && S._discover.userLoc;
  // /merchant/:id doesn't compute distance; derive it from the location the map view already asked for.
  if (merchant && loc && merchant.latitude != null && merchant.longitude != null) {
    merchant.distanceKm = haversineKm(loc.lat, loc.lng, merchant.latitude, merchant.longitude);
  }
  S._merchantDetail = { id, loading: false, merchant, products: pRes.ok ? pRes.data.items : [], tab: "home", q: "", sort: "popular" };
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
    if (c && S._store === st) { st.countryName = LANG === "ar" ? c.nameArabic || c.name : c.nameEnglish || c.name; render(); }
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

/** Search the store with a photo: the shopper takes or picks one, the server says what it shows and finds the matching products. */
async function storePhotoSearch(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  const st = S._store;
  st.byPhoto = { title: "", preview: null };
  st.items = []; st.total = 0; st.busy = true;
  render();
  try {
    const blob = await downscaleImage(file, 900);
    st.byPhoto.preview = URL.createObjectURL(blob);
    const { ok, data } = await postImage("/store/search-by-image", blob);
    st.busy = false;
    if (ok) { st.byPhoto.title = data.title; st.items = data.items; st.total = data.items.length; if (data.currency) S.currency = data.currency; }
    else { st.byPhoto = null; S.error = errMsg(data, t("photo.failed")); }
  } catch (e) {
    st.busy = false; st.byPhoto = null; S.error = t("photo.failed");
  }
  render();
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

function storeSlider(st, home) {
  const list = st.banners && st.banners.list ? st.banners.list : [];
  if (!list.length) {
    return `<button class="store-banner" onclick="storeSeeAll('deals')">
      <h1>${esc(t("store.heroBig"))}</h1>
      <p>${esc(t("store.heroUpTo", { n: Math.max(0, ...home.deals.map(storeOff)) }))}</p>
      <span class="btn-pill">${esc(t("store.shopNow"))}</span>
      <i>🛍️</i>
    </button>`;
  }
  const idx = Math.min(st.banners.idx || 0, list.length - 1);
  return `
    <div class="store-slider" id="store-slider">
      ${list.map((b, i) => `
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

/** Moves to another banner without redrawing the page (so a tap in progress, or a scroll, is not disturbed). */
function storeBannerShow(i) {
  const st = S._store;
  if (!st || !st.banners) return;
  const n = st.banners.list.length;
  st.banners.idx = ((i % n) + n) % n;
  document.querySelectorAll("#store-slider .store-slide").forEach((el, k) => el.classList.toggle("on", k === st.banners.idx));
  document.querySelectorAll("#store-slider .store-dots i").forEach((el, k) => el.classList.toggle("on", k === st.banners.idx));
  storeSliderRestart();
}

function storeBannerStep(d) { storeBannerShow((S._store.banners.idx || 0) + d); }

/** The banners change by themselves, as often as the admin set; the timer lives only while the store is on screen. */
function storeSliderRestart() {
  if (S._sliderTimer) { clearInterval(S._sliderTimer); S._sliderTimer = null; }
  const st = S._store;
  if (S.screen !== "store" || !st || !st.banners || st.banners.list.length < 2) return;
  S._sliderTimer = setInterval(() => {
    if (S.screen !== "store" || !S._store || !document.getElementById("store-slider")) { clearInterval(S._sliderTimer); S._sliderTimer = null; return; }
    const b = S._store.banners;
    b.idx = ((b.idx || 0) + 1) % b.list.length;
    document.querySelectorAll("#store-slider .store-slide").forEach((el, k) => el.classList.toggle("on", k === b.idx));
    document.querySelectorAll("#store-slider .store-dots i").forEach((el, k) => el.classList.toggle("on", k === b.idx));
  }, Math.max(2, Number(st.banners.seconds) || 5) * 1000);
}

function storeBannerGo(i) {
  const b = S._store.banners.list[i];
  if (!b) return;
  api("POST", "/store/banners/" + b.id + "/click");
  const { type, value } = b.target || {};
  if (type === "product" && value) go("productDetail", { productId: value });
  else if (type === "section" && value) storePickSection(value);
  else if (type === "shop" && value) go("merchantDetail", { merchantId: value });
  else if (type === "deals") storeSeeAll("deals");
  else if (type === "url" && /^https:\/\//.test(value || "")) window.open(value, "_blank", "noopener");
}

/* ---------------- the advertising spaces beside the banner ---------------- */

/** One space: a shop's paid product (marked as an ad) or, while nobody rented it, a best seller with an invitation to advertise. */
function storeSlot(sl) {
  const p = sl.product;
  const off = storeOff(p);
  return `
    <div class="store-slot ${sl.ad ? "is-ad" : ""}" role="button" tabindex="0" onclick="storeSlotOpen('${sl.adId || ""}','${p.id}')">
      ${storePic(p)}
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

function openAdBooking() {
  if (!S.token) return go("login");
  S._adBook = null;
  go("adBook");
}

function screenAdBook() {
  if (!S._adBook) { S._adBook = { loading: true, productId: "", days: 0, start: "" }; loadAdBook(); }
  const a = S._adBook;
  if (a.loading) return `${backRow()}${spinner()}`;
  if (S.role !== "MERCHANT") {
    return `${backRow()}
      <h1 class="screen-title">${esc(t("ads.bookTitle"))}</h1>
      <p class="screen-sub">${esc(t("ads.needShop"))}</p>
      <button class="btn" style="max-width:260px" onclick="go('merchantRegister')">${esc(t("profile.registerMerchant"))}</button>`;
  }
  if (a.done) {
    return `${backRow()}
      <div class="success-banner" style="margin-top:12px">${esc(a.done.autoApprove ? t("ads.doneLive") : t("ads.doneWaiting"))}</div>
      <div style="height:14px"></div>
      <button class="btn" style="max-width:260px" onclick="S._myAds=null;back();go('myAds')">${esc(t("profile.myAds"))}</button>`;
  }
  const pk = a.packages || [];
  const chosen = pk.find((p) => p.days === a.days);
  const enough = chosen ? a.balance >= chosen.credits : true;
  const starts = [["", t("ads.startNow")]];
  for (let d = 1; d <= 7; d++) {
    const dt = new Date(); dt.setDate(dt.getDate() + d); dt.setHours(0, 0, 0, 0);
    starts.push([dt.toISOString(), d === 1 ? t("ads.tomorrow") : dt.toLocaleDateString(LANG, { weekday: "long", day: "numeric", month: "short" })]);
  }
  if (a.start && !starts.some(([v]) => v === a.start)) starts.push([a.start, new Date(a.start).toLocaleString(LANG, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })]);
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(t("ads.bookTitle"))}</h1>
    <p class="screen-sub">${esc(t("ads.bookSub"))}</p>
    ${!a.products.length ? `<div class="error-banner">${esc(t("ads.noProducts"))}</div>` : `
    <div class="field"><label>${esc(t("ads.pickProduct"))}</label>
      <select onchange="S._adBook.productId=this.value;render()">
        <option value="">—</option>
        ${a.products.map((p) => `<option value="${p.id}" ${a.productId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
      </select></div>
    <div class="field"><label>${esc(t("ads.pickDays"))}</label>
      <div class="ad-packs">${pk.map((p) => `
        <button class="ad-pack ${a.days === p.days ? "on" : ""}" onclick="S._adBook.days=${p.days};render()">
          <b>${esc(t("ads.daysN", { n: p.days }))}</b><span>${p.credits} ${esc(a.creditName)}</span>
        </button>`).join("")}</div></div>
    <div class="field"><label>${esc(t("ads.pickStart"))}</label>
      <select onchange="S._adBook.start=this.value;render()">${starts.map(([v, l]) => `<option value="${esc(v)}" ${a.start === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
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

async function loadAdBook() {
  const [pk, mine] = await Promise.all([api("GET", "/ads/packages"), S.role === "MERCHANT" ? api("GET", "/products/mine") : Promise.resolve({ ok: true, data: [] })]);
  const a = S._adBook;
  if (!a) return;
  a.loading = false;
  a.packages = pk.ok ? pk.data.packages : [];
  a.creditName = pk.ok ? pk.data.creditName : "";
  a.balance = pk.ok ? pk.data.balance || 0 : 0;
  a.autoApprove = pk.ok ? pk.data.autoApprove : false;
  a.products = mine.ok ? mine.data.filter((p) => p.isActive && p.stock > 0) : [];
  if (a.packages.length) a.days = a.packages[0].days;
  render();
}

async function submitAdBooking() {
  const a = S._adBook;
  a.busy = true; a.error = null; a.nextAvailable = null;
  render();
  const body = { productId: a.productId, days: a.days };
  if (a.start) body.start = a.start;
  const { ok, data } = await api("POST", "/ads", body);
  a.busy = false;
  if (ok) { a.done = { autoApprove: data.status === "ACTIVE" }; }
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
    ${m.list.length === 0 ? `<div class="empty-state">${esc(t("ads.none"))}</div>` : m.list.map((a) => `
      <div class="card">
        <div class="title-line"><strong>${esc(a.product.name)}</strong><span class="badge ${a.state === "LIVE" ? "success" : a.state === "PENDING" || a.state === "SCHEDULED" ? "warning" : "neutral"}">${esc(t("ads.state." + a.state))}</span></div>
        <p class="muted">${esc(t("ads.daysN", { n: a.days }))} · ${day(a.startsAt)} → ${day(a.endsAt)} · ${a.credits}</p>
        <p class="muted">👁 ${a.impressions} · 👆 ${a.clicks}</p>
        ${a.rejectionReason ? `<p class="muted">${esc(a.rejectionReason)}</p>` : ""}
        ${a.state === "PENDING" ? `<button class="btn outline small" style="width:auto" onclick="cancelMyAd('${a.id}')">${esc(t("ads.cancel"))}</button>` : ""}
      </div>`).join("")}`;
}

async function loadMyAds() {
  const { ok, data } = await api("GET", "/ads/mine");
  S._myAds = { loading: false, list: ok ? data : [] };
  render();
}

async function cancelMyAd(id) {
  if (!confirm(t("ads.cancelConfirm"))) return;
  const { ok, data } = await api("POST", "/ads/" + id + "/cancel");
  if (!ok) S.error = errMsg(data, t("ads.failed"));
  loadMyAds();
}

/* ---------------- a product from a photo (for shops that are not used to typing) ---------------- */

function openProductWizard() {
  S._wiz = { step: "photos", photos: [], specs: [], stock: 1, condition: "NEW", section: "", name: "", description: "", price: "", alternatives: [], busy: false, error: null };
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
      <div class="wiz-photos">
        ${w.photos.map((p, i) => `<div class="wiz-photo"><img src="${esc(p.preview)}" alt=""><button onclick="wizRemovePhoto(${i})" aria-label="x">✕</button>${i === 0 ? `<span>${esc(t("wiz.mainPhoto"))}</span>` : ""}</div>`).join("")}
        ${w.photos.length < 4 ? `<label class="wiz-add"><input type="file" accept="image/*" capture="environment" onchange="wizPickFiles(this)" hidden><b>📷</b><span>${esc(t("wiz.takePhoto"))}</span></label>
          <label class="wiz-add alt"><input type="file" accept="image/*" multiple onchange="wizPickFiles(this)" hidden><b>🖼️</b><span>${esc(t("wiz.pickPhoto"))}</span></label>` : ""}
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
      <div class="wiz-done"><div class="wiz-done-ico">🎉</div><h1>${esc(t("wiz.doneTitle"))}</h1><p class="muted">${esc(t("wiz.doneSub"))}</p>
        <button class="btn" onclick="openProductWizard()">📷 ${esc(t("wiz.another"))}</button>
        <div style="height:10px"></div>
        <button class="btn outline" onclick="go('productDetail',{productId:'${w.createdId}'})">${esc(t("wiz.viewIt"))}</button>
      </div>`;
  }
  const cur = S.currency || "EUR";
  const mic = (field) => (voiceOk() ? `<button type="button" class="wiz-mic ${w.listening === field ? "on" : ""}" onclick="wizVoice('${field}')" aria-label="mic">${w.listening === field ? "⏺" : "🎤"}</button>` : "");
  return `${head}
    <h1 class="screen-title">${esc(t("wiz.reviewTitle"))}</h1>
    ${w.aiAvailable === false ? `<div class="info-banner">${esc(t("wiz.noAi"))}</div>` : `<p class="screen-sub">${esc(t("wiz.reviewSub"))}</p>`}
    <div class="wiz-top">${w.photos.slice(0, 4).map((p) => `<img src="${esc(p.preview)}" alt="">`).join("")}</div>

    <div class="field"><label>${esc(t("wiz.name"))}</label>
      <div class="wiz-row"><input value="${esc(w.name)}" oninput="S._wiz.name=this.value" placeholder="${esc(t("wiz.namePh"))}">${mic("name")}</div>
      ${w.alternatives.length ? `<div class="wiz-chips">${w.alternatives.map((n) => `<button onclick="S._wiz.name='${esc(n).replace(/'/g, "&#39;")}';render()">${esc(n)}</button>`).join("")}</div>` : ""}</div>

    <div class="field"><label>${esc(t("wiz.section"))}</label>
      <div class="wiz-tiles">${(S._wizSections || []).map((x) => `<button class="${w.section === x.id ? "on" : ""}" onclick="S._wiz.section='${x.id}';render()"><span>${esc(x.icon)}</span>${esc(storeSecName(x))}</button>`).join("")}</div></div>

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
      <div class="stepper"><button onclick="S._wiz.stock=Math.max(1,S._wiz.stock-1);render()">−</button><span>${w.stock}</span><button onclick="S._wiz.stock+=1;render()">+</button></div></div>

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
    const d = data.draft;
    if (d) {
      w.name = d.name; w.alternatives = d.alternatives || []; w.description = d.description || ""; w.specs = d.specs || [];
      if (d.section) w.section = d.section;
      if (d.condition) w.condition = d.condition;
    } else if (data.available) w.error = t("wiz.aiMiss");
  } else w.aiAvailable = false;
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

async function wizPublish() {
  const w = S._wiz;
  const price = Number(String(w.price).replace(",", "."));
  if (!w.name.trim()) { w.error = t("wiz.needName"); return render(); }
  if (!w.section) { w.error = t("wiz.needSection"); return render(); }
  if (!(price > 0)) { w.error = t("wiz.needPrice"); return render(); }
  w.busy = true; w.error = null; render();
  const body = {
    name: w.name.trim(), description: w.description.trim() || undefined, priceCents: Math.round(price * 100), stock: w.stock,
    storeSection: w.section, condition: w.condition, images: w.photos.map((p) => p.url),
    specs: w.specs.filter((x) => x.label.trim() && x.value.trim()).map((x) => ({ label: x.label.trim(), value: x.value.trim() })),
  };
  const { ok, data } = await api("POST", "/products", body);
  w.busy = false;
  if (ok) { w.step = "done"; w.createdId = data.id; S._catalog = null; }
  else w.error = errMsg(data, t("wiz.failed"));
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
        <div class="store-picks">${(home.slots || []).slice(0, 3).map(storeSlot).join("")}</div>
        ${storeSlider(st, home)}
        <div class="store-picks">${(home.slots || []).slice(3, 6).map(storeSlot).join("")}</div>
      </div>
      ${home.slots && home.slots.length ? `<div class="store-slotstrip">${home.slots.map(storeSlot).join("")}</div>` : ""}
      ${home.adOffer ? `<div class="store-adstrip"><span>📢 ${esc(t("ads.pitch", { price: home.adOffer.fromCredits, name: home.adOffer.creditName, days: home.adOffer.days }))}</span><button onclick="openAdBooking()">${esc(t("ads.bookCta"))}</button></div>` : ""}
      <div class="store-circles">${sections.map((x) => `
        <button onclick="storePickSection('${x.id}')"><span>${esc(x.icon)}</span><em>${esc(storeSecName(x))}</em></button>`).join("")}</div>
      ${storeSection(t("store.best"), home.bestSellers, "best")}
      ${storeSection(t("store.deals"), home.deals, "deals")}
      ${storeSection(t("store.newest"), home.newest, "new")}
      ${!home.bestSellers.length && !home.newest.length ? `<div class="empty">${esc(t("store.noResults"))}</div>` : ""}`;
  }
  return `
    <div class="store">
      <div class="store-head">
        <button class="store-icon-btn" onclick="storeBack()" aria-label="back">›</button>
        <b class="store-brand">${esc(t("tab.store"))}</b>
        <form class="store-search" onsubmit="storeSearch(event)">
          <input id="store-q" type="search" value="${esc(st.q)}" placeholder="${esc(t("store.searchPlaceholder"))}" />
          <button type="button" class="photo-btn" title="${esc(t("photo.search"))}" aria-label="${esc(t("photo.search"))}" onclick="qs('store-photo').click()">📷</button>
          <button type="submit" aria-label="search">${ICON.search}</button>
        </form>
        <input id="store-photo" type="file" accept="image/*" hidden onchange="storePhotoSearch(this)" />
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
            <div><span>${esc(t("store.availability"))}</span>${available ? `<b class="${prod.stock <= 5 ? "low" : "ok"}">${prod.stock <= 5 ? esc(t("store.lastPieces", { n: prod.stock })) : "✓ " + esc(t("store.inStock"))}</b>` : `<b class="low">${esc(t("store.unavailable"))}</b>`}</div>
          </div>
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
      ${prod.related && prod.related.length ? `<section class="store-sec"><div class="store-sec-head"><h2>${esc(t("store.related"))}</h2></div><div class="store-grid">${prod.related.map(storeCard).join("")}</div></section>` : ""}
    </div>`;
}

async function loadProductDetail(id) {
  const { ok, data } = await api("GET", "/store/products/" + id);
  S._productDetail = { id, loading: false, product: ok ? data : null, qty: 1 };
  render();
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
    <div class="title-line"><strong>الإجمالي</strong><span class="price" style="color:var(--primary)">${fmt(ord.totalCents)}</span></div>
    ${ord.memberDiscountCents > 0 ? `<p class="muted">وفّرت ${fmt(ord.memberDiscountCents)} بسعر أعضاء دليلكم</p>` : ""}
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
    <h1 class="screen-title">سجّل كتاجر</h1>
    <p class="screen-sub">بيصير حسابك تاجر بعد موافقة الإدارة، وبعدها بيظهر محلك على الخريطة</p>
    <div class="field"><label>اسم المحل</label><input id="mr-name" placeholder="اسم محلك" value="${esc(m.name || "")}" /></div>
    ${categoryPickerHtml(m.categories, m.selectedCat, "selectMerchCategory")}
    <div class="field"><label>العنوان (اختياري)</label><input id="mr-address" placeholder="العنوان" value="${esc(m.address || "")}" /></div>
    <div class="row">
      <div class="field"><label>الهاتف (اختياري)</label><input id="mr-phone" placeholder="رقم الهاتف" value="${esc(m.phone || "")}" /></div>
      <div class="field"><label>واتساب (اختياري)</label><input id="mr-whatsapp" placeholder="9639xxxxxxxx" value="${esc(m.whatsapp || "")}" /></div>
    </div>
    ${pickerHtml()}
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
  const pin = S._pick && S._pick.lat != null ? { latitude: S._pick.lat, longitude: S._pick.lng } : {};
  S.busy = true; render();
  const { ok, data } = await api("POST", "/merchant/register", { businessName, categoryId, address: address || undefined, phone: phone || undefined, whatsapp: whatsapp || undefined, ...pin });
  S.busy = false;
  if (ok) {
    S.role = "MERCHANT";
    localStorage.setItem("dlk_role", "MERCHANT");
    S._merchReg = null;
    S._onboarding = null;
    back();
  } else {
    S.error = errMsg(data, "تعذّر تسجيل حساب التاجر");
    render();
  }
}

/* ---- merchant: pin the shop on the map ---- */

// One Leaflet instance kept alive across re-renders (re-parented into #pick-slot each time).
function pickerHtml() {
  const p = S._pick || {};
  return `
    <div class="field">
      <label>مكان محلك على الخريطة — بهالطريقة بيلاقيك الزبائن</label>
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
      S._pickMarker.on("dragend", () => { const ll = S._pickMarker.getLatLng(); pickSet(ll.lat, ll.lng, false); });
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
    map.on("click", (e) => pickSet(e.latlng.lat, e.latlng.lng, false));
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

function pickUseMyLocation() {
  if (!navigator.geolocation) return toast("المتصفح ما بيدعم تحديد الموقع");
  navigator.geolocation.getCurrentPosition(
    (pos) => pickSet(pos.coords.latitude, pos.coords.longitude, true),
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
    <div class="field"><label>اسم المحل</label><input id="mp-name" value="${esc(m.name || "")}" /></div>
    ${categoryPickerHtml(m.categories || [], m.categoryId, "mprofCategory")}
    <div class="field"><label>العنوان</label><input id="mp-address" value="${esc(m.address || "")}" /></div>
    <div class="row">
      <div class="field"><label>الهاتف</label><input id="mp-phone" value="${esc(m.phone || "")}" /></div>
      <div class="field"><label>واتساب (مع رمز الدولة)</label><input id="mp-whatsapp" placeholder="9639xxxxxxxx" value="${esc(m.whatsapp || "")}" /></div>
    </div>
    ${pickerHtml()}
    ${errorBanner()}
    <button class="btn" onclick="saveMerchantProfile()">حفظ</button>
    ${m.msg ? `<p class="muted" style="text-align:center;margin-top:8px">${esc(m.msg)}</p>` : ""}
  `;
}

async function loadMerchantProfile() {
  const [me, cats] = await Promise.all([api("GET", "/merchant/me"), api("GET", "/categories?lang=" + LANG)]);
  const d = me.ok ? me.data : {};
  S._mprof = { loading: false, name: d.businessName, categoryId: d.categoryId, address: d.address, phone: d.phone, whatsapp: d.whatsapp, categories: cats.ok ? cats.data : [], msg: "" };
  pickReset(d.latitude != null ? d.latitude : null, d.longitude != null ? d.longitude : null);
  render();
}

function snapshotMprof() {
  const m = S._mprof;
  [["name", "mp-name"], ["address", "mp-address"], ["phone", "mp-phone"], ["whatsapp", "mp-whatsapp"]].forEach(([k, id]) => { if (qs(id)) m[k] = qs(id).value; });
}
function mprofCategory(id) { snapshotMprof(); S._mprof.categoryId = id; render(); }

async function saveMerchantProfile() {
  snapshotMprof();
  const m = S._mprof;
  const body = { businessName: (m.name || "").trim(), ...(m.categoryId ? { categoryId: m.categoryId } : {}), address: (m.address || "").trim() || null, phone: (m.phone || "").trim() || null, whatsapp: (m.whatsapp || "").replace(/\D/g, "") || null };
  if (S._pick && S._pick.lat != null) { body.latitude = S._pick.lat; body.longitude = S._pick.lng; }
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
    <div class="card checklist">
      <div class="title-line"><strong>جهّز محلك ليظهر للزبائن</strong><span class="badge ${o.steps.approved ? "success" : "warning"}">${done}/5</span></div>
      ${o.steps.approved ? "" : `<p class="muted" style="margin:4px 0 8px">⏳ طلبك بانتظار موافقة الإدارة — ما رح يظهر محلك على الخريطة قبلها.</p>`}
      ${item(o.steps.location, "حدّد مكان محلك على الخريطة", "S._mprof=null;go('merchantProfile')")}
      ${item(o.steps.hours, "حدّد ساعات العمل", "S._hours=null;go('merchantHours')")}
      ${item(o.steps.discount, "أضف حسم للأعضاء", "setMerchantTab('catalog')")}
      ${item(o.steps.product, "أضف أول منتج", "setMerchantTab('catalog')")}
      ${item(o.steps.approved, "موافقة الإدارة", "")}
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
  const m = d.merchants.find((x) => x.id === merchantId) || (S._merchantDetail && S._merchantDetail.merchant);
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
  const unitName = (u) => u.nameArabic || u.name;
  const opt = (value, label, chosen) => `<option value="${esc(value)}" ${String(chosen || "") === String(value) ? "selected" : ""}>${esc(label)}</option>`;
  const note = a.msg ? `<div class="card" style="border-color:var(--primary)">${esc(a.msg)}</div>` : "";
  const err = a.err ? `<div class="error-banner">${esc(a.err)}</div>` : "";
  const f = a.addr;
  const LABELS = { HOME: "البيت", WORK: "العمل", OTHER: "غير ذلك" };
  return `
    ${backRow()}
    <h1 class="screen-title">إعدادات الحساب</h1>
    ${note}${err}

    <div class="card">
      <div class="section-title" style="margin-top:0">الإيميل</div>
      <p dir="ltr" style="margin:4px 0;text-align:right"><strong>${esc(p.email)}</strong></p>
      <p class="muted">${p.emailVerified ? "✅ مؤكَّد" : "⚠️ غير مؤكَّد"}</p>
      ${a.emailDelivery ? `
        <div class="divider"></div>
        <div class="field"><label>الإيميل الجديد</label><input id="ac-newemail" type="email" dir="ltr" autocomplete="email" /></div>
        <div class="field"><label>كلمة السر للتأكيد</label><input id="ac-email-pw" type="password" autocomplete="current-password" /></div>
        <p class="muted">رح نبعت رابط تأكيد للإيميل الجديد، وتنبيه للقديم. بعد التأكيد بتسجّل دخول من جديد بالإيميل الجديد.</p>
        <button class="btn small" onclick="acctChangeEmail()">تغيير الإيميل</button>` : `<p class="muted">تغيير الإيميل مش متوفر حاليًا (خدمة البريد غير مفعّلة بعد).</p>`}
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">كلمة السر</div>
      <div class="field"><label>كلمة السر الحالية</label><input id="ac-pw-old" type="password" autocomplete="current-password" /></div>
      <div class="field"><label>كلمة السر الجديدة (8 أحرف على الأقل)</label><input id="ac-pw-new" type="password" autocomplete="new-password" /></div>
      <div class="field"><label>أعد كتابة الجديدة</label><input id="ac-pw-new2" type="password" autocomplete="new-password" /></div>
      <button class="btn small" onclick="acctChangePassword()">تغيير كلمة السر</button>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">رقم الهاتف</div>
      <div class="field"><input id="ac-phone" inputmode="tel" dir="ltr" placeholder="+49..." value="${esc(p.phone || "")}" /></div>
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
      <div class="field"><label>الرقم الضريبي (اختياري)</label><input id="ac-vat" dir="ltr" value="${esc(p.vatNumber || "")}" /></div>
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
        <div class="field"><label>الشارع</label><input id="ad-street" value="${esc(f.street)}" /></div>
        <div class="row">
          <div class="field"><label>رقم البناء</label><input id="ad-building" value="${esc(f.buildingNumber)}" /></div>
          <div class="field"><label>الرمز البريدي</label><input id="ad-postal" dir="ltr" value="${esc(f.postalCode)}" /></div>
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
    <div class="field"><label>الاسم</label><input id="pf-name" value="${esc(p.fullName || "")}" /></div>
    <div class="field"><label>نبذة عنك أو عن محلك (بتظهر للزبائن وعلى الفواتير)</label><textarea id="pf-bio" rows="4" maxlength="500">${esc(p.bio || "")}</textarea></div>
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
  let res;
  try { res = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + S.token, "Accept-Language": LANG } }); } catch (e) { return toast("تعذّر الاتصال بالسيرفر"); }
  if (!res.ok) return toast("تعذّر تجهيز المستند");
  const parsed = new DOMParser().parseFromString(await res.text(), "text/html");
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
function categoryPickerHtml(tree, selectedId, pick) {
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
  return html;
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

function screenMerchantModeShell() {
  const body = { redeem: tabRedeem, orders: tabMerchantOrders, catalog: tabCatalog, promo: tabPromo }[S.merchantTab]();
  return `
    <button class="back-btn" onclick="back()">‹ رجوع لحساب الزبون</button>
    ${merchantChecklistHtml()}
    <div>${body}</div>
    <div class="tabbar">
      ${MERCHANT_TABS.map((t) => `
        <button class="${S.merchantTab === t.id ? "active" : ""}" onclick="setMerchantTab('${t.id}')">
          ${ICON[t.icon]}<span>${esc(t.label)}</span>
        </button>`).join("")}
    </div>
  `;
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
  if (!S._promo) { S._promo = { loading: true, audience: "radius", cityId: "", radius: "5", title: "", body: "", productId: "", discountId: "" }; loadPromo(); }
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
        ? `<div class="field"><label>المدينة</label><select id="pr-city">${option("", "— اختر مدينة —", p.cityId)}${(p.cities || []).map((c) => option(c.id, c.nameArabic || c.name, p.cityId)).join("")}</select></div>`
        : p.audience === "followers" ? "" : `<div class="field"><label>المسافة حول محلك (كم)</label><input id="pr-radius" inputmode="decimal" value="${esc(p.radius)}" /></div>`}
      <div class="field"><label>العنوان</label><input id="pr-title" maxlength="100" value="${esc(p.title)}" /></div>
      <div class="field"><label>النص</label><textarea id="pr-body" maxlength="500" rows="3">${esc(p.body)}</textarea></div>
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
  const [history, me, products, cities] = await Promise.all([api("GET", "/broadcasts"), api("GET", "/merchant/me"), api("GET", "/products/mine"), api("GET", "/geo/units?level=CITY")]);
  Object.assign(S._promo, {
    loading: false,
    cities: cities.ok ? cities.data : [],
    history: history.ok ? history.data : [],
    discounts: me.ok ? (me.data.discounts || []).filter((d) => d.isActive !== false) : [],
    products: products.ok ? products.data.filter((x) => x.isActive !== false) : [],
  });
  render();
}

/** Reads the form into the state so a re-render never loses what was typed; returns who it is for, or null when something is missing. */
function promoRead() {
  const p = S._promo;
  p.audience = qs("pr-audience").value;
  if (qs("pr-radius")) p.radius = qs("pr-radius").value;
  if (qs("pr-city")) p.cityId = qs("pr-city").value;
  p.title = qs("pr-title").value;
  p.body = qs("pr-body").value;
  p.productId = qs("pr-product").value;
  p.discountId = qs("pr-discount").value;
  p.error = null;
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

/* ---- Redeem tab ---- */

function tabRedeem() {
  if (!S._redeem) S._redeem = { phase: "input", memberNumber: "", code: "" };
  const r = S._redeem;
  if (r.phase === "input") {
    return `
      <h1 class="screen-title">تأكيد حسم</h1>
      <p class="screen-sub">دخّل بيانات عضوية الزبون</p>
      <div class="field"><label>رقم العضوية</label><input id="rd-member" placeholder="DLK-XXXXXXXXXX" value="${esc(r.memberNumber)}" /></div>
      <div class="field"><label>الكود (6 أرقام)</label><input id="rd-code" placeholder="123456" maxlength="6" value="${esc(r.code)}" /></div>
      ${errorBanner()}
      <button class="btn" ${S.busy ? "disabled" : ""} onclick="verifyRedeem()">تحقق</button>
    `;
  }
  if (r.phase === "verified") {
    return `
      <h1 class="screen-title">تأكيد حسم</h1>
      <p><strong>العضو:</strong> ${esc(r.memberName)}</p>
      <p style="color:var(--primary)"><strong>نسبة الحسم:</strong> ${r.discountPercent}%</p>
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
  const memberNumber = qs("rd-member").value.trim();
  const code = qs("rd-code").value.trim();
  S._redeem.memberNumber = memberNumber;
  S._redeem.code = code;
  if (!memberNumber || code.length !== 6) { S.error = "دخّل رقم العضوية والكود المكوّن من 6 أرقام"; return render(); }
  S.busy = true; S.error = null; render();
  const { ok, data } = await api("POST", "/qr/verify", { memberNumber, code });
  S.busy = false;
  if (ok) {
    S._redeem = { phase: "verified", memberNumber, code, memberName: data.member.fullName, discountPercent: data.discount ? data.discount.percent : 0 };
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
  const { ok, data } = await api("POST", "/qr/redeem", { memberNumber: r.memberNumber, code: r.code, billAmountCents });
  S.busy = false;
  if (ok) { r.phase = "done"; r.receipt = data; }
  else S.error = errMsg(data, "تعذّر تأكيد الحسم");
  render();
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
        <p class="muted">${esc(ord.user ? ord.user.fullName : "")}</p>
        <p class="price">${fmt(ord.totalCents)}</p>
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
    <div class="card">
      <div class="section-title" style="margin-top:0">الحسومات</div>
      ${(c.discounts || []).length ? c.discounts.map((d) => `<p style="color:var(--primary)">🏷️ ${esc(d.title)} — ${d.percent}%</p>`).join("") : `<p class="muted">ما في حسومات بعد</p>`}
      <div class="divider"></div>
      <div class="row">
        <input id="cat-disc-title" placeholder="عنوان الحسم" value="${esc(c.discTitle || "")}" />
        <input id="cat-disc-percent" placeholder="نسبة %" style="max-width:70px" value="${esc(c.discPercent || "")}" />
      </div>
      <div style="height:8px"></div>
      <button class="btn small" onclick="addCatalogDiscount()">إضافة حسم</button>
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

    <button class="btn wiz-start" onclick="openProductWizard()">📷 ${esc(t("wiz.start"))}</button>
    <p class="muted" style="margin:6px 0 0;text-align:center">${esc(t("wiz.startSub"))}</p>
    <div class="title-line" style="margin:16px 0 8px">
      <strong>المنتجات</strong>
      <button class="btn small" style="width:auto" onclick="go('productEdit', {productId:null})">+ منتج جديد</button>
    </div>
    ${(c.products || []).length === 0 ? `<div class="empty-state">ما في منتجات بعد</div>` : c.products.map((p) => `
      <div class="card clickable" onclick="go('productEdit', {productId:'${p.id}'})">
        <div class="title-line"><strong>${esc(p.name)}</strong><span class="badge ${p.isActive ? "success" : "neutral"}">${p.isActive ? "نشط" : "غير نشط"}</span></div>
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
    S._prodEdit = { productId, loading: true, isNew: !productId, categories: [], name: "", description: "", price: "", stock: "0", sku: "", memberDiscountEnabled: false, memberPrice: "", isActive: true, selectedCat: null };
    initProductEdit(productId);
  }
  const p = S._prodEdit;
  if (p.loading) return backRow() + spinner();
  return `
    ${backRow()}
    <h1 class="screen-title">${p.isNew ? "منتج جديد" : "تعديل المنتج"}</h1>
    <div class="field"><label>اسم المنتج</label><input id="pe-name" value="${esc(p.name)}" /></div>
    <div class="field"><label>الوصف (اختياري)</label><input id="pe-desc" value="${esc(p.description)}" /></div>
    <div class="row">
      <div class="field"><label>السعر</label><input id="pe-price" value="${esc(p.price)}" /></div>
      <div class="field"><label>المخزون</label><input id="pe-stock" value="${esc(p.stock)}" /></div>
    </div>
    <div class="field"><label>SKU (اختياري)</label><input id="pe-sku" value="${esc(p.sku)}" /></div>
    <div class="section-title">التصنيف</div>
    <div class="chip-row" style="overflow-x:auto;flex-wrap:nowrap">
      ${flattenCategories(p.categories).map((c) => `<button class="chip ${p.selectedCat === c.id ? "active" : ""}" onclick="selectProdCategory('${c.id}')">${esc(c.name)}</button>`).join("")}
    </div>
    <div class="switch-row">
      <span>حسم أعضاء دليلكم</span>
      <label class="switch"><input type="checkbox" id="pe-member-toggle" ${p.memberDiscountEnabled ? "checked" : ""} onchange="toggleMemberDiscount(this.checked)" /><span class="track"></span></label>
    </div>
    ${p.memberDiscountEnabled ? `<div class="field"><label>سعر العضو</label><input id="pe-member-price" value="${esc(p.memberPrice)}" /></div>` : ""}
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
    isActive: prod.isActive, selectedCat: prod.categoryId || null,
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

function selectProdCategory(id) {
  snapshotProdEditDraft();
  S._prodEdit.selectedCat = id;
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
  let memberPriceCents = null;
  if (p.memberDiscountEnabled) {
    memberPriceCents = Math.round(parseFloat(latinDigits(p.memberPrice)) * 100);
    if (!memberPriceCents || memberPriceCents <= 0 || memberPriceCents >= priceCents) { S.error = "سعر العضو لازم يكون أقل من السعر الأصلي"; return render(); }
  }
  const payload = {
    name, description: description || undefined, priceCents, categoryId: p.selectedCat || undefined,
    stock, sku: sku || undefined, memberDiscountEnabled: p.memberDiscountEnabled, memberPriceCents: memberPriceCents || undefined,
  };
  S.busy = true; S.error = null; render();
  let res;
  if (p.isNew) res = await api("POST", "/products", payload);
  else res = await api("PATCH", "/products/" + p.productId, { ...payload, isActive: p.isActive });
  S.busy = false;
  if (res.ok) { S._catalog = null; back(); }
  else { S.error = errMsg(res.data, "تعذّر حفظ المنتج"); render(); }
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
          ${locals.map((l) => `<option value="${esc(l.key)}">${esc(l.label)}</option>`).join("")}
        </select>
      </div>
      <div id="tp-hint" class="muted" style="margin-bottom:10px;line-height:1.7"></div>
      <div class="field"><label id="tp-ref-label">رقم العملية</label><input id="tp-ref" /></div>
      <div class="field" id="tp-amount-row"><label>المبلغ اللي دفعته</label><input id="tp-amount" type="number" /></div>
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
      <div class="field"><label>وصف النشاط</label><input id="rp-desc" value="${esc(st.businessDescription || "")}" /></div>
      <div class="field"><label>نبرة الرد (رسمي، ودود...)</label><input id="rp-tone" value="${esc(st.tone || "")}" /></div>
      <div class="field"><label>إذا ما انطبقت أي قاعدة</label>
        <select id="rp-fb" onchange="S._resp.status.fallbackMode = this.value; render()">
          <option value="OFF" ${st.fallbackMode === "OFF" ? "selected" : ""}>ما أرد (أتجاهل الرسالة)</option>
          <option value="AI" ${st.fallbackMode === "AI" ? "selected" : ""}>الذكاء الاصطناعي يجاوب من معلومات نشاطي</option>
          <option value="TEMPLATE" ${st.fallbackMode === "TEMPLATE" ? "selected" : ""}>نص ثابت</option>
        </select></div>
      ${st.fallbackMode === "TEMPLATE" ? `<div class="field"><label>نص الرد الاحتياطي ({name} = اسم الزبون)</label><textarea id="rp-fbtext" rows="3">${esc(st.fallbackReply || "")}</textarea></div>` : ""}
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
      <div class="field"><label>اسم القاعدة</label><input id="ru-name" value="${esc(d.name || "")}" /></div>
      <div class="field"><label>كلمات مفتاحية (مفصولة بفاصلة)</label><input id="ru-keys" placeholder="سعر، كم، price" value="${esc(d.keys || "")}" /></div>
      <div class="field"><label>نوع الرد</label>
        <select id="ru-mode"><option value="FIXED" ${d.mode !== "AI" ? "selected" : ""}>رد ثابت</option><option value="AI" ${d.mode === "AI" ? "selected" : ""}>ذكاء اصطناعي</option></select></div>
      <div class="field"><label>نص الرد (استخدم {name} لاسم الزبون)</label><input id="ru-reply" value="${esc(d.reply || "")}" /></div>
      <div class="field"><label>تعليمات للذكاء الاصطناعي (اختياري)</label><input id="ru-ai" value="${esc(d.ai || "")}" /></div>
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
  if (S.screen === "home" && S.homeTab === "discover" && S._discover) {
    renderDiscoverMap();
  }
  if (S.screen === "merchantRegister" || S.screen === "merchantProfile") renderPicker();
  if (S.screen === "store" && S._store && S._store.banners && S._store.banners.list.length > 1) { if (!S._sliderTimer) storeSliderRestart(); }
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

bootSocialReturn().then((social) => {
  if (social) return;
  if (bootMetaReturn()) return;
  bootReferralCapture().then((handled) => {
    if (!handled && !bootMerchantLink()) render();
  });
});

// Same-origin — this page is served by the API itself (public/app/), so no CORS/base-URL needed.
const API_BASE = "";

const S = {
  token: localStorage.getItem("dlk_token") || null,
  role: localStorage.getItem("dlk_role") || null,
  screen: S_initialScreen(),
  homeTab: "home",
  merchantTab: "redeem",
  params: {},
  stack: [],
  busy: false,
  error: null,
  qrTimer: null,
  qrTick: null,
};

function S_initialScreen() {
  return localStorage.getItem("dlk_token") ? "home" : "login";
}

/* ---------------- helpers ---------------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmt(cents) {
  return (Number(cents || 0) / 100).toFixed(2) + " €";
}

function errMsg(data, fallback) {
  if (!data || !data.error) return fallback;
  if (typeof data.error === "string") return data.error;
  const fieldError = Object.values((data.error.details && data.error.details.fieldErrors) || {}).flat()[0];
  return fieldError || data.error.message || fallback;
}

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (S.token) headers["Authorization"] = "Bearer " + S.token;
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && S.token) {
      clearToken();
      reset("login");
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
}

function clearToken() {
  S.token = null;
  S.role = null;
  localStorage.removeItem("dlk_token");
  localStorage.removeItem("dlk_role");
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
  el.innerHTML = renderScreen();
  wireUpAfterRender();
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
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M3 4h2l2.2 11h10.4L20 8H6.2"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M8 9h8M8 13h8"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.3"/><path d="M5 20c1.3-3.6 4-5.4 7-5.4s5.7 1.8 7 5.4"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M4 12h16" stroke-dasharray="2.5 2.5"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3.5 7 12 3l8.5 4-8.5 4-8.5-4Z"/><path d="M3.5 7v10L12 21l8.5-4V7"/><path d="M12 11v10"/></svg>',
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

function screenLogin() {
  const draft = S.params.draft || {};
  return `
    <h1 class="screen-title">تسجيل الدخول</h1>
    <p class="screen-sub">أهلًا فيك بدليلكم — دخّل بياناتك</p>
    <div class="field"><label>الإيميل</label><input id="f-email" type="email" placeholder="name@example.com" value="${esc(draft.email || "")}" /></div>
    <div class="field"><label>كلمة السر</label><input id="f-password" type="password" placeholder="••••••••" value="${esc(draft.password || "")}" /></div>
    ${errorBanner()}
    <button class="btn" onclick="doLogin()">دخول</button>
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
  return `
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
    ${errorBanner()}
    <button class="btn" onclick="doRegister()">إنشاء الحساب</button>
    <button class="link-btn" onclick="reset('login')">عندك حساب أصلًا؟ سجل دخول</button>
  `;
}

function snapshotRegisterDraft() {
  S.params.draft = {
    name: qs("f-name") ? qs("f-name").value : (S.params.draft || {}).name,
    email: qs("f-email") ? qs("f-email").value : (S.params.draft || {}).email,
    password: qs("f-password") ? qs("f-password").value : (S.params.draft || {}).password,
  };
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
  const { ok, data } = await api("POST", "/auth/register", { email, password, fullName });
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

function doLogout() {
  api("POST", "/auth/logout");
  clearToken();
  reset("login");
}

/* ================= HOME SHELL ================= */

const HOME_TABS = [
  { id: "home", label: "الرئيسية", icon: "home" },
  { id: "card", label: "بطاقتي", icon: "card" },
  { id: "discover", label: "اكتشف", icon: "search" },
  { id: "cart", label: "السلة", icon: "cart" },
  { id: "orders", label: "طلباتي", icon: "orders" },
  { id: "profile", label: "حسابي", icon: "user" },
];

function screenHomeShell() {
  const body = {
    home: tabWelcome,
    card: tabCard,
    discover: tabDiscover,
    cart: tabCart,
    orders: tabOrders,
    profile: tabProfile,
  }[S.homeTab]();
  return `
    <div>${body}</div>
    <div class="tabbar" id="home-tabbar">
      ${HOME_TABS.map((t) => `
        <button class="${S.homeTab === t.id ? "active" : ""}" onclick="setHomeTab('${t.id}')">
          ${ICON[t.icon]}<span>${esc(t.label)}</span>
        </button>`).join("")}
    </div>
  `;
}

function tabWelcome() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:60px">
      <h1 class="screen-title">أهلًا فيك بدليلكم 👋</h1>
      <p class="screen-sub">شوف بطاقتك، أو دور على تجار عندهم حسم قريبين منك</p>
      <button class="btn" style="max-width:220px" onclick="setHomeTab('card')">بطاقتي</button>
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:220px" onclick="setHomeTab('discover')">اكتشف التجار</button>
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
    return `
      <h1 class="screen-title">بطاقتي</h1>
      <p class="screen-sub">ما عندك عضوية بعد — اشترك بخطة عشان تفعّل بطاقتك الرقمية</p>
      ${(c.plans || []).map((p) => `
        <div class="card">
          <div class="title-line"><strong>${esc(p.name)}</strong><span class="price">${fmt(p.priceCents)}</span></div>
          <p class="muted">${p.durationDays} يوم</p>
          <button class="btn small" onclick="subscribePlan('${p.id}')">اشترك</button>
        </div>`).join("") || `<div class="empty-state">لا يوجد خطط متاحة حاليًا</div>`}
      ${errorBanner()}
    `;
  }
  return `
    <h1 class="screen-title">بطاقتي</h1>
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
    const plans = await api("GET", "/membership/plans");
    S._card = { loading: false, plans: plans.ok ? plans.data : [] };
    render();
    return;
  }
  S._card = { loading: false, memberNumber: me.data.memberNumber, validUntil: me.data.endDate };
  render();
  startQrLoop();
}

async function subscribePlan(planId) {
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
      if (el) el.textContent = `بيتجدد خلال ${remaining} ثانية`;
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

/* ---- Discover tab ---- */

function tabDiscover() {
  if (!S._discover) {
    S._discover = {
      loading: true, query: "", categoryId: "", categories: [], merchants: [],
      view: "list", radiusKm: 10, discountsOnly: true, userLoc: null, locError: null,
      mapMerchants: [], mapLoading: false,
    };
    loadCategories().then(() => searchMerchants());
  }
  const d = S._discover;
  return `
    <div class="title-line">
      <h1 class="screen-title">اكتشف التجار</h1>
      <div class="chip-row" style="margin-bottom:0">
        <button class="chip ${d.view === "list" ? "active" : ""}" onclick="setDiscoverView('list')">قائمة</button>
        <button class="chip ${d.view === "map" ? "active" : ""}" onclick="setDiscoverView('map')">🗺️ خريطة</button>
      </div>
    </div>
    ${d.view === "list" ? discoverListView(d) : discoverMapView(d)}
  `;
}

function discoverListView(d) {
  return `
    <div class="field"><input id="disc-q" placeholder="دور على اسم محل..." value="${esc(d.query)}" oninput="onDiscoverQuery(this.value)" /></div>
    <div class="chip-row" style="overflow-x:auto;flex-wrap:nowrap">
      <button class="chip ${!d.categoryId ? "active" : ""}" onclick="onDiscoverCategory('')">الكل</button>
      ${flattenCategories(d.categories).map((c) => `<button class="chip ${d.categoryId === c.id ? "active" : ""}" onclick="onDiscoverCategory('${c.id}')">${esc(c.name)}</button>`).join("")}
    </div>
    <div style="height:6px"></div>
    ${d.loading ? spinner() : (d.merchants.length ? d.merchants.map(merchantRowHtml).join("") : `<div class="empty-state">ما في نتائج</div>`)}
  `;
}

function discoverMapView(d) {
  return `
    <div class="chip-row">
      <button class="chip ${d.discountsOnly ? "active" : ""}" onclick="toggleDiscoverDiscountsOnly()">🏷️ فيها حسم بس</button>
      ${[1, 5, 10, 25].map((r) => `<button class="chip ${d.radiusKm === r ? "active" : ""}" onclick="setDiscoverRadius(${r})">${r} كم</button>`).join("")}
    </div>
    ${d.locError ? `<div class="error-banner">${esc(d.locError)}</div>` : ""}
    <div id="discover-map" style="height:340px;border-radius:16px;overflow:hidden;border:1px solid var(--border)"></div>
    <div style="height:8px"></div>
    ${d.mapLoading
      ? spinner()
      : d.userLoc
        ? `<p class="muted">${d.mapMerchants.length} محل ${d.discountsOnly ? "عندهم حسم" : ""} بمحيط ${d.radiusKm} كم</p>`
        : `<div class="empty-state">فعّل صلاحية الموقع من المتصفح لنعرض أقرب المحلات</div>`}
  `;
}

function setDiscoverView(view) {
  S._discover.view = view;
  render();
  if (view === "map" && !S._discover.userLoc && !S._discover.locError) requestDiscoverLocation();
}

function toggleDiscoverDiscountsOnly() {
  S._discover.discountsOnly = !S._discover.discountsOnly;
  searchMerchantsForMap();
}

function setDiscoverRadius(km) {
  S._discover.radiusKm = km;
  searchMerchantsForMap();
}

function requestDiscoverLocation() {
  if (!navigator.geolocation) {
    S._discover.locError = "المتصفح ما بيدعم تحديد الموقع";
    render();
    return;
  }
  S._discover.mapLoading = true;
  render();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      S._discover.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      S._discover.locError = null;
      searchMerchantsForMap();
    },
    () => {
      S._discover.mapLoading = false;
      S._discover.locError = "ما قدرنا نحدد موقعك — تأكد من تفعيل صلاحية الموقع بالمتصفح";
      render();
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

async function searchMerchantsForMap() {
  if (!S._discover.userLoc) return;
  S._discover.mapLoading = true;
  render();
  const { lat, lng } = S._discover.userLoc;
  const params = new URLSearchParams({ lat, lng, radiusKm: S._discover.radiusKm });
  const { ok, data } = await api("GET", "/merchant?" + params.toString());
  let list = ok ? data : [];
  if (S._discover.discountsOnly) list = list.filter((m) => (m.discounts || []).length > 0);
  S._discover.mapMerchants = list;
  S._discover.mapLoading = false;
  render();
}

function renderDiscoverMap() {
  const el = document.getElementById("discover-map");
  if (!el || typeof L === "undefined") return;
  if (S._discoverMapInstance) {
    S._discoverMapInstance.remove();
    S._discoverMapInstance = null;
  }
  const center = S._discover.userLoc || { lat: 33.5138, lng: 36.2765 }; // Damascus, used only when location is unavailable
  const map = L.map(el, { attributionControl: false }).setView([center.lat, center.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
  L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap").addTo(map);

  if (S._discover.userLoc) {
    L.circleMarker([S._discover.userLoc.lat, S._discover.userLoc.lng], {
      radius: 7, color: "#1565c0", fillColor: "#1565c0", fillOpacity: 0.9, weight: 2,
    }).addTo(map).bindPopup("موقعك");
  }

  (S._discover.mapMerchants || []).forEach((m) => {
    if (m.latitude == null || m.longitude == null) return;
    const hasDiscount = (m.discounts || []).length > 0;
    const icon = L.divIcon({
      className: "",
      html: `<div style="background:${hasDiscount ? "#ba2a34" : "#8a7a78"};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)"><span style="transform:rotate(45deg);font-size:13px">${hasDiscount ? "🏷️" : "📍"}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
    const discountText = hasDiscount
      ? m.discounts.map((dc) => `${esc(dc.title)} — ${dc.percent}%`).join("<br>")
      : "بدون حسم حاليًا";
    L.marker([m.latitude, m.longitude], { icon }).addTo(map).bindPopup(`
      <div style="font-family:Tajawal,sans-serif;text-align:right;direction:rtl;min-width:150px">
        <strong>${esc(m.businessName)}</strong><br>
        ${m.distanceKm != null ? `<span style="color:#8a7a78;font-size:12px">${m.distanceKm.toFixed(1)} كم</span><br>` : ""}
        <span style="color:#ba2a34;font-size:12px">${discountText}</span><br>
        <button onclick="go('merchantDetail',{merchantId:'${m.id}'})" style="margin-top:6px;background:#ba2a34;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer">افتح المحل</button>
        <a href="${directionsUrl(m.latitude, m.longitude)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;margin-right:4px;background:#fff;color:#ba2a34;border:1px solid #ba2a34;border-radius:8px;padding:5px 10px;font-size:12px;text-decoration:none">🗺️ الاتجاهات</a>
      </div>
    `);
  });

  S._discoverMapInstance = map;
}

function flattenCategories(cats) {
  const out = [];
  for (const c of cats) { out.push(c); for (const ch of c.children || []) out.push(ch); }
  return out;
}

function merchantRowHtml(m) {
  return `
    <div class="card clickable" onclick="go('merchantDetail', {merchantId:'${m.id}'})">
      <div class="title-line">
        <strong>${esc(m.businessName)}</strong>
        ${m.distanceKm != null ? `<span class="muted">${m.distanceKm.toFixed(1)} كم</span>` : ""}
      </div>
      <p class="muted">${esc(m.category ? m.category.name : "")}</p>
      ${(m.discounts || []).map((dc) => `<div class="badge info" style="margin-top:4px">🏷️ ${esc(dc.title)} — ${dc.percent}%</div>`).join("")}
    </div>`;
}

async function loadCategories() {
  const { ok, data } = await api("GET", "/categories");
  S._discover.categories = ok ? data : [];
}

let discoverDebounce = null;
function onDiscoverQuery(v) {
  S._discover.query = v;
  clearTimeout(discoverDebounce);
  discoverDebounce = setTimeout(searchMerchants, 350);
}
function onDiscoverCategory(id) {
  S._discover.categoryId = id;
  searchMerchants();
}

async function searchMerchants() {
  S._discover.loading = true; render();
  const params = new URLSearchParams();
  if (S._discover.query) params.set("q", S._discover.query);
  if (S._discover.categoryId) params.set("categoryId", S._discover.categoryId);
  const { ok, data } = await api("GET", "/merchant?" + params.toString());
  S._discover.loading = false;
  S._discover.merchants = ok ? data : [];
  render();
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
      <h1 class="screen-title">حسابي</h1>
      <div style="height:20px"></div>
      ${S.role === "MERCHANT"
        ? `<button class="btn" style="max-width:240px" onclick="go('merchantMode')">وضع التاجر</button>`
        : `<button class="btn outline" style="max-width:240px" onclick="go('merchantRegister')">سجّل كتاجر</button>`}
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('affiliateMine')">مسوّقياتي</button>
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('responder')">🤖 المجيب الآلي</button>
      <div style="height:10px"></div>
      <button class="btn outline" style="max-width:240px" onclick="go('wallet')">💰 محفظتي</button>
      <div style="height:14px"></div>
      <button class="btn secondary" style="max-width:240px" onclick="doLogout()">تسجيل الخروج</button>
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

function screenMerchantDetail() {
  if (!S._merchantDetail || S._merchantDetail.id !== S.params.merchantId) {
    S._merchantDetail = { id: S.params.merchantId, loading: true };
    loadMerchantDetail(S.params.merchantId);
  }
  const m = S._merchantDetail;
  if (m.loading) return backRow() + spinner();
  if (!m.merchant) return backRow() + `<div class="error-banner">هذا المحل غير متوفر</div>`;
  const hasCoords = m.merchant.latitude != null && m.merchant.longitude != null;
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(m.merchant.businessName)}</h1>
    <p class="screen-sub">${esc(m.merchant.category ? m.merchant.category.name : "")}${m.merchant.address ? " · 📍 " + esc(m.merchant.address) : ""}${m.merchant.distanceKm != null ? " · " + m.merchant.distanceKm.toFixed(1) + " كم" : ""}</p>
    ${hasCoords ? `<a class="btn outline" style="width:auto;display:inline-flex;margin-bottom:12px" href="${directionsUrl(m.merchant.latitude, m.merchant.longitude)}" target="_blank" rel="noopener">🗺️ الاتجاهات</a>` : ""}
    ${(m.merchant.discounts || []).map((d) => `<div class="badge info" style="margin-bottom:6px">🏷️ ${esc(d.title)} — ${d.percent}%</div>`).join("")}
    <div class="section-title">المنتجات</div>
    ${(m.products || []).length === 0 ? `<div class="empty-state">ما في منتجات بعد</div>` : m.products.map((p) => `
      <div class="card clickable" onclick="go('productDetail', {productId:'${p.id}'})">
        <div class="title-line">
          <strong>${esc(p.name)}</strong>
          ${(!p.isActive || p.stock <= 0) ? `<span class="badge danger">غير متوفر</span>` : ""}
        </div>
        ${p.memberDiscountEnabled && p.memberPriceCents != null
          ? `<p><span class="price strike">${fmt(p.priceCents)}</span> <span class="price" style="color:var(--primary)">${fmt(p.memberPriceCents)} لأعضاء دليلكم</span></p>`
          : `<p class="price">${fmt(p.priceCents)}</p>`}
      </div>`).join("")}
  `;
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
  const [mRes, pRes] = await Promise.all([api("GET", "/merchant/" + id), api("GET", "/products?merchantId=" + id)]);
  const merchant = mRes.ok ? mRes.data : null;
  const loc = S._discover && S._discover.userLoc;
  // /merchant/:id doesn't compute distance; derive it from the location the map view already asked for.
  if (merchant && loc && merchant.latitude != null && merchant.longitude != null) {
    merchant.distanceKm = haversineKm(loc.lat, loc.lng, merchant.latitude, merchant.longitude);
  }
  S._merchantDetail = { id, loading: false, merchant, products: pRes.ok ? pRes.data : [] };
  render();
}

/* ================= PRODUCT DETAIL ================= */

function screenProductDetail() {
  if (!S._productDetail || S._productDetail.id !== S.params.productId) {
    S._productDetail = { id: S.params.productId, loading: true, qty: 1 };
    loadProductDetail(S.params.productId);
  }
  const p = S._productDetail;
  if (p.loading) return backRow() + spinner();
  if (!p.product) return backRow() + `<div class="error-banner">هذا المنتج غير متوفر</div>`;
  const prod = p.product;
  const available = prod.isActive && prod.stock > 0;
  return `
    ${backRow()}
    <h1 class="screen-title">${esc(prod.name)}</h1>
    ${prod.description ? `<p class="screen-sub">${esc(prod.description)}</p>` : ""}
    ${prod.memberDiscountEnabled && prod.memberPriceCents != null
      ? `<p><span class="price strike">${fmt(prod.priceCents)}</span> <span class="price" style="font-size:18px;color:var(--primary)"> ${fmt(prod.memberPriceCents)} — سعر أعضاء دليلكم</span></p>`
      : `<p class="price" style="font-size:18px">${fmt(prod.priceCents)}</p>`}
    ${available ? `<p class="muted">المتوفر بالمخزون: ${prod.stock}</p>` : `<div class="error-banner">غير متوفر حاليًا</div>`}
    ${available ? `
      <div style="height:14px"></div>
      <div class="stepper">
        <button onclick="changeProductQty(-1)">−</button><span>${p.qty}</span><button onclick="changeProductQty(1)">+</button>
      </div>
      <div style="height:14px"></div>
      <button class="btn" ${p.adding ? "disabled" : ""} onclick="addProductToCart()">أضف للسلة</button>
      ${p.added ? `<div class="success-banner">تمت الإضافة للسلة ✓ <button class="link-btn" style="padding:0" onclick="reset('home'); setHomeTab('cart')">روح للسلة</button></div>` : ""}
    ` : ""}
    ${errorBanner()}
  `;
}

async function loadProductDetail(id) {
  const { ok, data } = await api("GET", "/products/" + id);
  S._productDetail = { id, loading: false, product: ok ? data : null, qty: 1 };
  render();
}

function changeProductQty(delta) {
  const p = S._productDetail;
  const next = p.qty + delta;
  if (next >= 1 && next <= p.product.stock) { p.qty = next; render(); }
}

async function addProductToCart() {
  const p = S._productDetail;
  p.adding = true; render();
  const { ok, data } = await addToCart(p.id, p.qty);
  p.adding = false;
  if (ok) { p.added = true; S._cart = null; S.error = null; }
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
  if (!S._merchReg) { S._merchReg = { categories: [] }; api("GET", "/categories").then((r) => { S._merchReg.categories = r.ok ? r.data : []; render(); }); }
  const m = S._merchReg;
  return `
    ${backRow()}
    <h1 class="screen-title">سجّل كتاجر</h1>
    <p class="screen-sub">بيصير حسابك تاجر بعد موافقة الأدمن</p>
    <div class="field"><label>اسم المحل</label><input id="mr-name" placeholder="اسم محلك" value="${esc(m.name || "")}" /></div>
    <div class="section-title" style="margin-top:6px">التصنيف</div>
    <div class="chip-row" style="overflow-x:auto;flex-wrap:nowrap">
      ${flattenCategories(m.categories).map((c) => `<button class="chip ${m.selectedCat === c.id ? "active" : ""}" onclick="selectMerchCategory('${c.id}')">${esc(c.name)}</button>`).join("")}
    </div>
    <div class="field"><label>العنوان (اختياري)</label><input id="mr-address" placeholder="العنوان" value="${esc(m.address || "")}" /></div>
    <div class="field"><label>الهاتف (اختياري)</label><input id="mr-phone" placeholder="رقم الهاتف" value="${esc(m.phone || "")}" /></div>
    ${errorBanner()}
    <button class="btn" ${S.busy ? "disabled" : ""} onclick="submitMerchantRegister()">سجّل</button>
  `;
}

function snapshotMerchRegDraft() {
  const m = S._merchReg;
  m.name = qs("mr-name") ? qs("mr-name").value : m.name;
  m.address = qs("mr-address") ? qs("mr-address").value : m.address;
  m.phone = qs("mr-phone") ? qs("mr-phone").value : m.phone;
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
  S.busy = true; render();
  const { ok, data } = await api("POST", "/merchant/register", { businessName, categoryId, address: address || undefined, phone: phone || undefined });
  S.busy = false;
  if (ok) {
    S.role = "MERCHANT";
    localStorage.setItem("dlk_role", "MERCHANT");
    S._merchReg = null;
    back();
  } else {
    S.error = errMsg(data, "تعذّر تسجيل حساب التاجر");
    render();
  }
}

/* ================= MERCHANT MODE SHELL ================= */

const MERCHANT_TABS = [
  { id: "redeem", label: "تأكيد حسم", icon: "scan" },
  { id: "orders", label: "طلبات واردة", icon: "orders" },
  { id: "catalog", label: "الكتالوج", icon: "box" },
];

function screenMerchantModeShell() {
  const body = { redeem: tabRedeem, orders: tabMerchantOrders, catalog: tabCatalog }[S.merchantTab]();
  return `
    <button class="back-btn" onclick="back()">‹ رجوع لحساب الزبون</button>
    <div>${body}</div>
    <div class="tabbar">
      ${MERCHANT_TABS.map((t) => `
        <button class="${S.merchantTab === t.id ? "active" : ""}" onclick="setMerchantTab('${t.id}')">
          ${ICON[t.icon]}<span>${esc(t.label)}</span>
        </button>`).join("")}
    </div>
  `;
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
  const billAmountCents = Math.round(parseFloat(billText.replace(",", ".")) * 100);
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
  const commissionValue = parseInt(qs("aff-value").value, 10);
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
  const percent = parseInt(percentText, 10);
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
  const catsRes = await api("GET", "/categories");
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
  const priceCents = Math.round(parseFloat(p.price.replace(",", ".")) * 100);
  const stock = parseInt(p.stock, 10);
  const sku = p.sku.trim();
  if (!name || !priceCents || priceCents <= 0 || isNaN(stock) || stock < 0) { S.error = "تأكد من اسم المنتج والسعر والمخزون"; return render(); }
  let memberPriceCents = null;
  if (p.memberDiscountEnabled) {
    memberPriceCents = Math.round(parseFloat((p.memberPrice || "").replace(",", ".")) * 100);
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
  qs("tp-ref-label").textContent = usdt ? "رقم التحويل (txid — 64 خانة)" : "رقم العملية";
  if (usdt) {
    qs("tp-hint").innerHTML = `حوّل USDT عبر شبكة <b>TRC20</b> لهالعنوان، وبعدين الصق الـ txid — بنتحقق من الشبكة تلقائيًا وبينضاف الرصيد فورًا:<br><b style="direction:ltr;display:block;overflow-wrap:anywhere;user-select:all">${esc(m.usdtTrc20Address)}</b>`;
  } else {
    const l = (m.localWallets || []).find((x) => x.key === sel.value);
    qs("tp-hint").innerHTML = l ? `حوّل لحساب <b style="user-select:all">${esc(l.accountNumber)}</b>${l.instructions ? " — " + esc(l.instructions) : ""}<br>بعد التحويل دخّل رقم العملية والمبلغ، والإدارة بتأكد وبيضاف رصيدك.` : "";
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
  const amount = parseFloat(amountText);
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
  const [st, ch, cn, ru, ib] = await Promise.all([
    api("GET", "/responder/status"), api("GET", "/responder/channels"), api("GET", "/responder/connections"),
    api("GET", "/responder/rules"), api("GET", "/responder/inbox"),
  ]);
  const tab = (S._resp && S._resp.tab) || "overview";
  const keep = S._resp || {};
  S._resp = { loading: false, tab, ruleDraft: keep.ruleDraft, posts: keep.posts, selectedPosts: keep.selectedPosts, postsError: keep.postsError, status: st.ok ? st.data : null, channels: ch.ok ? ch.data : [], connections: cn.ok ? cn.data : [], rules: ru.ok ? ru.data : [], inbox: ib.ok ? ib.data : [] };
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
  return `
    <div class="card">
      <div class="title-line"><strong>حالة الخدمة</strong>${respStatusBadge(st.status)}</div>
      <p class="muted" style="margin-top:6px">${esc(endInfo)}</p>
      ${st.status === "EXPIRED" ? `<div class="error-banner">خلصت المدة — الردود الآلية موقوفة. ادفع لتكمل الخدمة.</div>` : ""}
      <p class="muted">رصيدك: <b>${st.balance}</b> ${esc(st.creditName)} · ردود AI هالفترة: ${st.aiRepliesUsed}/${st.aiReplyLimit}</p>
      ${errorBanner()}
      ${!st.running && st.trialAvailable ? `<button class="btn" onclick="respActivate()">ابدأ التجربة المجانية (${st.trialDays} يوم)</button>` : ""}
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
  await api("PATCH", "/responder/profile", { businessDescription: qs("rp-desc").value.trim(), tone: qs("rp-tone").value.trim() });
  loadResponder();
}

function respChannels() {
  const r = S._resp;
  return `
    ${errorBanner()}
    <div class="section-title" style="margin-top:0">القنوات المتاحة</div>
    ${r.channels.map((c) => `
      <div class="card">
        <div class="title-line"><strong>${esc(c.name)}</strong>${c.connectable ? "" : `<span class="badge neutral">قريبًا</span>`}</div>
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
  if (S.screen === "home" && S.homeTab === "discover" && S._discover && S._discover.view === "map") {
    renderDiscoverMap();
  }
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

bootReferralCapture().then((handled) => {
  if (!handled) render();
});

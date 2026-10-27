
const state = {
  token: localStorage.getItem('admin_token'),
  categoriesFlat: [],
};

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function errText(d, f) { const e = d && d.error; if (!e) return f; if (typeof e === 'string') return e; const fe = Object.values((e.details && e.details.fieldErrors) || {}).flat()[0]; return fe || e.message || f; }
function money(cents) { return (cents / 100).toFixed(2); }

// ---- auth ----
async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');
  errorBox.style.display = 'none';

  const { ok, data } = await api('POST', '/auth/login', { email, password });
  if (!ok) {
    errorBox.textContent = 'بيانات الدخول غير صحيحة';
    errorBox.style.display = 'block';
    return;
  }
  if (data.user.role !== 'ADMIN') {
    errorBox.textContent = 'هذا الحساب ليس حساب أدمن';
    errorBox.style.display = 'block';
    return;
  }
  state.token = data.token;
  localStorage.setItem('admin_token', data.token);
  enterApp();
}

async function changePassword() {
  const currentPassword = prompt('كلمة السر الحالية؟');
  if (!currentPassword) return;
  const newPassword = prompt('كلمة السر الجديدة (12 خانة على الأقل)؟');
  if (!newPassword) return;
  if (newPassword.length < 12) { alert('كلمة السر الجديدة لازم تكون 12 خانة على الأقل'); return; }
  const { ok, data } = await api('POST', '/auth/change-password', { currentPassword, newPassword });
  if (!ok) { alert(errText(data, 'تعذّر تغيير كلمة السر')); return; }
  state.token = data.token;
  localStorage.setItem('admin_token', data.token);
  alert('تم تغيير كلمة السر ✅');
}

function logout() {
  state.token = null;
  localStorage.removeItem('admin_token');
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
}

function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('active');
  document.getElementById('today').textContent = new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  showSection('home');
  loadHome();
  startHomeTimer();
  loadMerchants('');
  loadCategories();
  loadPlans();
  loadResponderAdmin();
  loadPushStatus();
  loadBroadcasts();
  geoInit();
  loadAiStatus();
  loadTopups('PENDING');
  refreshSugBadge();
  refreshProductReviewBadge();
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
  document.getElementById('section-' + name).style.display = 'block';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === name));
  const nav = document.querySelector('.nav-item[data-section="' + name + '"] .nt');
  document.getElementById('crumb').textContent = nav ? nav.textContent.trim() : '';
  toggleMenu(false);
  window.scrollTo({ top: 0 });
}

// ---- Home page: numbers and what is waiting ----
const HOME_WAIT = [
  ['merchants', '🏪', 'طلبات أصحاب الأنشطة', 'merchants', "loadMerchants('PENDING')"],
  ['discounts', '🏷️', 'حسومات بانتظار الموافقة', 'discounts', 'loadDiscounts()'],
  ['products', '🛡️', 'منتجات بانتظار المراجعة', 'prodreview', 'loadProductReview()'],
  ['ads', '📢', 'طلبات إعلانات المتجر', 'ads', 'loadAds()'],
  ['topups', '💰', 'طلبات إيداع الرصيد', 'topups', "loadTopups('PENDING')"],
  ['suggestions', '💡', 'اقتراحات مهن', 'suggestions', 'loadSuggestions()'],
  ['marketers', '📣', 'طلبات مسوّقين', 'marketers', 'loadMarketers()'],
  ['broadcasts', '🔔', 'إعلانات بانتظار المراجعة', 'broadcasts', 'loadBroadcasts()'],
  ['landmarks', '📍', 'معالم بانتظار المراجعة', 'landmarks', 'lmOpen()'],
  ['landmarkClaims', '📨', 'طلبات مطالبة بأماكن', 'landmarks', 'lmOpen()'],
];
const HOME_QUICK = [
  ['👥', 'المستخدمون', 'users'], ['🗂️', 'التصنيفات', 'categories'], ['💳', 'الباقات والأسعار', 'plans'], ['🛍️', 'المتجر', 'store'],
  ['📱', 'تحميل التطبيق', 'appfile'], ['🔗', 'روابط التواصل', 'social'], ['🔔', 'الإشعارات', 'push'], ['🧠', 'الذكاء الاصطناعي', 'ai'],
];
const ORDER_STATUS = {
  PENDING: ['جديد', '#e0a100'], CONFIRMED: ['مؤكّد', '#1b5fa6'], PREPARING: ['قيد التجهيز', '#8e44ad'],
  SHIPPED: ['تم الشحن', '#0e8f87'], DELIVERED: ['مُسلَّم', '#1e7e34'], CANCELLED: ['ملغي', '#b71c1c'],
};
let homeTimer = null;

function gotoSection(name) { const el = document.querySelector('.nav-item[data-section="' + name + '"]'); if (el) el.click(); }
const fmt = (n) => Number(n || 0).toLocaleString('en');
const fmtMoney = (cents) => Number((cents || 0) / 100).toLocaleString('en', { maximumFractionDigits: 2 });

function trendHtml(t) {
  if (t === null || t === undefined) return '<span class="trend up">جديد</span>';
  if (t > 0) return `<span class="trend up">▲ ${t}%</span>`;
  if (t < 0) return `<span class="trend down">▼ ${Math.abs(t)}%</span>`;
  return '<span class="trend flat">ثابت</span>';
}

function sparkSvg(points, color) {
  const max = Math.max(1, ...points.map(p => p.count)), W = 120, H = 38, n = points.length;
  const xy = points.map((p, i) => [(i / (n - 1)) * W, H - 3 - (p.count / max) * (H - 8)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${line} L${W} ${H} L0 ${H} Z" fill="${color}" opacity=".12"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function kpiHtml(cls, icon, label, value, sub, points, color) {
  return `<div class="kpi ${cls}"><div class="top"><span class="lbl">${label}</span><span class="ico">${icon}</span></div><div class="val">${value}</div><div class="sub">${sub}</div>${points ? sparkSvg(points, color) : ''}</div>`;
}

function areaChart(points, color, gid) {
  const W = 620, H = 190, L = 34, B = 8, T = 10, R = 6;
  const rawMax = Math.max(...points.map(p => p.count));
  const step = rawMax <= 4 ? 1 : Math.pow(10, Math.floor(Math.log10(rawMax / 3)));
  const niceMax = Math.max(4, Math.ceil(rawMax / (step * 4)) * step * 4);
  const n = points.length, iw = W - L - R, ih = H - T - B;
  const x = (i) => L + (i / (n - 1)) * iw, y = (v) => T + ih - (v / niceMax) * ih;
  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const v = (niceMax / 4) * g, yy = y(v);
    grid += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#efe6e3" stroke-width="1"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#a89a97">${fmt(Math.round(v))}</text>`;
  }
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.count).toFixed(1)).join(' ');
  const area = `${line} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const dots = points.map((p, i) => `<g><rect x="${x(i) - iw / n / 2}" y="${T}" width="${iw / n}" height="${ih}" fill="transparent"><title>${p.day.slice(5).replace('-', '/')} — ${fmt(p.count)}</title></rect>${p.count ? `<circle cx="${x(i)}" cy="${y(p.count)}" r="2.6" fill="${color}"/>` : ''}</g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="g${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#g${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

function chartCard(title, points, color, gid) {
  const sum = points.reduce((a, p) => a + p.count, 0);
  const d = (i) => { const [, m, dd] = points[i].day.split('-'); return dd + '/' + m; };
  return `<div class="card chart-card"><div class="head"><h3>${title}</h3><span class="big">${fmt(sum)}</span></div><div class="cap">المجموع خلال 30 يوم</div>${areaChart(points, color, gid)}<div class="x-axis"><span>${d(0)}</span><span>${d(10)}</span><span>${d(20)}</span><span>${d(29)}</span></div></div>`;
}

function barList(rows, valueKey, empty) {
  if (!rows.length) return `<div class="empty-note">${empty}</div>`;
  const max = Math.max(1, ...rows.map(r => r[valueKey]));
  return rows.map(r => `<div class="bar-row"><span class="name" title="${esc(r.name)}">${esc(r.name)}</span><span class="track"><span class="fill" style="display:block;width:${Math.max(4, (r[valueKey] / max) * 100)}%"></span></span><span class="num">${fmt(r[valueKey])}</span></div>`).join('');
}

function splitHtml(parts, empty) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return `<div class="empty-note">${empty}</div>`;
  return `<div class="split">${parts.filter(p => p.v).map(p => `<i style="width:${(p.v / total) * 100}%;background:${p.c}" title="${p.l}: ${fmt(p.v)}"></i>`).join('')}</div><div class="legend">${parts.map(p => `<span><em style="background:${p.c}"></em>${p.l} <b>${fmt(p.v)}</b></span>`).join('')}</div>`;
}

function renderHome(d) {
  const hour = new Date().getHours();
  document.getElementById('home-greet').textContent = (hour < 12 ? 'صباح الخير' : hour < 18 ? 'مرحبًا' : 'مساء الخير') + ' 👋';
  document.getElementById('home-updated').textContent = 'تحديث · ' + new Date(d.generatedAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });

  const totalWaiting = HOME_WAIT.reduce((a, w) => a + (d.waiting[w[0]] || 0), 0);
  document.getElementById('home-ai').innerHTML = !d.ai.available
    ? '<div class="error-banner">⚠️ الذكاء الاصطناعي غير مفعّل على السيرفر، فكل نشاط جديد وكل منتج بينتظر موافقتك يدويًا. فعّل مفتاح مزوّد (مثل Groq أو Gemini) من إعدادات السيرفر ليقرأهم لحاله.</div>'
    : (!d.ai.vision ? '<div class="error-banner" style="background:#fff3cd;color:#8a6300">ℹ️ الذكاء الاصطناعي شغّال لكنه بيقرأ الكلام بس، ما بيشوف الصور. للتأكد من صور المنتجات فعّل مزوّد بيشوف الصور (مثل Gemini).</div>' : '');
  document.getElementById('home-waiting').innerHTML = HOME_WAIT.map(([key, icon, label, section, loader]) => {
    const n = d.waiting[key] || 0;
    return `<button class="wait-tile ${n ? 'has' : ''}" onclick="gotoSection('${section}')"><span class="n">${fmt(n)}</span><span class="l">${icon} ${label}<small>${n ? 'اضغط للمراجعة' : 'ما في شي'}</small></span></button>`;
  }).join('') + (totalWaiting === 0 ? '<div class="all-clear">✅ كل شي منجز، ما في شي ينتظرك الآن.</div>' : '');

  const u = d.users, m = d.merchants, ds = d.discounts, o = d.orders;
  document.getElementById('home-kpis').innerHTML = [
    kpiHtml('c1', '👥', 'المستخدمون', fmt(u.total), `${trendHtml(u.trend)} <span>+${fmt(u.last30)} آخر 30 يوم</span>`, d.series.users, '#ba2a34'),
    kpiHtml('c2', '🏪', 'الأنشطة المعتمدة', fmt(m.approved), `${trendHtml(m.trend)} <span>${fmt(m.pending)} بانتظار الموافقة</span>`, d.series.merchants, '#1b5fa6'),
    kpiHtml('c3', '🏷️', 'عمليات الحسم', fmt(ds.redemptions), `${trendHtml(ds.trend)} <span>${fmt(ds.last30)} آخر 30 يوم</span>`, d.series.discounts, '#1e7e34'),
    kpiHtml('c4', '🧾', 'طلبات المتجر', fmt(o.total), `${trendHtml(o.trend)} <span>${fmt(o.last30)} آخر 30 يوم</span>`, d.series.orders, '#c58a00'),
    kpiHtml('c5', '💳', 'عضويات فعّالة', fmt(d.memberships.active), `<span>+${fmt(d.memberships.last30)} آخر 30 يوم</span>`, null),
    kpiHtml('c6', '💸', 'المبلغ الموفَّر للأعضاء', fmtMoney(ds.savedCents30), `<span>آخر 30 يوم · الإجمالي ${fmtMoney(ds.savedCentsAll)}</span>`, null),
    kpiHtml('c4', '🛒', 'مبيعات المتجر', fmtMoney(o.salesCents30), `<span>آخر 30 يوم (بدون الملغي)</span>`, null),
    kpiHtml('c2', '📦', 'منتجات معروضة', fmt(d.products.approved), `<span>${fmt(d.products.pending)} بانتظار المراجعة</span>`, null),
  ].join('');

  document.getElementById('home-charts').innerHTML =
    chartCard('مستخدمون جدد', d.series.users, '#ba2a34', 'u') + chartCard('عمليات الحسم', d.series.discounts, '#1e7e34', 'd') +
    chartCard('أنشطة جديدة', d.series.merchants, '#1b5fa6', 'm') + chartCard('طلبات المتجر', d.series.orders, '#c58a00', 'o');

  document.getElementById('home-people').innerHTML = splitHtml([
    { l: 'زبائن', v: u.customers, c: '#ba2a34' }, { l: 'أصحاب أنشطة', v: u.merchants, c: '#1b5fa6' }, { l: 'أدمن', v: u.admins, c: '#8a7b78' },
  ], 'ما في مستخدمين بعد') + `<div class="legend" style="margin-top:12px"><span>📧 إيميل موثّق <b>${fmt(u.verified)}</b></span><span>📱 أجهزة بإشعارات <b>${fmt(u.devices)}</b></span><span>🆕 آخر 7 أيام <b>${fmt(u.last7)}</b></span></div>`;
  document.getElementById('home-orders').innerHTML = splitHtml(Object.entries(ORDER_STATUS).map(([k, [l, c]]) => ({ l, v: o.byStatus[k] || 0, c })), 'ما في طلبات بعد');
  document.getElementById('home-cats').innerHTML = barList(d.topCategories, 'count', 'ما في أنشطة معتمدة بعد');
  document.getElementById('home-shops').innerHTML = barList(d.topShops, 'count', 'ما في عمليات حسم بآخر 30 يوم');
  document.getElementById('home-quick').innerHTML = HOME_QUICK.map(([i, l, s]) => `<button onclick="gotoSection('${s}')"><span>${i}</span>${l}</button>`).join('');
}

async function loadHome(manual) {
  const btn = document.getElementById('home-refresh');
  if (manual && btn) btn.classList.add('spin');
  const r = await api('GET', '/admin/overview');
  if (btn) btn.classList.remove('spin');
  if (!r.ok) {
    document.getElementById('home-waiting').innerHTML = `<div class="error-banner" style="grid-column:1/-1">${esc(errText(r.data, 'تعذّر تحميل الأرقام'))}</div>`;
    return;
  }
  renderHome(r.data);
}

// the home page refreshes itself every minute while it is the page on screen
function startHomeTimer() {
  clearInterval(homeTimer);
  homeTimer = setInterval(() => { const el = document.getElementById('section-home'); if (el && el.style.display !== 'none' && !document.hidden) loadHome(false); }, 60000);
}

function toggleMenu(open) { document.getElementById('app').classList.toggle('menu-open', open); }


// ---- The Android app as a file on the website ----
// "A new version is out" message inside the app
async function loadAppUpdate() {
  const box = document.getElementById('appupdate-card');
  const r = await api('GET', '/admin/app-update');
  if (!r.ok) { box.textContent = errText(r.data, 'تعذّر التحميل'); return; }
  box.innerHTML = `
    <h3>🔔 رسالة «نسخة جديدة» داخل التطبيق</h3>
    <p class="muted">بتظهر لكل شخص نسخته أقدم من الرقم اللي بتكتبه، وفيها زر «حدّث الآن». اللي نزّل من جوجل بلاي بيروح لصفحة التطبيق هناك، واللي نزّل الملف مباشرة بيروح لصفحة التحميل. <b>شغّلها بعد ما جوجل توافق على النسخة</b> عشان ما نرسل الناس لتحديث مو موجود.</p>
    <div class="grid2">
      <div class="field"><label>آخر نسخة متاحة (مثلًا 0.1.6)</label><input id="upd-version" dir="ltr" placeholder="0.1.6" value="${esc(r.data.version || '')}"></div>
    </div>
    <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="upd-notify" ${r.data.notify ? 'checked' : ''} style="width:20px;height:20px"> <span>أظهر الرسالة للمستخدمين</span></label>
    <div style="margin-top:12px"><button onclick="saveAppUpdate()">حفظ</button> <span id="upd-msg" class="muted"></span></div>`;
}
async function saveAppUpdate() {
  const msg = document.getElementById('upd-msg');
  const r = await api('PUT', '/admin/app-update', { version: document.getElementById('upd-version').value.trim(), notify: document.getElementById('upd-notify').checked });
  msg.textContent = r.ok ? 'انحفظ ✅' : errText(r.data, 'فشل الحفظ');
  if (r.ok) loadAppUpdate();
}

async function loadAppDownload() {
  loadAppUpdate();
  const box = document.getElementById('appfile-card');
  const r = await api('GET', '/admin/app-download');
  if (!r.ok) { box.textContent = errText(r.data, 'تعذّر التحميل'); return; }
  const d = r.data;
  const when = d.uploadedAt ? new Date(d.uploadedAt).toLocaleString('ar') : '';
  box.innerHTML = `
    <p><b>الملف الحالي:</b> ${d.hasFile ? `النسخة <b>${esc(d.version)}</b> · ${(d.sizeBytes / 1048576).toFixed(1)} MB · انرفع ${esc(when)}<br><span class="muted" dir="ltr" style="word-break:break-all">SHA-256: ${esc(d.sha256)}</span>` : 'ما في ملف مرفوع بعد'}</p>
    <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="app-visible" ${d.visible ? 'checked' : ''} ${d.hasFile ? '' : 'disabled'} onchange="setAppVisible(this.checked)" style="width:20px;height:20px"> <span>إظهار رابط التحميل على الموقع</span></label>
    <hr style="margin:16px 0;border:0;border-top:1px solid #ead9d6">
    <h3>رفع نسخة جديدة</h3>
    <div class="grid2">
      <div class="field"><label>رقم النسخة (مثلًا 0.1.3)</label><input id="app-version" dir="ltr" placeholder="0.1.3"></div>
      <div class="field"><label>ملف التطبيق (.apk)</label><input id="app-file" type="file" accept=".apk,application/vnd.android.package-archive"></div>
    </div>
    <button onclick="uploadAppFile()" id="app-upload-btn">رفع الملف</button> <span id="app-msg" class="muted"></span>
    <div id="app-progress" style="display:none;margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px"><b id="app-pct">0%</b><span id="app-sizes" class="muted" dir="ltr"></span></div>
      <div style="height:16px;background:#efe3e1;border-radius:999px;overflow:hidden"><div id="app-bar" style="height:100%;width:0;background:#ba2a34;border-radius:999px;transition:width .2s"></div></div>
    </div>
    <p class="subtitle">الملف الجديد بيحل مكان القديم فورًا. الحجم الأقصى 80 ميغا.</p>`;
}
function uploadAppFile() {
  const msg = document.getElementById('app-msg');
  const btn = document.getElementById('app-upload-btn');
  const file = document.getElementById('app-file').files[0];
  const version = document.getElementById('app-version').value.trim();
  if (!version) { msg.textContent = 'اكتب رقم النسخة أول'; return; }
  if (!file) { msg.textContent = 'اختر ملف التطبيق أول'; return; }
  const box = document.getElementById('app-progress');
  const bar = document.getElementById('app-bar');
  const pct = document.getElementById('app-pct');
  const sizes = document.getElementById('app-sizes');
  const mb = (n) => (n / 1048576).toFixed(1);
  const show = (p, loaded) => { bar.style.width = p + '%'; pct.textContent = p + '%'; sizes.textContent = mb(loaded) + ' / ' + mb(file.size) + ' MB'; };
  btn.disabled = true;
  box.style.display = 'block';
  show(0, 0);
  msg.textContent = 'عم يرفع… ما تسكّر الصفحة';
  const fail = (text) => { msg.textContent = text; btn.disabled = false; box.style.display = 'none'; };
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', '/admin/app-download/file?version=' + encodeURIComponent(version));
  xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const p = Math.min(100, Math.round((e.loaded / e.total) * 100));
    show(p, e.loaded);
    if (p >= 100) msg.textContent = 'وصل الملف، عم يتحقق منه ويحفظه…';
  };
  xhr.onerror = () => fail('انقطع الاتصال أثناء الرفع، جرّب من جديد');
  xhr.ontimeout = () => fail('أخذ وقت طويل، جرّب من جديد');
  xhr.onload = async () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch (e) {}
    if (xhr.status < 200 || xhr.status >= 300) return fail(errText(data, 'فشل الرفع'));
    await loadAppDownload();
    const done = document.getElementById('app-msg');
    if (done) done.textContent = 'انرفع ✅ — فعّل «إظهار» ليبين الرابط للناس';
  };
  xhr.send(file);
}
async function setAppVisible(visible) {
  const r = await api('PUT', '/admin/app-download/visible', { visible });
  if (!r.ok) { alert(errText(r.data, 'فشل')); }
  loadAppDownload();
}

// ---- Social media links ----
const SOCIAL_NAMES = { facebook: 'فيسبوك', instagram: 'إنستغرام', youtube: 'يوتيوب', tiktok: 'تيك توك', googleplay: 'جوجل بلاي (تحميل التطبيق)' };
const SOCIAL_HINTS = { facebook: 'https://www.facebook.com/اسم_الصفحة', instagram: 'https://www.instagram.com/اسم_الحساب', youtube: 'https://www.youtube.com/@اسم_القناة', tiktok: 'https://www.tiktok.com/@اسم_الحساب', googleplay: 'https://play.google.com/store/apps/details?id=...' };
async function loadSocialLinks() {
  const box = document.getElementById('social-card');
  const r = await api('GET', '/admin/social-links');
  if (!r.ok) { box.textContent = errText(r.data, 'تعذّر التحميل'); return; }
  box.innerHTML = `
    <table><thead><tr><th>المنصة</th><th>رابط الصفحة</th><th>إظهار</th></tr></thead><tbody>
    ${r.data.links.map((l) => `<tr>
      <td><img src="/brand/social/${l.platform}.png" alt="" width="26" height="26" style="vertical-align:middle"> <b>${SOCIAL_NAMES[l.platform]}</b></td>
      <td><input id="soc-url-${l.platform}" dir="ltr" style="width:100%;min-width:260px" placeholder="${SOCIAL_HINTS[l.platform]}" value="${esc(l.url)}"></td>
      <td><label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="soc-vis-${l.platform}" ${l.visible ? 'checked' : ''} style="width:20px;height:20px"> <span>إظهار</span></label></td>
    </tr>`).join('')}
    </tbody></table>
    <button onclick="saveSocialLinks()">حفظ</button> <span id="social-msg" class="muted"></span>`;
}
async function saveSocialLinks() {
  const msg = document.getElementById('social-msg');
  const links = Object.keys(SOCIAL_NAMES).map((p) => ({ platform: p, url: document.getElementById('soc-url-' + p).value.trim(), visible: document.getElementById('soc-vis-' + p).checked }));
  const r = await api('PUT', '/admin/social-links', { links });
  msg.textContent = r.ok ? 'انحفظ ✅' : errText(r.data, 'فشل الحفظ');
  if (r.ok) loadSocialLinks();
}

// ---- Launch reset ----
let launchInfo = null;
async function loadLaunchReset() {
  const box = document.getElementById('launch-card');
  const r = await api('GET', '/admin/launch-reset');
  if (!r.ok) { box.textContent = errText(r.data, 'تعذّر التحميل'); return; }
  launchInfo = r.data;
  const d = r.data;
  box.innerHTML = `
    <p><b>الحسابات اللي رح تبقى:</b> ${d.keptAdmins.map((a) => esc(a.email)).join('، ') || '—'}</p>
    <p><b>عدد المستخدمين الحاليين:</b> ${d.users}</p>
    <p><b>اللي رح يُمسح:</b></p>
    <table><thead><tr><th>الجدول</th><th>الصفوف</th></tr></thead><tbody>${d.willBeRemoved.map((x) => `<tr><td>${esc(x.table)}</td><td>${x.rows}</td></tr>`).join('') || '<tr><td colspan="2">لا شي</td></tr>'}</tbody></table>
    <p class="subtitle">تأكد من أخذ نسخة احتياطية من قاعدة البيانات (Neon) قبل ما تكمل.</p>
    ${d.enabled ? `
      <div class="field"><label>اكتب الجملة: <b>${esc(d.phrase)}</b></label><input placeholder="اكتب العبارة المطلوبة حرفيًا" id="launch-phrase" autocomplete="off"></div>
      <div class="field"><label>كلمة سر السوبر أدمن</label><input placeholder="كلمة سر الأدمن" id="launch-pass" type="password" autocomplete="current-password"></div>
      <button class="danger" onclick="runLaunchReset()">مسح كل شي والبدء من الصفر</button>
      <div id="launch-msg" class="subtitle"></div>` : `<div class="card" style="background:#fff8e1">التصفير مقفول. لتفتحه: بـ Render ضيف المتغير <b>ALLOW_DATA_RESET</b> بقيمة <b>yes</b> للخدمة، وانتظر الإعادة. وبعد ما تخلص احذفه.</div>`}`;
}
async function runLaunchReset() {
  const msg = document.getElementById('launch-msg');
  if (!confirm('متأكد؟ هاد المسح نهائي وما في رجعة.')) return;
  const r = await api('POST', '/admin/launch-reset', { phrase: document.getElementById('launch-phrase').value, password: document.getElementById('launch-pass').value });
  msg.textContent = r.ok ? `تم. بقي ${r.data.usersLeft} حساب (السوبر أدمن). حدّث الصفحة.` : errText(r.data, 'فشل');
  if (r.ok) loadLaunchReset();
}

// ---- Marketers ----
let marketersList = [];
let editingMarketerId = null;
const numOrNull = (id) => { const v = document.getElementById(id).value.trim(); return v === '' ? null : Number(v); };

function mkKindChanged() {
  const manager = document.getElementById('mk-kind').value === 'MANAGER';
  document.getElementById('mk-parent-wrap').style.display = manager ? 'none' : '';
  document.getElementById('mk-tpct-wrap').style.display = manager ? '' : 'none';
  document.getElementById('mk-tfix-wrap').style.display = manager ? '' : 'none';
}

function resetMarketerForm() {
  editingMarketerId = null;
  ['mk-email', 'mk-pct', 'mk-fix', 'mk-tpct', 'mk-tfix'].forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('mk-email').disabled = false;
  document.getElementById('mk-kind').value = 'MARKETER';
  document.getElementById('mk-channel').value = 'ELECTRONIC';
  document.getElementById('mk-form-title').textContent = 'إضافة مسوّق أو مدير تسويق';
  mkKindChanged();
}

async function loadMarketerRequests() {
  const { ok, data } = await api('GET', '/admin/marketer-requests?status=PENDING');
  const list = ok ? data.requests : [];
  document.getElementById('mkreq-card').style.display = list.length ? '' : 'none';
  document.getElementById('mkreq-body').innerHTML = list.map(r => `
    <tr>
      <td>${esc(r.name)}<br><small class="muted" style="direction:ltr">${esc(r.email)}</small></td>
      <td>${r.channel === 'FIELD' ? 'ميداني' : 'إلكتروني'}</td>
      <td style="direction:ltr;text-align:right">${esc(r.phone || '—')}</td>
      <td>${esc(r.note || '—')}</td>
      <td style="white-space:nowrap"><button class="small" onclick="decideMarketerRequest('${esc(r.id)}', true)">قبول</button> <button class="small" style="background:#777" onclick="decideMarketerRequest('${esc(r.id)}', false)">رفض</button></td>
    </tr>`).join('');
}

async function decideMarketerRequest(id, approve) {
  const { ok, data } = await api('POST', '/admin/marketer-requests/' + id + (approve ? '/approve' : '/reject'), {});
  if (!ok) document.getElementById('mk-msg').textContent = errText(data, 'تعذّر الحفظ');
  loadMarketers();
}

async function loadMarketers() {
  loadMarketerRequests();
  const [s, m] = await Promise.all([api('GET', '/admin/settings'), api('GET', '/admin/marketers')]);
  if (s.ok) {
    const r = s.data.referral || {};
    document.getElementById('ref-mpct').value = r.marketerPercent ?? 0;
    document.getElementById('ref-mfix').value = r.marketerSignupCredits ?? 0;
    document.getElementById('ref-gpct').value = r.managerPercent ?? 0;
    document.getElementById('ref-gfix').value = r.managerSignupCredits ?? 0;
  }
  marketersList = m.ok ? m.data.marketers : [];
  const managers = marketersList.filter((x) => x.kind === 'MANAGER' && x.isActive);
  document.getElementById('mk-parent').innerHTML = '<option value="">بلا مدير</option>' + managers.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  const val = (v, suffix) => (v == null ? 'العام' : v + suffix);
  document.getElementById('mk-body').innerHTML = marketersList.length ? marketersList.map((x) => `
    <tr>
      <td>${esc(x.name)}<br><small class="muted" style="direction:ltr">${esc(x.email)}</small></td>
      <td>${x.kind === 'MANAGER' ? 'مدير تسويق' : 'مسوّق'}</td>
      <td>${x.channel === 'FIELD' ? 'ميداني' : 'إلكتروني'}</td>
      <td style="direction:ltr;text-align:right"><b>${esc(x.code)}</b></td>
      <td>${esc(x.parentName || '—')}</td>
      <td><small>نسبة: ${val(x.percent, '%')} / مبلغ: ${val(x.signupCredits, '')}${x.kind === 'MANAGER' ? `<br>على فريقه — نسبة: ${val(x.teamPercent, '%')} / مبلغ: ${val(x.teamSignupCredits, '')}` : ''}</small></td>
      <td>${x.people}</td>
      <td>${x.earned}</td>
      <td style="white-space:nowrap"><button class="small" onclick="copyMarketerLink('${esc(x.id)}')">نسخ الرابط</button> <button class="small" onclick="editMarketer('${esc(x.id)}')">✏️</button> <button class="small" style="${x.isActive ? 'background:#777' : ''}" onclick="toggleMarketer('${esc(x.id)}', ${!x.isActive})">${x.isActive ? 'تعطيل' : 'تفعيل'}</button></td>
    </tr>`).join('') : '<tr><td colspan="9" class="muted">ما في مسوّقين بعد</td></tr>';
  mkKindChanged();
}

async function saveReferralDefaults() {
  const num = (id) => Number(document.getElementById(id).value) || 0;
  const { ok, data } = await api('PUT', '/admin/settings', { referral: { marketerPercent: num('ref-mpct'), marketerSignupCredits: Math.round(num('ref-mfix')), managerPercent: num('ref-gpct'), managerSignupCredits: Math.round(num('ref-gfix')) } });
  document.getElementById('ref-defaults-msg').textContent = ok ? 'انحفظ ✓' : errText(data, 'تعذّر الحفظ');
}

async function saveMarketer() {
  const msg = document.getElementById('mk-msg');
  const manager = document.getElementById('mk-kind').value === 'MANAGER';
  const body = { kind: document.getElementById('mk-kind').value, channel: document.getElementById('mk-channel').value, percent: numOrNull('mk-pct'), signupCredits: numOrNull('mk-fix') };
  if (manager) { body.teamPercent = numOrNull('mk-tpct'); body.teamSignupCredits = numOrNull('mk-tfix'); body.parentId = null; }
  else body.parentId = document.getElementById('mk-parent').value || null;
  let res;
  if (editingMarketerId) res = await api('PATCH', '/admin/marketers/' + editingMarketerId, body);
  else {
    body.email = document.getElementById('mk-email').value.trim();
    res = await api('POST', '/admin/marketers', body);
  }
  if (!res.ok) { msg.textContent = errText(res.data, 'تعذّر الحفظ'); return; }
  msg.textContent = 'انحفظ ✓';
  resetMarketerForm();
  loadMarketers();
}

function editMarketer(id) {
  const x = marketersList.find((m) => m.id === id);
  if (!x) return;
  editingMarketerId = id;
  document.getElementById('mk-email').value = x.email;
  document.getElementById('mk-email').disabled = true;
  document.getElementById('mk-kind').value = x.kind;
  document.getElementById('mk-channel').value = x.channel || 'ELECTRONIC';
  document.getElementById('mk-parent').value = x.parentId || '';
  document.getElementById('mk-pct').value = x.percent ?? '';
  document.getElementById('mk-fix').value = x.signupCredits ?? '';
  document.getElementById('mk-tpct').value = x.teamPercent ?? '';
  document.getElementById('mk-tfix').value = x.teamSignupCredits ?? '';
  document.getElementById('mk-form-title').textContent = 'تعديل: ' + x.name;
  mkKindChanged();
  document.getElementById('mk-form-title').scrollIntoView({ behavior: 'smooth' });
}

async function toggleMarketer(id, isActive) {
  const { ok, data } = await api('PATCH', '/admin/marketers/' + id, { isActive });
  if (!ok) document.getElementById('mk-msg').textContent = errText(data, 'تعذّر الحفظ');
  loadMarketers();
}

function copyMarketerLink(id) {
  const x = marketersList.find((m) => m.id === id);
  if (x && navigator.clipboard) navigator.clipboard.writeText(x.link).then(() => { document.getElementById('mk-msg').textContent = 'اننسخ الرابط ✓'; });
}

// ---- Users ----
const ROLE_LABEL = { ADMIN: 'أدمن', MERCHANT: 'صاحب نشاط', CUSTOMER: 'زبون' };

const PAGE_SIZE = 50;
/** "‹ previous · page 2 of 6 · next ›" under a list; [go] is the name of the function that shows a page. */
function pagerHtml(go, page, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return `<span class="muted">العدد: ${total}</span>`;
  const from = (page - 1) * PAGE_SIZE + 1, to = Math.min(total, page * PAGE_SIZE);
  return `<div class="pager"><button class="secondary small" ${page <= 1 ? 'disabled' : ''} onclick="${go}(${page - 1})">السابق ›</button><span>صفحة <b>${page}</b> من <b>${pages}</b> <span class="muted">· ${from}–${to} من ${total}</span></span><button class="secondary small" ${page >= pages ? 'disabled' : ''} onclick="${go}(${page + 1})">‹ التالي</button></div>`;
}

let usersPage = 1;
function usersGo(p) { usersPage = p; loadUsers(true); }

async function loadUsers(keepPage) {
  if (!keepPage) usersPage = 1; // a new search starts at the first page
  const body = document.getElementById('users-body');
  const msg = document.getElementById('users-msg');
  const params = new URLSearchParams();
  const q = document.getElementById('users-q').value.trim();
  const role = document.getElementById('users-role').value;
  if (q) params.set('q', q);
  if (role) params.set('role', role);
  params.set('page', usersPage);
  if (!state.myId) { const me = await api('GET', '/profile/me'); if (me.ok) state.myId = me.data.id; }
  const res = await fetch('/admin/users?' + params.toString(), { headers: { Authorization: 'Bearer ' + state.token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { body.innerHTML = ''; msg.textContent = errText(data, 'تعذّر التحميل'); return; }
  const total = Number(res.headers.get('X-Total-Count')) || data.length;
  msg.innerHTML = pagerHtml('usersGo', usersPage, total);
  body.innerHTML = data.length ? data.map((u, i) => `
    <tr>
      <td class="rownum">${(usersPage - 1) * PAGE_SIZE + i + 1}</td>
      <td>${esc(u.fullName)}</td>
      <td class="muted" style="direction:ltr;text-align:right">${esc(u.email)}${u.isEmailVerified ? '' : ' <small title="الإيميل غير مؤكَّد">⚠️</small>'}</td>
      <td class="muted" style="direction:ltr;text-align:right">${esc(u.phone || '—')}</td>
      <td><span class="badge ${u.role === 'ADMIN' ? 'APPROVED' : 'inactive'}">${esc(ROLE_LABEL[u.role] || u.role)}</span></td>
      <td><span class="badge ${u.isDisabled ? 'REJECTED' : 'active'}">${u.isDisabled ? 'معطّل' : 'فعّال'}</span></td>
      <td style="white-space:nowrap">${u.role === 'ADMIN' && u.id !== state.myId ? '<span class="muted" title="حساب أدمن محمي: بس صاحبه بيعدّل عليه">🔒 محمي</span>' : `<button class="small" onclick="openUserEdit('${esc(u.id)}')">✏️ تعديل</button> <button class="small" style="${u.isDisabled ? '' : 'background:#777'}" onclick="toggleUser('${esc(u.id)}', ${!u.isDisabled})">${u.isDisabled ? 'تفعيل' : 'تعطيل'}</button>`}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="muted">ما في نتائج</td></tr>';
}

let editingUserId = null;

async function openUserEdit(id) {
  const { ok, data } = await api('GET', '/admin/users/' + id);
  const msg = document.getElementById('users-msg');
  if (!ok) { msg.textContent = errText(data, 'تعذّر التحميل'); return; }
  editingUserId = id;
  const set = (k, v) => { document.getElementById('ue-' + k).value = v ?? ''; };
  set('name', data.fullName); set('email', data.email); set('phone', data.phone); set('role', data.role);
  set('lang', data.language || 'ar'); set('country', data.countryCode); set('vat', data.vatNumber); set('pass', ''); set('bio', data.bio);
  document.getElementById('ue-verified').checked = !!data.isEmailVerified;
  document.getElementById('ue-disabled').checked = !!data.isDisabled;
  const isAdmin = data.role === 'ADMIN';
  document.getElementById('ue-role').disabled = isAdmin;
  document.getElementById('ue-delete').style.display = isAdmin ? 'none' : '';
  const day = d => new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('ue-title').textContent = 'تعديل حساب: ' + data.fullName;
  document.getElementById('ue-info').textContent = 'انفتح الحساب ' + day(data.createdAt) + ' · رصيد المحفظة ' + data.walletBalance + ' · الطلبات ' + data.ordersCount + ' · العضويات ' + data.membershipsCount + (data.merchantProfile ? ' · المحل: ' + data.merchantProfile.businessName : '');
  document.getElementById('ue-msg').textContent = '';
  const box = document.getElementById('user-edit');
  box.style.display = '';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeUserEdit() {
  editingUserId = null;
  document.getElementById('user-edit').style.display = 'none';
}

async function saveUserEdit() {
  const v = k => document.getElementById('ue-' + k).value.trim();
  const msg = document.getElementById('ue-msg');
  const body = {
    fullName: v('name'), email: v('email'), phone: v('phone') || null, language: v('lang'),
    countryCode: v('country') || null, vatNumber: v('vat') || null, bio: v('bio') || null,
    isEmailVerified: document.getElementById('ue-verified').checked,
    isDisabled: document.getElementById('ue-disabled').checked,
  };
  if (!document.getElementById('ue-role').disabled) body.role = v('role');
  if (v('pass')) body.newPassword = v('pass');
  if (body.isDisabled && !confirm('الحساب معطّل: بيطلع من كل أجهزته. متأكد؟')) return;
  const { ok, data } = await api('PATCH', '/admin/users/' + editingUserId, body);
  if (!ok) { msg.textContent = errText(data, 'تعذّر الحفظ'); return; }
  msg.textContent = 'انحفظ ✓';
  loadUsers(true);
}

async function deleteUserForGood() {
  if (!confirm('حذف هذا الحساب نهائيًا؟ ما في رجعة.')) return;
  if (!confirm('تأكيد أخير: بيتمسح الحساب وكل بياناته الشخصية.')) return;
  const { ok, data } = await api('DELETE', '/admin/users/' + editingUserId);
  const msg = document.getElementById('users-msg');
  if (!ok) { document.getElementById('ue-msg').textContent = errText(data, 'تعذّر الحذف'); return; }
  closeUserEdit();
  loadUsers(true);
  msg.textContent = data.result === 'deleted'
    ? 'انحذف الحساب نهائيًا.'
    : 'عند الحساب طلبات أو حركات مالية مسجّلة، فانمسحت كل بياناته الشخصية وبقي سجل مجهول وغير فعّال للحسابات المالية.';
}

async function toggleUser(id, disable) {
  if (disable && !confirm('تعطيل هذا الحساب؟ بيطلع من كل أجهزته ولا يقدر يدخل.')) return;
  const { ok, data } = await api('PATCH', '/admin/users/' + id, { isDisabled: disable });
  if (!ok) { document.getElementById('users-msg').textContent = errText(data, 'تعذّر التنفيذ'); return; }
  loadUsers(true);
}

// ---- Geography: governorates > cities > neighbourhoods ----
const GEO_LEVELS = { REGION: 'المحافظات', CITY: 'المدن', AREA: 'الأحياء' };
const geoState = { countryId: '', regionId: '', cityId: '' };

async function geoInit() {
  const { ok, data } = await api('GET', '/geo/countries');
  const select = document.getElementById('geo-country');
  if (ok && select.options.length <= 1) data.forEach(c => select.add(new Option(c.nameArabic || c.name, c.id)));
}

async function geoFill(selectId, params, placeholder) {
  const select = document.getElementById(selectId);
  select.length = 1;
  select.options[0].text = placeholder;
  select.disabled = true;
  if (!params) return;
  const { ok, data } = await api('GET', '/geo/units?' + new URLSearchParams(params));
  if (ok && data.length) { data.forEach(u => select.add(new Option(u.nameArabic || u.name, u.id))); select.disabled = false; }
}

async function geoPickCountry() {
  geoState.countryId = document.getElementById('geo-country').value;
  geoState.regionId = geoState.cityId = '';
  await geoFill('geo-region', geoState.countryId && { countryId: geoState.countryId, level: 'REGION' }, '— كل المحافظات —');
  await geoFill('geo-city', null, '— كل المدن —');
  geoList();
}
async function geoPickRegion() {
  geoState.regionId = document.getElementById('geo-region').value;
  geoState.cityId = '';
  await geoFill('geo-city', geoState.regionId && { parentId: geoState.regionId }, '— كل المدن —');
  geoList();
}
async function geoPickCity() {
  geoState.cityId = document.getElementById('geo-city').value;
  geoList();
}

/** What is being listed (and added to): areas of a city, cities of a region, or the governorates of the country. */
function geoLevel() {
  return geoState.cityId ? 'AREA' : geoState.regionId ? 'CITY' : 'REGION';
}

async function geoList() {
  const body = document.getElementById('geo-body');
  const title = document.getElementById('geo-list-title');
  document.getElementById('geo-msg').textContent = '';
  if (!geoState.countryId) { title.textContent = '—'; body.innerHTML = '<tr><td colspan="3" class="muted">اختر بلدًا أولًا</td></tr>'; return; }
  const level = geoLevel();
  title.textContent = GEO_LEVELS[level];
  const params = level === 'REGION' ? { countryId: geoState.countryId, level: 'REGION' } : { parentId: geoState.cityId || geoState.regionId };
  const { ok, data } = await api('GET', '/geo/units?' + new URLSearchParams(params));
  if (!ok) { body.innerHTML = '<tr><td colspan="3" class="muted">تعذّر التحميل</td></tr>'; return; }
  body.innerHTML = data.length ? data.map(u => `
    <tr>
      <td><input placeholder="مثال: دمشق" id="geo-ar-${u.id}" value="${esc(u.nameArabic || '')}" /></td>
      <td><input placeholder="e.g. Damascus" id="geo-en-${u.id}" value="${esc(u.nameEnglish || u.name)}" style="direction:ltr" /></td>
      <td style="white-space:nowrap">
        <button class="small" onclick="geoSave('${u.id}')">حفظ</button>
        <button class="small" style="background:#777" onclick="geoHide('${u.id}')">إخفاء</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="3" class="muted">لا شيء هون بعد — أضف أول اسم</td></tr>';
}

async function geoAdd() {
  const msg = document.getElementById('geo-msg');
  const ar = document.getElementById('geo-new-ar').value.trim();
  const en = document.getElementById('geo-new-en').value.trim();
  if (!geoState.countryId) { msg.textContent = 'اختر بلدًا أولًا'; return; }
  if (!ar) { msg.textContent = 'اكتب الاسم بالعربي'; return; }
  const level = geoLevel();
  const body = { countryId: geoState.countryId, level, name: en || ar, nameArabic: ar, nameEnglish: en || undefined };
  if (level !== 'REGION') body.parentId = geoState.cityId || geoState.regionId;
  const { ok, data } = await api('POST', '/geo/units', body);
  if (!ok) { msg.textContent = errText(data, 'تعذّرت الإضافة'); return; }
  document.getElementById('geo-new-ar').value = '';
  document.getElementById('geo-new-en').value = '';
  await geoRefreshPickers(level);
  geoList();
}

/** The pickers above show the same places, so they must see what was just added or hidden. */
async function geoRefreshPickers(level) {
  if (level === 'REGION') {
    const keep = geoState.regionId;
    await geoFill('geo-region', { countryId: geoState.countryId, level: 'REGION' }, '— كل المحافظات —');
    document.getElementById('geo-region').value = keep;
  } else if (level === 'CITY') {
    const keep = geoState.cityId;
    await geoFill('geo-city', { parentId: geoState.regionId }, '— كل المدن —');
    document.getElementById('geo-city').value = keep;
  }
}

async function geoSave(id) {
  const nameArabic = document.getElementById('geo-ar-' + id).value.trim();
  const nameEnglish = document.getElementById('geo-en-' + id).value.trim();
  const msg = document.getElementById('geo-msg');
  if (!nameArabic) { msg.textContent = 'الاسم بالعربي مطلوب'; return; }
  const { ok, data } = await api('PATCH', '/geo/units/' + id, { nameArabic, nameEnglish: nameEnglish || undefined, name: nameEnglish || nameArabic });
  msg.textContent = ok ? 'تم الحفظ ✅' : errText(data, 'تعذّر الحفظ');
  if (ok) await geoRefreshPickers(geoLevel());
}

async function geoHide(id) {
  if (!confirm('إخفاء هذا المكان؟ ما رح يظهر بالقوائم (الحسابات وأصحاب الأنشطة المرتبطين فيه ما بيتأثروا).')) return;
  const { ok, data } = await api('PATCH', '/geo/units/' + id, { isActive: false });
  if (!ok) { document.getElementById('geo-msg').textContent = errText(data, 'تعذّر الإخفاء'); return; }
  await geoRefreshPickers(geoLevel());
  geoList();
}

// ---- Announcements ----
const BC_STATUS = { PENDING_REVIEW: ['PENDING', 'بانتظار المراجعة'], SENT: ['APPROVED', 'أُرسل'], REJECTED: ['REJECTED', 'مرفوض'] };
const AI_VERDICT = { OK: 'سليم', REVIEW: 'يحتاج انتباهك', BLOCK: 'مخالف' };

async function loadBroadcasts() {
  const [pending, all, countries, settings] = await Promise.all([
    api('GET', '/broadcasts?status=PENDING_REVIEW'),
    api('GET', '/broadcasts'),
    api('GET', '/geo/countries'),
    api('GET', '/admin/settings'),
  ]);
  if (!pending.ok) return;
  if (settings.ok && settings.data.broadcasts) {
    document.getElementById('bc-limit-default').value = settings.data.broadcasts.merchantDefaultMonthly;
    document.getElementById('bc-limit-price').value = settings.data.broadcasts.pricePerAnnouncement;
    document.getElementById('bc-limit-radius').value = settings.data.broadcasts.maxRadiusKm;
    document.getElementById('bc-limit-audience').value = settings.data.broadcasts.merchantMaxAudience;
  }
  if (settings.ok && settings.data.discountNotify) {
    const dn = settings.data.discountNotify;
    document.getElementById('dn-mode').value = dn.mode;
    document.getElementById('dn-radius').value = dn.radiusKm;
    document.getElementById('dn-followers').checked = !!dn.alsoFollowers;
    dnModeChanged();
  }
  const count = document.getElementById('bc-pending-count');
  count.textContent = pending.data.length;
  count.style.display = pending.data.length ? 'inline-block' : 'none';

  document.getElementById('bc-pending-body').innerHTML = pending.data.length ? pending.data.map(b => {
    const shop = (b.sender && b.sender.merchantProfile && b.sender.merchantProfile.businessName) || (b.sender && b.sender.email) || '—';
    const reasons = Array.isArray(b.aiReasons) && b.aiReasons.length ? '<br><small class="muted">' + b.aiReasons.map(esc).join(' — ') + '</small>' : '';
    const verdict = b.aiVerdict ? `<span class="badge ${b.aiVerdict === 'OK' ? 'APPROVED' : 'PENDING'}">${AI_VERDICT[b.aiVerdict]}</span>${reasons}` : '<span class="muted">لم يُفحص آليًا</span>';
    const where = b.scope === 'RADIUS' ? `ضمن ${esc(b.radiusKm)} كم` : 'منطقة محدّدة';
    return `<tr>
      <td>${esc(shop)}</td>
      <td><b>${esc(b.title)}</b><br>${esc(b.body)}${b.productId ? '<br><small class="muted">🛍️ مرفق منتج</small>' : ''}${b.discountId ? '<br><small class="muted">🏷️ مرفق عرض</small>' : ''}</td>
      <td>${verdict}</td>
      <td>${where} — نحو ${esc(b.targeted)}</td>
      <td style="white-space:nowrap"><button class="small" onclick="bcApprove('${esc(b.id)}')">✓ نشر</button> <button class="small" style="background:#777" onclick="bcReject('${esc(b.id)}')">✕ رفض</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="muted">لا شيء بانتظار المراجعة</td></tr>';

  if (all.ok) {
    document.getElementById('bc-history-body').innerHTML = all.data.length ? all.data.map(b => {
      const st = BC_STATUS[b.status] || ['inactive', b.status];
      const sender = (b.sender && b.sender.merchantProfile && b.sender.merchantProfile.businessName) || (b.senderRole === 'ADMIN' ? 'الإدارة' : '—');
      return `<tr><td>${new Date(b.createdAt).toLocaleString()}</td><td>${esc(sender)}</td><td>${esc(b.title)}</td><td><span class="badge ${st[0]}">${st[1]}</span>${b.reviewNote ? '<br><small class="muted">' + esc(b.reviewNote) + '</small>' : ''}</td><td>${b.status === 'SENT' ? esc(b.delivered) + ' / ' + esc(b.targeted) : '—'}${b.creditsCharged ? '<br><small class="muted">💰 ' + esc(b.creditsCharged) + '</small>' : ''}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="muted">لا إعلانات بعد</td></tr>';
  }

  const select = document.getElementById('bc-country');
  if (countries.ok && select.options.length <= 1) {
    countries.data.forEach(c => select.add(new Option(c.nameArabic || c.name, c.id)));
  }
}

function dnModeChanged() { document.getElementById('dn-radius-row').style.display = document.getElementById('dn-mode').value === 'RADIUS' ? 'block' : 'none'; }

async function saveDiscountNotify() {
  const msg = document.getElementById('dn-msg');
  const mode = document.getElementById('dn-mode').value;
  const radiusKm = Number(String(document.getElementById('dn-radius').value).replace(',', '.')) || 10;
  if (mode === 'RADIUS' && !(radiusKm > 0)) { msg.textContent = 'اكتب المسافة'; return; }
  const { ok, data } = await api('PUT', '/admin/settings', { discountNotify: { mode, radiusKm, alsoFollowers: document.getElementById('dn-followers').checked } });
  msg.textContent = ok ? 'تم الحفظ ✅' : errText(data, 'تعذّر الحفظ');
}

async function saveBroadcastLimits() {
  const msg = document.getElementById('bc-limit-msg');
  const num = (id) => Number(String(document.getElementById(id).value).replace(',', '.'));
  const merchantDefaultMonthly = Math.trunc(num('bc-limit-default'));
  const maxRadiusKm = num('bc-limit-radius');
  const merchantMaxAudience = Math.trunc(num('bc-limit-audience'));
  const pricePerAnnouncement = Math.trunc(num('bc-limit-price'));
  if (![merchantDefaultMonthly, maxRadiusKm, merchantMaxAudience, pricePerAnnouncement].every(Number.isFinite) || merchantDefaultMonthly < 0 || pricePerAnnouncement < 0 || maxRadiusKm <= 0 || merchantMaxAudience <= 0) {
    msg.textContent = 'تأكد من الأرقام';
    return;
  }
  const { ok, data } = await api('PUT', '/admin/settings', { broadcasts: { merchantDefaultMonthly, maxRadiusKm, merchantMaxAudience, pricePerAnnouncement } });
  msg.textContent = ok ? 'تم الحفظ ✅' : errText(data, 'تعذّر الحفظ');
}

async function bcFill(selectId, params, placeholder) {
  const select = document.getElementById(selectId);
  select.length = 1;
  select.options[0].text = placeholder;
  select.disabled = true;
  if (!params) return;
  const { ok, data } = await api('GET', '/geo/units?' + new URLSearchParams(params));
  if (ok && data.length) { data.forEach(u => select.add(new Option(u.nameArabic || u.name, u.id))); select.disabled = false; }
}

async function bcPickCountry() {
  const picked = document.getElementById('bc-country').value;
  const id = picked === '__all' ? '' : picked; // "everyone" has no regions to pick from
  await bcFill('bc-region', id && { countryId: id, level: 'REGION' }, '— كل البلد —');
  await bcFill('bc-city', null, '— كل المنطقة —');
  await bcFill('bc-area', null, '— كل المدينة —');
  bcPreview();
}
async function bcPickRegion() {
  const id = document.getElementById('bc-region').value;
  await bcFill('bc-city', id && { parentId: id }, '— كل المنطقة —');
  await bcFill('bc-area', null, '— كل المدينة —');
  bcPreview();
}
async function bcPickCity() {
  const id = document.getElementById('bc-city').value;
  await bcFill('bc-area', id && { parentId: id }, '— كل المدينة —');
  bcPreview();
}

/** The most specific thing chosen: an area, else a city, else a region, else the whole country. */
function bcTarget() {
  const v = (id) => document.getElementById(id).value;
  const country = v('bc-country');
  if (!country) return null;
  if (country === '__all') return v('bc-role') ? { everyone: true, role: v('bc-role') } : { everyone: true };
  const unit = v('bc-area') || v('bc-city') || v('bc-region');
  const target = unit ? { geoUnitId: unit } : { countryId: country };
  if (v('bc-role')) target.role = v('bc-role');
  return target;
}

async function bcPreview() {
  const out = document.getElementById('bc-count');
  const target = bcTarget();
  if (!target) { out.textContent = ''; return; }
  const { ok, data } = await api('POST', '/broadcasts/preview', target);
  out.textContent = ok ? `سيصل إلى نحو ${data.count} شخص (الحد الأقصى ${data.cap}).` : errText(data, 'تعذّر الحساب');
}

async function bcSend() {
  const msg = document.getElementById('bc-msg');
  const target = bcTarget();
  const title = document.getElementById('bc-title').value.trim();
  const body = document.getElementById('bc-body').value.trim();
  if (!target) { msg.textContent = 'اختر البلد أولًا'; return; }
  if (!title || !body) { msg.textContent = 'اكتب العنوان والنص'; return; }
  if (!confirm('سيصل هذا الإشعار فورًا للجمهور المحدّد. متابعة؟')) return;
  const { ok, data } = await api('POST', '/broadcasts', { ...target, title, body });
  msg.textContent = ok ? `أُرسل: وصل إلى ${data.delivered} من ${data.targeted}` : errText(data, 'تعذّر الإرسال');
  if (ok) { document.getElementById('bc-title').value = ''; document.getElementById('bc-body').value = ''; loadBroadcasts(); }
}

async function bcApprove(id) {
  if (!confirm('نشر هذا الإعلان الآن لجمهوره؟')) return;
  const { ok, data } = await api('POST', '/broadcasts/' + id + '/approve');
  if (!ok) alert(errText(data, 'تعذّر النشر'));
  loadBroadcasts();
}
async function bcReject(id) {
  const reason = prompt('سبب الرفض (سيقرأه صاحب النشاط):');
  if (!reason || reason.trim().length < 3) return;
  const { ok, data } = await api('POST', '/broadcasts/' + id + '/reject', { reason: reason.trim() });
  if (!ok) alert(errText(data, 'تعذّر الرفض'));
  loadBroadcasts();
}

// ---- Push notifications status ----
async function loadPushStatus() {
  const { ok, data } = await api('GET', '/admin/push-status');
  if (!ok) { logout(); return; }
  const badge = (good, yes, no) => `<span class="badge ${good ? 'APPROVED' : 'REJECTED'}">${good ? yes : no}</span>`;
  document.getElementById('push-configured').innerHTML = data.invalid
    ? badge(false, '', 'المتغيّر موجود لكنه مو ملف JSON صالح')
    : badge(data.configured, 'نعم', 'لا — ضيف FIREBASE_SERVICE_ACCOUNT_JSON على Render');
  document.getElementById('push-project').textContent = data.projectId || '—';
  document.getElementById('push-auth').innerHTML = data.authenticated === null ? '—' : badge(data.authenticated, 'شغّال', 'فشل');
  document.getElementById('push-devices').textContent = `${data.devices} (${data.usersWithDevices})`;
  document.getElementById('push-error').textContent = data.error || '';
}

async function sendPushTest() {
  const out = document.getElementById('push-test-result');
  out.textContent = 'عم يرسل...';
  const { ok, data } = await api('POST', '/admin/push-test');
  if (!ok) { out.textContent = (data && data.error && data.error.message) || 'تعذّر الإرسال'; return; }
  out.textContent = data.delivered > 0
    ? `انبعت لـ ${data.delivered} من ${data.devices} جهاز — تأكد أنه وصل على الموبايل.`
    : `ما وصل لأي جهاز. ${data.errors.join(' | ')}`;
  loadPushStatus();
}

async function testAiProvider(id, btn) {
  const out = document.getElementById('ai-test-' + id);
  btn.disabled = true; out.textContent = ' عم نجرّب...';
  const { ok, data } = await api('POST', '/admin/ai-test', { provider: id });
  btn.disabled = false;
  if (!ok) { out.textContent = ' تعذّر الاختبار'; return; }
  out.textContent = data.ok ? ` ✅ ردّ بـ ${data.ms}ms` : ` ❌ ${data.reason}`;
}

// ---- Discounts ----
let discStatus = 'PENDING';
const DISC_STATE_AR = { PENDING: 'بانتظار الموافقة', REJECTED: 'مرفوض', PAUSED: 'موقوف', SCHEDULED: 'لسا ما بدأ', LIVE: 'شغّال', ENDED: 'انتهى' };

function discScopeAr(d) {
  if (d.scope === 'SECTION' && d.section) return 'قسم: ' + d.section.name;
  if (d.scope === 'PRODUCTS' && d.productNames.length) return 'منتجات: ' + d.productNames.join('، ');
  return 'كل المحل';
}

async function loadDiscounts(status) {
  discStatus = status || discStatus;
  document.querySelectorAll('[data-dstatus]').forEach(b => b.classList.toggle('active', b.dataset.dstatus === discStatus));
  const { ok, data } = await api('GET', '/admin/discounts?status=' + discStatus);
  const body = document.getElementById('disc-body');
  if (!ok) { body.innerHTML = '<tr><td colspan="8">تعذّر التحميل</td></tr>'; return; }
  const day = d => d ? new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  body.innerHTML = data.length ? data.map(d => `<tr>
    <td>${esc(d.merchant.businessName)}${d.merchant.phone ? `<br><small class="muted">${esc(d.merchant.phone)}</small>` : ''}</td>
    <td><b>${d.percent}%</b> ${esc(d.title)}</td>
    <td>${esc(discScopeAr(d))}</td>
    <td>${day(d.startDate)} → ${d.endDate ? day(d.endDate) : 'بدون نهاية'}</td>
    <td>${d.perCustomerLimit ? d.perCustomerLimit + ' مرات لكل زبون' : 'بدون حد للمرات'}<br>${d.maxCustomers ? 'حتى ' + d.maxCustomers + ' شخص' : 'بدون حد للأشخاص'}</td>
    <td style="max-width:220px">${esc(d.description || '')}${d.rejectionReason ? `<br><small class="muted">رُفض: ${esc(d.rejectionReason)}</small>` : ''}</td>
    <td><span class="badge ${d.status === 'APPROVED' ? 'APPROVED' : d.status === 'PENDING' ? 'PENDING' : 'REJECTED'}">${esc(DISC_STATE_AR[d.state] || d.state)}</span></td>
    <td style="white-space:nowrap">${d.status !== 'APPROVED' ? `<button class="small" onclick="reviewDiscount('${d.id}','approve')">موافقة</button>` : ''}${d.status !== 'REJECTED' ? `<button class="small danger" onclick="reviewDiscount('${d.id}','reject')">رفض</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="8" class="muted">ما في حسومات</td></tr>';
  refreshDiscBadge();
}

async function refreshDiscBadge() {
  const { ok, data } = await api('GET', '/admin/discounts?status=PENDING');
  const badge = document.getElementById('disc-pending-count');
  if (ok && data.length) { badge.textContent = data.length; badge.style.display = ''; } else badge.style.display = 'none';
}

async function reviewDiscount(id, action) {
  let body = {};
  if (action === 'reject') { const reason = prompt('سبب الرفض (بيوصل لصاحب النشاط، واختياري):'); if (reason === null) return; body = { reason }; }
  const { ok, data } = await api('POST', '/admin/discounts/' + id + '/' + action, body);
  if (!ok) alert(errText(data, 'تعذّر التنفيذ'));
  loadDiscounts(discStatus);
}

// ---- Product categories shops added ----
async function loadProductCats() {
  const body = document.getElementById('pcats-body');
  const { ok, data } = await api('GET', '/admin/product-categories');
  if (!ok) { body.innerHTML = '<tr><td colspan="6">تعذّر التحميل</td></tr>'; return; }
  body.innerHTML = data.length ? data.map(c => `<tr>
    <td><input placeholder="مثال: ملابس" id="pc-ar-${c.id}" value="${esc(c.name)}" style="width:150px" /></td>
    <td><input id="pc-en-${c.id}" value="${esc(c.nameEn || '')}" dir="ltr" style="width:150px" placeholder="English" /></td>
    <td class="muted">${esc(c.parentName || '—')}</td>
    <td class="muted">${esc(c.shop || '—')}</td>
    <td>${c.productCount}</td>
    <td style="white-space:nowrap"><button class="small" onclick="savePcat('${c.id}')">حفظ</button> <button class="small danger" onclick="deletePcat('${c.id}')">حذف</button></td>
  </tr>`).join('') : '<tr><td colspan="6" class="muted">ما أضاف حدا تصنيف بعد</td></tr>';
}

async function savePcat(id) {
  const name = document.getElementById('pc-ar-' + id).value.trim();
  const nameEn = document.getElementById('pc-en-' + id).value.trim();
  const { ok, data } = await api('PATCH', '/admin/product-categories/' + id, { name, nameEn: nameEn || null });
  document.getElementById('pcats-msg').textContent = ok ? 'انحفظ ✓' : errText(data, 'تعذّر الحفظ');
}

async function deletePcat(id) {
  if (!confirm('حذف هذا التصنيف؟ منتجاته بتنتقل للتصنيف الأعلى.')) return;
  const { ok, data } = await api('DELETE', '/admin/product-categories/' + id);
  if (!ok) { document.getElementById('pcats-msg').textContent = errText(data, 'تعذّر الحذف'); return; }
  loadProductCats();
}

// ---- Products waiting for review ----
let prevStatus = 'PENDING';

let prevPage = 1;
const PROD_STATE = { PENDING: ['بانتظار القرار', 'PENDING'], APPROVED: ['مقبول', 'APPROVED'], REJECTED: ['مرفوض', 'REJECTED'] };
let prevItems = {};

async function loadProductReview(status, page) {
  prevStatus = status || prevStatus;
  prevPage = page || 1;
  document.querySelectorAll('[data-pstatus]').forEach(b => b.classList.toggle('active', b.dataset.pstatus === prevStatus));
  const box = document.getElementById('prev-list');
  const q = (document.getElementById('prev-q').value || '').trim();
  const params = new URLSearchParams({ status: prevStatus, page: prevPage });
  if (q) params.set('q', q);
  const res = await fetch('/admin/products?' + params.toString(), { headers: { Authorization: 'Bearer ' + state.token } });
  const data = await res.json().catch(() => []);
  if (!res.ok) { box.innerHTML = '<div class="card muted">تعذّر التحميل</div>'; return; }
  const total = Number(res.headers.get('X-Total-Count')) || data.length;
  prevItems = {};
  data.forEach(p => { prevItems[p.id] = p; });
  box.innerHTML = data.length ? data.map(p => `<div class="card" id="pcard-${p.id}">
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div style="display:flex;gap:6px;flex-wrap:wrap">${p.images.slice(0, 4).map(u => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}" style="width:110px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line)"></a>`).join('') || '<span class="muted">بدون صورة</span>'}</div>
      <div style="flex:1;min-width:220px">
        <b style="font-size:16px">${esc(p.name)}</b> <span class="badge ${PROD_STATE[p.moderation][1]}">${PROD_STATE[p.moderation][0]}</span>${p.isActive ? '' : ' <span class="badge inactive">مخفي</span>'}
        <div class="muted">${esc(p.shop)}${p.phone ? ' · ' + esc(p.phone) : ''} · السعر ${money(p.priceCents)} · المخزون ${p.stock}</div>
        <p style="margin:6px 0">${esc(p.description || '')}</p>
        ${p.specs.length ? `<p class="muted">${p.specs.map(s => esc(s.label) + ': ' + esc(s.value)).join(' · ')}</p>` : ''}
        ${p.note ? `<p class="muted">ملاحظة الذكاء الاصطناعي / الإدارة: ${esc(p.note)}</p>` : ''}
        <div style="margin-top:8px">
          ${p.moderation !== 'APPROVED' ? `<button class="small" onclick="decideProduct('${p.id}','approve')">✅ قبول</button> ` : ''}${p.moderation !== 'REJECTED' ? `<button class="small danger" onclick="decideProduct('${p.id}','reject')">❌ رفض</button> ` : ''}
          <button class="small secondary" onclick="editProduct('${p.id}')">✏️ تعديل</button>
        </div>
        <div id="pedit-${p.id}"></div>
      </div>
    </div></div>`).join('') : '<div class="card muted">ما في منتجات</div>';
  document.getElementById('prev-pager').innerHTML = pagerHtml('prevGo', prevPage, total);
  refreshProductReviewBadge();
}
function prevGo(p) { loadProductReview(prevStatus, p); }

/** The edit window opens under the product: its words, price, stock, details, visibility. */
function editProduct(id) {
  const p = prevItems[id];
  const box = document.getElementById('pedit-' + id);
  if (!p || !box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card" style="margin:10px 0 0;border:1px solid var(--line);box-shadow:none;background:var(--surface-2)">
    <div class="grid2">
      <div class="field"><label>اسم المنتج</label><input id="pe-n-${id}" value="${esc(p.name)}"></div>
      <div class="field"><label>السعر</label><input id="pe-p-${id}" dir="ltr" value="${money(p.priceCents)}" placeholder="مثال: 25.00"></div>
      <div class="field"><label>المخزون</label><input id="pe-s-${id}" dir="ltr" value="${p.stock}" placeholder="مثال: 10"></div>
      <div class="field"><label>الحالة</label><select id="pe-c-${id}"><option value="">غير محددة</option><option value="NEW" ${p.condition === 'NEW' ? 'selected' : ''}>جديد</option><option value="USED" ${p.condition === 'USED' ? 'selected' : ''}>مستعمل</option></select></div>
    </div>
    <div class="field"><label>الوصف</label><textarea id="pe-d-${id}" rows="3" placeholder="وصف قصير للمنتج">${esc(p.description || '')}</textarea></div>
    <div class="field"><label>التفاصيل (سطر لكل تفصيل، بهالشكل: الاسم: القيمة)</label><textarea id="pe-sp-${id}" rows="3" placeholder="مثال: اللون: أبيض">${esc(p.specs.map(s => s.label + ': ' + s.value).join('\n'))}</textarea></div>
    <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pe-a-${id}" ${p.isActive ? 'checked' : ''} style="width:20px;height:20px"> <span>ظاهر للزبائن (إذا مقبول)</span></label>
    <div style="margin-top:10px"><button onclick="saveProductEdit('${id}')">حفظ</button> <button class="secondary" onclick="editProduct('${id}')">إغلاق</button> <span id="pe-m-${id}" class="muted"></span></div>
  </div>`;
}

async function saveProductEdit(id) {
  const g = (k) => document.getElementById('pe-' + k + '-' + id);
  const price = parseFloat(String(g('p').value).replace(',', '.'));
  const stock = parseInt(g('s').value, 10);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) { g('m').textContent = 'اكتب سعر ومخزون صحيحين'; return; }
  const specs = g('sp').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(x => x && x.label && x.value);
  const body = { name: g('n').value.trim(), description: g('d').value.trim() || null, priceCents: Math.round(price * 100), stock, condition: g('c').value || null, isActive: g('a').checked, specs };
  const r = await api('PATCH', '/admin/products/' + id, body);
  if (!r.ok) { g('m').textContent = errText(r.data, 'فشل الحفظ'); return; }
  loadProductReview(prevStatus, prevPage);
}

async function refreshProductReviewBadge() {
  const res = await fetch('/admin/products?status=PENDING', { headers: { Authorization: 'Bearer ' + state.token } });
  const badge = document.getElementById('prev-pending-count');
  const total = res.ok ? Number(res.headers.get('X-Total-Count')) || 0 : 0;
  if (total) { badge.textContent = total; badge.style.display = ''; } else badge.style.display = 'none';
}

async function decideProduct(id, action) {
  let body = {};
  if (action === 'reject') { const reason = prompt('سبب الرفض (بيوصل لصاحب النشاط):'); if (reason === null) return; body = { reason }; }
  const { ok, data } = await api('POST', '/admin/products/' + id + '/' + action, body);
  if (!ok) { alert(errText(data, 'تعذّر التنفيذ')); return; }
  loadProductReview();
}

// ---- Profession suggestions ----
let sugStatus = 'PENDING';
let sugOptions = '';

async function loadSuggestions(status) {
  sugStatus = status || sugStatus;
  document.querySelectorAll('[data-sstatus]').forEach(b => b.classList.toggle('active', b.dataset.sstatus === sugStatus));
  if (!state.categoriesFlat || !state.categoriesFlat.length) await loadCategories();
  const flat = state.categoriesFlat || [];
  sugOptions = flat.map(c => `<option value="${c.id}">${'— '.repeat(c.depth)}${esc(c.name)}</option>`).join('');
  const box = document.getElementById('sug-list');
  const { ok, data } = await api('GET', '/admin/category-suggestions?status=' + sugStatus);
  if (!ok) { box.innerHTML = '<div class="card muted">تعذّر التحميل</div>'; return; }
  const day = d => new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' });
  box.innerHTML = data.length ? data.map(s => {
    const shop = s.merchant ? `${esc(s.merchant.businessName)}${s.merchant.phone ? ' · ' + esc(s.merchant.phone) : ''}` : '—';
    if (s.status !== 'PENDING') {
      return `<div class="card"><b>${esc(s.name)}</b> <span class="muted">— ${shop} — ${day(s.createdAt)}</span>
        ${s.categoryPath ? `<div class="muted">صارت: ${esc(s.categoryPath)}</div>` : ''}
        ${s.note ? `<div class="muted">ملاحظة: ${esc(s.note)}</div>` : ''}</div>`;
    }
    return `<div class="card" id="sug-${s.id}">
      <div><b style="font-size:17px">${esc(s.name)}</b> <span class="muted">— ${shop} — ${day(s.createdAt)}</span></div>
      <div class="muted" style="margin:4px 0 10px">أقرب مهنة اختارها: ${esc(s.nearestPath || '—')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
        <label>اسمها بالعربي<br><input placeholder="الاسم بالعربي" id="sug-ar-${s.id}" value="${esc(s.name)}" style="width:190px" /></label>
        <label>اسمها بالإنكليزي<br><input id="sug-en-${s.id}" placeholder="Name in English" style="width:190px" dir="ltr" /></label>
        <label>أيقونة<br><input placeholder="مثال: 🥊" id="sug-ic-${s.id}" maxlength="4" style="width:60px" /></label>
        <label>مكانها<br><select id="sug-par-${s.id}" style="width:230px"><option value="">— قسم رئيسي —</option>${sugOptions}</select></label>
        <label>كلمات بحث إضافية<br><input id="sug-sy-${s.id}" placeholder="كلمة|كلمة|كلمة" style="width:190px" /></label>
        <button class="small" onclick="approveSuggestion('${s.id}')">✅ قبول كمهنة جديدة</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:10px">
        <label>أو أضفها لمهنة موجودة<br><select id="sug-mrg-${s.id}" style="width:300px"><option value="">— اختر المهنة —</option>${sugOptions}</select></label>
        <button class="small" onclick="mergeSuggestion('${s.id}')">➕ أضفها لهالمهنة</button>
        <button class="small danger" onclick="rejectSuggestion('${s.id}')">رفض</button>
      </div>
    </div>`;
  }).join('') : '<div class="card muted">ما في اقتراحات</div>';
  data.filter(s => s.status === 'PENDING').forEach(s => { const el = document.getElementById('sug-par-' + s.id); if (el && s.nearestId) el.value = s.nearestId; });
  refreshSugBadge();
}

async function refreshSugBadge() {
  const { ok, data } = await api('GET', '/admin/category-suggestions?status=PENDING');
  const badge = document.getElementById('sug-pending-count');
  if (ok && data.length) { badge.textContent = data.length; badge.style.display = ''; } else badge.style.display = 'none';
}

async function approveSuggestion(id) {
  const v = k => document.getElementById('sug-' + k + '-' + id).value.trim();
  const body = { nameAr: v('ar'), parentId: v('par') || null };
  if (v('en')) body.nameEn = v('en');
  if (v('ic')) body.icon = v('ic');
  const syn = v('sy').split(/[|،,]/).map(x => x.trim()).filter(Boolean);
  if (syn.length) body.synonyms = syn;
  const { ok, data } = await api('POST', '/admin/category-suggestions/' + id + '/approve', body);
  if (!ok) { alert(errText(data, 'تعذّر التنفيذ')); return; }
  loadCategories();
  loadSuggestions();
}

async function mergeSuggestion(id) {
  const categoryId = document.getElementById('sug-mrg-' + id).value;
  if (!categoryId) { alert('اختر المهنة اللي بدك تضيفها لها'); return; }
  const { ok, data } = await api('POST', '/admin/category-suggestions/' + id + '/merge', { categoryId });
  if (!ok) { alert(errText(data, 'تعذّر التنفيذ')); return; }
  loadSuggestions();
}

async function rejectSuggestion(id) {
  const reason = prompt('سبب الرفض (بيوصل لصاحب النشاط، واختياري):');
  if (reason === null) return;
  const { ok, data } = await api('POST', '/admin/category-suggestions/' + id + '/reject', { reason });
  if (!ok) { alert(errText(data, 'تعذّر التنفيذ')); return; }
  loadSuggestions();
}

// ---- Store ads and banners ----
let adStatus = 'PENDING';
let bannersCache = [];
let editingBanner = null;

async function loadAds() {
  const [settings, countries] = await Promise.all([api('GET', '/admin/settings'), api('GET', '/geo/countries')]);
  if (settings.ok) {
    const ads = settings.data.ads || { packages: [], autoApprove: false, bannerSeconds: 5 };
    document.querySelectorAll('.credit-name').forEach(e => e.textContent = settings.data.creditName || 'الرصيد');
    const body = document.getElementById('ads-packages');
    body.innerHTML = '';
    (ads.packages || []).sort((a, b) => a.days - b.days).forEach(p => addAdPackage(p.days, p.credits));
    document.getElementById('ads-banner-packages').innerHTML = '';
    (ads.bannerPackages || []).sort((a, b) => a.days - b.days).forEach(p => addAdPackage(p.days, p.credits, 'ads-banner-packages'));
    document.getElementById('ads-banner-seconds').value = ads.bannerSeconds;
    document.getElementById('ads-auto').value = String(!!ads.autoApprove);
  }
  const sel = document.getElementById('bn-country');
  if (countries.ok && sel.options.length === 1) {
    countries.data.forEach(c => sel.add(new Option((c.nameArabic || c.name) + ' (' + c.isoCode2 + ')', c.isoCode2)));
  }
  loadAdBookings(adStatus);
  loadBannerBookings(bbStatus);
  loadBanners();
}

function addAdPackage(days, credits, into) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><input placeholder="مثال: 30" type="number" min="1" max="365" class="pk-days" value="' + (days ?? '') + '"></td><td><input placeholder="مثال: 500" type="number" min="0" class="pk-credits" value="' + (credits ?? '') + '"></td><td><button class="small danger" onclick="this.closest(\'tr\').remove()">حذف</button></td>';
  document.getElementById(into || 'ads-packages').appendChild(tr);
}

async function saveAdSettings() {
  const msg = document.getElementById('ads-settings-msg');
  const read = (id) => [...document.querySelectorAll('#' + id + ' tr')].map(tr => ({ days: Number(tr.querySelector('.pk-days').value), credits: Number(tr.querySelector('.pk-credits').value) })).filter(p => p.days > 0);
  const packages = read('ads-packages');
  const bannerPackages = read('ads-banner-packages');
  if ([packages, bannerPackages].some(list => new Set(list.map(p => p.days)).size !== list.length)) { msg.textContent = 'في مدة مكررة'; return; }
  const { ok, data } = await api('PUT', '/admin/settings', { ads: { packages, bannerPackages, bannerSeconds: Number(document.getElementById('ads-banner-seconds').value) || 5, autoApprove: document.getElementById('ads-auto').value === 'true' } });
  msg.textContent = ok ? 'تم الحفظ ✓' : errText(data, 'تعذّر الحفظ');
}

let bbStatus = 'PENDING';
let bbCache = [];
let bannerForBooking = null;

const BB_STATE = { PENDING: 'جديد', CONTACTED: 'تم التواصل', SCHEDULED: 'مجدول', REJECTED: 'مرفوض', CANCELLED: 'ملغى' };

async function loadBannerBookings(status) {
  bbStatus = status || bbStatus;
  document.querySelectorAll('[data-bbstatus]').forEach(b => b.classList.toggle('active', b.dataset.bbstatus === bbStatus));
  const { ok, data } = await api('GET', '/admin/banner-bookings?status=' + bbStatus);
  const body = document.getElementById('bb-body');
  if (!ok) { body.innerHTML = '<tr><td colspan="7">تعذّر التحميل</td></tr>'; return; }
  bbCache = data;
  const day = d => new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
  const wa = n => (n || '').replace(/\D/g, '');
  body.innerHTML = data.length ? data.map(b => `<tr>
    <td>${esc(b.merchant.businessName)}${b.hasImage ? `<br><a href="#" onclick="viewCreative('banner','${b.id}');return false">🖼️ صورة الزبون</a>` : ''}</td>
    <td style="white-space:nowrap"><a href="tel:${esc(b.phone)}">📞 ${esc(b.phone)}</a>${b.whatsapp ? `<br><a href="https://wa.me/${wa(b.whatsapp)}" target="_blank" rel="noopener">💬 ${esc(b.whatsapp)}</a>` : ''}</td>
    <td>${b.days} يوم</td><td>${b.credits}</td><td>${day(b.requestedStart)}</td><td style="max-width:220px">${esc(b.note || '')}</td>
    <td style="white-space:nowrap">
      ${b.status === 'PENDING' ? `<button class="small" onclick="bannerBookingContacted('${b.id}')">تم التواصل</button>` : ''}
      ${b.status === 'PENDING' || b.status === 'CONTACTED' ? `<button class="small" onclick="makeBannerFor('${b.id}')">جهّز البانر</button><button class="small danger" onclick="bannerBookingReject('${b.id}')">رفض</button>` : `<span class="badge ${b.status === 'SCHEDULED' ? 'APPROVED' : 'REJECTED'}">${esc(BB_STATE[b.status])}</span>`}
    </td></tr>`).join('') : '<tr><td colspan="7" class="muted">ما في حجوزات</td></tr>';
  const pending = await api('GET', '/admin/banner-bookings?status=PENDING');
  const badge = document.getElementById('bb-count');
  if (pending.ok && pending.data.length) { badge.textContent = pending.data.length; badge.style.display = ''; } else badge.style.display = 'none';
  refreshAdsBadge();
}

async function bannerBookingContacted(id) {
  const { ok, data } = await api('POST', '/admin/banner-bookings/' + id + '/contacted');
  if (!ok) alert(errText(data, 'تعذّر التنفيذ'));
  loadBannerBookings(bbStatus);
}

async function bannerBookingReject(id) {
  const reason = prompt('سبب الرفض (بيوصل لصاحب النشاط، واختياري، وبيرجع له المبلغ):');
  if (reason === null) return;
  const { ok, data } = await api('POST', '/admin/banner-bookings/' + id + '/reject', { reason });
  if (!ok) alert(errText(data, 'تعذّر التنفيذ'));
  loadBannerBookings(bbStatus);
}

/** Fills the banner form for a booking: the shop's name, its dates, and a button that opens its shop page. */
/** The picture a shop sent with its booking, opened in a new tab (it needs the admin's key, so it is fetched first). */
async function viewCreative(kind, id) {
  const res = await fetch('/admin/ad-creatives/' + kind + '/' + id, { headers: { Authorization: 'Bearer ' + state.token } });
  if (!res.ok) { alert('ما في صورة'); return; }
  window.open(URL.createObjectURL(await res.blob()), '_blank');
}

function makeBannerFor(id) {
  const b = bbCache.find(x => x.id === id);
  if (!b) return;
  resetBannerForm();
  bannerForBooking = id;
  document.getElementById('banner-form-title').textContent = 'بانر لحجز: ' + b.merchant.businessName;
  document.getElementById('bn-title').value = b.merchant.businessName;
  document.getElementById('bn-target').value = 'shop';
  document.getElementById('bn-value').value = b.merchant.id;
  const start = new Date(b.requestedStart);
  const end = new Date(start.getTime() + b.days * 86400000);
  document.getElementById('bn-start').value = localInput(start.toISOString());
  document.getElementById('bn-end').value = localInput(end.toISOString());
  bannerTargetHint();
  document.getElementById('banner-msg').textContent = b.hasImage ? '🖼️ الزبون أرسل صورة: بتنحط للبانر تلقائيًا عند الحفظ (ارفع صورة ثانية لتبدّلها).' : '';
  document.getElementById('banner-form-title').scrollIntoView({ behavior: 'smooth' });
}

const AD_STATE = { PENDING: 'بانتظار الموافقة', SCHEDULED: 'مجدول', LIVE: 'ظاهر الآن', ENDED: 'انتهى', REJECTED: 'مرفوض', CANCELLED: 'ملغى' };

async function loadAdBookings(status) {
  adStatus = status || adStatus;
  document.querySelectorAll('[data-adstatus]').forEach(b => b.classList.toggle('active', b.dataset.adstatus === adStatus));
  const { ok, data } = await api('GET', '/admin/ads?status=' + adStatus);
  const body = document.getElementById('ads-body');
  if (!ok) { body.innerHTML = '<tr><td colspan="10">تعذّر التحميل</td></tr>'; return; }
  const day = d => new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
  body.innerHTML = data.length ? data.map(a => `<tr>
    <td>${esc(a.merchant.businessName)}${a.hasImage ? `<br><a href="#" onclick="viewCreative('space','${a.id}');return false">🖼️ صورة الزبون</a>` : ''}</td><td>${esc(a.product.icon || '')} ${esc(a.product.name)}</td><td>${esc(a.country)}</td><td>${a.slot}</td><td>${a.days} يوم</td><td>${a.credits}</td>
    <td><span class="badge ${a.status === 'ACTIVE' ? 'APPROVED' : a.status === 'PENDING' ? 'PENDING' : 'REJECTED'}">${esc(AD_STATE[a.state] || a.state)}</span></td>
    <td>${day(a.startsAt)} → ${day(a.endsAt)}</td><td>${a.impressions} / ${a.clicks}</td>
    <td>${a.status === 'PENDING' ? `<button class="small" onclick="reviewAd('${a.id}','approve')">موافقة</button><button class="small danger" onclick="reviewAd('${a.id}','reject')">رفض</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="10" class="muted">ما في حجوزات</td></tr>';
  refreshAdsBadge();
}

/** The number on the menu: small-space bookings and big-banner bookings both waiting for the admin. */
async function refreshAdsBadge() {
  const [small, big] = await Promise.all([api('GET', '/admin/ads?status=PENDING'), api('GET', '/admin/banner-bookings?status=PENDING')]);
  const total = (small.ok ? small.data.length : 0) + (big.ok ? big.data.length : 0);
  const nav = document.getElementById('ads-pending-count');
  if (total) { nav.textContent = total; nav.style.display = ''; } else nav.style.display = 'none';
}

async function reviewAd(id, action) {
  let body = {};
  if (action === 'reject') { const reason = prompt('سبب الرفض (بيوصل لصاحب النشاط، واختياري):'); if (reason === null) return; body = { reason }; }
  const { ok, data } = await api('POST', '/admin/ads/' + id + '/' + action, body);
  if (!ok) alert(errText(data, 'تعذّر التنفيذ'));
  loadAdBookings(adStatus);
}

const BANNER_HINT = { none: 'القيمة', deals: 'القيمة', section: 'اسم القسم (electronics, fashion, home, beauty, grocery, sports, kids, books, auto, health)', product: 'رقم المنتج (id)', shop: 'رقم المتجر (id)', url: 'الرابط (https://...)' };
function bannerTargetHint() { document.getElementById('bn-target-label').textContent = BANNER_HINT[document.getElementById('bn-target').value]; }

async function loadBanners() {
  const { ok, data } = await api('GET', '/admin/banners');
  const box = document.getElementById('banners-list');
  if (!ok) { box.innerHTML = 'تعذّر التحميل'; return; }
  bannersCache = data;
  box.innerHTML = data.length ? '<table><thead><tr><th></th><th>العنوان</th><th>الدولة</th><th>الفترة</th><th>الحالة</th><th>مشاهدات / نقرات</th><th></th></tr></thead><tbody>' + data.map((b, i) => `<tr>
    <td style="white-space:nowrap"><button class="small secondary" ${i === 0 ? 'disabled' : ''} onclick="moveBanner(${i},-1)">▲</button><button class="small secondary" ${i === data.length - 1 ? 'disabled' : ''} onclick="moveBanner(${i},1)">▼</button></td>
    <td>${b.imageUrl ? '<img src="' + esc(b.imageUrl) + '" style="width:64px;height:24px;object-fit:cover;border-radius:4px;vertical-align:middle"> ' : ''}${esc(b.title)}</td>
    <td>${esc(b.countryCode || 'الكل')}</td><td>${b.startsAt ? new Date(b.startsAt).toLocaleDateString('ar') : '—'} → ${b.endsAt ? new Date(b.endsAt).toLocaleDateString('ar') : '—'}</td>
    <td><span class="badge ${b.isActive ? 'active' : 'inactive'}">${b.isActive ? 'ظاهر' : 'مخفي'}</span></td><td>${b.views} / ${b.clicks}</td>
    <td style="white-space:nowrap"><button class="small" onclick="editBanner('${b.id}')">تعديل</button><button class="small danger" onclick="deleteBanner('${b.id}')">حذف</button></td></tr>`).join('') + '</tbody></table>' : '<p class="muted">ما في بانرات — بيظهر البانر الافتراضي.</p>';
}

async function moveBanner(i, d) {
  const ids = bannersCache.map(b => b.id);
  [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
  await api('PUT', '/admin/banners-order', { ids });
  loadBanners();
}

function localInput(iso) { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

function editBanner(id) {
  const b = bannersCache.find(x => x.id === id);
  if (!b) return;
  editingBanner = id;
  document.getElementById('banner-form-title').textContent = 'تعديل البانر';
  document.getElementById('bn-title').value = b.title;
  document.getElementById('bn-subtitle').value = b.subtitle || '';
  document.getElementById('bn-button').value = b.buttonText || '';
  document.getElementById('bn-bg').value = b.bg;
  document.getElementById('bn-target').value = b.targetType;
  document.getElementById('bn-value').value = b.targetValue || '';
  document.getElementById('bn-country').value = b.countryCode || '';
  document.getElementById('bn-start').value = localInput(b.startsAt);
  document.getElementById('bn-end').value = localInput(b.endsAt);
  document.getElementById('bn-active').value = String(b.isActive);
  document.getElementById('bn-image').value = '';
  bannerTargetHint();
  document.getElementById('banner-form-title').scrollIntoView({ behavior: 'smooth' });
}

function resetBannerForm() {
  editingBanner = null;
  bannerForBooking = null;
  document.getElementById('banner-form-title').textContent = 'بانر جديد';
  ['bn-title', 'bn-subtitle', 'bn-button', 'bn-value', 'bn-start', 'bn-end', 'bn-image'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('bn-bg').value = 'coral';
  document.getElementById('bn-target').value = 'none';
  document.getElementById('bn-country').value = '';
  document.getElementById('bn-active').value = 'true';
  bannerTargetHint();
}

async function saveBanner() {
  const msg = document.getElementById('banner-msg');
  const val = id => document.getElementById(id).value;
  const iso = id => (val(id) ? new Date(val(id)).toISOString() : null);
  const body = {
    title: val('bn-title').trim(), subtitle: val('bn-subtitle').trim() || null, buttonText: val('bn-button').trim() || null, bg: val('bn-bg'),
    targetType: val('bn-target'), targetValue: val('bn-value').trim() || null, countryCode: val('bn-country') || null,
    startsAt: iso('bn-start'), endsAt: iso('bn-end'), isActive: val('bn-active') === 'true',
    ...(bannerForBooking ? { bookingId: bannerForBooking } : {}),
  };
  if (!body.title) { msg.textContent = 'اكتب العنوان'; return; }
  msg.textContent = 'عم يحفظ...';
  const res = editingBanner ? await api('PATCH', '/admin/banners/' + editingBanner, body) : await api('POST', '/admin/banners', body);
  if (!res.ok) { msg.textContent = errText(res.data, 'تعذّر الحفظ'); return; }
  const file = document.getElementById('bn-image').files[0];
  if (file) {
    const up = await fetch('/admin/banners/' + res.data.id + '/image', { method: 'PUT', headers: { 'Content-Type': file.type, Authorization: 'Bearer ' + state.token }, body: file });
    if (!up.ok) { msg.textContent = 'انحفظ البانر لكن الصورة ما انرفعت (JPG/PNG/WebP حتى 2 ميغا)'; loadBanners(); return; }
  }
  msg.textContent = 'تم الحفظ ✓';
  const hadBooking = !!bannerForBooking;
  resetBannerForm();
  loadBanners();
  if (hadBooking) loadBannerBookings(bbStatus);
}

async function deleteBanner(id) {
  if (!confirm('حذف هذا البانر؟')) return;
  await api('DELETE', '/admin/banners/' + id);
  if (editingBanner === id) resetBannerForm();
  loadBanners();
}

// ---- Store ----
async function demoStore(method) {
  const out = document.getElementById('store-msg');
  if (method === 'DELETE' && !confirm('حذف المتاجر والمنتجات التجريبية؟')) return;
  out.textContent = 'لحظة...';
  const { ok, data } = await api(method, '/admin/demo-store');
  if (!ok) { out.textContent = (data && data.error && data.error.message) || 'تعذّر التنفيذ'; return; }
  out.textContent = method === 'POST'
    ? (data.created ? `انضافت ${data.created} منتج لـ ${data.shops} متاجر.` : `المنتجات التجريبية موجودة من قبل (${data.products}).`)
    : `انحذف ${data.products} منتج و${data.shops} متاجر تجريبية.`;
}

// ---- AI provider status ----
let aiPacks = [];

function renderAiPacks() {
  document.getElementById('ai-packs').innerHTML = aiPacks.map((p, i) => `
    <tr>
      <td><input placeholder="مثال: باقة شهرية" value="${esc(p.name)}" oninput="aiPacks[${i}].name=this.value"></td>
      <td><input placeholder="مثال: 30" type="number" min="1" max="365" value="${p.days}" oninput="aiPacks[${i}].days=Number(this.value)"></td>
      <td><input placeholder="مثال: 100" type="number" min="1" value="${p.uses}" oninput="aiPacks[${i}].uses=Number(this.value)"></td>
      <td><input placeholder="مثال: 500" type="number" min="0" value="${p.credits}" oninput="aiPacks[${i}].credits=Number(this.value)"></td>
      <td><button class="small danger" onclick="aiPacks.splice(${i},1);renderAiPacks()">✕</button></td>
    </tr>`).join('');
}

function aiPackAdd() {
  aiPacks.push({ id: 'p-' + Date.now().toString(36), name: '', days: 30, uses: 100, credits: 1000 });
  renderAiPacks();
}

async function testImageEdit() {
  const msg = document.getElementById('ai-image-msg');
  msg.textContent = 'جاري الاختبار...';
  const { ok, data } = await api('POST', '/admin/ai-image-test');
  if (!ok) { msg.textContent = errText(data, 'تعذّر الاختبار'); return; }
  msg.textContent = data.ok ? 'تعديل الصور بالذكاء الاصطناعي شغّال ✓ (' + data.ms + ' ms)' : 'ما اشتغل: ' + (data.reason || 'سبب غير معروف');
}

async function loadAiQuota() {
  const { ok, data } = await api('GET', '/admin/settings');
  if (!ok || !data.ai) return;
  document.getElementById('ai-free').value = data.ai.freePerMonth;
  document.getElementById('ai-price').value = data.ai.creditsPerUse;
  aiPacks = (data.ai.packages || []).map((p) => ({ ...p }));
  renderAiPacks();
}

async function saveAiQuota() {
  const msg = document.getElementById('ai-quota-msg');
  const freePerMonth = Number(document.getElementById('ai-free').value);
  const creditsPerUse = Number(document.getElementById('ai-price').value);
  if (!Number.isInteger(freePerMonth) || freePerMonth < 0 || !Number.isInteger(creditsPerUse) || creditsPerUse < 0) { msg.textContent = 'اكتب أرقام صحيحة (صفر أو أكثر)'; return; }
  if (aiPacks.some((p) => p.name.trim().length < 2 || !(p.days >= 1) || !(p.uses >= 1) || !(p.credits >= 0))) { msg.textContent = 'عبّي اسم وأيام واستخدامات وسعر لكل باقة'; return; }
  msg.textContent = 'عم نحفظ...';
  const { ok } = await api('PUT', '/admin/settings', { ai: { freePerMonth, creditsPerUse, packages: aiPacks.map((p) => ({ id: p.id, name: p.name.trim(), days: p.days, uses: p.uses, credits: p.credits })) } });
  msg.textContent = ok ? 'انحفظ ✓' : 'تعذّر الحفظ';
}

async function loadAiStatus() {
  loadAiQuota();
  const { ok, data } = await api('GET', '/admin/ai-status');
  if (!ok) { logout(); return; }
  document.getElementById('ai-vision').textContent = data.vision ? 'شغّال ✓' : 'مطفأ — ضيف مفتاح Gemini على Render';

  // Every provider the server knows, in the order they are tried; a failing one rests for a while (shown here).
  const providers = (data.providers || []).map(p => ({
    key: p.id,
    label: `${esc(p.label)} — ${esc(p.model)}${p.id === 'anthropic' ? ' (احتياطي أخير)' : ''}`
      + (p.cooldownSeconds > 0 ? `<br><small class="muted">⏸ يرتاح ${esc(p.cooldownSeconds)} ث — ${esc(p.lastError || '')}</small>` : (p.lastError ? `<br><small class="muted">آخر خطأ: ${esc(p.lastError)}</small>` : '')),
    configured: p.configured,
  }));
  const rows = (usage, withTest) => providers.map(p => {
    const u = usage[p.key] || { attempts: 0, successes: 0, failures: 0 };
    return `
      <tr>
        <td>${p.label}</td>
        <td><span class="badge ${p.configured ? 'APPROVED' : 'REJECTED'}">${p.configured ? 'نعم' : 'لا'}</span></td>
        <td>${u.attempts}</td>
        <td>${u.successes}</td>
        <td>${u.failures}</td>
        ${withTest ? `<td>${p.configured ? `<button class="small" onclick="testAiProvider('${p.key}', this)">جرّب</button><span id="ai-test-${p.key}" class="muted"></span>` : ''}</td>` : ''}
      </tr>`;
  }).join('');

  document.getElementById('ai-session-body').innerHTML = rows(data.usage, true);
  document.getElementById('ai-active').textContent = data.activeProvider || 'لا يوجد أي مزوّد مضبوط';
  document.getElementById('ai-last').textContent = data.usage.lastProvider || '—';
  document.getElementById('ai-last-at').textContent = data.usage.lastUsedAt ? new Date(data.usage.lastUsedAt).toLocaleString() : 'لا ردّ بعد';

  const totals = data.usageTotals;
  if (totals) {
    document.getElementById('ai-totals-body').innerHTML = rows(totals);
    document.getElementById('ai-totals-note').textContent = totals.lastUsedAt
      ? `آخر جواب مسجّل: ${totals.lastProvider} — ${new Date(totals.lastUsedAt).toLocaleString()}`
      : 'ما في ولا جواب مسجّل بعد';
  } else {
    document.getElementById('ai-totals-body').innerHTML = '<tr><td colspan="5" class="muted">غير متاح — تعذّر الوصول لقاعدة البيانات</td></tr>';
    document.getElementById('ai-totals-note').textContent = '';
  }

  document.getElementById('ai-msg').textContent = 'آخر تحديث ' + new Date().toLocaleTimeString();
}

// ---- merchants ----
let merchantsPage = 1, merchantsRows = [];
function merchantsGo(p) { merchantsPage = p; renderMerchants(); }
async function loadMerchants(status) {
  merchantsPage = 1;
  document.querySelectorAll('.filters button').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  if (!state.plans) await loadPlans(); // the plan selector below needs the merchant plans
  const { ok, data } = await api('GET', '/merchant/list' + (status ? '?status=' + status : ''));
  if (!ok) { logout(); return; }
  merchantsRows = data;
  renderMerchants();
}
function renderMerchants() {
  const data = merchantsRows.slice((merchantsPage - 1) * PAGE_SIZE, merchantsPage * PAGE_SIZE);
  document.getElementById('merchants-pager').innerHTML = pagerHtml('merchantsGo', merchantsPage, merchantsRows.length);
  document.getElementById('merchants-body').innerHTML = data.map((m, i) => `
    <tr>
      <td class="rownum">${(merchantsPage - 1) * PAGE_SIZE + i + 1}</td>
      <td>${m.businessName}</td>
      <td>${m.user.fullName}</td>
      <td class="muted">${m.user.email}</td>
      <td>${m.category ? m.category.name : '—'}</td>
      <td><span class="badge ${m.approvalStatus}">${statusLabel(m.approvalStatus)}</span>${m.approvalStatus === 'PENDING' && m.reviewNote ? `<br><small class="muted">🤖 ${esc(m.reviewNote)}</small>` : ''}${m.approvalStatus === 'REJECTED' && m.rejectionReason ? `<br><small class="muted">${m.reviewSource === 'ADMIN' ? '' : '🤖 '}${esc(m.rejectionReason)}</small>` : ''}${m.approvalStatus === 'APPROVED' && m.reviewSource === 'AI' ? '<br><small class="muted">🤖 وافق عليه الذكاء الاصطناعي</small>' : ''}</td>
      <td>${m.latitude != null && m.longitude != null
        ? `<a href="https://www.google.com/maps?q=${Number(m.latitude)},${Number(m.longitude)}" target="_blank" rel="noopener">📍 عرض</a>`
        : `<span class="muted" title="بدون موقع لا يظهر المحل على الخريطة">⚠️ غير محدد</span>`}</td>
      <td><select onchange="assignMerchantPlan('${m.id}', this.value)">
        <option value="">— الافتراضي —</option>
        ${(state.plans || []).filter(p => p.service === 'MERCHANT_ACCOUNT').map(p => `<option value="${p.id}" ${m.planId === p.id ? 'selected' : ''}>${esc(p.name)}${p.monthlyBroadcastLimit != null ? ' (' + esc(p.monthlyBroadcastLimit) + ' إعلان/شهر)' : ''}</option>`).join('')}
      </select></td>
      <td>${m.approvalStatus === 'PENDING' ? `
        <button class="small" onclick="approveMerchant('${m.id}')">✅ موافقة</button>
        <button class="small danger" onclick="rejectMerchant('${m.id}')">❌ رفض</button>
      ` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="9" class="muted">لا يوجد أصحاب أنشطة بهذه الحالة</td></tr>`;
}
async function assignMerchantPlan(id, planId) {
  const { ok, data } = await api('PUT', '/admin/merchants/' + id + '/plan', { planId: planId || null });
  if (!ok) alert(errText(data, 'تعذّر تعيين الباقة'));
}
function statusLabel(s) { return { PENDING: 'بانتظار الموافقة', APPROVED: 'معتمد', REJECTED: 'مرفوض' }[s] || s; }
async function approveMerchant(id) {
  await api('POST', '/merchant/' + id + '/approve');
  loadMerchants(currentMerchantFilter());
}
async function rejectMerchant(id) {
  const reason = prompt('سبب الرفض؟');
  if (!reason) return;
  await api('POST', '/merchant/' + id + '/reject', { reason });
  loadMerchants(currentMerchantFilter());
}
function currentMerchantFilter() {
  const active = document.querySelector('.filters button.active');
  return active ? active.dataset.status : '';
}

// ---- categories ----
async function loadCategories() {
  const { data } = await api('GET', '/categories');
  const top = data || [];
  // sections > professions > specialties: flatten the whole tree, remembering how deep each node is
  state.categoriesFlat = [];
  const walk = (nodes, depth) => nodes.forEach(c => { state.categoriesFlat.push({ ...c, depth }); walk(c.children || [], depth + 1); });
  walk(top, 0);

  document.getElementById('cat-parent').innerHTML = '<option value="">— بدون —</option>' +
    state.categoriesFlat.filter(c => c.depth < 2).map(c => `<option value="${c.id}">${'— '.repeat(c.depth)}${c.name}</option>`).join('');

  const rows = state.categoriesFlat.map(c => categoryRow(c, c.depth));
  document.getElementById('categories-body').innerHTML = rows.join('') || `<tr><td colspan="2" class="muted">لا يوجد تصنيفات بعد</td></tr>`;
}
function categoryRow(c, depth) {
  return `<tr class="${depth ? 'child-row' : ''}">
    <td style="padding-inline-start:${12 + depth * 22}px"><input placeholder="مثال: ملابس" class="inline-input" style="width:200px" id="cat-name-${c.id}" value="${c.name}" /> <span class="muted">${c.merchantCount || 0}</span></td>
    <td>
      <button class="small" onclick="saveCategory('${c.id}')">💾 حفظ</button>
      <button class="small danger" onclick="deleteCategory('${c.id}')">🗑️ حذف</button>
    </td>
  </tr>`;
}
async function addCategory() {
  const name = document.getElementById('cat-name').value.trim();
  const parentId = document.getElementById('cat-parent').value || undefined;
  if (!name) return;
  const { ok, data } = await api('POST', '/categories', { name, parentId });
  if (!ok) { alert(errText(data, 'خطأ')); return; }
  document.getElementById('cat-name').value = '';
  loadCategories();
}
async function saveCategory(id) {
  const name = document.getElementById('cat-name-' + id).value.trim();
  if (!name) return;
  const { ok, data } = await api('PATCH', '/categories/' + id, { name });
  if (!ok) alert(errText(data, 'تعذّر الحفظ'));
  loadCategories();
}
async function deleteCategory(id) {
  if (!confirm('حذف هذا التصنيف نهائيًا؟')) return;
  const { ok, data } = await api('DELETE', '/categories/' + id);
  if (!ok) {
    alert(data.error === 'Category is still in use and can\'t be deleted'
      ? `ما بقدر أحذفه — مستخدم حاليًا (تصنيفات فرعية: ${data.childCount}, أصحاب أنشطة: ${data.merchantCount}, منتجات: ${data.productCount})`
      : (data.error || 'تعذّر الحذف'));
    return;
  }
  loadCategories();
}

// ---- plans, country prices, tax ----
const SERVICE_LABEL = {
  MEMBERSHIP: 'عضوية الزبون',
  MERCHANT_ACCOUNT: 'باقة النشاط',
  RESPONDER_CUSTOMER: 'المجيب الآلي — زبون',
  RESPONDER_MERCHANT: 'المجيب الآلي — نشاط',
};
const SERVICE_ORDER = ['MEMBERSHIP', 'MERCHANT_ACCOUNT', 'RESPONDER_CUSTOMER', 'RESPONDER_MERCHANT'];
let planCountries = [];

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadPlans() {
  const [plansRes, countriesRes] = await Promise.all([api('GET', '/plans/admin'), api('GET', '/geo/countries')]);
  if (!plansRes.ok) return;
  planCountries = countriesRes.ok ? countriesRes.data : [];
  state.plans = plansRes.data || [];
  renderPlans();
  loadTaxRates();
}

function countryOptions(selectedId, withDefault) {
  return (withDefault ? `<option value="">— الافتراضي لكل البلدان —</option>` : '') +
    planCountries.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escHtml(c.name)} (${escHtml(c.isoCode2)})</option>`).join('');
}

function priceRowHtml(p) {
  p = p || {};
  return `<div class="pp-row row" style="align-items:flex-end;margin-bottom:6px">
    <div><label>البلد</label><select class="pp-country">${countryOptions(p.countryId, false)}</select></div>
    <div><label>بالكوينز</label><input placeholder="مثال: 500" class="pp-credits" value="${p.priceCredits ?? ''}" /></div>
    <div><label>بالعملة (اختياري)</label><input placeholder="مثال: 9.99" class="pp-cash" value="${p.cashAmountCents != null ? money(p.cashAmountCents) : ''}" /></div>
    <div><label>رمز العملة</label><input placeholder="مثال: EUR" class="pp-cur" maxlength="3" value="${escHtml(p.currencyCode || '')}" /></div>
    <div style="flex:0 0 auto"><label>فعّال</label><input type="checkbox" class="pp-active" style="width:auto" ${p.isActive === false ? '' : 'checked'} /></div>
    <div style="flex:0 0 auto"><button class="small danger" onclick="this.closest('.pp-row').remove()">✕</button></div>
  </div>`;
}

function addPriceRow(planId) {
  document.getElementById('pp-' + planId).insertAdjacentHTML('beforeend', priceRowHtml());
}

function planCardHtml(p) {
  const isMerchant = p.service === 'MERCHANT_ACCOUNT';
  const features = (p.features || []).map(f => (f.included ? '✔ ' : '✘ ') + f.text).join('\n');
  const needsCredits = p.priceCents > 0 && p.priceCredits == null;
  return `<div class="card plan-card">
    <div class="plan-head">
      <strong>${escHtml(p.name)}</strong>
      <span class="badge PENDING">${SERVICE_LABEL[p.service] || p.service}</span>
      <span class="badge ${p.isActive ? 'active' : 'inactive'}">${p.isActive ? 'فعالة' : 'معطّلة'}</span>
      <span class="muted">${p._count ? p._count.memberships : 0} عضوية</span>
      ${needsCredits ? '<span class="badge REJECTED" title="ما حدا بيقدر يشترك بهي الباقة">ما في سعر بالكوينز</span>' : ''}
    </div>
    <div class="row">
      <div><label>الاسم</label><input placeholder="مثال: شهري" id="pl-name-${p.id}" value="${escHtml(p.name)}" /></div>
      <div><label>وصف قصير</label><input placeholder="وصف قصير للباقة" id="pl-desc-${p.id}" value="${escHtml(p.description || '')}" /></div>
    </div>
    <div class="row">
      <div><label>المدة (يوم)</label><input placeholder="مثال: 30" id="pl-duration-${p.id}" value="${p.durationDays}" /></div>
      <div><label>أيام التجربة</label><input placeholder="مثال: 7" id="pl-trial-${p.id}" value="${p.trialDays}" /></div>
      <div><label>ترتيب العرض</label><input placeholder="مثال: 1" id="pl-sort-${p.id}" value="${p.sortOrder}" /></div>
      ${isMerchant ? `<div><label>حد الرسائل الجماعية بالشهر</label><input placeholder="مثال: 10" id="pl-broadcast-${p.id}" value="${p.monthlyBroadcastLimit ?? ''}" /></div>` : ''}
    </div>
    <div class="row">
      <div><label>السعر (بالعملة)</label><input placeholder="مثال: 9.99" id="pl-price-${p.id}" value="${money(p.priceCents)}" /></div>
      <div><label>العملة</label><input placeholder="مثال: EUR" id="pl-currency-${p.id}" maxlength="3" value="${escHtml(p.currency)}" /></div>
      <div><label>السعر بالكوينز (المخصوم من المحفظة)</label><input id="pl-credits-${p.id}" value="${p.priceCredits ?? ''}" placeholder="غير مضبوط" /></div>
    </div>
    <label>المواصفات — بند بكل سطر، وابدأ السطر بـ ✘ إذا البند غير مشمول</label>
    <textarea id="pl-features-${p.id}" rows="4" placeholder="✔ 500 رد ذكي بالشهر&#10;✘ رسائل جماعية">${escHtml(features)}</textarea>
    <label>أسعار خاصة بالبلدان (الباقة بتنباع بسعرها الأساسي لأي بلد ما إلو سطر هون)</label>
    <div id="pp-${p.id}">${(p.prices || []).map(priceRowHtml).join('')}</div>
    <button class="small secondary" onclick="addPriceRow('${p.id}')">+ إضافة بلد</button>
    <div style="margin-top:14px">
      <button onclick="savePlanFull('${p.id}')">💾 حفظ الباقة</button>
      <button class="secondary" onclick="togglePlanActive('${p.id}', ${p.isActive})">${p.isActive ? 'تعطيل' : 'تفعيل'}</button>
      <button class="danger" onclick="removePlan('${p.id}')">🗑️ حذف</button>
    </div>
  </div>`;
}

function renderPlans() {
  const plans = state.plans || [];
  const html = SERVICE_ORDER.map(service => {
    const group = plans.filter(p => p.service === service);
    if (!group.length) return '';
    return `<h3 style="margin:24px 0 10px">${SERVICE_LABEL[service]}</h3>${group.map(planCardHtml).join('')}`;
  }).join('');
  document.getElementById('plans-list').innerHTML = html || '<div class="card muted">لا يوجد باقات بعد</div>';
}

function parseNonNegInt(raw, label) {
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 0) { alert(label + ' لازم يكون رقم صحيح'); return null; }
  return n;
}

async function addServicePlan() {
  const name = document.getElementById('np-name').value.trim();
  const durationDays = parseInt(document.getElementById('np-duration').value, 10);
  const trialDays = parseNonNegInt(document.getElementById('np-trial').value || '0', 'أيام التجربة');
  const priceCents = Math.round(parseFloat(document.getElementById('np-price').value) * 100);
  const currency = (document.getElementById('np-currency').value.trim() || 'EUR').toUpperCase();
  const creditsRaw = document.getElementById('np-credits').value.trim();
  const priceCredits = creditsRaw === '' ? null : parseNonNegInt(creditsRaw, 'السعر بالكوينز');
  if (!name || !durationDays || trialDays === null || !Number.isFinite(priceCents) || (creditsRaw !== '' && priceCredits === null)) return;
  const { ok, data } = await api('POST', '/plans', {
    service: document.getElementById('np-service').value, name, durationDays, trialDays, priceCents, currency, priceCredits,
  });
  if (!ok) { alert(errText(data, 'خطأ')); return; }
  document.getElementById('np-name').value = '';
  loadPlans();
}

function readFeatures(id) {
  return document.getElementById('pl-features-' + id).value.split('\n').map(l => l.trim()).filter(Boolean).map(line => ({
    included: !line.startsWith('✘'),
    text: line.replace(/^[✔✘]\s*/, '').slice(0, 200),
  })).filter(f => f.text);
}

function readCountryPrices(id) {
  const rows = [...document.querySelectorAll('#pp-' + id + ' .pp-row')];
  const out = [];
  for (const row of rows) {
    const countryId = row.querySelector('.pp-country').value;
    const credits = parseNonNegInt(row.querySelector('.pp-credits').value, 'سعر البلد بالكوينز');
    if (!countryId || credits === null) return null;
    const cash = row.querySelector('.pp-cash').value.trim();
    const cur = row.querySelector('.pp-cur').value.trim().toUpperCase();
    out.push({
      countryId, priceCredits: credits,
      cashAmountCents: cash === '' ? null : Math.round(parseFloat(cash) * 100),
      currencyCode: cur.length === 3 ? cur : null,
      isActive: row.querySelector('.pp-active').checked,
    });
  }
  return out;
}

async function savePlanFull(id) {
  const get = k => document.getElementById(`pl-${k}-${id}`);
  const plan = state.plans.find(p => p.id === id);
  const creditsRaw = get('credits').value.trim();
  const priceCredits = creditsRaw === '' ? null : parseNonNegInt(creditsRaw, 'السعر بالكوينز');
  const durationDays = parseInt(get('duration').value, 10);
  const trialDays = parseNonNegInt(get('trial').value, 'أيام التجربة');
  const sortOrder = parseInt(get('sort').value, 10);
  const priceCents = Math.round(parseFloat(get('price').value) * 100);
  if ((creditsRaw !== '' && priceCredits === null) || trialDays === null || !durationDays || !Number.isFinite(priceCents) || !Number.isFinite(sortOrder)) return;
  const prices = readCountryPrices(id);
  if (prices === null) return;
  if (new Set(prices.map(p => p.countryId)).size !== prices.length) { alert('كل بلد مرة وحدة بس'); return; }

  const body = {
    name: get('name').value.trim(), description: get('desc').value.trim() || null,
    durationDays, trialDays, sortOrder, priceCents, currency: get('currency').value.trim().toUpperCase(), priceCredits,
  };
  if (plan.service === 'MERCHANT_ACCOUNT') {
    const raw = get('broadcast').value.trim();
    body.monthlyBroadcastLimit = raw === '' ? null : parseNonNegInt(raw, 'حد الرسائل الجماعية');
    if (raw !== '' && body.monthlyBroadcastLimit === null) return;
  }
  const saved = await api('PATCH', '/plans/' + id, body);
  if (!saved.ok) { alert(errText(saved.data, 'تعذّر الحفظ')); return; }
  const f = await api('PUT', `/plans/${id}/features`, { features: readFeatures(id) });
  if (!f.ok) { alert(errText(f.data, 'تعذّر حفظ المواصفات')); return; }
  const p = await api('PUT', `/plans/${id}/prices`, { prices });
  if (!p.ok) { alert(errText(p.data, 'تعذّر حفظ أسعار البلدان')); return; }
  loadPlans();
}

async function togglePlanActive(id, current) {
  await api('PATCH', '/plans/' + id, { isActive: !current });
  loadPlans();
}

async function removePlan(id) {
  if (!confirm('حذف هذه الباقة نهائيًا؟')) return;
  const { ok, data } = await api('DELETE', '/plans/' + id);
  if (!ok) { alert(errText(data, 'تعذّر الحذف')); return; }
  loadPlans();
}

async function loadTaxRates() {
  const { ok, data } = await api('GET', '/plans/tax-rates');
  if (!ok) return;
  document.getElementById('tx-country').innerHTML = countryOptions(null, true);
  document.getElementById('tax-body').innerHTML = (data || []).map(r => `
    <tr>
      <td>${r.country ? escHtml(r.country.name) + ' (' + escHtml(r.country.isoCode2) + ')' : '<strong>الافتراضي لكل البلدان</strong>'}</td>
      <td>${escHtml(r.name)}</td>
      <td>${(r.percentBps / 100).toFixed(2)}%</td>
      <td><button class="small danger" onclick="removeTaxRate('${r.id}')">🗑️ حذف</button></td>
    </tr>`).join('') || `<tr><td colspan="4" class="muted">ما في نسب ضريبة — الفواتير بتطلع بدون ضريبة</td></tr>`;
}

async function saveTaxRate() {
  const countryId = document.getElementById('tx-country').value || null;
  const name = document.getElementById('tx-name').value.trim();
  const percent = parseFloat(document.getElementById('tx-percent').value);
  if (!name || !Number.isFinite(percent) || percent < 0 || percent > 100) { alert('اكتب اسم النسبة ونسبة بين 0 و 100'); return; }
  const { ok, data } = await api('PUT', '/plans/tax-rates', { countryId, name, percentBps: Math.round(percent * 100) });
  if (!ok) { alert(errText(data, 'تعذّر الحفظ')); return; }
  document.getElementById('tx-name').value = '';
  document.getElementById('tx-percent').value = '';
  loadTaxRates();
}

async function removeTaxRate(id) {
  if (!confirm('حذف هذه النسبة؟')) return;
  await api('DELETE', '/plans/tax-rates/' + id);
  loadTaxRates();
}

// ---- responder / payments ----
async function loadResponderAdmin() {
  const { ok, data } = await api('GET', '/admin/settings');
  if (!ok) return;
  document.getElementById('rs-credit-name').value = data.creditName;
  document.getElementById('rs-credits-usd').value = data.creditsPerUsd;
  document.getElementById('rs-price-customer').value = data.responder.priceCustomer;
  document.getElementById('rs-price-merchant').value = data.responder.priceMerchant;
  document.getElementById('rs-period').value = data.responder.periodDays;
  document.getElementById('rs-trial').value = data.responder.trialDays;
  document.getElementById('rs-ai-limit').value = data.responder.monthlyAiReplyLimit;
  document.getElementById('rs-usdt').value = data.payment.usdtTrc20Address;
  document.getElementById('rs-syp').value = data.payment.sypPerUsd || 0;
  document.getElementById('rs-wallets').value = data.payment.localWallets.map(w => [w.key, w.label, w.accountNumber, w.instructions || ''].join('|')).join('\n');
  loadChannels();
  loadSubs();
}
async function saveResponderSettings() {
  const num = (id) => Number(document.getElementById(id).value);
  const wallets = document.getElementById('rs-wallets').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [key, label, accountNumber, instructions] = l.split('|').map(x => (x || '').trim());
    return { key, label, accountNumber, instructions };
  });
  const { ok, data } = await api('PUT', '/admin/settings', {
    creditName: document.getElementById('rs-credit-name').value.trim(),
    creditsPerUsd: num('rs-credits-usd'),
    responder: { priceCustomer: num('rs-price-customer'), priceMerchant: num('rs-price-merchant'), periodDays: num('rs-period'), trialDays: num('rs-trial'), monthlyAiReplyLimit: num('rs-ai-limit') },
    payment: { usdtTrc20Address: document.getElementById('rs-usdt').value.trim(), localWallets: wallets, sypPerUsd: num('rs-syp') || 0 },
  });
  const msg = document.getElementById('rs-msg');
  msg.textContent = ok ? '✅ انحفظت' : '❌ ' + errText(data, 'تحقق من القيم (مفاتيح المحافظ بأحرف كبيرة وأرقام و _)');
}
async function loadChannels() {
  const { ok, data } = await api('GET', '/admin/channels');
  if (!ok) return;
  document.getElementById('channels-body').innerHTML = data.map(c => `
    <tr><td>${esc(c.name)}</td><td class="muted">${c.driver}</td><td class="muted">${esc(c.key)}</td><td>${c._count.connections}</td>
    <td><span class="badge ${c.isEnabled ? 'active' : 'inactive'}">${c.isEnabled ? 'مفعّلة' : 'معطّلة'}</span></td>
    <td><button class="small secondary" onclick="toggleChannel('${c.id}', ${!c.isEnabled})">${c.isEnabled ? 'تعطيل' : 'تفعيل'}</button></td></tr>`).join('');
}
async function addChannel() {
  const { ok, data } = await api('POST', '/admin/channels', {
    key: document.getElementById('ch-key').value.trim(), name: document.getElementById('ch-name').value.trim(), driver: document.getElementById('ch-driver').value,
  });
  if (!ok) { alert(errText(data, 'تحقق من المفتاح (a-z, 0-9, - _) والاسم')); return; }
  document.getElementById('ch-key').value = ''; document.getElementById('ch-name').value = '';
  loadChannels();
}
async function toggleChannel(id, isEnabled) { await api('PATCH', '/admin/channels/' + id, { isEnabled }); loadChannels(); }
async function loadSubs() {
  const { ok, data } = await api('GET', '/admin/responder/subscriptions');
  if (!ok) return;
  document.getElementById('subs-body').innerHTML = data.map(s => `<tr><td>${esc(s.user.fullName)} <span class="muted">${esc(s.user.email)}</span></td><td>${s.user.role}</td><td>${s.status}</td>
    <td class="muted">${String((s.status === 'TRIAL' ? s.trialEndsAt : s.periodEnd) || '').slice(0, 10)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">لا اشتراكات بعد</td></tr>';
}
let topupFilter = 'PENDING';
async function loadTopups(status) {
  topupFilter = status || topupFilter;
  document.querySelectorAll('[data-tstatus]').forEach(b => b.classList.toggle('active', b.dataset.tstatus === topupFilter));
  const { ok, data } = await api('GET', '/admin/topups?status=' + topupFilter);
  if (!ok) return;
  document.getElementById('topups-body').innerHTML = data.map(t => `<tr>
    <td>${esc(t.user.fullName)} <span class="muted">${esc(t.user.email)}</span></td><td>${esc(t.method)}</td>
    <td class="muted" style="max-width:140px;overflow-wrap:anywhere">${esc(t.reference)}</td><td>${t.amountClaimed ?? '—'}</td>
    <td><span class="badge ${t.status === 'PENDING' ? 'PENDING' : t.status === 'APPROVED' ? 'APPROVED' : 'REJECTED'}">${t.status}${t.verifiedBy === 'AUTO' ? ' (تلقائي)' : ''}</span></td>
    <td>${t.status === 'PENDING' ? `<button class="small" onclick="approveTopup('${t.id}')">✅ قبول</button><button class="small danger" onclick="rejectTopup('${t.id}')">❌ رفض</button>` : (t.amountCredits ? t.amountCredits + ' وحدة' : '')}</td></tr>`).join('')
    || '<tr><td colspan="6" class="muted">لا يوجد طلبات</td></tr>';
}
async function approveTopup(id) {
  const v = prompt('كم وحدة من عملة دليلكم تضيف لرصيده؟');
  const amountCredits = parseInt(v, 10);
  if (!amountCredits || amountCredits <= 0) return;
  const { ok, data } = await api('POST', '/admin/topups/' + id + '/approve', { amountCredits });
  if (!ok) alert(errText(data, 'خطأ'));
  loadTopups();
}
async function rejectTopup(id) {
  const note = prompt('سبب الرفض؟'); if (!note) return;
  await api('POST', '/admin/topups/' + id + '/reject', { note }); loadTopups();
}
async function adjustWallet() {
  const { ok, data } = await api('POST', '/admin/wallet/adjust', {
    userEmail: document.getElementById('adj-email').value.trim(), amount: parseInt(document.getElementById('adj-amount').value, 10), note: document.getElementById('adj-note').value.trim() || undefined,
  });
  alert(ok ? 'الرصيد الجديد: ' + data.balance : errText(data, 'تحقق من البيانات'));
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- Landmarks: mosques, hospitals, parks, main streets (places without an owner's account) ----
const lm = { kinds: [], items: {}, page: 1, editingId: null, map: null, layer: null, path: [], inited: false, importMap: null, importMarker: null, importCircle: null };
const LM_STATUS = { ACTIVE: ['ظاهر', 'APPROVED'], PENDING_REVIEW: ['بانتظار المراجعة', 'PENDING'], HIDDEN: ['مخفي', 'inactive'], CLAIMED: ['استلمه صاحبه', 'APPROVED'] };
const LM_CITIES = [['دمشق', 33.5138, 36.2765], ['حلب', 36.2021, 37.1343], ['حمص', 34.7324, 36.7137], ['حماة', 35.1318, 36.7578], ['اللاذقية', 35.5317, 35.7901], ['طرطوس', 34.8890, 35.8866], ['درعا', 32.6189, 36.1021], ['إدلب', 35.9306, 36.6339], ['دير الزور', 35.3359, 40.1408], ['الحسكة', 36.5024, 40.7477], ['السويداء', 32.7090, 36.5663]];
const LM_IMPORTABLE = ['mosque', 'church', 'hospital', 'park', 'school', 'kindergarten', 'university', 'government', 'police', 'fire_station', 'post_office', 'bus_station', 'train_station', 'airport', 'stadium', 'museum', 'historic', 'market', 'square', 'neighborhood', 'main_street'];
const hasArabicText = (s) => /[؀-ۿ]/.test(s || '');

async function lmOpen() {
  if (!lm.inited) {
    lm.inited = true;
    await lmLoadKinds();
    document.getElementById('lm-cities').innerHTML = LM_CITIES.map(([n, la, ln]) => `<button class="secondary small" onclick="lmPickCity(${la},${ln})">${n}</button>`).join('');
  }
  lmTab('list');
  lmDupsBadge();
  api('GET', '/admin/landmark-claims?status=PENDING').then(r => { if (r.ok) document.getElementById('lm-claims-badge').textContent = r.data.total ? ' ' + r.data.total : ''; });
}

async function lmLoadKinds() {
  const r = await api('GET', '/admin/landmark-kinds');
  if (!r.ok) return;
  lm.kinds = r.data.kinds;
  const opts = lm.kinds.map(k => `<option value="${k.id}" data-slug="${esc(k.slug)}" data-geo="${k.geometry}">${esc(k.icon)} ${esc(k.nameAr)}</option>`).join('');
  document.getElementById('lm-kind').innerHTML = opts;
  document.getElementById('lm-f-kind').innerHTML = '<option value="">كل الأنواع</option>' + lm.kinds.map(k => `<option value="${esc(k.slug)}">${esc(k.icon)} ${esc(k.nameAr)}</option>`).join('');
  document.getElementById('lm-i-kinds').innerHTML = `<div style="display:flex;gap:8px;width:100%;margin-bottom:4px"><button class="secondary small" type="button" onclick="lmImportKinds(true)">تحديد الكل</button><button class="secondary small" type="button" onclick="lmImportKinds(false)">إلغاء التحديد</button></div>` + lm.kinds.filter(k => LM_IMPORTABLE.includes(k.slug)).map(k => `<label style="display:inline-flex;align-items:center;gap:6px;margin:0;cursor:pointer;font-size:14px;color:var(--text)"><input type="checkbox" class="lm-i-kind" value="${esc(k.slug)}"${['mosque', 'hospital', 'park', 'main_street'].includes(k.slug) ? ' checked' : ''}> ${esc(k.icon)} ${esc(k.nameAr)}</label>`).join('');
  lmRenderKinds();
}

function lmTab(name) {
  document.querySelectorAll('#lm-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['list', 'form', 'import', 'claims', 'dups', 'kinds'].forEach(p => { document.getElementById('lm-pane-' + p).style.display = p === name ? 'block' : 'none'; });
  if (name === 'list') lmLoad(lm.page || 1);
  if (name === 'claims') lmLoadClaims(1);
  if (name === 'dups') lmLoadDups();
  if (name === 'form') { if (!lm.editingId) lmResetForm(); setTimeout(lmInitMap, 50); }
  if (name === 'import') setTimeout(lmInitImportMap, 50);
}

async function lmLoad(page) {
  lm.page = page || 1;
  const params = new URLSearchParams({ page: lm.page });
  const status = document.getElementById('lm-f-status').value, kind = document.getElementById('lm-f-kind').value, q = document.getElementById('lm-f-q').value.trim();
  if (status) params.set('status', status);
  if (kind) params.set('kind', kind);
  if (q) params.set('q', q);
  const r = await api('GET', '/admin/landmarks?' + params.toString());
  if (!r.ok) { document.getElementById('lm-body').innerHTML = `<tr><td colspan="6" class="muted">${esc(errText(r.data, 'تعذّر التحميل'))}</td></tr>`; return; }
  const d = r.data;
  lm.items = {};
  d.items.forEach(l => { lm.items[l.id] = l; });
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  document.getElementById('lm-counts').innerHTML = `<button class="secondary small" onclick="lmFilterStatus('')">الكل ${fmt(total)}</button> ` + Object.entries(LM_STATUS).map(([k, [label]]) => `<button class="secondary small" onclick="lmFilterStatus('${k}')">${label} <b>${fmt(d.counts[k] || 0)}</b></button>`).join(' ');
  const bulk = document.getElementById('lm-bulk');
  // the approve-all button is always there while places wait for review (whatever status is being looked at)
  const waiting = d.counts.PENDING_REVIEW || 0;
  const kindName = kind ? ((lm.kinds.find(k => k.slug === kind) || {}).nameAr || kind) : '';
  if (waiting > 0) {
    bulk.style.display = 'block';
    bulk.innerHTML = `<button onclick="lmBulk('approve')">✅ اعتماد كل المنتظرة${kind ? ' من نوع «' + esc(kindName) + '»' : ''} ${kind ? '' : ' (' + fmt(waiting) + ')'} وإظهارها على الخريطة</button> ` +
      (status === 'PENDING_REVIEW' ? `<button class="danger" onclick="lmBulk('delete')">🗑️ حذف كل المنتظرة${kind ? ' من نوع «' + esc(kindName) + '»' : ''}</button> ` : '') +
      `<span class="muted">الأماكن اللي بدون اسم عربي معلّمة ⚠️، عدّلها قبل الاعتماد.</span>`;
  } else { bulk.style.display = 'none'; }
  document.getElementById('lm-body').innerHTML = d.items.length ? d.items.map((l, i) => `
    <tr>
      <td class="rownum">${(lm.page - 1) * d.pageSize + i + 1}</td>
      <td><b>${esc(l.name)}</b>${hasArabicText(l.name) ? '' : ' <span class="badge PENDING" title="الاسم مو بالعربي، عدّله">⚠️ بدون اسم عربي</span>'}${l.nameEn ? `<br><small class="muted" dir="ltr">${esc(l.nameEn)}</small>` : ''}</td>
      <td>${esc(l.kind.icon)} ${esc(l.kind.nameAr)}${l.sector ? ` <small class="muted">· ${l.sector === 'PUBLIC' ? 'عام' : 'خاص'}</small>` : ''}</td>
      <td class="muted">${esc(l.address || '—')}</td>
      <td><span class="badge ${LM_STATUS[l.status][1]}">${LM_STATUS[l.status][0]}</span>${l.source === 'OSM' ? ' <small class="muted">OSM</small>' : ''}</td>
      <td style="white-space:nowrap">
        <button class="small secondary" onclick="lmEdit('${l.id}')">✏️ تعديل</button>
        ${l.status === 'PENDING_REVIEW' || l.status === 'HIDDEN' ? `<button class="small" onclick="lmSetStatus('${l.id}','ACTIVE')">✅ اعتماد</button>` : ''}
        ${l.status === 'ACTIVE' ? `<button class="small secondary" onclick="lmSetStatus('${l.id}','HIDDEN')">🙈 إخفاء</button>` : ''}
        ${l.status !== 'CLAIMED' ? `<button class="small danger" onclick="lmDelete('${l.id}')">🗑️</button>` : ''}
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted">ما في أماكن بهالفلتر</td></tr>';
  document.getElementById('lm-pager').innerHTML = pagerHtml('lmLoad', lm.page, d.total);
}

function lmFilterStatus(s) { document.getElementById('lm-f-status').value = s; lmLoad(1); }

async function lmSetStatus(id, status) {
  const r = await api('PATCH', '/admin/landmarks/' + id, { status });
  if (!r.ok) { alert(errText(r.data, 'تعذّر التعديل')); return; }
  lmLoad(lm.page);
}

async function lmDelete(id) {
  if (!confirm('تحذف هالمكان؟')) return;
  const r = await fetch('/admin/landmarks/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + state.token } });
  if (!r.ok) { alert(errText(await r.json().catch(() => ({})), 'تعذّر الحذف')); return; }
  lmLoad(lm.page);
}

async function lmBulk(action) {
  // only the places waiting for review (never the hidden or the shown ones), of the kind chosen in the filter if any
  const filter = { status: 'PENDING_REVIEW', kind: document.getElementById('lm-f-kind').value || undefined };
  if (!confirm(action === 'approve' ? 'تعتمد كل الأماكن المنتظرة للمراجعة وتظهر على الخريطة؟' : 'تحذف كل الأماكن المنتظرة للمراجعة؟ ما بيرجعوا.')) return;
  const r = await api('POST', '/admin/landmarks/review', { action, filter });
  if (!r.ok) { alert(errText(r.data, 'تعذّر التنفيذ')); return; }
  alert('تم: ' + fmt(r.data.changed) + ' مكان');
  lmLoad(1);
}

/* ---- the form with the map ---- */

function lmKind() { const o = document.getElementById('lm-kind').selectedOptions[0]; return o ? { id: o.value, slug: o.dataset.slug, geo: o.dataset.geo } : { geo: 'POINT' }; }

function lmResetForm() {
  lm.editingId = null; lm.path = [];
  document.getElementById('lm-form-title').textContent = 'مكان جديد';
  ['name', 'name-en', 'phone', 'address', 'desc', 'lat', 'lng'].forEach(f => { document.getElementById('lm-' + f).value = ''; });
  document.getElementById('lm-status').value = 'ACTIVE';
  document.getElementById('lm-sector').value = '';
  document.getElementById('lm-msg').textContent = '';
  document.getElementById('lm-dup').style.display = 'none';
  lmKindChanged();
  lmDraw();
}

function lmKindChanged() {
  const k = lmKind();
  document.getElementById('lm-sector-box').style.display = k.slug === 'hospital' ? '' : 'none';
  document.getElementById('lm-line-tools').style.display = k.geo === 'LINE' ? 'block' : 'none';
  document.getElementById('lm-map-hint').textContent = k.geo === 'LINE' ? 'اضغط على الخريطة نقطة نقطة لرسم الشارع (القطعة الجديدة للأجزاء المنفصلة)' : 'اضغط على الخريطة لتحديد المكان (أو اسحب الدبوس)';
  lmDraw();
}

function lmInitMap() {
  if (!window.L) { document.getElementById('lm-map').textContent = 'تعذّر تحميل الخريطة'; return; }
  if (!lm.map) {
    lm.map = L.map('lm-map').setView([33.5138, 36.2765], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(lm.map);
    lm.layer = L.layerGroup().addTo(lm.map);
    lm.map.on('click', (e) => lmMapClick(e.latlng.lat, e.latlng.lng));
  }
  lm.map.invalidateSize();
  lmDraw(true);
}

function lmMapClick(lat, lng) {
  if (lmKind().geo === 'LINE') {
    if (!lm.path.length) lm.path.push([]);
    lm.path[lm.path.length - 1].push([lat, lng]);
    lmDraw();
  } else {
    document.getElementById('lm-lat').value = lat.toFixed(6);
    document.getElementById('lm-lng').value = lng.toFixed(6);
    lmDraw();
  }
}
function lmNewSegment() { if (!lm.path.length || lm.path[lm.path.length - 1].length) lm.path.push([]); }
function lmUndoPoint() { const last = lm.path[lm.path.length - 1]; if (last) { last.pop(); if (!last.length) lm.path.pop(); } lmDraw(); }
function lmClearPath() { lm.path = []; lmDraw(); }

function lmDraw(fit) {
  if (!lm.map || !lm.layer) return;
  lm.layer.clearLayers();
  const k = lmKind();
  if (k.geo === 'LINE') {
    lm.path.forEach(seg => { if (seg.length) L.polyline(seg, { color: '#8e44ad', weight: 5 }).addTo(lm.layer); seg.forEach(p => L.circleMarker(p, { radius: 4, color: '#8e44ad', fillOpacity: 1 }).addTo(lm.layer)); });
    document.getElementById('lm-line-info').textContent = lm.path.length ? lm.path.length + ' قطعة · ' + lm.path.reduce((a, s) => a + s.length, 0) + ' نقطة' : '';
    if (fit && lm.path.length) lm.map.fitBounds(L.latLngBounds(lm.path.flat()), { padding: [30, 30] });
  } else {
    const lat = parseFloat(document.getElementById('lm-lat').value), lng = parseFloat(document.getElementById('lm-lng').value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const m = L.marker([lat, lng], { draggable: true }).addTo(lm.layer);
      m.on('dragend', () => { const p = m.getLatLng(); document.getElementById('lm-lat').value = p.lat.toFixed(6); document.getElementById('lm-lng').value = p.lng.toFixed(6); });
      if (fit) lm.map.setView([lat, lng], 16);
    }
  }
}

function lmEdit(id) {
  const l = lm.items[id];
  if (!l) return;
  lm.editingId = id;
  lmTab('form');
  document.getElementById('lm-form-title').textContent = 'تعديل: ' + l.name;
  document.getElementById('lm-kind').value = l.kindId;
  document.getElementById('lm-status').value = l.status === 'CLAIMED' ? 'HIDDEN' : l.status;
  document.getElementById('lm-name').value = l.name;
  document.getElementById('lm-name-en').value = l.nameEn || '';
  document.getElementById('lm-sector').value = l.sector || '';
  document.getElementById('lm-phone').value = l.phone || '';
  document.getElementById('lm-address').value = l.address || '';
  document.getElementById('lm-desc').value = l.description || '';
  document.getElementById('lm-lat').value = l.latitude;
  document.getElementById('lm-lng').value = l.longitude;
  lm.path = Array.isArray(l.path) ? l.path.map(seg => seg.map(p => [p[0], p[1]])) : [];
  document.getElementById('lm-dup').style.display = 'none';
  lmKindChanged();
  setTimeout(() => { lmInitMap(); lmDraw(true); if (lm.map && !(lm.path.length)) lm.map.setView([l.latitude, l.longitude], 16); }, 80);
}

function lmLabelPoint() {
  const segs = lm.path.filter(s => s.length >= 2);
  if (!segs.length) return null;
  const longest = [...segs].sort((a, b) => b.length - a.length)[0];
  return longest[Math.floor(longest.length / 2)];
}

async function lmSave(force) {
  const msg = document.getElementById('lm-msg');
  const k = lmKind();
  const body = {
    kindId: k.id, name: document.getElementById('lm-name').value.trim(), nameEn: document.getElementById('lm-name-en').value.trim() || null,
    description: document.getElementById('lm-desc').value.trim() || null, address: document.getElementById('lm-address').value.trim() || null,
    phone: document.getElementById('lm-phone').value.trim() || null, status: document.getElementById('lm-status').value,
    sector: k.slug === 'hospital' ? (document.getElementById('lm-sector').value || null) : null,
  };
  if (k.geo === 'LINE') {
    const mid = lmLabelPoint();
    if (!mid) { msg.textContent = 'ارسم الشارع على الخريطة أول (نقطتين على الأقل)'; return; }
    body.latitude = mid[0]; body.longitude = mid[1]; body.path = lm.path.filter(s => s.length >= 2);
  } else {
    body.latitude = parseFloat(document.getElementById('lm-lat').value); body.longitude = parseFloat(document.getElementById('lm-lng').value);
    if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) { msg.textContent = 'حدّد المكان على الخريطة'; return; }
  }
  if (!body.name) { msg.textContent = 'اكتب الاسم'; return; }
  if (force) body.force = true;
  const r = lm.editingId ? await api('PATCH', '/admin/landmarks/' + lm.editingId, body) : await api('POST', '/admin/landmarks', body);
  const dup = document.getElementById('lm-dup');
  if (r.status === 409 && r.data.error && Array.isArray(r.data.error.details)) {
    dup.style.display = 'block';
    dup.innerHTML = 'في مكان مشابه موجود على الخريطة: ' + r.data.error.details.map(s => `<b>${esc(s.name)}</b>`).join('، ') + ' <button class="small" onclick="lmSave(true)">أضيف رغم ذلك</button>';
    return;
  }
  dup.style.display = 'none';
  if (!r.ok) { msg.textContent = errText(r.data, 'فشل الحفظ'); return; }
  msg.textContent = 'انحفظ ✅';
  lm.editingId = null;
  lmTab('list');
}

/* ---- import ---- */

function lmImportKinds(checked) { document.querySelectorAll('.lm-i-kind').forEach(c => { c.checked = checked; }); }

function lmImportCenter() {
  const lat = parseFloat(document.getElementById('lm-i-lat').value), lng = parseFloat(document.getElementById('lm-i-lng').value);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

function lmImportRadius() {
  const radius = parseFloat(document.getElementById('lm-i-r').value);
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

function lmDrawImportArea(fit) {
  if (!lm.importMap || !window.L) return;
  const center = lmImportCenter(), radius = lmImportRadius();
  if (!center) return;
  if (lm.importMarker) lm.importMap.removeLayer(lm.importMarker);
  lm.importMarker = L.marker(center, { draggable: true }).addTo(lm.importMap);
  lm.importMarker.on('dragend', () => {
    const p = lm.importMarker.getLatLng();
    document.getElementById('lm-i-lat').value = p.lat.toFixed(6);
    document.getElementById('lm-i-lng').value = p.lng.toFixed(6);
    lmDrawImportArea(false);
  });
  if (lm.importCircle) lm.importMap.removeLayer(lm.importCircle);
  if (radius) {
    lm.importCircle = L.circle(center, { radius: radius * 1000, color: '#ba2a34', weight: 2, fillColor: '#ba2a34', fillOpacity: 0.12 }).addTo(lm.importMap);
    if (fit) lm.importMap.fitBounds(lm.importCircle.getBounds(), { padding: [20, 20], maxZoom: 14 });
  } else if (fit) lm.importMap.setView(center, 12);
}

function lmInitImportMap() {
  if (!window.L) { document.getElementById('lm-i-map').textContent = 'تعذّر تحميل الخريطة'; return; }
  let created = false;
  if (!lm.importMap) {
    lm.importMap = L.map('lm-i-map').setView(lmImportCenter() || [33.5138, 36.2765], 11);
    created = true;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(lm.importMap);
    lm.importMap.on('click', e => {
      document.getElementById('lm-i-lat').value = e.latlng.lat.toFixed(6);
      document.getElementById('lm-i-lng').value = e.latlng.lng.toFixed(6);
      lmDrawImportArea(false);
    });
    document.getElementById('lm-i-r').addEventListener('input', () => lmDrawImportArea(true));
    ['lm-i-lat', 'lm-i-lng'].forEach(id => document.getElementById(id).addEventListener('change', () => lmDrawImportArea(true)));
  }
  lm.importMap.invalidateSize();
  if (!lmImportCenter()) {
    document.getElementById('lm-i-lat').value = '33.5138';
    document.getElementById('lm-i-lng').value = '36.2765';
  }
  if (created) lm.importMap.setView(lmImportCenter(), 11);
  lmDrawImportArea(false);
}

function lmPickCity(lat, lng) {
  document.getElementById('lm-i-lat').value = lat;
  document.getElementById('lm-i-lng').value = lng;
  if (lm.importMap) {
    lm.importMap.setView([lat, lng], 12);
    lmDrawImportArea(false);
  }
}

async function lmImport() {
  const msg = document.getElementById('lm-i-msg'), btn = document.getElementById('lm-i-btn');
  const kinds = [...document.querySelectorAll('.lm-i-kind:checked')].map(c => c.value);
  const latitude = parseFloat(document.getElementById('lm-i-lat').value), longitude = parseFloat(document.getElementById('lm-i-lng').value), radiusKm = parseFloat(document.getElementById('lm-i-r').value);
  if (!kinds.length) { msg.textContent = 'اختار نوع واحد على الأقل'; return; }
  if (![latitude, longitude, radiusKm].every(Number.isFinite)) { msg.textContent = 'اختار مدينة أو اكتب الإحداثيات'; return; }
  btn.disabled = true;
  // a few kinds at a time: each request stays short (the map-data service is shared and slow), and the totals are added up here
  const parts = []; for (let i = 0; i < kinds.length; i += 4) parts.push(kinds.slice(i, i + 4));
  const names = Object.fromEntries(lm.kinds.map(k => [k.slug, k.nameAr]));
  const sum = { total: 0, skipped: 0, unnamed: 0, withoutArabic: 0, created: {} };
  let failed = '';
  for (let i = 0; i < parts.length; i++) {
    msg.textContent = `جاري الجلب (${i + 1} من ${parts.length})… ممكن ياخد دقيقة لكل دفعة`;
    const r = await api('POST', '/admin/landmarks/import', { latitude, longitude, radiusKm, kinds: parts[i] });
    if (!r.ok) { failed = `تعذّرت دفعة (${parts[i].map(k => names[k] || k).join('، ')}): ` + errText(r.data, 'تعذّر الاستيراد'); break; }
    const d = r.data;
    sum.total += d.total; sum.skipped += d.skipped; sum.unnamed += d.unnamed; sum.withoutArabic += d.withoutArabic;
    Object.entries(d.created).forEach(([k, n]) => { sum.created[k] = (sum.created[k] || 0) + n; });
  }
  btn.disabled = false;
  msg.innerHTML = (failed ? `<span style="color:var(--danger,#b71c1c)">${esc(failed)}</span><br>` : '') + `انجلب <b>${fmt(sum.total)}</b> مكان جديد (${Object.entries(sum.created).map(([k, n]) => fmt(n) + ' ' + (names[k] || k)).join('، ') || 'لا شي'}) · موجود مسبقًا ${fmt(sum.skipped)} · بدون اسم ${fmt(sum.unnamed)} · بدون اسم عربي ${fmt(sum.withoutArabic)} <button class="small" onclick="lmFilterStatus('PENDING_REVIEW');lmTab('list')">افتح قائمة المراجعة</button>`;
}


/* ---- places that now have a shop of the same name next to them ---- */

async function lmDupsBadge() {
  const r = await api('GET', '/admin/landmark-duplicates');
  document.getElementById('lm-dups-badge').textContent = r.ok && r.data.items.length ? ' ' + r.data.items.length : '';
}

async function lmLoadDups() {
  const box = document.getElementById('ld-list');
  box.innerHTML = '<p class="muted">جاري البحث…</p>';
  const r = await api('GET', '/admin/landmark-duplicates');
  if (!r.ok) { box.innerHTML = `<p class="muted">${esc(errText(r.data, 'تعذّر التحميل'))}</p>`; return; }
  document.getElementById('lm-dups-badge').textContent = r.data.items.length ? ' ' + r.data.items.length : '';
  box.innerHTML = r.data.items.length ? `<table><thead><tr><th>المعلم (على الخريطة)</th><th>المحل المسجّل</th><th>المسافة</th><th></th></tr></thead><tbody>` + r.data.items.map(d => `
    <tr>
      <td>${esc(d.landmark.kind.icon)} <b>${esc(d.landmark.name)}</b><br><small class="muted">${esc(d.landmark.address || '—')}</small></td>
      <td>🏪 <b>${esc(d.shop.name)}</b><br><small class="muted">${esc(d.shop.address || '—')}</small></td>
      <td>${Math.round(d.km * 1000)} م</td>
      <td style="white-space:nowrap">
        <button class="small" onclick="lmDupHide('${d.landmark.id}')">🙈 إخفاء المعلم</button>
        <button class="small secondary" onclick="lmDupDismiss('${d.landmark.id}')">✋ مو نفس المكان</button>
      </td>
    </tr>`).join('') + '</tbody></table>' : '<p class="muted">ما في معالم مكررة 👌</p>';
}

async function lmDupHide(id) {
  const r = await api('PATCH', '/admin/landmarks/' + id, { status: 'HIDDEN' });
  if (!r.ok) { alert(errText(r.data, 'تعذّر الإخفاء')); return; }
  lmLoadDups();
}

async function lmDupDismiss(id) {
  const r = await api('POST', '/admin/landmarks/' + id + '/duplicate-dismiss', {});
  if (!r.ok) { alert(errText(r.data, 'تعذّر التنفيذ')); return; }
  lmLoadDups();
}


/* ---- claims: the proof, and the admin's decision ---- */

const LC_STATUS = { PENDING: ['بانتظار قرارك', 'PENDING'], NEEDS_INFO: ['طلبت معلومات', 'PENDING'], APPROVED: ['موافق عليها', 'APPROVED'], REJECTED: ['مرفوضة', 'REJECTED'], WITHDRAWN: ['سحبها صاحبها', 'inactive'] };
const LC_ROLE = { OWNER: 'مالك', MANAGER: 'مدير', AUTHORIZED: 'مفوّض' };

async function lmLoadClaims(page) {
  const status = document.getElementById('lc-status').value;
  const params = new URLSearchParams({ page: page || 1 });
  if (status) params.set('status', status);
  const r = await api('GET', '/admin/landmark-claims?' + params.toString());
  const list = document.getElementById('lc-list');
  if (!r.ok) { list.textContent = errText(r.data, 'تعذّر التحميل'); return; }
  if (!state.categoriesFlat || !state.categoriesFlat.length) await loadCategories();
  const d = r.data;
  const pending = (d.counts.PENDING || 0) + (d.counts.NEEDS_INFO || 0);
  document.getElementById('lc-counts').innerHTML = Object.entries(LC_STATUS).map(([k, [label]]) => `<span class="badge ${LC_STATUS[k][1]}">${label} ${fmt(d.counts[k] || 0)}</span>`).join(' ');
  document.getElementById('lm-claims-badge').textContent = (d.counts.PENDING || 0) ? ' ' + (d.counts.PENDING) : '';
  const day = (x) => new Date(x).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' });
  const catOptions = (state.categoriesFlat || []).map(c => `<option value="${c.id}">${'— '.repeat(c.depth)}${esc(c.name)}</option>`).join('');
  list.innerHTML = d.items.length ? d.items.map(c => `
    <div class="card" style="border:1px solid var(--line);box-shadow:none;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div><b style="font-size:16px">${esc(c.landmark.kind.icon)} ${esc(c.landmark.name)}</b> <span class="muted">· ${esc(c.landmark.kind.nameAr)}${c.landmark.sector ? ' · ' + (c.landmark.sector === 'PUBLIC' ? 'عام' : 'خاص') : ''}</span>
          <div class="muted">${esc(c.landmark.address || '')} <a href="https://www.google.com/maps?q=${c.landmark.latitude},${c.landmark.longitude}" target="_blank" rel="noopener">📍 عرض</a></div></div>
        <span class="badge ${LC_STATUS[c.status][1]}">${LC_STATUS[c.status][0]}</span>
      </div>
      <table style="margin-top:10px"><tbody>
        <tr><td class="muted" style="width:120px">مقدّم الطلب</td><td><b>${esc(c.user.fullName)}</b> · <span dir="ltr">${esc(c.user.email)}</span>${c.user.merchantProfile ? ` · <span class="badge APPROVED">عنده محل: ${esc(c.user.merchantProfile.businessName)}</span>` : ''}</td></tr>
        <tr><td class="muted">صفته</td><td>${esc(LC_ROLE[c.claimantRole] || c.claimantRole)}</td></tr>
        <tr><td class="muted">هاتف للتواصل</td><td dir="ltr" style="text-align:right"><a href="tel:${esc(c.contactPhone)}">${esc(c.contactPhone)}</a></td></tr>
        ${c.note ? `<tr><td class="muted">ملاحظته</td><td>${esc(c.note)}</td></tr>` : ''}
        ${c.adminMessage ? `<tr><td class="muted">ردّك</td><td>${esc(c.adminMessage)}</td></tr>` : ''}
        <tr><td class="muted">تاريخ الطلب</td><td>${day(c.createdAt)}</td></tr>
      </tbody></table>
      <div style="margin:10px 0"><b>الإثباتات (${c.files.length})</b></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap" id="lc-files-${c.id}">${c.files.length ? c.files.map(f => `<img data-file="${f.id}" alt="${esc(f.name)}" style="width:150px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line);cursor:zoom-in;background:var(--surface-2)" onclick="lcOpenFile(this)">`).join('') : '<span class="muted">ما أرسل صور</span>'}</div>
      ${c.status === 'PENDING' || c.status === 'NEEDS_INFO' ? `
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${c.user.merchantProfile ? '<span class="muted">بيتضاف فرعًا لمحله</span>' : `<select id="lc-cat-${c.id}" style="max-width:260px"><option value="">اختار مهنة المحل الجديد…</option>${catOptions}</select>`}
        <button onclick="lcApprove('${c.id}', ${c.user.merchantProfile ? 'true' : 'false'})">✅ موافقة</button>
        <button class="secondary" onclick="lcAsk('${c.id}')">❓ طلب معلومات</button>
        <button class="danger" onclick="lcReject('${c.id}')">❌ رفض</button>
      </div>` : ''}
    </div>`).join('') : '<p class="muted">ما في طلبات بهالحالة</p>';
  document.getElementById('lc-pager').innerHTML = pagerHtml('lmLoadClaims', page || 1, d.total);
  // the proof pictures need the admin's key, so they are fetched and shown from memory
  document.querySelectorAll('#lc-list img[data-file]').forEach(async (img) => {
    const res = await fetch('/admin/landmark-claims/files/' + img.dataset.file, { headers: { Authorization: 'Bearer ' + state.token } });
    if (res.ok) img.src = URL.createObjectURL(await res.blob());
  });
}

function lcOpenFile(img) { if (img.src) window.open(img.src, '_blank'); }

async function lcApprove(id, hasShop) {
  const body = {};
  if (!hasShop) {
    const cat = document.getElementById('lc-cat-' + id).value;
    if (!cat) { alert('اختار مهنة المحل الجديد أول'); return; }
    body.categoryId = cat;
  }
  if (!confirm('توافق؟ المكان بيصير محل صاحب الطلب وبيختفي من المعالم.')) return;
  const r = await api('POST', '/admin/landmark-claims/' + id + '/approve', body);
  if (!r.ok) { alert(errText(r.data, 'تعذّرت الموافقة')); return; }
  lmLoadClaims(1);
}
async function lcAsk(id) {
  const message = prompt('شو المعلومات أو الإثبات اللي بدك ياها؟ (بيوصله إشعار)');
  if (!message) return;
  const r = await api('POST', '/admin/landmark-claims/' + id + '/needs-info', { message });
  if (!r.ok) { alert(errText(r.data, 'تعذّر الإرسال')); return; }
  lmLoadClaims(1);
}
async function lcReject(id) {
  const reason = prompt('سبب الرفض؟ (بيوصل لصاحب الطلب)');
  if (!reason) return;
  const r = await api('POST', '/admin/landmark-claims/' + id + '/reject', { reason });
  if (!r.ok) { alert(errText(r.data, 'تعذّر الرفض')); return; }
  lmLoadClaims(1);
}

/* ---- kinds ---- */

function lmRenderKinds() {
  document.getElementById('lm-kinds-body').innerHTML = lm.kinds.map(k => `
    <tr>
      <td><input id="kd-icon-${k.id}" value="${esc(k.icon)}" style="width:60px"></td>
      <td><input id="kd-ar-${k.id}" value="${esc(k.nameAr)}"></td>
      <td><input id="kd-en-${k.id}" value="${esc(k.nameEn)}" dir="ltr"></td>
      <td><input id="kd-color-${k.id}" type="color" value="${esc(k.color)}" style="width:60px;height:36px;padding:2px"></td>
      <td>${k.geometry === 'LINE' ? 'خط' : 'نقطة'}</td>
      <td><input type="checkbox" id="kd-claim-${k.id}" ${k.claimable ? 'checked' : ''} style="width:20px;height:20px"></td>
      <td><input type="checkbox" id="kd-on-${k.id}" ${k.isActive ? 'checked' : ''} style="width:20px;height:20px"></td>
      <td><button class="small" onclick="lmSaveKind('${k.id}')">حفظ</button></td>
    </tr>`).join('');
}

async function lmSaveKind(id) {
  const g = (p) => document.getElementById('kd-' + p + '-' + id);
  const r = await api('PATCH', '/admin/landmark-kinds/' + id, { icon: g('icon').value.trim(), nameAr: g('ar').value.trim(), nameEn: g('en').value.trim(), color: g('color').value, claimable: g('claim').checked, isActive: g('on').checked });
  if (!r.ok) { alert(errText(r.data, 'فشل الحفظ')); return; }
  await lmLoadKinds();
  alert('انحفظ ✅');
}

async function lmAddKind() {
  const msg = document.getElementById('nk-msg');
  const r = await api('POST', '/admin/landmark-kinds', {
    slug: document.getElementById('nk-slug').value.trim(), nameAr: document.getElementById('nk-ar').value.trim(), nameEn: document.getElementById('nk-en').value.trim(),
    icon: document.getElementById('nk-icon').value.trim(), color: document.getElementById('nk-color').value, geometry: document.getElementById('nk-geo').value, claimable: false, isActive: true,
  });
  if (!r.ok) { msg.textContent = errText(r.data, 'فشلت الإضافة'); return; }
  msg.textContent = 'انضاف ✅';
  ['slug', 'ar', 'en', 'icon'].forEach(f => { document.getElementById('nk-' + f).value = ''; });
  await lmLoadKinds();
}

// ---- boot ----
if (state.token) enterApp();

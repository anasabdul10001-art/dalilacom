
function errText(d, f) { const e = d && d.error; if (!e) return f; if (typeof e === 'string') return e; const fe = Object.values((e.details && e.details.fieldErrors) || {}).flat()[0]; return fe || e.message || f; }
const state = { customerToken: null, merchantToken: null, adminToken: null, categories: [] };

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('panel-' + t.dataset.tab).classList.add('active');
});

function log(label, data) {
  const el = document.getElementById('log');
  el.textContent = `[${new Date().toLocaleTimeString()}] ${label}\n${JSON.stringify(data, null, 2)}\n\n` + el.textContent;
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  log(`${method} ${path} -> ${res.status}`, data);
  return { ok: res.ok, status: res.status, data };
}

function money(cents) { return (cents / 100).toFixed(2) + '€'; }

// ---- categories (shared) ----
async function loadCategoriesInto(selectId) {
  const { data } = await api('GET', '/categories');
  state.categories = [];
  const flat = [];
  for (const c of data) { flat.push(c); for (const ch of (c.children || [])) flat.push(ch); }
  const sel = document.getElementById(selectId);
  if (sel) sel.innerHTML = flat.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('search-category').innerHTML = '<option value="">الكل</option>' + flat.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}
loadCategoriesInto('m-category');

// ---- customer auth ----
async function customerRegister() {
  const { ok, data } = await api('POST', '/auth/register', {
    email: document.getElementById('c-email').value,
    password: document.getElementById('c-password').value,
    fullName: document.getElementById('c-fullname').value,
  });
  if (ok) { state.customerToken = data.token; renderCustomerStatus(); }
}
async function customerLogin() {
  const { ok, data } = await api('POST', '/auth/login', {
    email: document.getElementById('c-email').value,
    password: document.getElementById('c-password').value,
  });
  if (ok) { state.customerToken = data.token; renderCustomerStatus(); }
}
async function customerLogout() {
  if (state.customerToken) await api('POST', '/auth/logout', null, state.customerToken);
  state.customerToken = null; renderCustomerStatus();
}
function renderCustomerStatus() {
  const el = document.getElementById('customer-status');
  if (state.customerToken) { el.textContent = '✅ مسجل دخول'; el.className = 'status ok'; }
  else { el.textContent = '❌ غير مسجل دخول'; el.className = 'status bad'; }
}

// ---- membership ----
async function loadPlans() {
  const { data } = await api('GET', '/membership/plans');
  document.getElementById('plans-list').innerHTML = data.map(p => {
    // priceCredits is what the wallet is actually debited; without it on a priced plan nobody can subscribe.
    const price = p.priceCents > 0
      ? (p.priceCredits == null ? '⚠️ السعر بالكوينز غير مضبوط' : `${p.priceCredits} كوين`)
      : 'مجانية';
    return `<div class="item">${p.name} — ${p.durationDays} يوم — ${money(p.priceCents)} — <b>${price}</b>
     <button class="small" onclick="subscribe('${p.id}')">اشترك</button></div>`;
  }).join('') || '<div class="muted">لا يوجد خطط</div>';
}
async function subscribe(planId) {
  const { ok, data } = await api('POST', '/membership/subscribe', { planId }, state.customerToken);
  if (ok) {
    document.getElementById('membership-info').textContent =
      `✅ ${data.memberNumber} — ينتهي ${new Date(data.endDate).toLocaleDateString()}` +
      (data.creditsPaid ? ` — مدفوع ${data.creditsPaid} كوين (الرصيد: ${data.walletBalance})` : ' — مجانية');
  } else {
    log('خطأ بالاشتراك', data);
    alert(errText(data, 'تعذّر الاشتراك'));
  }
}
async function showQr() {
  const { ok, data } = await api('GET', '/qr/mine', null, state.customerToken);
  document.getElementById('qr-display').innerHTML = ok
    ? `<div>رقم العضوية: <b>${data.memberNumber}</b></div><code class="qr">${data.code}</code><div class="muted">صالح لـ ${data.expiresInSeconds} ثانية إضافية — يتغيّر كل 45 ثانية</div>`
    : `<div class="muted">${errText(data, 'لا يوجد عضوية فعالة')}</div>`;
}

// ---- discovery ----
async function searchMerchants(lat, lng) {
  const q = document.getElementById('search-q').value;
  const categoryId = document.getElementById('search-category').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categoryId) params.set('categoryId', categoryId);
  if (lat) { params.set('lat', lat); params.set('lng', lng); params.set('radiusKm', 100); }
  const { data } = await api('GET', '/merchant?' + params.toString());
  document.getElementById('merchants-list').innerHTML = (data || []).map(m => `
    <div class="item">
      <b>${m.businessName}</b> <span class="muted">${m.category?.name || ''}</span>
      ${m.distanceKm !== undefined ? `<span class="muted"> — ${m.distanceKm.toFixed(1)}كم</span>` : ''}
      ${(m.discounts || []).map(d => `<div class="muted">🏷️ ${d.title} (${d.percent}%)</div>`).join('')}
      <button class="small" onclick="viewMerchantProducts('${m.id}','${m.businessName}')">شوف المنتجات</button>
    </div>`).join('') || '<div class="muted">لا نتائج</div>';
}
async function viewMerchantProducts(merchantId, name) {
  const { data } = await api('GET', '/products?merchantId=' + merchantId);
  document.getElementById('merchants-list').innerHTML =
    `<button class="small secondary" onclick="searchMerchants()">⬅ رجوع للقائمة</button><h4>${name}</h4>` +
    (data || []).map(p => `
      <div class="item">
        ${p.name} — ${p.memberDiscountEnabled ? `<span class="price-orig">${money(p.priceCents)}</span> <span class="price-member">${money(p.memberPriceCents)}</span>` : money(p.priceCents)}
        <span class="muted">(مخزون: ${p.stock})</span>
        <button class="small" onclick="addToCart('${p.id}')">أضف للسلة</button>
      </div>`).join('') || '<div class="muted">لا منتجات</div>';
}

// ---- cart ----
async function addToCart(productId) {
  await api('POST', '/cart/items', { productId, quantity: 1 }, state.customerToken);
  loadCart();
}
async function loadCart() {
  const { ok, data } = await api('GET', '/cart', null, state.customerToken);
  if (!ok) { document.getElementById('cart-view').innerHTML = '<div class="muted">سجل دخول كزبون أول</div>'; return; }
  document.getElementById('cart-view').innerHTML = data.items.map(i => `
    <div class="item">${i.product.name} × ${i.quantity} (${i.product.merchant.businessName})
      — ${i.regularPriceCents !== i.unitPriceCents ? `<span class="price-orig">${money(i.regularPriceCents)}</span> <span class="price-member">${money(i.unitPriceCents)}</span>` : money(i.unitPriceCents)}
      = ${money(i.lineTotalCents)}
      <button class="small secondary" onclick="removeCartItem('${i.id}')">حذف</button>
    </div>`).join('') + `<div style="margin-top:8px"><b>المجموع: ${money(data.totalCents)}</b></div>`;
}
async function removeCartItem(id) {
  await api('DELETE', '/cart/items/' + id, null, state.customerToken);
  loadCart();
}
async function checkout() {
  const { ok, data } = await api('POST', '/cart/checkout', null, state.customerToken);
  if (ok) { alert('تم إنشاء ' + data.length + ' طلب/طلبات!'); loadCart(); loadMyOrders(); }
  else alert('خطأ: ' + errText(data, JSON.stringify(data)));
}
async function loadMyOrders() {
  const { data } = await api('GET', '/orders/mine', null, state.customerToken);
  document.getElementById('my-orders').innerHTML = (data || []).map(o => `
    <div class="item">${o.orderNumber} — ${o.merchant.businessName} — <b>${o.status}</b> — ${money(o.totalCents)}
      ${['PENDING','CONFIRMED','PREPARING'].includes(o.status) ? `<button class="small secondary" onclick="cancelOrder('${o.id}')">إلغاء</button>` : ''}
    </div>`).join('') || '<div class="muted">لا طلبات بعد</div>';
}
async function cancelOrder(id) {
  await api('POST', '/orders/' + id + '/cancel', null, state.customerToken);
  loadMyOrders();
}

// ---- notifications (section 13 + 87) ----
async function loadNotifications() {
  if (!state.customerToken) { log('إشعاراتي', { error: 'سجّل دخول كزبون أولًا' }); return; }
  const { ok, data } = await api('GET', '/notifications', null, state.customerToken);
  if (!ok) { log('إشعاراتي', data); return; }
  document.getElementById('notif-unread').textContent = data.unread ? `(${data.unread} غير مقروء)` : '(لا جديد)';
  document.getElementById('notif-list').innerHTML = data.items.length
    ? data.items.map(n => `
      <div class="item"${n.readAt ? ' style="opacity:.55"' : ''}>
        <b>${n.title}</b> <span class="muted">${new Date(n.createdAt).toLocaleString()}</span>
        <div class="muted">${n.body || ''}</div>
        ${n.readAt ? '' : `<button class="small secondary" onclick="markNotificationRead('${n.id}')">تعليم كمقروء</button>`}
      </div>`).join('')
    : '<div class="muted">ما في إشعارات بعد — اعمل طلب من السلة أو استخدم حسم بالـQR وشوف كيف بيوصل.</div>';
  await loadNotificationPrefs();
}
async function markNotificationRead(id) {
  await api('POST', '/notifications/' + id + '/read', null, state.customerToken);
  loadNotifications();
}
async function markAllNotificationsRead() {
  if (!state.customerToken) { log('إشعاراتي', { error: 'سجّل دخول كزبون أولًا' }); return; }
  const { ok, data } = await api('POST', '/notifications/read-all', null, state.customerToken);
  if (ok) log('تعليم الكل كمقروء', data);
  loadNotifications();
}
async function loadNotificationPrefs() {
  const { ok, data } = await api('GET', '/notifications/preferences', null, state.customerToken);
  if (!ok) return;
  document.getElementById('notif-prefs').innerHTML =
    '<table><thead><tr><th>النوع</th><th>كيف بيوصل</th></tr></thead><tbody>' +
    data.map(p => `<tr><td>${p.type}</td><td>
      <select onchange="saveNotificationPref('${p.type}', this.value)">
        <option value="FULL"${p.mode === 'FULL' ? ' selected' : ''}>كامل — داخل التطبيق + إيميل</option>
        <option value="IN_APP_ONLY"${p.mode === 'IN_APP_ONLY' ? ' selected' : ''}>داخل التطبيق فقط</option>
        <option value="OFF"${p.mode === 'OFF' ? ' selected' : ''}>معطّل</option>
      </select></td></tr>`).join('') +
    '</tbody></table>';
}
async function saveNotificationPref(type, mode) {
  const { ok, data } = await api('PUT', '/notifications/preferences', { preferences: [{ type, mode }] }, state.customerToken);
  log(ok ? 'تم حفظ تفضيل الإشعار' : 'خطأ بتفضيل الإشعار', ok ? { type, mode } : data);
}

// ---- merchant auth ----
async function merchantRegisterUser() {
  const { ok, data } = await api('POST', '/auth/register', {
    email: document.getElementById('m-email').value,
    password: document.getElementById('m-password').value,
    fullName: document.getElementById('m-fullname').value,
  });
  if (ok) { state.merchantToken = data.token; renderMerchantStatus(); }
}
async function merchantLogin() {
  const { ok, data } = await api('POST', '/auth/login', {
    email: document.getElementById('m-email').value,
    password: document.getElementById('m-password').value,
  });
  if (ok) { state.merchantToken = data.token; renderMerchantStatus(); }
}
async function merchantLogout() {
  if (state.merchantToken) await api('POST', '/auth/logout', null, state.merchantToken);
  state.merchantToken = null; renderMerchantStatus();
}
function renderMerchantStatus() {
  const el = document.getElementById('merchant-status');
  if (state.merchantToken) { el.textContent = '✅ مسجل دخول'; el.className = 'status ok'; }
  else { el.textContent = '❌ غير مسجل دخول'; el.className = 'status bad'; }
}

async function registerMerchantProfile() {
  const { ok, data } = await api('POST', '/merchant/register', {
    businessName: document.getElementById('m-bizname').value,
    categoryId: document.getElementById('m-category').value,
    address: document.getElementById('m-address').value,
    latitude: parseFloat(document.getElementById('m-lat').value),
    longitude: parseFloat(document.getElementById('m-lng').value),
  }, state.merchantToken);
  if (ok) {
    alert('تم التسجيل! الحالة: ' + data.approvalStatus + ' — لازم الأدمن يوافق (تبويب الأدمن).');
    // Role updated server-side — re-login to get a JWT carrying the MERCHANT role.
    await merchantLogin();
  }
}
async function loadMerchantMe() {
  const { ok, data } = await api('GET', '/merchant/me', null, state.merchantToken);
  document.getElementById('merchant-me').innerHTML = ok
    ? `<div>${data.businessName} — حالة الموافقة: <b>${data.approvalStatus}</b>${data.rejectionReason ? ' — سبب الرفض: ' + data.rejectionReason : ''}</div>`
    : `<div class="muted">${errText(data, 'خطأ')}</div>`;
}
async function addDiscount() {
  await api('POST', '/merchant/discounts', {
    title: document.getElementById('d-title').value,
    percent: parseInt(document.getElementById('d-percent').value, 10),
  }, state.merchantToken);
}
async function addProduct() {
  const memberPrice = document.getElementById('p-memberprice').value;
  await api('POST', '/products', {
    name: document.getElementById('p-name').value,
    priceCents: parseInt(document.getElementById('p-price').value, 10),
    stock: parseInt(document.getElementById('p-stock').value, 10),
    memberDiscountEnabled: !!memberPrice,
    ...(memberPrice ? { memberPriceCents: parseInt(memberPrice, 10) } : {}),
  }, state.merchantToken);
  loadMyProducts();
}
async function loadMyProducts() {
  const { data } = await api('GET', '/products/mine', null, state.merchantToken);
  document.getElementById('my-products').innerHTML = (data || []).map(p =>
    `<div class="item">${p.name} — ${money(p.priceCents)} — مخزون: ${p.stock}</div>`).join('') || '<div class="muted">لا منتجات بعد</div>';
}

async function verifyQr() {
  const { ok, data } = await api('POST', '/qr/verify', {
    memberNumber: document.getElementById('scan-member').value,
    code: document.getElementById('scan-code').value,
  }, state.merchantToken);
  document.getElementById('scan-result').innerHTML = ok
    ? `<div class="status ok">✅ MEMBER VERIFIED: ${data.member.fullName} — حسم: ${data.discount ? data.discount.percent + '%' : 'لا يوجد'}</div>`
    : `<div class="status bad">${errText(data, 'خطأ')}</div>`;
}
async function redeemQr() {
  const { ok, data } = await api('POST', '/qr/redeem', {
    memberNumber: document.getElementById('scan-member').value,
    code: document.getElementById('scan-code').value,
    billAmountCents: parseInt(document.getElementById('scan-bill').value, 10),
  }, state.merchantToken);
  document.getElementById('scan-result').innerHTML = ok
    ? `<div class="status ok">✅ تم! الفاتورة: ${money(data.billAmountCents)} — الحسم: ${money(data.discountAmountCents)} — النهائي: ${money(data.finalAmountCents)}</div>`
    : `<div class="status bad">${errText(data, 'خطأ')}</div>`;
}
async function loadMerchantOrders() {
  const { data } = await api('GET', '/orders/merchant', null, state.merchantToken);
  const next = { PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'SHIPPED', SHIPPED: 'DELIVERED' };
  document.getElementById('merchant-orders').innerHTML = (data || []).map(o => `
    <div class="item">${o.orderNumber} — ${o.user.fullName} — <b>${o.status}</b> — ${money(o.totalCents)}
      ${next[o.status] ? `<button class="small" onclick="advanceOrder('${o.id}','${next[o.status]}')">➡ ${next[o.status]}</button>` : ''}
    </div>`).join('') || '<div class="muted">لا طلبات بعد</div>';
}
async function advanceOrder(id, status) {
  await api('PATCH', '/orders/' + id + '/status', { status }, state.merchantToken);
  loadMerchantOrders();
}

// ---- admin ----
async function adminLogin() {
  const { ok, data } = await api('POST', '/auth/login', {
    email: document.getElementById('a-email').value,
    password: document.getElementById('a-password').value,
  });
  const el = document.getElementById('admin-status');
  if (ok) { state.adminToken = data.token; el.textContent = '✅ مسجل دخول'; el.className = 'status ok'; }
  else { el.textContent = '❌ فشل الدخول'; el.className = 'status bad'; }
}
async function loadPending() {
  const { data } = await api('GET', '/merchant/pending', null, state.adminToken);
  document.getElementById('pending-list').innerHTML = (data || []).map(m => `
    <div class="item">${m.businessName} — ${m.user.fullName} (${m.user.email})
      <button class="small" onclick="approveMerchant('${m.id}')">✅ موافقة</button>
      <button class="small secondary" onclick="rejectMerchant('${m.id}')">❌ رفض</button>
    </div>`).join('') || '<div class="muted">لا يوجد أصحاب أنشطة بانتظار الموافقة</div>';
}
async function approveMerchant(id) {
  await api('POST', '/merchant/' + id + '/approve', null, state.adminToken);
  loadPending();
}
async function rejectMerchant(id) {
  const reason = prompt('سبب الرفض؟') || 'لم يستوفِ الشروط';
  await api('POST', '/merchant/' + id + '/reject', { reason }, state.adminToken);
  loadPending();
}
async function createCategory() {
  await api('POST', '/categories', { name: document.getElementById('cat-name').value }, state.adminToken);
  loadCategoriesInto('m-category');
}

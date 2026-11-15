/* ---- The staff of a business owner (server: /business-staff/*, and /accounting/* with the header X-Business-Owner).
   The owner's "Staff" tab lives inside the accounting site. A staff member sees a workplace only after a real
   invitation was accepted (AGENTS.md: no empty profession sections); then the accounting opens for them as the owner's,
   with the tabs their role allows. ---- */

const STAFF_ROLES = ["CASHIER", "STOCK", "ASSISTANT", "MANAGER", "DRIVER", "MARKETER"];
/** The accounting tabs each kind of permission opens (the server enforces the same list). */
const ACC_TAB_TAG = { summary: "reports", reports: "reports", entry: "money", recurring: "money", sale: "sell", purchases: "money", parties: "partiesRead", invoices: "money", stock: "productsRead", tax: "admin", statements: "reports" };

function staffState() { return (S._staff = S._staff || { list: null, code: null, wp: undefined, mine: {} }); }
/** The workplace this session works in right now (null: the account's own accounting). */
function staffActing() {
  const wp = staffState().wp;
  return S._actAs && Array.isArray(wp) ? wp.find((w) => w.ownerId === S._actAs) || null : null;
}
function staffLoadWorkplaces() {
  const st = staffState();
  if (!S.token || st.wp !== undefined) return;
  st.wp = null;
  api("GET", "/business-staff/workplaces").then(({ ok, data }) => {
    st.wp = ok && Array.isArray(data) ? data : [];
    if (S._actAs && !st.wp.some((w) => w.ownerId === S._actAs)) staffSwitch(null);
    else render();
  });
}
function staffSwitch(ownerId) {
  S._actAs = ownerId || null;
  try { if (ownerId) localStorage.setItem("dlk_actas", ownerId); else localStorage.removeItem("dlk_actas"); } catch (e) { /* storage may be blocked */ }
  S._accounting = null;
  S._site = S._site || {};
  S._site.accounting = "home";
  render();
}
/** The accounting tabs for this session: the owner's own list, or what the staff role allows. */
function accTabs() {
  const all = SITES.accounting.tabs;
  const wp = staffActing();
  if (wp) return [...(wp.role === "DRIVER" ? ["deliveries"] : []), ...(wp.role === "MARKETER" ? ["marketing"] : []), ...all.filter((id) => (wp.allowed || []).includes(ACC_TAB_TAG[id])), "mywork"];
  return S._actAs ? ["mywork"] : [...all, "staff"];
}

const staffMoney = (c, cur) => (Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (cur || "");
const staffErr = (res, fallback) => toast((res.data && res.data.error && res.data.error.message) || fallback || t("staff.error"));

/** The switcher bar: only for accounts that really work for someone (nothing for everybody else). */
function staffSwitcherHtml() {
  staffLoadWorkplaces();
  const wp = staffState().wp;
  if (!Array.isArray(wp) || !wp.length) return "";
  const acting = staffActing();
  return `<div class="card" style="padding:10px"><div class="chips">
    <button class="btn small ${acting ? "outline" : ""}" onclick="staffSwitch(null)">${esc(t("staff.switch.mine"))}</button>
    ${wp.map((w) => `<button class="btn small ${acting && acting.ownerId === w.ownerId ? "" : "outline"}" onclick="staffSwitch('${w.ownerId}')">${esc(t("staff.workingAt", { name: w.businessName || "" }))}</button>`).join("")}
  </div></div>`;
}

/** On the accounting home: anyone signed in can enter an invitation code (the workplace then appears). */
function staffJoinCard() {
  if (!S.token) return "";
  return `<div class="card"><div class="section-title">${esc(t("staff.join.title"))}</div><p class="muted">${esc(t("staff.join.help"))}</p>
    <div class="field"><input id="staff-code" autocomplete="off" /></div>
    <button class="btn soft" onclick="staffAccept(this)">${esc(t("staff.join.btn"))}</button></div>`;
}
async function staffAccept(btn) {
  const code = (document.getElementById("staff-code") || {}).value || "";
  if (code.trim().length < 10) return toast(t("staff.join.help"));
  await uiBusy(btn, async () => {
    const res = await api("POST", "/business-staff/accept", { code: code.trim() });
    if (!res.ok) return staffErr(res);
    toast(t("staff.joined"));
    staffState().wp = undefined;
    staffSwitch(res.data.ownerId);
  });
}

/* ---- the owner's tab ---- */
function staffTab() {
  const st = staffState();
  if (st.list === null) { st.list = undefined; api("GET", "/business-staff").then(({ ok, data }) => { st.list = ok ? data : []; render(); }); }
  if (st.hrEmps === undefined) { st.hrEmps = null; api("GET", "/business-staff/hr-employees").then(({ ok, data }) => { st.hrEmps = ok && Array.isArray(data) ? data : []; render(); }); }
  const list = st.list || [];
  const roleOpts = STAFF_ROLES.map((r) => `<option value="${r}">${esc(t("staff.role." + r))}</option>`).join("");
  return `<div class="card"><div class="section-title">${esc(t("staff.title"))}</div><p class="muted">${esc(t("staff.help"))}</p></div>
    ${st.code ? `<div class="card"><div class="badge success">${esc(t("staff.inviteShow"))}</div><p><bdi><code style="font-size:15px;user-select:all">${esc(st.code)}</code></bdi></p><div class="btn-row"><button class="btn small soft" onclick="staffCopyCode()">${esc(t("staff.copy"))}</button></div></div>` : ""}
    <div class="card"><div class="section-title">${esc(t("staff.add"))}</div>
      <div class="field"><label>${esc(t("staff.name"))}</label><input id="staff-name" maxlength="80" /></div>
      <div class="field"><label>${esc(t("staff.role"))}</label><select id="staff-role" onchange="staffRoleHelp()">${roleOpts}</select><small id="staff-role-help" class="muted">${esc(t("staff.roleHelp.CASHIER"))}</small></div>
      <div class="field"><label>${esc(t("staff.rate"))}</label><input id="staff-rate" type="number" min="0" max="50" step="0.1" inputmode="decimal" value="0" /><small class="muted">${esc(t("staff.rateHelp"))}</small></div>
      <div class="field"><label>${esc(t("staff.fixed"))}</label><input id="staff-fixed" type="number" min="0" step="0.01" inputmode="decimal" value="0" /></div>
      <button class="btn" onclick="staffAdd(this)">${esc(t("staff.add"))}</button></div>
    ${st.list === undefined ? skeleton("list", 2) : list.length === 0 ? uiEmpty("👥", t("staff.none")) : list.map(staffRow).join("")}`;
}
function staffRoleHelp() {
  const r = (document.getElementById("staff-role") || {}).value, el = document.getElementById("staff-role-help");
  if (el && r) el.textContent = t("staff.roleHelp." + r);
}
function staffRow(s) {
  const owed = (s.unpaidCommissions || []).filter((o) => o.cents > 0);
  return `<div class="card"><div class="title-line"><div><strong>${esc(s.name)}</strong><div class="chips">${uiChip(t("staff.role." + s.role))}${uiChip(t("staff.state." + s.inviteState), s.inviteState === "LINKED" ? "" : "warn")}${s.salesRateBp > 0 ? uiChip((s.salesRateBp / 100) + "%") : ""}</div></div></div>
    ${s.fixedPayCents > 0 ? `<p class="muted">${esc(t("staff.fixed"))}: ${esc(staffMoney(s.fixedPayCents, S.currency || ""))}</p>` : ""}
    ${s.fixedPayCents > 0 ? `<div class="btn-row"><button class="btn small soft" onclick="staffPaySalary(this,'${s.id}',${s.fixedPayCents})">${esc(t("staff.paySalary"))}</button></div>` : ""}
    ${owed.map((o) => `<div class="title-line"><span>${esc(t("staff.unpaid"))}: <b>${esc(staffMoney(o.cents, o.currency))}</b></span><button class="btn small" onclick="staffPay(this,'${s.id}','${o.currency}',${o.cents})">${esc(t("staff.pay"))}</button></div>`).join("")}
    <div class="btn-row">
      ${s.inviteState === "LINKED" ? "" : `<button class="btn small soft" onclick="staffInvite(this,'${s.id}')">${esc(t("staff.invite"))}</button>`}
      ${(staffState().hrEmps || []).length ? `<button class="btn small outline" onclick="staffLinkHr('${s.id}')">${esc(s.hrEmployeeId ? t("staff.hr.linked", { name: ((staffState().hrEmps || []).find((e) => e.id === s.hrEmployeeId) || {}).name || "" }) : t("staff.hr.link"))}</button>` : ""}
      <button class="btn small outline" onclick="staffEditRate('${s.id}',${s.salesRateBp})">${esc(t("staff.editRate"))}</button>
      <button class="btn small outline" onclick="staffRemove('${s.id}')" aria-label="${esc(t("staff.remove"))}">🗑 ${esc(t("staff.remove"))}</button>
    </div></div>`;
}
async function staffAdd(btn) {
  const v = (id) => (document.getElementById(id) || {}).value || "";
  const name = v("staff-name").trim();
  if (name.length < 2) return toast(t("staff.name"));
  const salesRateBp = Math.round((parseFloat(v("staff-rate")) || 0) * 100), fixedPayCents = Math.round((parseFloat(v("staff-fixed")) || 0) * 100);
  await uiBusy(btn, async () => {
    const res = await api("POST", "/business-staff", { name, role: v("staff-role"), salesRateBp, fixedPayCents });
    if (!res.ok) return staffErr(res);
    toast(t("staff.saved")); staffState().list = null; render();
  });
}
async function staffInvite(btn, id) {
  await uiBusy(btn, async () => {
    const res = await api("POST", `/business-staff/${id}/invite`);
    if (!res.ok) return staffErr(res);
    staffState().code = res.data.code; staffState().list = null; render();
  });
}
function staffCopyCode() {
  const c = staffState().code;
  if (c && navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast(t("staff.copied"))).catch(() => undefined);
}
async function staffEditRate(id, bp) {
  const v = await uiPrompt(t("staff.rate"), bp / 100, { numeric: true });
  if (v === null) return;
  const res = await api("PATCH", `/business-staff/${id}`, { salesRateBp: Math.round((parseFloat(v) || 0) * 100) });
  if (!res.ok) return staffErr(res);
  toast(t("staff.saved")); staffState().list = null; render();
}
async function staffRemove(id) {
  const s = (staffState().list || []).find((x) => x.id === id);
  if (!confirm(t("staff.removeConfirm", { name: s ? s.name : "" }))) return;
  const res = await api("DELETE", `/business-staff/${id}`);
  if (!res.ok) return staffErr(res);
  staffState().list = null; render();
}
async function staffPay(btn, id, currency, cents) {
  const s = (staffState().list || []).find((x) => x.id === id);
  if (!confirm(t("staff.payConfirm", { amount: staffMoney(cents, currency), name: s ? s.name : "" }))) return;
  await uiBusy(btn, async () => {
    const res = await api("POST", `/business-staff/${id}/commissions/pay`, { currency });
    if (!res.ok) return staffErr(res);
    toast(t("staff.paid")); S._accounting = null; staffState().list = null; render();
  });
}

/* ---- the staff member's own tab ---- */
function staffMyWork() {
  const wp = staffActing();
  if (!wp) return uiEmpty("👤", t("staff.noWorkplace"));
  const st = staffState();
  if (st.mine[wp.staffId] === undefined) {
    st.mine[wp.staffId] = null;
    api("GET", `/business-staff/me/${wp.staffId}/commissions`).then(({ ok, data }) => { st.mine[wp.staffId] = ok ? data : []; render(); });
  }
  const rows = st.mine[wp.staffId];
  const owed = (wp.unpaidCommissions || []).filter((o) => o.cents > 0);
  return `<div class="card"><div class="section-title">${esc(t("staff.workingAt", { name: wp.businessName || "" }))}</div>
      <div class="chips">${uiChip(t("staff.role." + wp.role))}${wp.salesRateBp > 0 ? uiChip(t("staff.myRate", { p: wp.salesRateBp / 100 })) : ""}</div>
      ${owed.map((o) => `<div class="tiles">${uiTile(t("staff.unpaid"), staffMoney(o.cents, o.currency), "income")}</div>`).join("")}</div>
    <div class="panel-title">${esc(t("staff.commissions"))}</div>
    ${rows === null ? skeleton("list", 2) : rows.length === 0 ? uiEmpty("💵", t("staff.noCommissions")) : rows.map((c) => `<div class="item"><span class="avatar" style="--h:150">💵</span><div class="item-main"><div class="item-title">${esc(staffMoney(c.amountCents, c.currency))}</div><div class="item-sub"><bdi>${esc(String(c.createdAt).slice(0, 10))}</bdi> · ${esc((c.rateBp / 100) + "%")}</div></div><div class="item-end">${uiChip(t("staff.status." + c.status), c.status === "ACCRUED" ? "warn" : "")}</div></div>`).join("")}`;
}

async function staffPaySalary(btn, id, cents) {
  const s = (staffState().list || []).find((x) => x.id === id);
  if (!confirm(t("staff.paySalaryConfirm", { amount: staffMoney(cents, ""), name: s ? s.name : "" }))) return;
  await uiBusy(btn, async () => {
    const res = await api("POST", `/business-staff/${id}/salary/pay`);
    if (!res.ok) return staffErr(res);
    toast(t("staff.paid")); S._accounting = null; render();
  });
}

/* ---- the driver's tab: the shop orders ready to take, and the ones on the road ---- */
function staffDeliveries() {
  const wp = staffActing();
  if (!wp) return uiEmpty("🚚", t("staff.noWorkplace"));
  const st = staffState();
  if (st.orders === undefined) { st.orders = null; api("GET", `/business-staff/driver/${wp.staffId}/orders`).then(({ ok, data }) => { st.orders = ok ? data : []; render(); }); }
  const rows = st.orders;
  if (rows === null) return skeleton("list", 3);
  if (!rows.length) return uiEmpty("🚚", t("staff.noDeliveries")) + `<div class="btn-row"><button class="btn soft" onclick="staffState().orders=undefined;render()">${esc(t("staff.refresh"))}</button></div>`;
  return `<div class="btn-row"><button class="btn small soft" onclick="staffState().orders=undefined;render()">${esc(t("staff.refresh"))}</button></div>` + rows.map((o) => `<div class="card">
      <div class="title-line"><div><strong><bdi>${esc(o.orderNumber)}</bdi></strong><div class="muted">${esc(o.customerName || "")}</div></div><b>${esc(staffMoney(o.totalCents, S.currency || ""))}</b></div>
      <div class="chips">${uiChip(t("staff.order." + o.status), o.status === "SHIPPED" ? "warn" : "")}${o.paymentMethod ? uiChip(o.paymentMethod) : ""}</div>
      <p class="muted">${o.items.map((i) => esc(i.productName) + " × " + i.quantity).join("، ")}</p>
      <div class="btn-row">${o.status === "PREPARING" ? `<button class="btn" onclick="staffOrderAct(this,'${wp.staffId}','${o.id}','pickup')">${esc(t("staff.pickup"))}</button>` : `<button class="btn" onclick="staffOrderAct(this,'${wp.staffId}','${o.id}','deliver')">${esc(t("staff.deliver"))}</button>`}</div></div>`).join("");
}
async function staffOrderAct(btn, staffId, orderId, action) {
  await uiBusy(btn, async () => {
    const res = await api("POST", `/business-staff/driver/${staffId}/orders/${orderId}/${action}`);
    if (!res.ok) return staffErr(res);
    toast(t(action === "pickup" ? "staff.pickedUp" : "staff.delivered"));
    const st = staffState(); st.orders = undefined; st.wp = undefined; st.mine = {}; render();
  });
}

/* ---- the marketer's tab: the shop's offers and announcements to its followers (no ads, no money) ---- */
function staffMarketing() {
  const wp = staffActing();
  if (!wp) return uiEmpty("📣", t("staff.noWorkplace"));
  const st = staffState();
  if (st.offers === undefined) { st.offers = null; api("GET", "/merchant/discounts").then(({ ok, data }) => { st.offers = ok && Array.isArray(data) ? data : []; render(); }); }
  const rows = st.offers;
  return `<div class="card"><div class="section-title">${esc(t("staff.offer.new"))}</div>
      <div class="field"><label>${esc(t("staff.offer.title"))}</label><input id="mk-title" maxlength="80" /></div>
      <div class="field"><label>${esc(t("staff.offer.percent"))}</label><input id="mk-percent" type="number" min="1" max="100" inputmode="numeric" /></div>
      <p class="muted">${esc(t("staff.offer.note"))}</p>
      <button class="btn" onclick="staffOfferAdd(this)">${esc(t("staff.offer.add"))}</button></div>
    ${rows === null ? skeleton("list", 2) : rows.length === 0 ? uiEmpty("🏷️", t("staff.offer.none")) : rows.map((d) => `<div class="card"><div class="title-line"><div><strong>${esc(d.title)}</strong><div class="chips">${uiChip(d.percent + "%")}${uiChip(String(d.state || d.status || ""), d.isActive ? "" : "warn")}</div></div>
        <button class="btn small outline" onclick="staffOfferToggle('${d.id}',${d.isActive ? "false" : "true"})">${esc(t(d.isActive ? "staff.offer.stop" : "staff.offer.start"))}</button></div></div>`).join("")}
    <div class="card"><div class="section-title">${esc(t("staff.announce.title"))}</div><p class="muted">${esc(t("staff.announce.help"))}</p>
      <div class="field"><label>${esc(t("staff.offer.title"))}</label><input id="mk-a-title" maxlength="100" /></div>
      <div class="field"><label>${esc(t("staff.announce.body"))}</label><textarea id="mk-a-body" maxlength="500" rows="3"></textarea></div>
      <button class="btn" onclick="staffAnnounce(this)">${esc(t("staff.announce.send"))}</button></div>`;
}
async function staffOfferAdd(btn) {
  const v = (id) => (document.getElementById(id) || {}).value || "";
  const title = v("mk-title").trim(), percent = parseInt(v("mk-percent"), 10);
  if (title.length < 2 || !(percent >= 1 && percent <= 100)) return toast(t("staff.offer.title"));
  await uiBusy(btn, async () => {
    const res = await api("POST", "/merchant/discounts", { title, percent });
    if (!res.ok) return staffErr(res);
    toast(t("staff.saved")); staffState().offers = undefined; render();
  });
}
async function staffOfferToggle(id, isActive) {
  const res = await api("PATCH", `/merchant/discounts/${id}`, { isActive });
  if (!res.ok) return staffErr(res);
  staffState().offers = undefined; render();
}
async function staffAnnounce(btn) {
  const v = (id) => (document.getElementById(id) || {}).value || "";
  const title = v("mk-a-title").trim(), body = v("mk-a-body").trim();
  if (!title || !body) return toast(t("staff.announce.body"));
  await uiBusy(btn, async () => {
    const res = await api("POST", "/broadcasts", { followers: true, title, body });
    if (!res.ok) return staffErr(res);
    toast(t("staff.announce.sent"));
  });
}

/** Links a staff member to an employee of the owner's payroll: their unpaid commissions then join the payslip. */
async function staffLinkHr(id) {
  const emps = staffState().hrEmps || [];
  const pick = await uiPick(t("staff.hr.pick"), [["", t("staff.hr.none")], ...emps.map((e) => [e.id, e.name])]);
  if (pick === null) return;
  const res = await api("PUT", `/business-staff/${id}/hr-employee`, { hrEmployeeId: pick || null });
  if (!res.ok) return staffErr(res);
  toast(t("staff.saved")); staffState().list = null; render();
}

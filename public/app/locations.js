/* ---- goods outside the main store: shop branches and distributors. The server side is /accounting/locations
   (src/services/accountingLocations.service.ts). The main store is the product's own quantity: giving goods out takes them
   from it, returning puts them back, and a sale made from a location takes them from that location only. ---- */

function locState() { return (S._loc = S._loc || { ov: null, staff: null, loadingOv: false }); }
function locReload() {
  S._loc = { ov: null, staff: null, loadingOv: false };
  S._accounting = { ...S._accounting, loading: true };
  loadAccounting();
}

/** Whether this account may hand goods out or back (the owner always; a staff member only with the "distribute" permission). */
function locCanMove() {
  if (!S._actAs) return true;
  const wp = typeof staffActing === "function" ? staffActing() : null;
  return !!(wp && (wp.allowed || []).includes("distribute"));
}

/** The products the sale form may sell now: the main store's, or what the chosen location holds. */
function saleProducts(a) {
  const st = saleState();
  const all = a.products || [];
  if (!st.locationId) return all;
  const loc = (a.locations || []).find((l) => l.id === st.locationId);
  if (!loc) return all;
  return loc.items.map((it) => { const p = all.find((x) => x.id === it.productId); return p ? { ...p, quantity: it.onHand } : null; }).filter(Boolean);
}

/** "Sell from": the main store or one of the locations (a distributor has only his own, already chosen). */
function saleLocationField(a) {
  const locs = (a.locations || []).filter((l) => l.isActive);
  if (!locs.length) return "";
  const st = saleState();
  if (S._actAs && locs.length === 1 && st.locationId !== locs[0].id) { st.locationId = locs[0].id; }
  const main = S._actAs ? "" : `<option value="">${esc(t("loc.mainStore"))}</option>`;
  return `<div class="field"><label>${esc(t("loc.sellFrom"))}</label><select onchange="saleChooseLocation(this.value)">${main}${locs.map((l) => `<option value="${esc(l.id)}" ${st.locationId === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div>`;
}
function saleChooseLocation(id) {
  const st = saleState();
  if (st.locationId === id) return;
  st.locationId = id; st.items = []; // another place has other goods
  render();
}

function locOverview() {
  const h = locState();
  if (h.ov === null && !h.loadingOv) {
    h.loadingOv = true;
    api("GET", "/accounting/stock/overview").then(({ ok, data }) => { h.ov = ok ? data : []; h.loadingOv = false; render(); });
  }
  return h.ov;
}
function locStaffList() {
  const h = locState();
  if (S._actAs) return [];
  if (h.staff === null) {
    h.staff = [];
    api("GET", "/business-staff").then(({ ok, data }) => { h.staff = ok && Array.isArray(data) ? data.filter((s) => s.status !== "REMOVED") : []; render(); });
  }
  return h.staff;
}

function accountingLocationsCard(a) {
  const ov = locOverview();
  const staff = locStaffList();
  const locs = a.locations || [];
  const canMove = locCanMove();
  const rows = (ov || []).filter((r) => r.inMainStore || r.distributed || r.sold || r.inOnlineStore || r.soldOnline);
  const overview = ov === null ? skeleton("list", 2) : rows.length === 0 ? uiEmpty("📦", t("loc.noProducts")) :
    `<table class="plain-table" style="width:100%"><thead><tr><th>${esc(t("loc.product"))}</th><th>${esc(t("loc.inMain"))}</th><th>${esc(t("loc.distributed"))}</th><th>${esc(t("loc.inOnline"))}</th><th>${esc(t("loc.sold"))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.inMainStore}</td><td>${r.distributed}</td><td>${r.inOnlineStore || 0}</td><td>${r.sold + (r.soldOnline || 0)}</td></tr>`).join("")}</tbody></table>`;
  const productOpts = (a.products || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const list = locs.length === 0 ? uiEmpty("🏬", t("loc.none")) : locs.map((l) => `<div class="card" style="margin-top:10px">
      <div class="item-title">${esc(l.name)} ${uiChip(t("loc.kind." + l.kind), l.isActive ? "info" : "warn")}${l.staffName ? " " + uiChip(l.staffName) : ""}</div>
      <p class="muted">${esc(t("loc.held", { n: l.onHandUnits }))} · ${esc(t("loc.soldHere", { n: l.soldUnits }))}</p>
      ${l.items.length ? `<table class="plain-table" style="width:100%"><thead><tr><th>${esc(t("loc.product"))}</th><th>${esc(t("loc.onHand"))}</th><th>${esc(t("loc.sold"))}</th></tr></thead><tbody>${l.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.onHand}</td><td>${i.sold}</td></tr>`).join("")}</tbody></table>` : ""}
      ${canMove && l.isActive ? `<div class="row"><div class="field"><label>${esc(t("loc.product"))}</label><select id="loc-p-${esc(l.id)}">${productOpts}</select></div><div class="field"><label>${esc(t("loc.qty"))}</label><input id="loc-q-${esc(l.id)}" inputmode="numeric" value="1" /></div></div>
        <div class="btn-row"><button class="btn small" onclick="locMove(this,'${esc(l.id)}','give')">${esc(t("loc.give"))}</button><button class="btn small outline" onclick="locMove(this,'${esc(l.id)}','return')">${esc(t("loc.return"))}</button></div>` : ""}
      ${!S._actAs ? `<div class="btn-row"><button class="btn small soft" onclick="locToggle(this,'${esc(l.id)}',${l.isActive ? "false" : "true"})">${esc(t(l.isActive ? "loc.switchOff" : "loc.switchOn"))}</button></div>` : ""}
    </div>`).join("");
  const staffOpts = `<option value="">${esc(t("loc.noStaff"))}</option>` + staff.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  const form = S._actAs ? "" : `<div class="card"><h2>${esc(t("loc.add"))}</h2>
      <div class="field"><label>${esc(t("loc.name"))}</label><input id="loc-name" maxlength="80" /></div>
      <div class="row"><div class="field"><label>${esc(t("loc.kindLabel"))}</label><select id="loc-kind"><option value="BRANCH">${esc(t("loc.kind.BRANCH"))}</option><option value="DISTRIBUTOR">${esc(t("loc.kind.DISTRIBUTOR"))}</option></select></div>
        <div class="field"><label>${esc(t("loc.staff"))}</label><select id="loc-staff">${staffOpts}</select></div></div>
      <button class="btn" onclick="locCreate(this)">${esc(t("loc.addBtn"))}</button></div>`;
  // the online store: how many units of a warehouse product the store offers (the rest stays in the warehouse)
  const own = (a.products || []).filter((p) => !p.isStoreProduct);
  const free = (a.products || []).filter((p) => p.isStoreProduct);
  const storeForm = S._actAs && !canMove ? "" : (own.length && (free.length || own.some((p) => p.storeProductId)))
    ? `<div class="card"><h2>${esc(t("loc.onlineStore"))}</h2><p class="muted">${esc(t("loc.onlineHint"))}</p>
      <div class="field"><label>${esc(t("loc.product"))}</label><select id="loc-sp">${own.map((p) => `<option value="${esc(p.id)}" data-store="${esc(p.storeProductId || "")}" data-units="${p.storeUnits || 0}">${esc(p.name)}${p.storeProductId ? " · " + esc(t("loc.inOnline")) + ": " + (p.storeUnits || 0) : ""}</option>`).join("")}</select></div>
      <div class="field"><label>${esc(t("loc.storeProduct"))}</label><select id="loc-ss"><option value="">—</option>${free.map((p) => `<option value="${esc(p.id.slice(6))}">${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>${esc(t("loc.storeQty"))}</label><input id="loc-sq" inputmode="numeric" value="1" /></div>
      <button class="btn" onclick="locStoreSave(this)">${esc(t("loc.storeSave"))}</button></div>`
    : (own.length && !S._actAs ? uiEmpty("🛒", t("loc.storeNone")) : "");
  return `<div class="panel-title">${esc(t("loc.overview"))}</div><p class="muted">${esc(t("loc.overviewHint"))}</p>${overview}
    <div class="panel-title" style="margin-top:16px">${esc(t("loc.onlineStore"))}</div>${storeForm}
    <div class="panel-title" style="margin-top:16px">${esc(t("loc.title"))}</div>${list}${form}`;
}

async function locCreate(btn) {
  const name = (document.getElementById("loc-name") || {}).value.trim();
  if (!name) return toast(t("loc.name"));
  const staffId = (document.getElementById("loc-staff") || {}).value;
  const body = { name, kind: document.getElementById("loc-kind").value };
  if (staffId) body.staffId = staffId;
  const res = await uiBusy(btn, () => api("POST", "/accounting/locations", body));
  if (!res.ok) return toast(errMsg(res.data, t("loc.failed")));
  toast(t("loc.added")); locReload();
}
async function locMove(btn, id, kind) {
  const productId = document.getElementById("loc-p-" + id).value;
  const quantity = Math.floor(Number(document.getElementById("loc-q-" + id).value));
  if (!productId || !(quantity > 0)) return toast(t("accounting.invalidAmount"));
  const res = await uiBusy(btn, () => api("POST", `/accounting/locations/${id}/${kind}`, { productId, quantity }));
  if (!res.ok) return toast(errMsg(res.data, t("loc.failed")));
  toast(t(kind === "give" ? "loc.gave" : "loc.returned")); locReload();
}
async function locStoreSave(btn) {
  const sel = document.getElementById("loc-sp");
  const opt = sel.options[sel.selectedIndex];
  const storeProductId = (opt && opt.dataset.store) || document.getElementById("loc-ss").value;
  const quantity = Math.floor(Number(document.getElementById("loc-sq").value));
  if (!sel.value || !storeProductId || !(quantity >= 0)) return toast(t("accounting.invalidAmount"));
  const res = await uiBusy(btn, () => api("POST", `/accounting/products/${sel.value}/store`, { storeProductId, quantity }));
  if (!res.ok) return toast(errMsg(res.data, t("loc.failed")));
  toast(t("loc.storeSaved")); locReload();
}
async function locToggle(btn, id, on) {
  const res = await uiBusy(btn, () => api("PATCH", `/accounting/locations/${id}`, { isActive: on }));
  if (!res.ok) return toast(errMsg(res.data, t("loc.failed")));
  locReload();
}

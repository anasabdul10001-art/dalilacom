/* ---- Human resources, inside DALILACOM (no separate site). The server side is /hr/* (src/routes/hr.routes.ts).
   A tab shows only when a real record makes it relevant: the owner's tabs need the owner's plan or company,
   "my job" needs an employee record linked to this account (AGENTS.md: no empty profession sections). ---- */

function hrState() { return (S._hr = S._hr || { loading: false, ov: null, tab: {} }); }
function hrReload() { const h = hrState(); h.ov = null; h.data = {}; h.loading = false; render(); }

/** What the account's role lets it do in the company (the server sends the list; the owner has everything). */
function hrCan(area) { const m = (hrState().ov || {}).manage; return !!m && (m.areas || []).includes(area); }

/** The tabs this account has, from its real HR records (the first tab, "home", is always there). */
function hrTabs() {
  const ov = hrState().ov;
  if (!S.token || !ov) return [];
  const tabs = [];
  if (ov.manage || ov.canStart) tabs.push("people");
  if (ov.manage) {
    if (hrCan("attendance")) tabs.push("attendance");
    if (hrCan("leave")) tabs.push("leave");
    if (hrCan("payroll")) tabs.push("payroll");
  }
  if ((ov.jobs && ov.jobs.length) || ov.invitations) tabs.push("job");
  return tabs;
}

async function hrLoadOverview() {
  const h = hrState();
  if (h.loading) return;
  h.loading = true;
  const { ok, data } = await api("GET", "/hr/overview");
  h.ov = ok ? data : { manage: null, canStart: false, jobs: [], invitations: 0 };
  h.loading = false;
  render();
}

/** Load one list for a tab once; hrReload() clears everything after a change. */
function hrData(key, path) {
  const h = hrState();
  h.data = h.data || {};
  if (h.data[key] === undefined) {
    h.data[key] = null;
    api("GET", path).then(({ ok, data }) => { h.data[key] = ok ? data : []; render(); });
  }
  return h.data[key];
}

function hrDay(v) { return v ? String(v).slice(0, 10) : ""; }
function hrMoney(minor, cur) { return (Number(minor || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (cur || ""); }
function hrErr(res) { toast((res.data && res.data.error && res.data.error.message) || t("hr.error")); }
async function hrDo(method, path, body, doneKey) {
  const res = await api(method, path, body);
  if (!res.ok) { hrErr(res); return null; }
  // a payroll run that costs nothing books no expense: say so instead of claiming one was added
  if (doneKey) {
    const d = res.data || {};
    toast(t(doneKey === "hr.pay.paidDone" ? (d.expenseBooked === false ? "hr.pay.paidNoExpense" : d.accountingActive === false ? "hr.pay.paidNoAccounting" : doneKey) : doneKey));
  }
  hrReload();
  return res.data;
}
const hrVal = (id) => (document.getElementById(id) || {}).value || "";

function hrBody(tab) {
  const h = hrState();
  if (!h.ov) { if (!h.loading) hrLoadOverview(); return skeleton("list", 3); }
  if (tab === "people") return hrPeople();
  if (tab === "attendance") return hrAttendance();
  if (tab === "leave") return hrLeave();
  if (tab === "payroll") return hrPayroll();
  if (tab === "job") return hrJob();
  return "";
}

const hrName = (o) => (o ? o.firstName + " " + o.lastName : "");
const hrRange = (a, b) => `<bdi>${esc(hrDay(a))} → ${esc(hrDay(b))}</bdi>`;

/* ---- people: the company, its employees, invitations ---- */
function hrPeople() {
  const ov = hrState().ov;
  if (!ov.manage) {
    return `<div class="card" style="text-align:center"><div style="font-size:44px">🏢</div><h2>${esc(t("hr.company.create"))}</h2>
      <p class="muted">${esc(t("hr.company.createHint"))}</p>
      <div class="field"><label>${esc(t("hr.company.name"))}</label><input id="hr-co-name" /></div>
      <button class="btn" onclick="hrCreateCompany(this)">${esc(t("hr.company.createBtn"))}</button></div>`;
  }
  const emps = hrData("employees", "/hr/employees");
  const depts = hrData("depts", "/hr/departments");
  if (emps === null || depts === null) return skeleton("list", 3);
  const cur = ov.manage.currency;
  const isOwner = ov.manage.role === "OWNER";
  const list = emps.length === 0 ? uiEmpty("👥", t("hr.people.empty")) : emps.map((e) => {
    const name = hrName(e);
    const tone = e.employmentStatus === "ACTIVE" ? "ok" : e.employmentStatus === "ON_LEAVE" ? "warn" : "bad";
    const more = `<span>${esc(t("hr.f.hire"))}: <bdi>${esc(hrDay(e.hireDate))}</bdi></span>${e.email ? `<span>${esc(t("hr.f.email"))}: <bdi>${esc(e.email)}</bdi></span>` : ""}<span>${esc(e.userId ? t("hr.linked") : t("hr.notLinked"))}</span>${e.deviceCode ? `<span>${esc(t("hr.f.deviceCode"))}: <bdi>${esc(e.deviceCode)}</bdi></span>` : ""}`;
    return `<div class="item">${uiAvatar(name)}<div class="item-main">
        <div class="item-title">${esc(name)}</div><div class="item-sub">${esc(e.position || t("hr.role." + e.role))}</div>
        <div class="chips">${uiChip(t("hr.role." + e.role))}${uiChip(t("hr.status." + e.employmentStatus), tone)}${e.department ? uiChip(e.department.name) : ""}${e.userId ? uiChip(t("hr.linked"), "info") : ""}</div>
        ${uiFold(t("hr.details"), more)}
        <div class="btn-row">${hrCan("payroll") ? `<button class="btn small soft" onclick="hrSalaryOpen('${e.id}')">${esc(t("hr.sal.open"))}</button>` : ""}${hrCan("peopleEdit") ? `<button class="btn small soft" onclick="hrSetDeviceCode('${e.id}')">${esc(t("hr.dev.setCode"))}</button><button class="btn small soft" onclick="hrTrackToggle(this,'${e.id}',${e.tracksLocation ? "false" : "true"})">${esc(t(e.tracksLocation ? "hr.trk.turnOff" : "hr.trk.turnOn"))}</button>${e.userId && e.employmentStatus !== "TERMINATED" ? `<button class="btn small soft" onclick="hrPhoneReset(this,'${e.id}')">${esc(t("hr.lock.reset"))}</button>` : ""}${e.userId || e.employmentStatus === "TERMINATED" ? "" : `<button class="btn small soft" onclick="hrInvite(this,'${e.id}')">${esc(t("hr.invite"))}</button>`}` : ""}</div>
        ${isOwner && e.employmentStatus !== "TERMINATED" ? `<div class="field"><label>${esc(t("hr.f.role"))}</label><select onchange="hrSetRole(this,'${e.id}')">${hrRoleOptions(e.role)}</select></div>` : ""}
      </div>${e.baseSalary != null ? `<div class="item-end">${esc(hrMoney(e.baseSalary, cur))}</div>` : ""}</div>`;
  }).join("");
  const deptOpts = `<option value="">${esc(t("hr.dept.none"))}</option>` + depts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  const deptList = depts.length === 0 ? uiEmpty("🏷️", t("hr.dept.empty")) : depts.map((d) => `<div class="item"><span class="avatar" style="--h:${hrHue(d.name)}">${esc(d.name.slice(0, 1).toUpperCase())}</span><div class="item-main">
      <div class="item-title">${esc(d.name)}</div><div class="item-sub">${esc(t("hr.dept.count", { n: d._count ? d._count.employees : 0 }))}</div>
      <div class="btn-row"><button class="btn small soft" onclick="hrDeptRename('${d.id}')">${esc(t("hr.dept.rename"))}</button><button class="btn small outline" onclick="hrDeptDelete(this,'${d.id}')" aria-label="${esc(t("accounting.delete"))}">🗑</button></div></div></div>`).join("");
  return `${hrCan("payroll") ? hrSalaryCard(emps, cur) : ""}<div class="panel-title">${esc(ov.manage.companyName)} <small>${esc(t("hr.people.count", { n: emps.length }))}</small></div>${list}
    <div class="panel-title" style="margin-top:16px">${esc(t("hr.dept.title"))}</div>${deptList}
    ${!hrCan("peopleEdit") ? "" : `<div class="card"><div class="field"><label>${esc(t("hr.dept.name"))}</label><input id="hr-d-name" maxlength="80" /></div>
      <button class="btn soft" onclick="hrDeptAdd(this)">${esc(t("hr.dept.add"))}</button></div>
    <div class="card"><h2>${esc(t("hr.people.add"))}</h2>
      <div class="row"><div class="field"><label>${esc(t("hr.f.first"))}</label><input id="hr-e-first" /></div><div class="field"><label>${esc(t("hr.f.last"))}</label><input id="hr-e-last" /></div></div>
      <div class="row"><div class="field"><label>${esc(t("hr.f.email"))}</label><input id="hr-e-email" type="email" /></div><div class="field"><label>${esc(t("hr.f.position"))}</label><input id="hr-e-pos" /></div></div>
      <div class="row"><div class="field"><label>${esc(t("hr.f.hire"))}</label><input id="hr-e-hire" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>${hrCan("payroll") ? `<div class="field"><label>${esc(t("hr.f.salary", { c: cur }))}</label><input id="hr-e-salary" inputmode="decimal" /></div>` : ""}</div>
      <div class="field"><label>${esc(t("hr.f.dept"))}</label><select id="hr-e-dept">${deptOpts}</select></div>
      <div class="field"><label>${esc(t("hr.f.deviceCode"))}</label><input id="hr-e-code" maxlength="40" /></div>
      ${isOwner ? `<div class="field"><label>${esc(t("hr.f.role"))}</label><select id="hr-e-role">${hrRoleOptions("EMPLOYEE")}</select><p class="muted">${esc(t("hr.role.hint"))}</p></div>` : ""}
      <button class="btn" onclick="hrAddEmployee(this)">${esc(t("hr.people.addBtn"))}</button>
    </div>`}`;
}
const HR_ROLES = ["EMPLOYEE", "MANAGER", "ACCOUNTANT", "SECRETARY", "ATTENDANCE_SUPERVISOR", "HR"];
const hrRoleOptions = (cur) => HR_ROLES.map((r) => `<option value="${r}"${r === cur ? " selected" : ""}>${esc(t("hr.role." + r))}</option>`).join("");
async function hrSetRole(sel, id) { await hrDo("PATCH", `/hr/employees/${id}`, { role: sel.value }, "hr.roleDone"); }
async function hrCreateCompany(btn) {
  const name = hrVal("hr-co-name").trim();
  if (name.length < 2) return toast(t("hr.company.name"));
  await uiBusy(btn, () => hrDo("POST", "/hr/company", { name }, "hr.company.done"));
}
async function hrAddEmployee(btn) {
  const salary = hrVal("hr-e-salary").trim();
  const body = { firstName: hrVal("hr-e-first").trim(), lastName: hrVal("hr-e-last").trim(), hireDate: hrVal("hr-e-hire"), position: hrVal("hr-e-pos").trim() || null, email: hrVal("hr-e-email").trim() || null };
  if (hrVal("hr-e-dept")) body.departmentId = hrVal("hr-e-dept");
  if (hrVal("hr-e-code").trim()) body.deviceCode = hrVal("hr-e-code").trim();
  if (hrVal("hr-e-role")) body.role = hrVal("hr-e-role");
  if (!body.firstName || !body.lastName) return toast(t("hr.f.first"));
  if (salary !== "") { const n = Math.round(parseFloat(salary) * 100); if (!Number.isFinite(n) || n < 0) return toast(t("hr.f.salary", { c: "" })); body.baseSalary = n; }
  await uiBusy(btn, () => hrDo("POST", "/hr/employees", body, "hr.people.added"));
}
async function hrSetDeviceCode(id) {
  const e = ((hrState().data || {}).employees || []).find((x) => x.id === id); if (!e) return;
  const code = await uiPrompt(t("hr.dev.codePrompt"), e.deviceCode || ""); if (code === null) return;
  await hrDo("PATCH", `/hr/employees/${id}`, { deviceCode: code.trim() || null }, "hr.dev.codeSaved");
}

/* ---- attendance: the readers (fingerprint, card, face), a file of punches, and the latest records ---- */
const HR_DEV_KINDS = ["FINGERPRINT", "CARD", "FACE", "OTHER"];
function hrAttendance() {
  const h = hrState();
  const devs = hrData("devices", "/hr/devices");
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recs = hrData("attrec", "/hr/attendance?from=" + from);
  const co = hrData("company", "/hr/company");
  const reqs = hrCan("devices") ? hrData("devreq", "/hr/device-requests?status=PENDING") : [];
  const locs = hrCan("tracking") ? hrData("locs", "/hr/locations/current") : [];
  if (devs === null || recs === null || co === null || reqs === null || locs === null) return skeleton("list", 3);
  const locCard = !hrCan("tracking") ? "" : `<div class="panel-title" style="margin-top:16px">${esc(t("hr.trk.title"))}</div><p class="muted">${esc(t("hr.trk.note"))}</p>
    ${Array.isArray(locs) && locs.length ? locs.map((r) => `<div class="item">${uiAvatar(hrName(r.employee))}<div class="item-main"><div class="item-title">${esc(hrName(r.employee))}</div>
      <div class="chips">${uiChip(t(r.onShift ? "hr.trk.onShift" : "hr.trk.offShift"), r.onShift ? "ok" : "warn")}</div>
      <div class="item-sub">${r.latest ? esc(t("hr.trk.last", { t: new Date(r.latest.recordedAt).toLocaleString() })) : esc(t("hr.trk.noPoint"))}</div>
      <div class="btn-row"><button class="btn small soft" onclick="hrRouteMap('${r.employee.id}','${esc(hrName(r.employee)).replace(/'/g, "")}')">${esc(t("hr.trk.map"))}</button></div></div></div>`).join("") : uiEmpty("📍", t("hr.trk.none"))}`;
  const lockOn = !!(co && co.deviceLockRequired);
  const lockCard = !hrCan("devices") ? "" : `<div class="panel-title" style="margin-top:16px">${esc(t("hr.lock.title"))}</div><p class="muted">${esc(t("hr.lock.intro"))}</p>
    <div class="card"><div class="chips">${uiChip(t(lockOn ? "hr.lock.on" : "hr.lock.off"), lockOn ? "ok" : "warn")}</div>
      <div class="btn-row">${hrCan("company") ? `<button class="btn small soft" onclick="hrLockToggle(this,${lockOn ? "false" : "true"})">${esc(t(lockOn ? "hr.lock.turnOff" : "hr.lock.turnOn"))}</button>` : ""}</div></div>
    <div class="panel-title">${esc(t("hr.lock.reqTitle"))}</div>
    ${Array.isArray(reqs) && reqs.length ? reqs.map((r) => `<div class="item">${uiAvatar(hrName(r.employee))}<div class="item-main"><div class="item-title">${esc(hrName(r.employee))}</div>
      <div class="item-sub">${esc(r.deviceName || "—")} · ${when(r.createdAt)}</div>
      <div class="btn-row"><button class="btn small" onclick="hrLockDecide(this,'${r.id}','APPROVE')">${esc(t("hr.lock.approve"))}</button><button class="btn small outline" onclick="hrLockDecide(this,'${r.id}','REJECT')">${esc(t("hr.lock.reject"))}</button></div></div></div>`).join("") : uiEmpty("📱", t("hr.lock.noReq"))}`;
  const codeOn = !!(co && co.attendanceCodeRequired);
  const codeCard = `<div class="panel-title">${esc(t("hr.code.title"))}</div><p class="muted">${esc(t("hr.code.intro"))}</p>
    <div class="card"><div class="chips">${uiChip(t(codeOn ? "hr.code.on" : "hr.code.off"), codeOn ? "ok" : "warn")}</div>
      <div class="btn-row"><button class="btn small" onclick="hrCodeScreen()">${esc(t("hr.code.show"))}</button>
        ${hrCan("company") ? `<button class="btn small soft" onclick="hrCodeToggle(this,${codeOn ? "false" : "true"})">${esc(t(codeOn ? "hr.code.turnOff" : "hr.code.turnOn"))}</button>` : ""}</div></div>`;
  const when = (v) => (v ? `<bdi>${esc(new Date(v).toLocaleString())}</bdi>` : "—");
  const keyCard = h.newKey ? `<div class="card" style="border:2px solid var(--brand, #f60)"><strong>${esc(t("hr.dev.keyTitle", { n: h.newKey.name }))}</strong>
      <p class="muted">${esc(t("hr.dev.keyNote"))}</p>
      <input readonly onclick="this.select()" value="${esc(h.newKey.key)}" dir="ltr" style="width:100%" />
      <p class="muted" dir="ltr">POST ${esc(location.origin)}/hr/device/punches<br>X-Device-Key: …<br>{"punches":[{"code":"17","at":"2026-03-02 08:00:00","direction":"IN"}]}</p>
      <button class="btn small outline" onclick="hrState().newKey=null;render()">${esc(t("hr.dev.keyDone"))}</button></div>` : "";
  const devList = devs.length === 0 ? uiEmpty("🖐️", t("hr.dev.empty")) : devs.map((d) => `<div class="item"><span class="avatar" style="--h:${hrHue(d.name)}">${esc(d.name.slice(0, 1).toUpperCase())}</span><div class="item-main">
      <div class="item-title">${esc(d.name)}</div>
      <div class="chips">${uiChip(t("hr.dev.kind." + d.kind))}${uiChip(d.active ? t("hr.dev.on") : t("hr.dev.off"), d.active ? "ok" : "warn")}${uiChip("…" + d.keyHint, "info")}</div>
      <div class="item-sub">${esc(t("hr.dev.lastSeen"))}: ${d.lastSeenAt ? when(d.lastSeenAt) : esc(t("hr.dev.never"))}</div>
      <div class="btn-row"><button class="btn small soft" onclick="hrDevToggle(this,'${d.id}',${d.active ? "false" : "true"})">${esc(t(d.active ? "hr.dev.switchOff" : "hr.dev.switchOn"))}</button>
        <button class="btn small soft" onclick="hrDevRotate(this,'${d.id}')">${esc(t("hr.dev.rotate"))}</button>
        <button class="btn small outline" onclick="hrDevDelete(this,'${d.id}')" aria-label="${esc(t("accounting.delete"))}">🗑</button></div></div></div>`).join("");
  const recList = recs.length === 0 ? uiEmpty("🕒", t("hr.att.empty")) : recs.slice(0, 40).map((r) => `<div class="item"><span class="avatar" style="--h:${hrHue(hrName(r.employee))}">${esc(hrName(r.employee).slice(0, 1).toUpperCase())}</span><div class="item-main">
      <div class="item-title">${esc(hrName(r.employee))}</div>
      <div class="item-sub">${when(r.checkIn)} → ${r.checkOut ? when(r.checkOut) : esc(t("hr.att.open"))}</div>
      <div class="chips">${uiChip(t("hr.att.src." + r.source), r.source === "DEVICE" ? "info" : "")}</div></div></div>`).join("");
  return `${keyCard}${codeCard}${lockCard}${locCard}<div class="panel-title" style="margin-top:16px">${esc(t("hr.dev.title"))}</div><p class="muted">${esc(t("hr.dev.intro"))}</p>${devList}
    <div class="card"><div class="field"><label>${esc(t("hr.dev.name"))}</label><input id="hr-dv-name" maxlength="80" /></div>
      <div class="field"><label>${esc(t("hr.dev.kind"))}</label><select id="hr-dv-kind">${HR_DEV_KINDS.map((k) => `<option value="${k}">${esc(t("hr.dev.kind." + k))}</option>`).join("")}</select></div>
      <button class="btn soft" onclick="hrDevAdd(this)">${esc(t("hr.dev.add"))}</button></div>
    <div class="panel-title" style="margin-top:16px">${esc(t("hr.imp.title"))}</div>
    <div class="card"><p class="muted">${esc(t("hr.imp.hint"))}</p>
      <input id="hr-imp-file" type="file" accept=".csv,.txt,text/csv,text/plain" onchange="hrImportFile(this)" />
      <div class="field"><label>${esc(t("hr.imp.paste"))}</label><textarea id="hr-imp-text" rows="5" dir="ltr" placeholder="17, 2026-03-02 08:00:00, IN"></textarea></div>
      <button class="btn" onclick="hrImportRun(this)">${esc(t("hr.imp.run"))}</button>${h.impResult ? `<p class="muted">${esc(h.impResult)}</p>` : ""}</div>
    <div class="panel-title" style="margin-top:16px">${esc(t("hr.att.recent"))}</div>${recList}`;
}
async function hrDevAdd(btn) {
  const name = hrVal("hr-dv-name").trim();
  if (!name) return toast(t("hr.dev.name"));
  const data = await uiBusy(btn, () => hrDo("POST", "/hr/devices", { name, kind: hrVal("hr-dv-kind") || "FINGERPRINT" }, "hr.dev.added"));
  if (data && data.key) { hrState().newKey = { name: data.name, key: data.key }; render(); }
}
async function hrTrackToggle(btn, id, on) {
  const h = hrState();
  const data = await uiBusy(btn, () => hrDo("PATCH", `/hr/employees/${id}`, { tracksLocation: on }, on ? "hr.trk.onDone" : "hr.trk.offDone"));
  if (data) { delete h.data.locs; render(); }
}
// the route of one tracked employee today, on a map (Leaflet is already on the page for the shop map)
async function hrRouteMap(id, name) {
  const res = await api("GET", `/hr/locations/${id}`);
  if (!res.ok) return hrErr(res);
  const pts = (res.data.points || []).map((p) => [p.latitude, p.longitude]);
  const box = document.createElement("div");
  box.className = "ui-ask";
  box.innerHTML = `<div class="ui-ask-card" style="width:min(640px,100%)"><label>${esc(name)}</label>
    <p class="muted">${esc(pts.length ? t("hr.trk.dist", { n: res.data.distanceKm }) : t("hr.trk.noPoint"))}</p>
    ${pts.length ? `<div id="hr-route-map" style="height:340px;border-radius:14px"></div>` : ""}
    <div class="btn-row"><button class="btn small outline" data-no>${esc(t("adr.cancel"))}</button></div></div>`;
  document.body.appendChild(box);
  let map = null;
  const close = () => { if (map) map.remove(); box.remove(); };
  box.querySelector("[data-no]").onclick = close;
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  if (pts.length && window.L) {
    map = L.map("hr-route-map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    L.polyline(pts, { weight: 5 }).addTo(map);
    L.marker(pts[pts.length - 1]).addTo(map);
    pts.length > 1 ? map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] }) : map.setView(pts[0], 16);
  }
}
async function hrLockToggle(btn, on) {
  const h = hrState();
  const data = await uiBusy(btn, () => hrDo("PATCH", "/hr/company", { deviceLockRequired: on }, on ? "hr.lock.turnedOn" : "hr.lock.turnedOff"));
  if (data) { delete h.data.company; render(); }
}
// forget the registered phone of an employee (lost or changed phone): the next phone he signs in on becomes his registered one
async function hrPhoneReset(btn, id) {
  if (!confirm(t("hr.lock.resetConfirm"))) return;
  const data = await uiBusy(btn, () => hrDo("DELETE", `/hr/employees/${id}/device`, undefined, "hr.lock.resetDone"));
  if (data) render();
}
async function hrLockDecide(btn, id, decision) {
  const h = hrState();
  const data = await uiBusy(btn, () => hrDo("POST", `/hr/device-requests/${id}/decision`, { decision }, "hr.lock.decided"));
  if (data) { delete h.data.devreq; render(); }
}
async function hrCodeToggle(btn, on) {
  const h = hrState();
  const data = await uiBusy(btn, () => hrDo("PATCH", "/hr/company", { attendanceCodeRequired: on }, on ? "hr.code.turnedOn" : "hr.code.turnedOff"));
  if (data) { delete h.data.company; render(); }
}
// a full-screen page for a screen at the shop: the live code as numbers and a QR, refreshed every 30 s
let hrCodeTimer = null;
async function hrCodeScreen() {
  const box = document.createElement("div");
  box.className = "ui-ask";
  box.style.cssText = "background:#fff;flex-direction:column;gap:18px;text-align:center";
  box.innerHTML = `<div style="font-weight:800;font-size:22px">${esc(t("hr.code.screenTitle"))}</div><div id="hr-code-qr" style="display:flex;justify-content:center"></div>
    <div id="hr-code-num" dir="ltr" style="font-size:64px;font-weight:900;letter-spacing:10px">······</div><div id="hr-code-left" class="muted"></div>
    <button class="btn small outline" id="hr-code-close">${esc(t("adr.cancel"))}</button>`;
  document.body.appendChild(box);
  let expires = 0, alive = true;
  const close = () => { alive = false; clearTimeout(hrCodeTimer); box.remove(); };
  box.querySelector("#hr-code-close").onclick = close;
  const tick = async () => {
    if (!alive) return;
    if (Date.now() >= expires) {
      const res = await api("GET", "/hr/attendance-code");
      if (!alive) return;
      if (!res.ok) { hrErr(res); return close(); }
      expires = new Date(res.data.expiresAt).getTime();
      box.querySelector("#hr-code-num").textContent = res.data.code;
      const qr = box.querySelector("#hr-code-qr"); qr.innerHTML = "";
      if (window.QRCode) new QRCode(qr, { text: "dlc-att:" + res.data.code, width: 240, height: 240, colorDark: "#1c1413", colorLight: "#ffffff" });
    }
    box.querySelector("#hr-code-left").textContent = t("hr.code.left", { n: Math.max(0, Math.ceil((expires - Date.now()) / 1000)) });
    hrCodeTimer = setTimeout(tick, 1000);
  };
  tick();
}
async function hrDevToggle(btn, id, active) { await uiBusy(btn, () => hrDo("PATCH", `/hr/devices/${id}`, { active }, "hr.dev.saved")); }
async function hrDevRotate(btn, id) {
  if (!confirm(t("hr.dev.rotateConfirm"))) return;
  const data = await uiBusy(btn, () => hrDo("PATCH", `/hr/devices/${id}`, { rotateKey: true }, "hr.dev.saved"));
  if (data && data.key) { hrState().newKey = { name: data.name, key: data.key }; render(); }
}
async function hrDevDelete(btn, id) {
  if (!confirm(t("hr.dev.deleteConfirm"))) return;
  await uiBusy(btn, () => hrDo("DELETE", `/hr/devices/${id}`, undefined, "hr.dev.deleted"));
}
function hrImportFile(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { const ta = document.getElementById("hr-imp-text"); if (ta) ta.value = String(r.result || ""); };
  r.readAsText(f);
}
async function hrImportRun(btn) {
  const lines = hrVal("hr-imp-text").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return toast(t("hr.imp.paste"));
  const h = hrState(); let done = 0, bad = 0, skipped = 0;
  for (let i = 0; i < lines.length; i += 1500) {
    const res = await uiBusy(btn, () => api("POST", "/hr/attendance/import", { csv: lines.slice(i, i + 1500).join("\n") }));
    if (!res.ok) { hrErr(res); break; }
    const s = res.data.summary || {};
    done += (s.CHECKED_IN || 0) + (s.CHECKED_OUT || 0); skipped += s.DUPLICATE || 0;
    bad += res.data.lines - ((s.CHECKED_IN || 0) + (s.CHECKED_OUT || 0) + (s.DUPLICATE || 0)) + (res.data.skipped || 0);
  }
  h.impResult = t("hr.imp.result", { ok: done, dup: skipped, bad });
  hrReload();
}
async function hrInvite(btn, id) {
  const res = await uiBusy(btn, () => api("POST", `/hr/employees/${id}/invite`));
  if (!res.ok) return hrErr(res);
  // the code is shown once; it is also emailed when the employee has an email address
  alert(t(res.data.emailed ? "hr.invite.emailed" : "hr.invite.code") + (res.data.emailed ? "" : "\n\n" + res.data.code));
}

/* ---- departments ---- */
function hrHue(name) { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
async function hrDeptAdd(btn) {
  const name = hrVal("hr-d-name").trim();
  if (!name) return toast(t("hr.dept.name"));
  await uiBusy(btn, () => hrDo("POST", "/hr/departments", { name }, "hr.dept.added"));
}
async function hrDeptRename(id) {
  const d = ((hrState().data || {}).depts || []).find((x) => x.id === id); if (!d) return;
  const name = await uiPrompt(t("hr.dept.name"), d.name); if (name === null || !name.trim()) return;
  await hrDo("PATCH", `/hr/departments/${id}`, { name: name.trim() }, "hr.dept.renamed");
}
async function hrDeptDelete(btn, id) {
  if (!confirm(t("hr.dept.confirmDelete"))) return;
  await uiBusy(btn, () => hrDo("DELETE", `/hr/departments/${id}`, undefined, "hr.dept.deleted"));
}

/* ---- salary structure of one employee: base salary plus additions and deductions ---- */
function hrSalaryOpen(id) { const h = hrState(); h.salFor = id; h.data = h.data || {}; delete h.data["sal:" + id]; render(); }
function hrSalaryClose() { hrState().salFor = null; render(); }
function hrSalaryCard(emps, cur) {
  const h = hrState(); if (!h.salFor) return "";
  const emp = emps.find((e) => e.id === h.salFor); if (!emp) return "";
  const sal = hrData("sal:" + emp.id, `/hr/employees/${emp.id}/salary`);
  const comps = hrData("comps", "/hr/salary-components");
  if (sal === null || comps === null || Array.isArray(sal)) return `<div class="card">${skeleton("list", 2)}</div>`;
  const items = sal.components.length === 0 ? `<p class="muted">${esc(t("hr.sal.empty"))}</p>` : sal.components.map((c) => {
    const k = c.component;
    const val = k.calcType === "FIXED" ? hrMoney(c.fixedAmount, cur) : (Number(c.percentage) + "%");
    return `<div class="item"><span class="avatar" style="--h:${k.type === "DEDUCTION" ? 4 : 140}">${k.type === "DEDUCTION" ? "−" : "+"}</span><div class="item-main"><div class="item-title">${esc(k.name)}</div>
      <div class="item-sub">${esc(t(k.type === "DEDUCTION" ? "hr.sal.deduction" : "hr.sal.earning"))}</div></div>
      <div class="item-end ${k.type === "DEDUCTION" ? "out" : "in"}">${esc(val)}</div>
      <button class="btn small outline" onclick="hrSalaryRemove(this,'${emp.id}','${k.id}')">${esc(t("hr.sal.remove"))}</button></div>`;
  }).join("");
  const compOpts = `<option value="">${esc(t("hr.sal.pickComp"))}</option>` + comps.map((k) => `<option value="${k.id}" data-calc="${k.calcType}">${esc(k.name)} (${esc(t(k.calcType === "FIXED" ? "hr.sal.fixed" : "hr.sal.percent"))})</option>`).join("");
  return `<div class="card"><div class="section-title">${esc(t("hr.sal.title"))}: ${esc(hrName(emp))}</div>
    <div class="field"><label>${esc(t("hr.sal.base", { c: cur }))}</label><input id="hr-s-base" inputmode="decimal" value="${sal.baseSalary != null ? (sal.baseSalary / 100).toFixed(2) : ""}" /></div>
    <button class="btn soft" onclick="hrSalarySaveBase(this,'${emp.id}')">${esc(t("hr.sal.saveBase"))}</button>
    <div class="panel-title" style="margin-top:14px">${esc(t("hr.sal.items"))}</div>${items}
    <div class="row"><div class="field"><label>${esc(t("hr.sal.comp"))}</label><select id="hr-s-comp">${compOpts}</select></div>
      <div class="field"><label>${esc(t("hr.sal.amount", { c: cur }))}</label><input id="hr-s-val" inputmode="decimal" /></div></div>
    <button class="btn soft" onclick="hrSalaryAddItem(this,'${emp.id}')">${esc(t("hr.sal.addItem"))}</button>
    ${uiFold(t("hr.sal.newComp"), `<div class="field"><label>${esc(t("hr.sal.compName"))}</label><input id="hr-k-name" maxlength="60" /></div>
      <div class="row"><div class="field"><label>${esc(t("hr.sal.compType"))}</label><select id="hr-k-type"><option value="EARNING">${esc(t("hr.sal.earning"))}</option><option value="DEDUCTION">${esc(t("hr.sal.deduction"))}</option></select></div>
      <div class="field"><label>${esc(t("hr.sal.compCalc"))}</label><select id="hr-k-calc"><option value="FIXED">${esc(t("hr.sal.fixed"))}</option><option value="PERCENTAGE_OF_BASE">${esc(t("hr.sal.percent"))}</option></select></div></div>
      <button class="btn soft" onclick="hrCompCreate(this)">${esc(t("hr.sal.createComp"))}</button>`)}
    <div class="btn-row" style="margin-top:10px"><button class="btn small outline" onclick="hrSalaryClose()">${esc(t("hr.sal.close"))}</button></div></div>`;
}
function hrSalaryRefresh(id) { const h = hrState(); delete h.data["sal:" + id]; delete h.data.employees; render(); }
async function hrSalarySaveBase(btn, id) {
  const n = Math.round(parseFloat(hrVal("hr-s-base").replace(",", ".")) * 100);
  if (!Number.isFinite(n) || n < 0) return toast(t("hr.sal.base", { c: "" }));
  const res = await uiBusy(btn, () => api("PUT", `/hr/employees/${id}/salary/base`, { baseSalary: n }));
  if (!res.ok) return hrErr(res);
  toast(t("hr.sal.saved")); hrSalaryRefresh(id);
}
async function hrSalaryAddItem(btn, id) {
  const sel = document.getElementById("hr-s-comp"); if (!sel || !sel.value) return toast(t("hr.sal.pickComp"));
  const calc = sel.selectedOptions[0].dataset.calc;
  const v = parseFloat(hrVal("hr-s-val").replace(",", "."));
  if (!Number.isFinite(v) || v < 0) return toast(t("hr.sal.amount", { c: "" }));
  const body = calc === "FIXED" ? { componentId: sel.value, fixedAmount: Math.round(v * 100) } : { componentId: sel.value, percentage: v };
  const res = await uiBusy(btn, () => api("PUT", `/hr/employees/${id}/salary/components`, body));
  if (!res.ok) return hrErr(res);
  toast(t("hr.sal.itemAdded")); hrSalaryRefresh(id);
}
async function hrSalaryRemove(btn, id, componentId) {
  const res = await uiBusy(btn, () => api("DELETE", `/hr/employees/${id}/salary/components/${componentId}`));
  if (!res.ok) return hrErr(res);
  toast(t("hr.sal.removed")); hrSalaryRefresh(id);
}
async function hrCompCreate(btn) {
  const name = hrVal("hr-k-name").trim(); if (!name) return toast(t("hr.sal.compName"));
  const res = await uiBusy(btn, () => api("POST", "/hr/salary-components", { name, type: hrVal("hr-k-type"), calcType: hrVal("hr-k-calc") }));
  if (!res.ok) return hrErr(res);
  toast(t("hr.sal.compCreated")); delete hrState().data.comps; render();
}

/* ---- leave: types and the requests waiting for a decision ---- */
function hrLeave() {
  const types = hrData("leaveTypes", "/hr/leave-types");
  const reqs = hrData("leaveReqs", "/hr/leave-requests");
  if (types === null || reqs === null) return skeleton("list", 3);
  const open = reqs.filter((r) => r.status === "PENDING_MANAGER" || r.status === "PENDING_HR");
  const days = (r) => Math.round((new Date(r.endDate) - new Date(r.startDate)) / 86400000) + 1;
  const list = open.length === 0 ? uiEmpty("🏖️", t("hr.leave.none")) : open.map((r) => `<div class="item">${uiAvatar(hrName(r.employee))}<div class="item-main">
      <div class="item-title">${esc(hrName(r.employee))}</div>
      <div class="item-sub">${esc(r.leaveType ? r.leaveType.name : "")} · ${hrRange(r.startDate, r.endDate)}</div>
      <div class="chips">${uiChip(t("hr.leave.days", { n: days(r) }), "info")}${uiChip(t(r.status === "PENDING_HR" ? "hr.leave.waitHr" : "hr.leave.waitManager"), "warn")}</div>
      ${r.reason ? `<div class="item-sub">${esc(r.reason)}</div>` : ""}
      ${hrCan("leaveEdit") ? `<div class="btn-row"><button class="btn small" onclick="hrDecide(this,'leave-requests','${r.id}','APPROVE')">${esc(t("hr.approve"))}</button><button class="btn small outline" onclick="hrDecide(this,'leave-requests','${r.id}','REJECT')">${esc(t("hr.reject"))}</button></div>` : ""}
    </div></div>`).join("");
  return `<div class="panel-title">${esc(t("hr.leave.pending"))} <small>${open.length}</small></div>${list}
    ${!hrCan("leaveEdit") ? "" : `<div class="card"><h2>${esc(t("hr.leave.types"))}</h2>
      ${types.length ? `<div class="chips">${types.map((x) => uiChip(x.name + " · " + t("hr.leave.days", { n: x.defaultBalance }), "info")).join("")}</div>` : uiEmpty("📅", t("hr.leave.noTypes"))}
      <div class="row"><div class="field"><label>${esc(t("hr.leave.typeName"))}</label><input id="hr-lt-name" /></div><div class="field"><label>${esc(t("hr.leave.typeDays"))}</label><input id="hr-lt-days" inputmode="numeric" value="14" /></div></div>
      <button class="btn small" onclick="hrAddLeaveType(this)">${esc(t("hr.leave.addType"))}</button></div>`}`;
}
async function hrDecide(btn, kind, id, decision) { await uiBusy(btn, () => hrDo("POST", `/hr/${kind}/${id}/decision`, { decision }, "hr.decided")); }
async function hrAddLeaveType(btn) {
  const name = hrVal("hr-lt-name").trim(), defaultBalance = parseInt(hrVal("hr-lt-days"), 10);
  if (!name || !Number.isInteger(defaultBalance) || defaultBalance < 0) return toast(t("hr.leave.typeName"));
  await uiBusy(btn, () => hrDo("POST", "/hr/leave-types", { name, defaultBalance, isPaid: true }, "hr.leave.typeAdded"));
}

/* ---- payroll: runs; paying one books an expense in this owner's accounting ---- */
function hrPayroll() {
  const ov = hrState().ov;
  const runs = hrData("runs", "/hr/payroll-runs");
  const advs = hrData("advances", "/hr/advances");
  const unified = hrData("unified", "/hr/unified-summary");
  if (runs === null || advs === null || unified === null) return skeleton("tiles");
  const pendingAdv = advs.filter((a) => a.status === "PENDING_MANAGER" || a.status === "PENDING_HR");
  const cur = ov.manage.currency, owner = ov.manage.role === "OWNER";
  const paidCost = runs.filter((r) => r.status === "PAID").reduce((sum, r) => sum + ((r.totals && r.totals.cost) || 0), 0);
  const steps = [t("hr.run.DRAFT"), t("hr.run.PROCESSED"), t("hr.run.PAID")];
  const reached = (st) => (st === "PAID" ? 2 : st === "PROCESSED" ? 1 : 0);
  const act = (r) => r.status === "DRAFT" ? `<button class="btn" onclick="hrRunStep(this,'${r.id}','process','hr.pay.processed')">${esc(t("hr.pay.process"))}</button>`
    : r.status === "PROCESSED" ? `<button class="btn" onclick="hrRunStep(this,'${r.id}','mark-paid','hr.pay.paidDone')">${esc(t("hr.pay.markPaid"))}</button>`
    : owner ? `<button class="btn outline" onclick="hrRevert(this,'${r.id}')">${esc(t("hr.pay.revert"))}</button>` : "";
  const runCards = runs.length === 0 ? uiEmpty("💵", t("hr.pay.none")) : runs.map((r) => `<div class="card">
      <div class="title-line"><strong>${hrRange(r.periodStart, r.periodEnd)}</strong>${uiChip(t("hr.run." + r.status), r.status === "PAID" ? "ok" : r.status === "PROCESSED" ? "info" : "")}</div>
      ${uiStepper(steps, reached(r.status))}
      ${r.status !== "DRAFT" && r.totals ? `<div class="tiles">${uiTile(t("hr.pay.gross"), hrMoney(r.totals.grossPay, cur), "net")}${uiTile(t("hr.pay.deductions"), hrMoney(r.totals.totalDeductions, cur), "expense")}${uiTile(t("hr.pay.net"), hrMoney(r.totals.netPay, cur), "income")}${uiTile(t("hr.pay.cost"), hrMoney(r.totals.cost, cur), "payroll")}</div>` : ""}
      <div class="btn-row">${act(r)}</div></div>`).join("");
  return `<div class="panel-title">${esc(t("hr.pay.runs"))}</div>
    <p class="muted">${esc(t("hr.pay.note"))}</p><p class="muted">${esc(t("hr.pay.attNote"))}</p>
    ${paidCost > 0 ? `<div class="tiles">${uiTile(t("hr.pay.paidTotalLabel"), hrMoney(paidCost, cur), "payroll", true)}</div>` : ""}
    ${unifiedSummaryCard(unified)}
    ${runCards}
    <div class="card"><h2>${esc(t("hr.pay.create"))}</h2>
      <div class="row"><div class="field"><label>${esc(t("hr.pay.from"))}</label><input id="hr-run-from" type="date" /></div><div class="field"><label>${esc(t("hr.pay.to"))}</label><input id="hr-run-to" type="date" /></div></div>
      <button class="btn" onclick="hrCreateRun(this)">${esc(t("hr.pay.create"))}</button></div>
    ${pendingAdv.length ? `<div class="panel-title">${esc(t("hr.adv.pending"))} <small>${pendingAdv.length}</small></div>${pendingAdv.map((a) => `<div class="item">${uiAvatar(hrName(a.employee))}<div class="item-main">
        <div class="item-title">${esc(hrName(a.employee))}</div><div class="item-sub">${esc(t("hr.adv.installments", { n: a.installmentsCount }))}</div>
        <div class="btn-row"><button class="btn small" onclick="hrDecide(this,'advances','${a.id}','APPROVE')">${esc(t("hr.approve"))}</button><button class="btn small outline" onclick="hrDecide(this,'advances','${a.id}','REJECT')">${esc(t("hr.reject"))}</button></div>
      </div><div class="item-end">${esc(hrMoney(a.amount, cur))}</div></div>`).join("")}` : ""}`;
}
async function hrRunStep(btn, id, action, doneKey) { await uiBusy(btn, () => hrDo("POST", `/hr/payroll-runs/${id}/${action}`, undefined, doneKey)); }
async function hrRevert(btn, id) {
  if (!confirm(t("hr.pay.revertAsk"))) return;
  await uiBusy(btn, () => hrDo("POST", `/hr/payroll-runs/${id}/revert-paid`, undefined, "hr.pay.reverted"));
}
async function hrCreateRun(btn) {
  const periodStart = hrVal("hr-run-from"), periodEnd = hrVal("hr-run-to");
  if (!periodStart || !periodEnd) return toast(t("hr.pay.from"));
  await uiBusy(btn, () => hrDo("POST", "/hr/payroll-runs", { periodStart, periodEnd }, "hr.pay.created"));
}

/* ---- my job: check in/out, leave, payslips, advances (only for an account linked to an employee record) ---- */
function hrJob() {
  const ov = hrState().ov;
  const invites = ov.invitations ? hrData("invites", "/hr/me/invitations") : [];
  const invHtml = !invites || !invites.length ? "" : `<div class="panel-title">${esc(t("hr.job.invites"))}</div>${invites.map((i) => `<div class="item">${uiAvatar(i.companyName)}<div class="item-main">
      <div class="item-title">${esc(i.companyName)}</div><div class="item-sub">${esc(i.position || "")}</div>
      <div class="btn-row"><button class="btn small" onclick="hrJobDo(this,'POST','/hr/me/invitations/${i.id}/accept','hr.job.accepted')">${esc(t("hr.job.accept"))}</button></div></div></div>`).join("")}`;
  const codeHtml = `<div class="card"><div class="field"><label>${esc(t("hr.job.haveCode"))}</label><input id="hr-code" /></div><button class="btn small outline" onclick="hrAcceptCode(this)">${esc(t("hr.job.accept"))}</button></div>`;
  if (!ov.jobs || !ov.jobs.length) return invHtml + codeHtml;
  const att = hrData("att", "/hr/me/attendance"), bal = hrData("bal", "/hr/me/leave-balances"), slips = hrData("slips", "/hr/me/payslips");
  if ([att, bal, slips].some((x) => x === null)) return invHtml + skeleton("list", 3);
  const rows = Array.isArray(att) ? att : (att.items || []);
  const openIn = rows.find((r) => !r.checkOut);
  const cur = ov.jobs[0].currency;
  const balances = Array.isArray(bal) ? bal : [];
  const slipList = Array.isArray(slips) ? slips : [];
  return `${invHtml}<div class="card" style="text-align:center">
      <div class="panel-title" style="justify-content:center">${esc(ov.jobs[0].companyName)}</div><div class="item-sub">${esc(ov.jobs[0].position || "")}</div>
      ${openIn ? `<p><span class="pulse-dot" style="display:inline-block;margin-inline-end:8px"></span>${esc(t("hr.job.in", { t: new Date(openIn.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }))}</p><button class="btn" onclick="hrJobPunch(this,'out')">${esc(t("hr.job.out"))}</button>`
        : `<button class="btn" style="margin-top:12px" onclick="hrJobPunch(this,'in')">${esc(t("hr.job.inBtn"))}</button>`}</div>
    <div class="panel-title">${esc(t("hr.job.leave"))}</div>
    ${balances.length ? `<div class="tiles">${balances.map((b) => uiTile((b.leaveType && b.leaveType.name) || "", t("hr.leave.days", { n: b.balanceDays }), "income")).join("")}</div>
      <div class="card"><div class="field"><label>${esc(t("hr.job.leaveType"))}</label><select id="hr-lr-type">${balances.map((b) => `<option value="${b.leaveTypeId || (b.leaveType && b.leaveType.id)}">${esc((b.leaveType && b.leaveType.name) || "")}</option>`).join("")}</select></div>
        <div class="row"><div class="field"><label>${esc(t("hr.pay.from"))}</label><input id="hr-lr-from" type="date" /></div><div class="field"><label>${esc(t("hr.pay.to"))}</label><input id="hr-lr-to" type="date" /></div></div>
        <button class="btn" onclick="hrRequestLeave(this)">${esc(t("hr.job.request"))}</button></div>` : uiEmpty("🏖️", t("hr.job.noBalances"))}
    <div class="panel-title">${esc(t("hr.job.slips"))}</div>
    ${slipList.length === 0 ? uiEmpty("🧾", t("hr.job.noSlips")) : slipList.map((s) => `<div class="item"><span class="avatar" style="--h:150">🧾</span><div class="item-main">
        <div class="item-title">${hrRange(s.run && s.run.periodStart, s.run && s.run.periodEnd)}</div>
        ${uiFold(t("hr.details"), `<span>${esc(t("hr.pay.gross"))}: ${esc(hrMoney(s.grossPay, cur))}</span><span>${esc(t("hr.pay.deductions"))}: ${esc(hrMoney(s.totalDeductions, cur))}</span>`)}
      </div><div class="item-end in">${esc(hrMoney(s.netPay, cur))}</div></div>`).join("")}`;
}
async function hrJobDo(btn, method, path, doneKey) { await uiBusy(btn, () => hrDo(method, path, undefined, doneKey)); }
// check in/out: if the owner turned the shop code on, ask for the code read from the screen at the shop and send it again
async function hrJobPunch(btn, kind) {
  const path = kind === "in" ? "/hr/me/check-in" : "/hr/me/check-out", doneKey = kind === "in" ? "hr.job.inDone" : "hr.job.outDone";
  await uiBusy(btn, async () => {
    let res = await api("POST", path, {});
    if (!res.ok && res.data && res.data.error && res.data.error.code === "ATTENDANCE_CODE_REQUIRED") {
      const code = await uiPrompt(t("hr.code.ask"), "", { numeric: true });
      if (code === null) return;
      res = await api("POST", path, { code: code.trim() });
    }
    if (!res.ok) return hrErr(res);
    toast(t(doneKey));
    hrReload();
  });
}
async function hrAcceptCode(btn) {
  const code = hrVal("hr-code").trim();
  if (code.length < 10) return toast(t("hr.job.haveCode"));
  await uiBusy(btn, () => hrDo("POST", "/hr/me/accept", { code }, "hr.job.accepted"));
}
async function hrRequestLeave(btn) {
  const leaveTypeId = hrVal("hr-lr-type"), startDate = hrVal("hr-lr-from"), endDate = hrVal("hr-lr-to");
  if (!leaveTypeId || !startDate || !endDate) return toast(t("hr.pay.from"));
  await uiBusy(btn, () => hrDo("POST", "/hr/me/leave-requests", { leaveTypeId, startDate, endDate }, "hr.job.requested"));
}

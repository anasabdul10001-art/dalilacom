/* ---- Human resources, inside DALILACOM (no separate site). The server side is /hr/* (src/routes/hr.routes.ts).
   A tab shows only when a real record makes it relevant: the owner's tabs need the owner's plan or company,
   "my job" needs an employee record linked to this account (AGENTS.md: no empty profession sections). ---- */

function hrState() { return (S._hr = S._hr || { loading: false, ov: null, tab: {} }); }
function hrReload() { const h = hrState(); h.ov = null; h.data = {}; h.loading = false; render(); }

/** The tabs this account has, from its real HR records (the first tab, "home", is always there). */
function hrTabs() {
  const ov = hrState().ov;
  if (!S.token || !ov) return [];
  const tabs = [];
  if (ov.manage || ov.canStart) tabs.push("people");
  if (ov.manage) tabs.push("leave", "payroll");
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
  const list = emps.length === 0 ? uiEmpty("👥", t("hr.people.empty")) : emps.map((e) => {
    const name = hrName(e);
    const tone = e.employmentStatus === "ACTIVE" ? "ok" : e.employmentStatus === "ON_LEAVE" ? "warn" : "bad";
    const more = `<span>${esc(t("hr.f.hire"))}: <bdi>${esc(hrDay(e.hireDate))}</bdi></span>${e.email ? `<span>${esc(t("hr.f.email"))}: <bdi>${esc(e.email)}</bdi></span>` : ""}<span>${esc(e.userId ? t("hr.linked") : t("hr.notLinked"))}</span>`;
    return `<div class="item">${uiAvatar(name)}<div class="item-main">
        <div class="item-title">${esc(name)}</div><div class="item-sub">${esc(e.position || t("hr.role." + e.role))}</div>
        <div class="chips">${uiChip(t("hr.role." + e.role))}${uiChip(t("hr.status." + e.employmentStatus), tone)}${e.department ? uiChip(e.department.name) : ""}${e.userId ? uiChip(t("hr.linked"), "info") : ""}</div>
        ${uiFold(t("hr.details"), more)}
        <div class="btn-row"><button class="btn small soft" onclick="hrSalaryOpen('${e.id}')">${esc(t("hr.sal.open"))}</button>${e.userId || e.employmentStatus === "TERMINATED" ? "" : `<button class="btn small soft" onclick="hrInvite(this,'${e.id}')">${esc(t("hr.invite"))}</button>`}</div>
      </div>${e.baseSalary != null ? `<div class="item-end">${esc(hrMoney(e.baseSalary, cur))}</div>` : ""}</div>`;
  }).join("");
  const deptOpts = `<option value="">${esc(t("hr.dept.none"))}</option>` + depts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  const deptList = depts.length === 0 ? uiEmpty("🏷️", t("hr.dept.empty")) : depts.map((d) => `<div class="item"><span class="avatar" style="--h:${hrHue(d.name)}">${esc(d.name.slice(0, 1).toUpperCase())}</span><div class="item-main">
      <div class="item-title">${esc(d.name)}</div><div class="item-sub">${esc(t("hr.dept.count", { n: d._count ? d._count.employees : 0 }))}</div>
      <div class="btn-row"><button class="btn small soft" onclick="hrDeptRename('${d.id}')">${esc(t("hr.dept.rename"))}</button><button class="btn small outline" onclick="hrDeptDelete(this,'${d.id}')" aria-label="${esc(t("accounting.delete"))}">🗑</button></div></div></div>`).join("");
  return `${hrSalaryCard(emps, cur)}<div class="panel-title">${esc(ov.manage.companyName)} <small>${esc(t("hr.people.count", { n: emps.length }))}</small></div>${list}
    <div class="panel-title" style="margin-top:16px">${esc(t("hr.dept.title"))}</div>${deptList}
    <div class="card"><div class="field"><label>${esc(t("hr.dept.name"))}</label><input id="hr-d-name" maxlength="80" /></div>
      <button class="btn soft" onclick="hrDeptAdd(this)">${esc(t("hr.dept.add"))}</button></div>
    <div class="card"><h2>${esc(t("hr.people.add"))}</h2>
      <div class="row"><div class="field"><label>${esc(t("hr.f.first"))}</label><input id="hr-e-first" /></div><div class="field"><label>${esc(t("hr.f.last"))}</label><input id="hr-e-last" /></div></div>
      <div class="row"><div class="field"><label>${esc(t("hr.f.email"))}</label><input id="hr-e-email" type="email" /></div><div class="field"><label>${esc(t("hr.f.position"))}</label><input id="hr-e-pos" /></div></div>
      <div class="row"><div class="field"><label>${esc(t("hr.f.hire"))}</label><input id="hr-e-hire" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div><div class="field"><label>${esc(t("hr.f.salary", { c: cur }))}</label><input id="hr-e-salary" inputmode="decimal" /></div></div>
      <div class="field"><label>${esc(t("hr.f.dept"))}</label><select id="hr-e-dept">${deptOpts}</select></div>
      <button class="btn" onclick="hrAddEmployee(this)">${esc(t("hr.people.addBtn"))}</button>
    </div>`;
}
async function hrCreateCompany(btn) {
  const name = hrVal("hr-co-name").trim();
  if (name.length < 2) return toast(t("hr.company.name"));
  await uiBusy(btn, () => hrDo("POST", "/hr/company", { name }, "hr.company.done"));
}
async function hrAddEmployee(btn) {
  const salary = hrVal("hr-e-salary").trim();
  const body = { firstName: hrVal("hr-e-first").trim(), lastName: hrVal("hr-e-last").trim(), hireDate: hrVal("hr-e-hire"), position: hrVal("hr-e-pos").trim() || null, email: hrVal("hr-e-email").trim() || null };
  if (hrVal("hr-e-dept")) body.departmentId = hrVal("hr-e-dept");
  if (!body.firstName || !body.lastName) return toast(t("hr.f.first"));
  if (salary !== "") { const n = Math.round(parseFloat(salary) * 100); if (!Number.isFinite(n) || n < 0) return toast(t("hr.f.salary", { c: "" })); body.baseSalary = n; }
  await uiBusy(btn, () => hrDo("POST", "/hr/employees", body, "hr.people.added"));
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
      <div class="btn-row"><button class="btn small" onclick="hrDecide(this,'leave-requests','${r.id}','APPROVE')">${esc(t("hr.approve"))}</button><button class="btn small outline" onclick="hrDecide(this,'leave-requests','${r.id}','REJECT')">${esc(t("hr.reject"))}</button></div>
    </div></div>`).join("");
  return `<div class="panel-title">${esc(t("hr.leave.pending"))} <small>${open.length}</small></div>${list}
    <div class="card"><h2>${esc(t("hr.leave.types"))}</h2>
      ${types.length ? `<div class="chips">${types.map((x) => uiChip(x.name + " · " + t("hr.leave.days", { n: x.defaultBalance }), "info")).join("")}</div>` : uiEmpty("📅", t("hr.leave.noTypes"))}
      <div class="row"><div class="field"><label>${esc(t("hr.leave.typeName"))}</label><input id="hr-lt-name" /></div><div class="field"><label>${esc(t("hr.leave.typeDays"))}</label><input id="hr-lt-days" inputmode="numeric" value="14" /></div></div>
      <button class="btn small" onclick="hrAddLeaveType(this)">${esc(t("hr.leave.addType"))}</button></div>`;
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
  if (runs === null || advs === null) return skeleton("tiles");
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
      ${openIn ? `<p><span class="pulse-dot" style="display:inline-block;margin-inline-end:8px"></span>${esc(t("hr.job.in", { t: new Date(openIn.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }))}</p><button class="btn" onclick="hrJobDo(this,'POST','/hr/me/check-out','hr.job.outDone')">${esc(t("hr.job.out"))}</button>`
        : `<button class="btn" style="margin-top:12px" onclick="hrJobDo(this,'POST','/hr/me/check-in','hr.job.inDone')">${esc(t("hr.job.inBtn"))}</button>`}</div>
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

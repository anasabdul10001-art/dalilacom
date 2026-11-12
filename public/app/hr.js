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
  if (!h.ov) { if (!h.loading) hrLoadOverview(); return spinner(); }
  if (tab === "people") return hrPeople();
  if (tab === "leave") return hrLeave();
  if (tab === "payroll") return hrPayroll();
  if (tab === "job") return hrJob();
  return "";
}

/* ---- people: the company, its employees, invitations ---- */
function hrPeople() {
  const ov = hrState().ov;
  if (!ov.manage) {
    return `<div class="card"><h2>${esc(t("hr.company.create"))}</h2>
      <p class="muted">${esc(t("hr.company.createHint"))}</p>
      <div class="field"><label>${esc(t("hr.company.name"))}</label><input id="hr-co-name" /></div>
      <button class="btn" onclick="hrCreateCompany()">${esc(t("hr.company.createBtn"))}</button></div>`;
  }
  const emps = hrData("employees", "/hr/employees");
  if (emps === null) return spinner();
  const cur = ov.manage.currency;
  return `<div class="card"><h2>${esc(ov.manage.companyName)}</h2>
    <p class="muted">${esc(t("hr.people.count", { n: emps.length }))}</p>
    ${emps.length === 0 ? `<div class="empty-state">${esc(t("hr.people.empty"))}</div>` : emps.map((e) => `
      <div class="card" style="margin:8px 0">
        <div class="title-line"><strong>${esc(e.firstName + " " + e.lastName)}</strong><span class="badge neutral">${esc(t("hr.role." + e.role))}</span></div>
        <p class="muted">${esc(e.position || "")} ${e.baseSalary != null ? "· " + esc(hrMoney(e.baseSalary, cur)) : ""}</p>
        <p class="muted">${esc(t("hr.status." + e.employmentStatus))}${e.userId ? " · " + esc(t("hr.linked")) : ""}</p>
        ${e.userId || e.employmentStatus === "TERMINATED" ? "" : `<button class="btn small outline" onclick="hrInvite('${e.id}')">${esc(t("hr.invite"))}</button>`}
      </div>`).join("")}</div>
    <div class="card"><h2>${esc(t("hr.people.add"))}</h2>
      <div class="row"><div class="field"><label>${esc(t("hr.f.first"))}</label><input id="hr-e-first" /></div><div class="field"><label>${esc(t("hr.f.last"))}</label><input id="hr-e-last" /></div></div>
      <div class="row"><div class="field"><label>${esc(t("hr.f.email"))}</label><input id="hr-e-email" type="email" /></div><div class="field"><label>${esc(t("hr.f.position"))}</label><input id="hr-e-pos" /></div></div>
      <div class="row"><div class="field"><label>${esc(t("hr.f.hire"))}</label><input id="hr-e-hire" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div><div class="field"><label>${esc(t("hr.f.salary", { c: cur }))}</label><input id="hr-e-salary" inputmode="decimal" /></div></div>
      <button class="btn" onclick="hrAddEmployee()">${esc(t("hr.people.addBtn"))}</button>
    </div>`;
}
async function hrCreateCompany() {
  const name = hrVal("hr-co-name").trim();
  if (name.length < 2) return toast(t("hr.company.name"));
  await hrDo("POST", "/hr/company", { name }, "hr.company.done");
}
async function hrAddEmployee() {
  const salary = hrVal("hr-e-salary").trim();
  const body = { firstName: hrVal("hr-e-first").trim(), lastName: hrVal("hr-e-last").trim(), hireDate: hrVal("hr-e-hire"), position: hrVal("hr-e-pos").trim() || null, email: hrVal("hr-e-email").trim() || null };
  if (!body.firstName || !body.lastName) return toast(t("hr.f.first"));
  if (salary !== "") { const n = Math.round(parseFloat(salary) * 100); if (!Number.isFinite(n) || n < 0) return toast(t("hr.f.salary", { c: "" })); body.baseSalary = n; }
  await hrDo("POST", "/hr/employees", body, "hr.people.added");
}
async function hrInvite(id) {
  const res = await api("POST", `/hr/employees/${id}/invite`);
  if (!res.ok) return hrErr(res);
  // the code is shown once; it is also emailed when the employee has an email address
  alert(t(res.data.emailed ? "hr.invite.emailed" : "hr.invite.code") + (res.data.emailed ? "" : "\n\n" + res.data.code));
}

/* ---- leave: types and the requests waiting for a decision ---- */
function hrLeave() {
  const types = hrData("leaveTypes", "/hr/leave-types");
  const reqs = hrData("leaveReqs", "/hr/leave-requests");
  if (types === null || reqs === null) return spinner();
  const open = reqs.filter((r) => r.status === "PENDING_MANAGER" || r.status === "PENDING_HR");
  return `<div class="card"><h2>${esc(t("hr.leave.pending"))}</h2>
    ${open.length === 0 ? `<div class="empty-state">${esc(t("hr.leave.none"))}</div>` : open.map((r) => `
      <div class="card" style="margin:8px 0">
        <strong>${esc(r.employee ? r.employee.firstName + " " + r.employee.lastName : "")}</strong>
        <p class="muted">${esc(r.leaveType ? r.leaveType.name : "")} · ${esc(hrDay(r.startDate))} → ${esc(hrDay(r.endDate))}</p>
        ${r.reason ? `<p class="muted">${esc(r.reason)}</p>` : ""}
        <button class="btn small" onclick="hrDecide('leave-requests','${r.id}','APPROVE')">${esc(t("hr.approve"))}</button>
        <button class="btn small outline" onclick="hrDecide('leave-requests','${r.id}','REJECT')">${esc(t("hr.reject"))}</button>
      </div>`).join("")}</div>
    <div class="card"><h2>${esc(t("hr.leave.types"))}</h2>
      ${types.map((x) => `<p>${esc(x.name)} <span class="muted">· ${esc(t("hr.leave.days", { n: x.defaultBalance }))}</span></p>`).join("") || `<p class="muted">${esc(t("hr.leave.noTypes"))}</p>`}
      <div class="row"><div class="field"><label>${esc(t("hr.leave.typeName"))}</label><input id="hr-lt-name" /></div><div class="field"><label>${esc(t("hr.leave.typeDays"))}</label><input id="hr-lt-days" inputmode="numeric" value="14" /></div></div>
      <button class="btn small" onclick="hrAddLeaveType()">${esc(t("hr.leave.addType"))}</button></div>`;
}
async function hrDecide(kind, id, decision) { await hrDo("POST", `/hr/${kind}/${id}/decision`, { decision }, "hr.decided"); }
async function hrAddLeaveType() {
  const name = hrVal("hr-lt-name").trim(), defaultBalance = parseInt(hrVal("hr-lt-days"), 10);
  if (!name || !Number.isInteger(defaultBalance) || defaultBalance < 0) return toast(t("hr.leave.typeName"));
  await hrDo("POST", "/hr/leave-types", { name, defaultBalance, isPaid: true }, "hr.leave.typeAdded");
}

/* ---- payroll: runs; paying one books an expense in this owner's accounting ---- */
function hrPayroll() {
  const ov = hrState().ov;
  const runs = hrData("runs", "/hr/payroll-runs");
  const advs = hrData("advances", "/hr/advances");
  if (runs === null || advs === null) return spinner();
  const pendingAdv = advs.filter((a) => a.status === "PENDING_MANAGER" || a.status === "PENDING_HR");
  const cur = ov.manage.currency, owner = ov.manage.role === "OWNER";
  const paidCost = runs.filter((r) => r.status === "PAID").reduce((sum, r) => sum + ((r.totals && r.totals.cost) || 0), 0);
  const step = (r) => r.status === "DRAFT" ? `<button class="btn small" onclick="hrDo('POST','/hr/payroll-runs/${r.id}/process',undefined,'hr.pay.processed')">${esc(t("hr.pay.process"))}</button>`
    : r.status === "PROCESSED" ? `<button class="btn small" onclick="hrDo('POST','/hr/payroll-runs/${r.id}/mark-paid',undefined,'hr.pay.paidDone')">${esc(t("hr.pay.markPaid"))}</button>`
    : owner ? `<button class="btn small outline" onclick="if(confirm(t('hr.pay.revertAsk')))hrDo('POST','/hr/payroll-runs/${r.id}/revert-paid',undefined,'hr.pay.reverted')">${esc(t("hr.pay.revert"))}</button>` : "";
  return `<div class="card"><h2>${esc(t("hr.pay.runs"))}</h2><p class="muted">${esc(t("hr.pay.note"))}</p><p class="muted">${esc(t("hr.pay.attNote"))}</p>${paidCost > 0 ? `<p><b>${esc(t("hr.pay.paidTotal", { n: hrMoney(paidCost, cur) }))}</b></p>` : ""}
    ${runs.length === 0 ? `<div class="empty-state">${esc(t("hr.pay.none"))}</div>` : runs.map((r) => `
      <div class="card" style="margin:8px 0"><div class="title-line"><strong>${esc(hrDay(r.periodStart))} → ${esc(hrDay(r.periodEnd))}</strong><span class="badge ${r.status === "PAID" ? "success" : "neutral"}">${esc(t("hr.run." + r.status))}</span></div>
      ${r.status !== "DRAFT" && r.totals ? `<p class="muted">${esc(t("hr.pay.gross"))}: ${esc(hrMoney(r.totals.grossPay, cur))} · ${esc(t("hr.pay.deductions"))}: ${esc(hrMoney(r.totals.totalDeductions, cur))} · ${esc(t("hr.pay.net"))}: ${esc(hrMoney(r.totals.netPay, cur))} · <b>${esc(t("hr.pay.cost"))}: ${esc(hrMoney(r.totals.cost, cur))}</b></p>` : ""}
      ${step(r)}</div>`).join("")}
    <div class="field"><label>${esc(t("hr.pay.from"))}</label><input id="hr-run-from" type="date" /></div><div class="field"><label>${esc(t("hr.pay.to"))}</label><input id="hr-run-to" type="date" /></div>
    <button class="btn" onclick="hrCreateRun()">${esc(t("hr.pay.create"))}</button></div>
    ${pendingAdv.length ? `<div class="card"><h2>${esc(t("hr.adv.pending"))}</h2>${pendingAdv.map((a) => `
      <div class="card" style="margin:8px 0"><strong>${esc(a.employee ? a.employee.firstName + " " + a.employee.lastName : "")}</strong>
      <p class="muted">${esc(hrMoney(a.amount, cur))} · ${esc(t("hr.adv.installments", { n: a.installmentsCount }))}</p>
      <button class="btn small" onclick="hrDecide('advances','${a.id}','APPROVE')">${esc(t("hr.approve"))}</button>
      <button class="btn small outline" onclick="hrDecide('advances','${a.id}','REJECT')">${esc(t("hr.reject"))}</button></div>`).join("")}</div>` : ""}`;
}
async function hrCreateRun() {
  const periodStart = hrVal("hr-run-from"), periodEnd = hrVal("hr-run-to");
  if (!periodStart || !periodEnd) return toast(t("hr.pay.from"));
  await hrDo("POST", "/hr/payroll-runs", { periodStart, periodEnd }, "hr.pay.created");
}

/* ---- my job: check in/out, leave, payslips, advances (only for an account linked to an employee record) ---- */
function hrJob() {
  const ov = hrState().ov;
  const invites = ov.invitations ? hrData("invites", "/hr/me/invitations") : [];
  const invHtml = !invites || !invites.length ? "" : `<div class="card"><h2>${esc(t("hr.job.invites"))}</h2>${invites.map((i) => `
    <p><strong>${esc(i.companyName)}</strong> <span class="muted">${esc(i.position || "")}</span>
    <button class="btn small" onclick="hrDo('POST','/hr/me/invitations/${i.id}/accept',undefined,'hr.job.accepted')">${esc(t("hr.job.accept"))}</button></p>`).join("")}</div>`;
  const codeHtml = `<div class="card"><div class="field"><label>${esc(t("hr.job.haveCode"))}</label><input id="hr-code" /></div><button class="btn small outline" onclick="hrAcceptCode()">${esc(t("hr.job.accept"))}</button></div>`;
  if (!ov.jobs || !ov.jobs.length) return invHtml + codeHtml;
  const me = hrData("me", "/hr/me"), att = hrData("att", "/hr/me/attendance"), bal = hrData("bal", "/hr/me/leave-balances"), slips = hrData("slips", "/hr/me/payslips");
  if ([me, att, bal, slips].some((x) => x === null)) return invHtml + spinner();
  const rows = Array.isArray(att) ? att : (att.items || []);
  const openIn = rows.find((r) => !r.checkOut);
  const cur = ov.jobs[0].currency;
  return `${invHtml}<div class="card"><h2>${esc(ov.jobs[0].companyName)}</h2><p class="muted">${esc(ov.jobs[0].position || "")}</p>
      ${openIn ? `<p>${esc(t("hr.job.in", { t: new Date(openIn.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }))}</p><button class="btn" onclick="hrDo('POST','/hr/me/check-out',undefined,'hr.job.outDone')">${esc(t("hr.job.out"))}</button>`
        : `<button class="btn" onclick="hrDo('POST','/hr/me/check-in',undefined,'hr.job.inDone')">${esc(t("hr.job.inBtn"))}</button>`}</div>
    <div class="card"><h2>${esc(t("hr.job.leave"))}</h2>
      ${(Array.isArray(bal) ? bal : []).map((b) => `<p>${esc((b.leaveType && b.leaveType.name) || "")} <span class="muted">· ${esc(t("hr.leave.days", { n: b.balanceDays }))}</span></p>`).join("") || `<p class="muted">${esc(t("hr.job.noBalances"))}</p>`}
      ${(Array.isArray(bal) ? bal : []).length ? `<div class="field"><label>${esc(t("hr.job.leaveType"))}</label><select id="hr-lr-type">${bal.map((b) => `<option value="${b.leaveTypeId || (b.leaveType && b.leaveType.id)}">${esc((b.leaveType && b.leaveType.name) || "")}</option>`).join("")}</select></div>
        <div class="row"><div class="field"><label>${esc(t("hr.pay.from"))}</label><input id="hr-lr-from" type="date" /></div><div class="field"><label>${esc(t("hr.pay.to"))}</label><input id="hr-lr-to" type="date" /></div></div>
        <button class="btn small" onclick="hrRequestLeave()">${esc(t("hr.job.request"))}</button>` : ""}</div>
    <div class="card"><h2>${esc(t("hr.job.slips"))}</h2>
      ${(Array.isArray(slips) ? slips : []).map((s) => `<p>${esc(hrDay(s.run && s.run.periodStart))} → ${esc(hrDay(s.run && s.run.periodEnd))} <strong>${esc(hrMoney(s.netPay, cur))}</strong></p>`).join("") || `<p class="muted">${esc(t("hr.job.noSlips"))}</p>`}</div>`;
}
async function hrAcceptCode() {
  const code = hrVal("hr-code").trim();
  if (code.length < 10) return toast(t("hr.job.haveCode"));
  await hrDo("POST", "/hr/me/accept", { code }, "hr.job.accepted");
}
async function hrRequestLeave() {
  const leaveTypeId = hrVal("hr-lr-type"), startDate = hrVal("hr-lr-from"), endDate = hrVal("hr-lr-to");
  if (!leaveTypeId || !startDate || !endDate) return toast(t("hr.pay.from"));
  await hrDo("POST", "/hr/me/leave-requests", { leaveTypeId, startDate, endDate }, "hr.job.requested");
}

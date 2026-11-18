// Chapters: manual movements, recurring, summary/day cash, reports, tax, statements.
const { sleep, vis } = require("./lib.cjs");
const { ask } = require("./ch-a.cjs");
const fld = (label) => `${vis('.site .field')}.find(f => f.querySelector('label') && f.querySelector('label').innerText.includes(${JSON.stringify(label)})).querySelector('input,select,textarea')`;
async function dump(b, n) {
  console.log(n, await b.ev(`JSON.stringify({sel:${vis(".site select")}.map(s=>[...s.options].map(o=>o.text).slice(0,6)),inp:${vis(".site input,.site textarea")}.map(x=>[x.id,x.type,x.placeholder]),btn:${vis(".site button")}.map(x=>x.innerText.trim()).filter(Boolean).slice(14,50),lab:${vis(".site .field label")}.map(x=>x.innerText)})`));
  await b.shot(n);
}
async function explore(b) {
  for (const t of ["إضافة حركة", "المتكررة", "التقارير", "الضريبة", "الكشوف", "الملخص", "الفروع والموزّعين", "الموظفون", "الفواتير"]) { await b.tab(t); await sleep(1000); await dump(b, "e-" + t.replace(/\s/g, "_")); }
}
const byId = (id) => `document.getElementById(${JSON.stringify(id)})`;
const setDate = async (b, expr, v) => { const p = await b.rectOf(expr); await b.clickAt(p); await b.ev(`(()=>{const e=${expr}; e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(700); };
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// ---- manual income / expense movements
async function moves(b) {
  await b.tab("إضافة حركة"); await sleep(1200);
  const add = async (type, pay, cat, desc, amt) => {
    await b.setSelect(fld("نوع الحركة"), type); await b.setSelect(fld("طريقة الدفع"), pay);
    await b.fillBy(byId("acc-category"), cat); await b.fillBy(byId("acc-description"), desc); await b.fillBy(byId("acc-amount"), amt);
    await b.clickText("حفظ", ".site button"); await sleep(2400);
  };
  await add("المصاريف", "نقداً", "كهرباء", "فاتورة الكهرباء", "45");
  await add("المصاريف", "بنك", "نقل", "أجرة نقل بضاعة", "30");
  await add("الدخل", "محفظة", "خدمات", "عمولة تعبئة رصيد", "18");
}
// ---- recurring expenses
async function recurring(b) {
  await b.tab("المتكررة"); await sleep(1200);
  await b.setSelect(fld("النوع"), "المصاريف"); await b.setSelect(fld("التكرار"), "كل شهر"); await b.setSelect(fld("طريقة الدفع"), "بنك");
  await b.fillBy(byId("rec-category"), "إيجار"); await b.fillBy(byId("rec-description"), "إيجار المحل"); await b.fillBy(byId("rec-amount"), "300");
  await setDate(b, byId("rec-start"), daysAgo(65));
  await b.click(byId("rec-backfill")); await sleep(800);
  await b.clickText("إضافة حركة متكررة", ".site button"); await sleep(2800);
  await b.scrollBy(500, 1200); await sleep(1200);
  await b.shot("rec-done");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 900));
}
// ---- summary + daily cash box
async function summary(b) {
  await b.tab("الملخص"); await sleep(3000);
  await b.scrollBy(500, 1500); await sleep(2500);
  await b.scrollBy(500, 1500); await sleep(2500);
  await b.clickText("تغيير رصيد البداية", ".site button"); await ask(b, "200"); await sleep(1500);
  await b.fillBy(byId("acc-cash-counted"), "105");
  await b.clickText("إقفال اليوم", ".site button"); await sleep(2800);
  await b.shot("sum-closed");
  await b.scrollBy(500, 1200); await sleep(1500);
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 1800));
}
// ---- reports
async function reports(b) {
  await b.tab("التقارير"); await sleep(2500);
  for (const t of ["آخر 7 أيام", "هالشهر", "آخر 30 يوم", "اليوم"]) { await b.clickText(t, ".site button"); await sleep(2200); }
  await b.setSelect(fld("تجميع الصافي"), "شهري"); await sleep(1500);
  await b.scrollBy(600, 1600); await sleep(2500); await b.scrollBy(600, 1600); await sleep(2500); await b.scrollBy(700, 1600); await sleep(2500);
  await b.shot("reports");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 1800));
}
// ---- tax settings and rates
async function tax(b) {
  await b.tab("الضريبة"); await sleep(2200);
  await b.fillBy(byId("tax-number"), "123456789"); await b.fillBy(byId("tax-business"), "أبو سامر للمواد الغذائية");
  await b.setSelect(fld("كيف مكتوبة الأسعار"), "الضريبة بتنضاف على السعر");
  await b.fillBy(byId("tax-rate-name"), "ضريبة المبيعات"); await b.fillBy(byId("tax-rate-pct"), "5");
  await b.clickText("إضافة نسبة", ".site button"); await sleep(2500);
  await b.scrollBy(-600, 1000);
  await b.setSelect(fld("النسبة الافتراضية"), "ضريبة المبيعات · 5%");
  await b.clickText("حفظ الإعدادات", ".site button"); await sleep(2200);
  await b.scrollBy(500, 1400); await sleep(2000);
  await b.shot("tax");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 1500));
}
// ---- statements (income statement and the simple balance sheet)
async function statements(b) {
  await b.tab("الكشوف"); await sleep(2500);
  for (const t of ["آخر 30 يوم", "هالشهر"]) { await b.clickText(t, ".site button"); await sleep(2200); }
  await b.scrollBy(600, 1600); await sleep(2500); await b.scrollBy(600, 1600); await sleep(2500);
  await b.shot("statements");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 1500));
}
module.exports = { fld, dump, explore, moves, recurring, summary, reports, tax, statements, setDate, daysAgo, byId };

// ---- branches and distributors
async function locations(b) {
  await b.tab("الفروع والموزّعين"); await sleep(2000);
  await b.fillBy(byId("loc-name"), "فرع المزة"); await b.setSelect(fld("النوع"), "فرع");
  await b.clickText("أضف", ".site button"); await sleep(2500);
  await b.fillBy(byId("loc-name"), "موزّع الريف"); await b.setSelect(fld("النوع"), "موزّع");
  await b.clickText("أضف", ".site button"); await sleep(2500);
  await b.shot("loc1");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 1800));
  console.log(await b.ev(`${vis(".site button")}.map(x=>x.innerText.trim()).filter(Boolean).slice(14).join("|")`));
}
module.exports.locations = locations;

const card = (name) => `${vis(".site div")}.filter(d => d.innerText.includes(${JSON.stringify(name)}) && d.innerText.includes("وزّع عليه") && d.querySelectorAll("select").length >= 1).sort((a, b) => a.innerText.length - b.innerText.length)[0]`;
async function distribute(b) {
  await b.tab("الفروع والموزّعين"); await sleep(1500);
  const c = card("موزّع الريف"); await b.waitFor(c, 25000); await sleep(800);
  await b.setSelect(`${c}.querySelector("select")`, "أرز");
  await b.fillBy(`${c}.querySelector("input")`, "10");
  await b.click(`[...${c}.querySelectorAll("button")].find(x => x.innerText.trim() === "وزّع عليه")`);
  await sleep(2500); await b.shot("dist1");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(300, 1100));
}
module.exports.distribute = distribute;

async function settle(b) {
  await b.tab("الفروع والموزّعين"); await sleep(1500);
  const c = card("موزّع الريف"); await b.waitFor(c, 25000);
  await b.scrollBy(1100, 1400); await sleep(2000);
  const hf = `document.querySelector('[id^="loc-h-"]')`;
  if (await b.waitFor(hf, 20000).then(() => true, () => false)) {
    await b.fillBy(hf, "14");
    await b.clickText("استلام", ".site button"); await sleep(2800);
  }
  await b.setSelect(`${c}.querySelector("select")`, "أرز");
  await b.fillBy(`${c}.querySelector("input")`, "2");
  await b.click(`[...${c}.querySelectorAll("button")].find(x => x.innerText.trim() === "رجّع للمستودع")`); await sleep(2500);
  await b.scrollBy(900, 1400);
  await b.clickText("عرض", ".site button"); await sleep(2800);
  await b.shot("settle");
}
async function staff(b) {
  await b.tab("الموظفون"); await sleep(2200);
  await b.fillBy(byId("staff-name"), "سامر العلي"); await b.setSelect(fld("الدور"), "كاشير");
  await b.fillBy(byId("staff-rate"), "2"); await b.fillBy(byId("staff-fixed"), "150");
  await b.clickText("إضافة موظف", ".site button"); await sleep(3000);
  await b.shot("staff1");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(280, 1500));
  console.log(await b.ev(`${vis(".site button")}.map(x=>x.innerText.trim()).filter(Boolean).slice(14).join("|")`));
}
module.exports.settle = settle; module.exports.staff = staff;

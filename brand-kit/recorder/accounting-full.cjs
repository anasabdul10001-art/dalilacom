// The long accounting video: ONE continuous recording that covers the whole accounting section on the local site.
// Needs http://localhost:4000 running with Syria geo + accounting plans seeded (see brand-kit/video-plans/accounting-video-plan.md).
// Output: video-plans/accounting/raw/accounting-full.mp4 + accounting-full.chapters.json (start second of every chapter).
const path = require("path"), fs = require("fs");
const { open, sleep, vis } = require("./lib.cjs");
const A = require("./ch-a.cjs"), B = require("./ch-b.cjs");
const OUT = path.join(__dirname, "..", "video-plans", "accounting", "raw", "accounting-full.mp4");
const EMAIL = `demo.shop.${Date.now()}@example.test`, PASS = "Demo-pass-2026!";

async function signup(b) {
  await b.goto("http://localhost:4000/app/"); await sleep(2500);
  await b.setSelect(`${vis("select")}[0]`, "دمشق"); await b.clickText("تأكيد", "button"); await sleep(2800);
  await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2500);
  await b.scrollBy(520, 1800); await sleep(1500); await b.scrollBy(520, 1800); await sleep(1500); await b.scrollBy(-1200, 1400); await sleep(1200);
  await b.clickText("إنشاء حساب", "button,a,[role=button]"); await sleep(2200);
  await b.clickText("لدي نشاط", "button,[role=button]"); await sleep(1500);
  await b.fillBy(`${vis('input[placeholder="مثال: أحمد محمد"]')}[0]`, "أبو سامر للمواد الغذائية");
  await b.fillBy(`${vis('input[type="email"],input[placeholder="name@example.com"]')}[0]`, EMAIL);
  await b.fillBy(`${vis('input[type="password"]')}[0]`, PASS);
  await b.scrollBy(300, 900);
  await b.setSelect(`${vis("select")}[0]`, "سوريا"); await b.setSelect(`${vis("select")}[1]`, "دمشق"); await b.setSelect(`${vis("select")}[2]`, "دمشق");
  await b.scrollBy(420, 1100);
  await b.click(`${vis('input[type="checkbox"]')}[0]`); await sleep(700);
  await b.clickText("إنشاء الحساب", "button"); await sleep(3500);
}
async function plan(b) {
  await b.goto("http://localhost:4000/app/"); await sleep(1500);
  await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
  await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
  await b.clickText("افتح لوحة المحاسب", "button,a"); await sleep(2200);
  await b.clickText("شوف الباقات", "button,a"); await sleep(2800);
  await b.scrollBy(900, 1600); await sleep(1200);
  await b.click(`(() => { const btns = ${vis("button")}.filter(x => x.innerText.includes("ابدأ التجربة")); return btns.find(x => { let e = x; for (let i = 0; i < 5 && e; i++) { e = e.parentElement; if (e && (e.innerText || "").includes("المحاسبة – شهري") && !(e.innerText || "").includes("المحاسبة – سنوي")) return true; } return false; }); })()`);
  await sleep(3500);
  await b.goto("http://localhost:4000/app/"); await sleep(1500);
  await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
  await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
  await b.waitFor(b.byText("افتح لوحة المحاسب", "button,a")); await sleep(800);
  await b.clickText("افتح لوحة المحاسب", "button,a");
  await b.waitFor(`document.body.innerText.includes("ملخص الحركات")`); await sleep(3000);
}
async function tour(b) { // a quick walk over every tab so the viewer sees the whole menu
  for (const t of ["الملخص", "التقارير", "إضافة حركة", "المتكررة", "فاتورة بيع", "المشتريات", "الزبائن والموردين", "الفواتير", "المخزون", "الفروع والموزّعين", "الضريبة", "الكشوف", "الموظفون"]) { await b.tab(t); await sleep(1400); }
}
async function photoInvoices(b) { await b.tab("الفواتير"); await sleep(4000); await b.scrollBy(400, 1200); await sleep(2000); await b.scrollBy(-400, 1000); }
async function finalSummary(b) { await b.tab("الملخص"); await sleep(3500); await b.scrollBy(600, 1600); await sleep(3000); await b.tab("الرئيسية"); await sleep(4000); }

const CHAPTERS = [
  ["الاشتراك وفتح الحساب", signup], ["اختيار الباقة", plan], ["جولة على التبويبات", tour],
  ["المخزون", A.inventory], ["الزبائن والموردين", A.parties], ["فاتورة بيع ومرتجع", A.sale], ["فاتورة شراء", A.purchases],
  ["كشف حساب الزبون", (b) => A.partyStatement(b, "الزبائن", "أم خالد", "4", "نقداً", "10")], ["كشف حساب المورد", (b) => A.partyStatement(b, "الموردين", "مستودع الشام", "40", "بنك")],
  ["الحركات اليدوية", B.moves], ["المتكررة", B.recurring], ["الملخص وصندوق اليوم", B.summary],
  ["الفروع والموزّعون", B.locations], ["توزيع وبيع موزّع وتسوية", async (b) => { await B.distribute(b); await A.saleDistributor(b); await B.settle(b); }],
  ["الضريبة", B.tax], ["التقارير", B.reports], ["الكشوف", B.statements], ["الموظفون", B.staff], ["فواتير بالصورة", photoInvoices], ["الخلاصة", finalSummary],
];
(async () => {
  const b = await open(9370, { fresh: true });
  const marks = []; let t0 = 0;
  try {
    await b.goto("http://localhost:4000/app/"); await b.startRec(); t0 = Date.now(); await sleep(2000);
    for (const [name, fn] of CHAPTERS) {
      const s = Math.round((Date.now() - t0) / 1000); marks.push({ name, start: s });
      try { await fn(b); console.log("ok  ", s + "s", name); }
      catch (e) { console.log("FAIL", s + "s", name, "-", e.message.slice(0, 500)); await b.shot("fail-" + name.replace(/\s/g, "_")); }
    }
    const r = await b.stopRec(OUT, 3);
    fs.writeFileSync(OUT.replace(".mp4", ".chapters.json"), JSON.stringify(marks, null, 1));
    console.log("done", r, OUT);
  } catch (e) { console.error("FATAL", e.message); }
  await b.close(); process.exit(0);
})();

// The guided accounting video: ONE continuous recording where every action is logged as a step (for a step-by-step narration).
// Needs http://localhost:4000 (see accounting-video-plan.md). Output: video-plans/accounting/raw/accounting-guided.mp4 + .steps.json
const path = require("path"), fs = require("fs");
const { open, sleep, vis } = require("./lib.cjs");
const G = require("./guided.cjs");
const OUT = path.join(__dirname, "..", "video-plans", "accounting", "raw", "accounting-guided.mp4");
const EMAIL = `demo.shop.${Date.now()}@example.test`, PASS = "Demo-pass-2026!";

async function signup(b) {
  await b.goto("http://localhost:4000/app/"); await sleep(2500);
  b.note("افتح دليلكم، واكتب اسم مدينتك في خانة البحث، ثم اختر المدينة من النتائج.");
  await b.waitFor(`document.getElementById("city-q")`);
  await b.setSelect(`document.getElementById("city-country")`, "سوريا"); await sleep(800); // the gate starts with the country guessed from the connection (here Germany)
  await b.fillBy(`document.getElementById("city-q")`, "دمشق");
  await b.waitFor(`document.querySelector(".city-result")`);
  await b.click(`document.querySelector(".city-result")`);
  await b.waitFor(`!document.querySelector(".city-gate")`); await sleep(3500);
  b.note("من القائمة الجانبية، اضغط على قسم المحاسب.");
  await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2500);
  if (!(await b.ev(`document.body.innerText.includes("إنشاء حساب")`))) { await b.silent(() => b.clickText("المحاسب", "button,a,[role=button]")); await sleep(2500); }
  b.note("هذه الصفحة الرئيسية للقسم. تشرح لك ما يقدّمه: الدخل والمصاريف، والمخزون والباركود، والفواتير بالصورة، والتقارير.");
  await b.scrollBy(520, 1800); await sleep(2500); await b.scrollBy(520, 1800); await sleep(2500); await b.scrollBy(-1200, 1400); await sleep(1200);
  b.note("لإنشاء حساب جديد، اضغط إنشاء حساب.");
  await b.clickText("إنشاء حساب", "button,a,[role=button]"); await sleep(2200);
  await b.clickText("لدي نشاط", "button,[role=button]"); await sleep(1500);
  b.mark("fill", { label: "اسمك", value: "أبو سامر للمواد الغذائية" });
  await b.silent(() => b.fillBy(`${vis('input[placeholder="مثال: أحمد محمد"]')}[0]`, "أبو سامر للمواد الغذائية"));
  b.mark("fill", { label: "البريد الإلكتروني", value: "" });
  await b.silent(() => b.fillBy(`${vis('input[type="email"],input[placeholder="name@example.com"]')}[0]`, EMAIL));
  b.mark("fill", { label: "كلمة المرور", value: "" });
  await b.silent(() => b.fillBy(`${vis('input[type="password"]')}[0]`, PASS));
  await b.scrollBy(300, 900);
  await b.setSelect(`${vis("select")}[0]`, "سوريا"); await b.setSelect(`${vis("select")}[1]`, "دمشق"); await b.setSelect(`${vis("select")}[2]`, "دمشق");
  await b.scrollBy(420, 1100);
  b.note("وافق على الشروط، ثم اضغط إنشاء الحساب.");
  await b.click(`${vis('input[type="checkbox"]')}[0]`); await sleep(700);
  await b.clickText("إنشاء الحساب", "button"); await sleep(3500);
}
async function plan(b) {
  await b.goto("http://localhost:4000/app/"); await sleep(1500);
  await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
  await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
  b.note("بعد إنشاء الحساب، اضغط افتح لوحة المحاسب، ثم شاهد الباقات.");
  await b.clickText("افتح لوحة المحاسب", "button,a"); await sleep(2200);
  await b.clickText("شاهد الباقات", "button,a"); await sleep(2800);
  await b.scrollBy(900, 1600); await sleep(1200);
  b.note("الآن عرض الإطلاق: ثلاثة أشهر مجاناً، بدون بطاقة دفع. اضغط ابدأ التجربة في باقة المحاسبة الشهرية.");
  await b.click(`(() => { const btns = ${vis("button")}.filter(x => x.innerText.includes("ابدأ التجربة")); return btns.find(x => { let e = x; for (let i = 0; i < 5 && e; i++) { e = e.parentElement; if (e && (e.innerText || "").includes("المحاسبة – شهري") && !(e.innerText || "").includes("المحاسبة – سنوي")) return true; } return false; }); })()`);
  await sleep(3500);
  await b.goto("http://localhost:4000/app/"); await sleep(1500);
  await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
  await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
  await b.waitFor(b.byText("افتح لوحة المحاسب", "button,a")); await sleep(800);
  await b.clickText("افتح لوحة المحاسب", "button,a");
  await b.waitFor(`document.body.innerText.includes("ملخص الحركات")`); await sleep(3000);
}
async function tour(b) {
  b.note("هذه لوحة المحاسب. في الأعلى شريط التبويبات، وسنمرّ عليها تبويباً تبويباً.");
  await sleep(3000);
  for (const t of ["الملخص", "التقارير", "إضافة حركة", "المتكررة", "فاتورة بيع", "المشتريات", "الزبائن والموردون", "الفواتير", "المخزون", "الفروع والموزّعين", "الضريبة", "الكشوف", "الموظفون"]) { await b.silent(() => b.tab(t)); await sleep(900); }
}
const CHAPTERS = [
  ["ابدأ بدقيقة", signup], ["اختر باقتك", plan], ["جولة على اللوحة", tour],
  ["المخزون", async (b) => { await G.inventory(b); await G.stockCount(b); }], ["الزبائن والموردون", G.parties], ["فاتورة بيع", G.sale], ["فاتورة شراء", G.purchases],
  ["كشف حساب الزبون", (b) => G.partyStatement(b, "الزبائن", "أم خالد", "4", "نقدًا", "10")], ["كشف حساب المورّد", (b) => G.partyStatement(b, "الموردون", "مستودع الشام", "40", "بنك")],
  ["مصاريف ودخل", G.moves], ["الحركات المتكررة", G.recurring], ["الملخص وصندوق اليوم", G.summary],
  ["الفروع والموزّعون", G.locations], ["بضاعة الموزّع", async (b) => { await G.distribute(b); await G.saleDistributor(b); await G.settle(b); }],
  ["الضريبة", G.tax], ["التقارير", G.reports], ["الكشوف", G.statements], ["الموظفون", G.staff], ["فواتير بالصورة", G.photoInvoices], ["الخلاصة", G.finalSummary],
];
module.exports = { signup, plan };
if (require.main === module) (async () => {
  const b = await open(9371, { fresh: true });
  try {
    await b.goto("http://localhost:4000/app/"); await b.startRec(); await sleep(2000);
    for (const [name, fn] of CHAPTERS) {
      b.chapter(name); const t0 = Date.now();
      try { await fn(b); console.log("ok  ", Math.round((Date.now() - t0) / 1000) + "s", name); }
      catch (e) { console.log("FAIL", name, "-", e.message.slice(0, 400)); await b.shot("gfail-" + name.replace(/\s/g, "_")); }
      b.setQuiet(false);
    }
    const r = await b.stopRec(OUT, 3);
    fs.writeFileSync(OUT.replace(".mp4", ".steps.json"), JSON.stringify(b.getSteps().map((x) => ({ ...x, t: Math.max(0, x.abs - b.frameT0()) })), null, 1));
    console.log("done", r, OUT, "steps:", b.getSteps().length);
  } catch (e) { console.error("FATAL", e.message); }
  await b.close(); process.exit(0);
})();

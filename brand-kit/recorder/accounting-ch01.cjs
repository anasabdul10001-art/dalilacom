// Accounting video, part 1, chapter 1: open the section, sign up (a demo shop owner), pick the free plan, land on the dashboard.
// Needs the local site on http://localhost:4000 (see brand-kit/video-plans/accounting-video-plan.md). Output: raw/ch01-clean.mp4
const { launch, sleep } = require("./cdp.cjs");
const path = require("path");
const OUT = path.join(__dirname, "..", "video-plans", "accounting", "raw", "ch01-clean.mp4");
const EMAIL = process.env.REC_EMAIL || `demo.shop.${Date.now()}@example.test`;
const PASS = "Demo-pass-2026!";
const vis = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent !== null)`;

(async () => {
  const b = await launch();
  try {
    await b.goto("http://localhost:4000/app/");
    await b.startRec();
    await sleep(2500);
    // the city gate
    await b.setSelect(`${vis("select")}[0]`, "دمشق");
    await b.clickText("تأكيد", "button"); await sleep(2800);
    // open the accounting section from the side menu
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2500);
    await b.scrollBy(520, 1800); await sleep(1500); await b.scrollBy(520, 1800); await sleep(1500);
    await b.scrollBy(-1200, 1400); await sleep(1200);
    // sign up
    await b.clickText("إنشاء حساب", "button,a,[role=button]"); await sleep(2200);
    await b.clickText("لدي نشاط", "button,[role=button]"); await sleep(1500);
    await b.fillBy(`${vis('input[placeholder="مثال: أحمد محمد"]')}[0]`, "أبو سامر للمواد الغذائية");
    await b.fillBy(`${vis('input[type="email"],input[placeholder="name@example.com"]')}[0]`, EMAIL);
    await b.fillBy(`${vis('input[type="password"]')}[0]`, PASS);
    await b.scrollBy(300, 900);
    await b.setSelect(`${vis("select")}[0]`, "سوريا");
    await b.setSelect(`${vis("select")}[1]`, "دمشق");
    await b.setSelect(`${vis("select")}[2]`, "دمشق");
    await b.scrollBy(420, 1100);
    await b.click(`${vis('input[type="checkbox"]')}[0]`); await sleep(700);
    await b.clickText("إنشاء الحساب", "button"); await sleep(3500);
    // back to the home page, then into accounting (no plan yet: the page offers the plans)
    await b.goto("http://localhost:4000/app/"); await sleep(1500);
    await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
    await b.clickText("افتح لوحة المحاسب", "button,a"); await sleep(2200);
    await b.clickText("شوف الباقات", "button,a"); await sleep(2800);
    await b.scrollBy(900, 1600); await sleep(1200);
    // the free trial of the monthly accounting plan
    await b.click(`(() => { const btns = ${vis("button")}.filter(x => x.innerText.includes("ابدأ التجربة")); return btns.find(x => { let e = x; for (let i = 0; i < 5 && e; i++) { e = e.parentElement; if (e && (e.innerText || "").includes("المحاسبة – شهري") && !(e.innerText || "").includes("المحاسبة – سنوي")) return true; } return false; }); })()`);
    await sleep(3500);
    await b.goto("http://localhost:4000/app/"); await sleep(1500);
    await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
    await b.waitFor(b.byText("افتح لوحة المحاسب", "button,a")); await sleep(800);
    await b.clickText("افتح لوحة المحاسب", "button,a");
    await b.waitFor(`document.body.innerText.includes("ملخص الحركات")`); await sleep(3500);
    const r = await b.stopRec(OUT, 2.5);
    console.log("done", r, OUT);
  } catch (e) { console.error("FAILED", e.message); try { await b.send("Page.stopScreencast"); } catch {} }
  await b.close();
})();

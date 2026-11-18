// Dev helper: create the demo shop account once in a persistent profile (so later stages start logged in).
const { launch, sleep } = require("./cdp.cjs");
const path=require("path");
const PROFILE = path.join(process.env.TEMP, "dlk-demo-profile");
const EMAIL = `demo.shop.${Date.now()}@example.test`, PASS = "Demo-pass-2026!";
const vis = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent !== null)`;
(async () => {
  const b = await launch({ port: 9346, profile: PROFILE });
  try {
    await b.goto("http://localhost:4000/app/");
    await b.setSelect(`${vis("select")}[0]`, "دمشق"); await b.clickText("تأكيد", "button"); await sleep(2000);
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2000);
    await b.clickText("إنشاء حساب", "button,a,[role=button]"); await sleep(1500);
    await b.clickText("لدي نشاط", "button,[role=button]"); await sleep(1000);
    await b.fillBy(`${vis('input[placeholder="مثال: أحمد محمد"]')}[0]`, "أبو سامر للمواد الغذائية");
    await b.fillBy(`${vis('input[type="email"],input[placeholder="name@example.com"]')}[0]`, EMAIL);
    await b.fillBy(`${vis('input[type="password"]')}[0]`, PASS);
    await b.setSelect(`${vis("select")}[0]`, "سوريا"); await b.setSelect(`${vis("select")}[1]`, "دمشق"); await b.setSelect(`${vis("select")}[2]`, "دمشق");
    await b.click(`${vis('input[type="checkbox"]')}[0]`); await sleep(500);
    await b.clickText("إنشاء الحساب", "button"); await sleep(3500);
    console.log("signed up");
  } catch (e) { console.error("FAILED", e.message); }
  await b.close();
})();

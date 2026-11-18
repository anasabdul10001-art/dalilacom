// Dev helper: open the demo profile, go into the accounting dashboard, screenshot given tabs into a folder.
const { launch, sleep } = require("./cdp.cjs");
const path=require("path"), fs=require("fs");
const PROFILE = path.join(process.env.TEMP, "dlk-demo-profile");
const OUT = path.join(process.env.TEMP, "shots"); fs.mkdirSync(OUT,{recursive:true});
const vis = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent !== null)`;
(async () => {
  const b = await launch({ port: 9347, profile: PROFILE });
  const shot = async (n) => { const r = await b.send("Page.captureScreenshot",{format:"jpeg",quality:70}); fs.writeFileSync(path.join(OUT,n+".jpg"), Buffer.from(r.data,"base64")); };
  try {
    await b.goto("http://localhost:4000/app/");
    await sleep(1500);
    if (await b.ev(`!!document.querySelector('select')&&[...document.querySelectorAll('select')].some(x=>x.offsetParent)`)) { await b.setSelect(`${vis("select")}[0]`, "دمشق"); await b.clickText("تأكيد","button"); await sleep(1500); }
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2000);
    if (await b.ev(`document.body.innerText.includes("افتح لوحة المحاسب")`)) { await b.clickText("افتح لوحة المحاسب","button,a"); await sleep(2000); }
    if (await b.ev(`document.body.innerText.includes("شوف الباقات")`)) {
      await b.clickText("شوف الباقات","button,a"); await sleep(2000); await b.scrollBy(900,500);
      await b.click(`(() => { const btns = ${vis("button")}.filter(x => x.innerText.includes("ابدأ التجربة")); return btns.find(x => { let e = x; for (let i = 0; i < 5 && e; i++) { e = e.parentElement; if (e && (e.innerText || "").includes("المحاسبة – شهري") && !(e.innerText || "").includes("المحاسبة – سنوي")) return true; } return false; }); })()`);
      await sleep(3000); await b.goto("http://localhost:4000/app/"); await b.clickText("المحاسب","button,a,[role=button]"); await sleep(2000); await b.clickText("افتح لوحة المحاسب","button,a"); await sleep(2500);
    }
    for (const t of process.argv.slice(2)) {
      await b.clickText(t, ".site-tabs *, .site-tab, button"); await sleep(1800); await shot(t.replace(/\s/g,"_"));
      const txt = await b.ev(`document.querySelector('.site')?.innerText.slice(0,1500)`); fs.writeFileSync(path.join(OUT,t.replace(/\s/g,"_")+".txt"), txt||"");
    }
    console.log("ok");
  } catch (e) { console.error("FAILED", e.message); await shot("fail"); }
  await b.close();
})();

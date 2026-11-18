// Shared helpers for the accounting video scripts (persistent demo profile, login state, tab navigation).
const { launch, sleep } = require("./cdp.cjs");
const path = require("path"), fs = require("fs");
const PROFILE = path.join(process.env.TEMP, "dlk-demo-profile");
const SHOTS = path.join(process.env.TEMP, "shots"); fs.mkdirSync(SHOTS, { recursive: true });
const vis = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent !== null)`;
async function open(port, opts = {}) {
  const b = await launch({ port, profile: opts.fresh ? undefined : PROFILE });
  b.shot = async (n) => { const r = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); fs.writeFileSync(path.join(SHOTS, n + ".jpg"), Buffer.from(r.data, "base64")); };
  b.inputs = (scope = ".site") => `${vis(scope + " input:not([type=hidden]):not([type=checkbox]):not([type=file]),textarea")}`;
  b.tab = async (t) => { await b.clickText(t, ".site-tabs *, .site-tab, button"); await sleep(1600); };
  b.fill = async (i, text, scope) => b.fillBy(`${b.inputs(scope)}[${i}]`, text);
  b.enterDashboard = async () => {
    await b.goto("http://localhost:4000/app/"); await sleep(1200);
    if (await b.ev(`${vis("select")}.length>0 && document.body.innerText.includes("تأكيد")`)) { await b.setSelect(`${vis("select")}[0]`, "دمشق"); await b.clickText("تأكيد", "button"); await sleep(1500); }
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2000);
    if (await b.ev(`document.body.innerText.includes("افتح لوحة المحاسب")`)) { await b.clickText("افتح لوحة المحاسب", "button,a"); await sleep(2200); }
  };
  return b;
}
module.exports = { open, sleep, vis, SHOTS };

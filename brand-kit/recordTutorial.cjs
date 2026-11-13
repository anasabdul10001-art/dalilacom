// Records a scripted walk through the local web app as a phone-sized screen, into frames + timestamps (assembled later with the voice).
// node record.js <video: a|b|c|d> <outDir>
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const which = process.argv[2];
const outDir = process.argv[3];
const BASE = "http://localhost:4000/app/";
const EMAIL = process.env.REC_EMAIL || "acctest@example.test";

(async () => {
  fs.rmSync(path.join(outDir, which), { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, which), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.evaluate(async (email) => {
    const r = await fetch("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "Test-pass-123!" }) }).then((r) => r.json());
    localStorage.setItem("dlk_token", r.token); localStorage.setItem("dlk_role", r.user.role);
  }, EMAIL);
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.addStyleTag({ content: `.dk-tap{position:fixed;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(244,128,80,.45);border:3px solid #f48050;z-index:99999;pointer-events:none;animation:dkTap .55s ease-out forwards}@keyframes dkTap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}` });
  // hide the floating side tab and the card button: they are not part of what is being explained
  await page.addStyleTag({ content: '#social-dock, .fab-stack { display: none !important; }' });
  await page.evaluate(() => setHomeTab("accounting"));
  await sleep(1500);

  // ---- frame recorder
  let running = true, n = 0; const stamps = []; const t0 = Date.now();
  const loop = (async () => {
    while (running) {
      const t = Date.now() - t0;
      const buf = await page.screenshot({ type: "jpeg", quality: 82 });
      fs.writeFileSync(path.join(outDir, which, String(n).padStart(5, "0") + ".jpg"), buf);
      stamps.push(t); n++;
    }
  })();

  const tap = async (text, nth = 0) => {
    const pos = await page.evaluate((t, i) => {
      const els = [...document.querySelectorAll("button,a")].filter((x) => x.offsetParent !== null && (x.innerText || "").trim() === t || (x.innerText || "").trim().includes(t) && x.offsetParent !== null);
      const el = els[i]; if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, text, nth);
    if (!pos) { console.log("missing", text); return; }
    await sleep(350);
    await page.evaluate((p) => { const d = document.createElement("div"); d.className = "dk-tap"; d.style.left = p.x + "px"; d.style.top = p.y + "px"; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, pos);
    await sleep(450);
    await page.evaluate((t, i) => { const els = [...document.querySelectorAll("button,a")].filter((x) => x.offsetParent !== null && (x.innerText || "").trim().includes(t)); els[i].click(); }, text, nth);
  };
  const fill = async (id, text) => {
    await page.evaluate((i) => { const e = document.getElementById(i); e.scrollIntoView({ block: "center" }); e.focus(); }, id);
    await sleep(300);
    await page.keyboard.type(text, { delay: 90 });
    await sleep(350);
  };

  if (which === "a") {
    await sleep(1200); await tap("افتح لوحة المحاسب"); await sleep(1800);
    await tap("شوف الباقات"); await sleep(2200);
    await tap("ابدأ التجربة"); await sleep(3200);
  } else if (which === "b") {
    await tap("المخزون"); await sleep(1800);
    await fill("acc-product-name", "كوب قهوة");
    await fill("acc-sale-price", "5");
    await fill("acc-cost-price", "2");
    await fill("acc-quantity", "20");
    await tap("إضافة المنتج للجرد"); await sleep(2500);
    await tap("+"); await sleep(1200);
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.keyboard.type("10", { delay: 120 }); await sleep(700);
    await tap("حفظ"); await sleep(2500);
  } else if (which === "c") {
    await tap("المخزون"); await sleep(1800);
    await tap("بيع"); await sleep(1300);
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.keyboard.type("2", { delay: 120 }); await sleep(700);
    await tap("حفظ"); await sleep(2800);
    await tap("الملخص"); await sleep(2500);
  } else if (which === "d") {
    await tap("الملخص"); await sleep(2500);
    await page.evaluate(() => window.scrollBy({ top: 420, behavior: "smooth" })); await sleep(2200);
    await page.evaluate(() => window.scrollBy({ top: 420, behavior: "smooth" })); await sleep(2200);
  }

  running = false; await loop;
  fs.writeFileSync(path.join(outDir, which, "stamps.json"), JSON.stringify(stamps));
  console.log(which, n, "frames", Math.round(stamps[stamps.length - 1] / 1000) + "s");
  await browser.close();
})();

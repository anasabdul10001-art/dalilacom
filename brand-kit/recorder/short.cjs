// Short "how do I ...?" videos: one clip = one question. The voice is generated FIRST, then the screen is recorded at
// real speed and every step simply lasts as long as its sentence. Nothing is retimed or concatenated, so sound and
// picture cannot drift apart. Needs http://localhost:4000.
//   node short.cjs 01-goods voice    generate the narration (ElevenLabs)
//   node short.cjs 01-goods          record and mix -> editor/out/short-01-goods.mp4   (UHD=1 -> short-01-goods-4k.mp4)
const UHD = process.env.UHD === "1"; if (UHD) process.env.DLK_SCALE = "3"; /* the picture is the 1280x720 layout times this factor */ // 3840x2160 (must be set before the recorder is loaded)
const SUF = UHD ? "-4k" : "";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { spawnSync } = require("child_process");
const { open, sleep } = require("./lib.cjs");
const { signup, plan } = require("./accounting-guided.cjs");
const { fld } = require("./ch-b.cjs");

const ID = process.argv[2];
const clip = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "video-plans", "accounting", "clips", ID + ".json"), "utf8"));
const ED = path.join(__dirname, "..", "editor"), OUT = path.join(ED, "out"), VO = path.join(ED, "voice-short");
[OUT, VO].forEach((d) => fs.mkdirSync(d, { recursive: true }));
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
// the owner's final choice 2026-11-25: his own cloned voice "Anas DALILACOM" with lively settings (sample 1)
const VOICE_ID = "clS4TmlZF18Hafme6bgr";
const VOICE_SETTINGS = { stability: 0.3, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true, speed: 1.05 };
const mp3Of = (t) => path.join(VO, crypto.createHash("sha1").update(VOICE_ID + JSON.stringify(VOICE_SETTINGS) + t).digest("hex").slice(0, 12) + ".mp3");
const durOf = (f) => { const r = spawnSync(FF, ["-hide_banner", "-i", f]); const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(r.stderr)); if (!m) throw new Error("no duration: " + f); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
const PAUSE = 0.9; // a breath after every sentence

// the owner's rule: numbers are always written as words (the voice mispronounces digits)
for (const s of clip.steps) if (/[0-9\u0660-\u0669]/.test(s.say)) throw new Error("write numbers as words: " + s.say);

async function genVoice() {
  const KEY = fs.readFileSync("C:/Users/Tom/.elevenlabs-key.txt", "utf8").trim();
  for (const { say } of clip.steps) {
    const f = mp3Of(say); if (fs.existsSync(f)) continue;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: say, model_id: "eleven_multilingual_v2", voice_settings: VOICE_SETTINGS }) });
    if (!r.ok) throw new Error("TTS " + r.status + " " + (await r.text()).slice(0, 200));
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log("voice", durOf(f).toFixed(1) + "s", path.basename(f));
  }
}

// ---- full-screen cards (inside the page, so they are part of the one continuous recording)
const card = (b, big, small) => b.ev(`(() => { let d = document.getElementById("__card"); if (!d) { d = document.createElement("div"); d.id = "__card"; document.documentElement.appendChild(d); }
  d.style.cssText = "position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;padding:0 90px;text-align:center;direction:rtl;background:linear-gradient(135deg,#fdf4ee,#ffe3d3);font-family:" + getComputedStyle(document.body).fontFamily;
  d.innerHTML = '<div style="font-size:34px;font-weight:700;color:#f48050">دليلكم · المحاسب</div><div style="font-size:66px;font-weight:800;line-height:1.5;color:#1c1c1c">' + ${JSON.stringify(big)} + '</div>' + ${JSON.stringify(small ? `<div style="font-size:40px;font-weight:700;color:#fff;background:#f48050;border-radius:60px;padding:16px 44px;direction:ltr">${small}</div>` : "")}; })()`);
const uncard = (b) => b.ev(`document.getElementById("__card")?.remove()`);

const id = (x) => `document.getElementById(${JSON.stringify(x)})`;
const addProduct = async (b) => { await b.clickText("إضافة المنتج إلى الجرد", "button"); await sleep(2200); };
const button = async (b, label) => { await b.clickText(label, ".site button"); await sleep(1400); };
// what a clip needs to exist before the camera starts
const PREP = {
  twoProducts: async (b) => {
    await b.tab("المخزون"); await sleep(1500);
    for (const p of [["6281001", "أرز مصري", "3.5", "2.5", "40"], ["6281002", "سكر ناعم", "2", "1.5", "60"]]) {
      for (const [i, f] of ["acc-barcode", "acc-product-name", "acc-sale-price", "acc-cost-price", "acc-quantity"].entries()) await b.fillBy(id(f), p[i]);
      await addProduct(b);
    }
  },
};
const tabClick = async (b, label) => { await uncard(b); await sleep(1200); await b.clickText(label, ".site-tabs *, .site-tab, button"); await sleep(1500); };
const ACTIONS = {
  openSale: (b) => tabClick(b, "فاتورة بيع"),
  pickProduct: (b) => b.setSelect(id("sale-product"), "أرز"),
  saleQty: (b) => b.fillBy(id("sale-qty"), "3"),
  addLine: async (b) => { await sleep(900); await button(b, "أضف إلى الفاتورة"); },
  byBarcode: async (b) => { await b.fillBy(id("sale-barcode"), "6281002"); await sleep(1500); await button(b, "أضف بالباركود"); },
  payment: async (b) => { const f = fld("طريقة الدفع"); await sleep(1500); await b.setSelect(f, "بنك"); await sleep(1200); await b.setSelect(f, "نقدًا"); },
  totals: (b) => b.scrollBy(350, 1500),
  save: async (b) => { await sleep(1200); await button(b, "حفظ الفاتورة"); await sleep(1500); },
  saved: async () => {},
  stockAfter: async (b) => { await b.ev(`window.scrollTo({top:0,behavior:"smooth"})`); await sleep(1200); await b.clickText("المخزون", ".site-tabs *, .site-tab, button"); await sleep(1800); await b.scrollBy(420, 1500); },
  title: async () => {},
  openStock: async (b) => { await uncard(b); await sleep(1200); await b.clickText("المخزون", ".site-tabs *, .site-tab, button"); await sleep(1200); },
  barcode: (b) => b.fillBy(id("acc-barcode"), "6281001"),
  name: (b) => b.fillBy(id("acc-product-name"), "أرز مصري"),
  price: (b) => b.fillBy(id("acc-sale-price"), "3.5"),
  cost: (b) => b.fillBy(id("acc-cost-price"), "2.5"),
  qty: (b) => b.fillBy(id("acc-quantity"), "40"),
  add: async (b) => { await sleep(1200); await addProduct(b); },
  show: (b) => b.scrollBy(420, 1500),
  second: async (b) => {
    await b.scrollBy(-900, 1300);
    for (const [f, v] of [["acc-barcode", "6281002"], ["acc-product-name", "سكر ناعم"], ["acc-sale-price", "2"], ["acc-cost-price", "1.5"], ["acc-quantity", "60"]]) await b.fillBy(id(f), v);
    await addProduct(b);
  },
  outro: (b) => card(b, "جرّب محاسب دليلكم<br>مجاناً لمدة 3 أشهر", "dalilacom.com"),
};

// the actions of clips 3 and later live in their own file
const more = require("./short-actions.cjs")({ sleep, card, uncard, id, button, tabClick, addProduct, PREP });
Object.assign(PREP, more.PREP); Object.assign(ACTIONS, more.ACTIONS);

async function record() {
  for (const s of clip.steps) if (!fs.existsSync(mp3Of(s.say))) throw new Error("run the voice step first");
  const b = await open(9373, { fresh: true });
  const silentMp4 = path.join(OUT, `short-${ID}${SUF}-silent.mp4`), outMp4 = path.join(OUT, `short-${ID}${SUF}.mp4`);
  try {
    if (!clip.fromStart) { await signup(b); await plan(b); } // preparation, not recorded
    // 1280x720 CSS px drawn at 1.5x = a 1920x1080 picture with text large enough for a phone
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: UHD ? 3 : 1.5, mobile: false });
    if (clip.prep) { await PREP[clip.prep](b); await sleep(4000); } // wait for the "saved" message to leave
    if (clip.fromStart) { await b.goto("http://localhost:4000/app/"); await sleep(2500); } else { await b.tab(clip.start); await sleep(2000); }
    await card(b, clip.title); await sleep(800);
    await b.startRec(); await sleep(150);
    const marks = [];
    for (const s of clip.steps) {
      const file = mp3Of(s.say), dur = durOf(file), start = Date.now();
      marks.push({ do: s.do, say: s.say, file, dur, abs: start / 1000 });
      await ACTIONS[s.do](b);
      const left = start + (dur + PAUSE) * 1000 - Date.now(); if (left > 0) await sleep(left);
      await b.shot(`short-${ID}-${String(marks.length).padStart(2, "0")}-${s.do}`);
      console.log("step", s.do, "voice", dur.toFixed(1) + "s", "took", ((Date.now() - start) / 1000).toFixed(1) + "s");
    }
    // keep the last card moving so the recorder receives frames until the very end
    await b.ev(`(() => { const d = document.getElementById("__card"); let n = 0; setInterval(() => { d.style.opacity = (n++ % 2) ? "1" : "0.999"; }, 200); })()`);
    await sleep(1500);
    const rec = await b.stopRec(silentMp4, 0.5);
    const t0 = b.frameT0(), total = durOf(silentMp4);
    const segs = marks.map((m, i) => ({ i, kind: m.do, say: m.say, file: m.file, dur: m.dur, at: Math.max(0.15, m.abs - t0 + 0.15) }));
    const tl = path.join(OUT, `short-${ID}${SUF}.timeline.json`);
    fs.writeFileSync(tl, JSON.stringify({ lang: "ar", total, recorderSeconds: rec.seconds, hook: null, segs }, null, 1));
    const music = path.join(__dirname, "..", "social", "videos", "dalilacom-register-free-music.wav");
    const mx = spawnSync("python", [path.join(ED, "mix_audio.py"), "--timeline", tl, "--video-in", silentMp4, "--out", outMp4, "--music", music, "--vol", "0.05"], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    if (mx.status !== 0) throw new Error("mix failed");
    console.log("DONE", outMp4, total.toFixed(1) + "s");
  } finally { await b.close(); }
}

(process.argv[3] === "voice" ? genVoice() : record()).then(() => process.exit(0)).catch((e) => { console.error("FAILED", e.stack); process.exit(1); });

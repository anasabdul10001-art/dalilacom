// Vertical teaser clips (1080x1920) cut from the finished 4K video: caption card rendered in headless Chrome (Arabic shaping), video placed in the middle.
// node make-shorts.cjs   ->  ../social/shorts/accounting-short-{a,b,c}.mp4
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { launch, sleep } = require("../recorder/cdp.cjs");
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const SRC = path.join(__dirname, "out", "accounting-guided-edit-4k.mp4"), OUT = path.join(__dirname, "..", "social", "shorts"), W = path.join(__dirname, "work2");
fs.mkdirSync(OUT, { recursive: true });
const logo = "file:///" + path.resolve(__dirname, "..", "logo", "logo-full-horizontal-color.png").split(path.sep).join("/");
const font = (f) => "file:///" + path.resolve(__dirname, "..", "fonts", f).split(path.sep).join("/");
const CLIPS = [
  { id: "a", ss: 0, to: 59.42, top: "برنامج محاسبة", mid: "مجاني", sub: "لمدة ٣ أشهر", cta: "الفيديو الكامل على قناة دليلكم" },
  { id: "b", ss: 331.78, to: 383.88, top: "فاتورة بيع", mid: "بدقيقة", sub: "من هاتفك أو حاسوبك", cta: "الفيديو الكامل على قناة دليلكم" },
  { id: "c", ss: 896.11, to: 951.17, top: "أرباحك ومصاريفك", mid: "بضغطة", sub: "تقارير جاهزة وواضحة", cta: "الفيديو الكامل على قناة دليلكم" },
];
const html = (c) => `<!doctype html><meta charset=utf-8><style>
@font-face{font-family:T;src:url(${font("tajawal_bold.ttf")});font-weight:800}
@font-face{font-family:T;src:url(${font("tajawal_medium.ttf")});font-weight:500}
html,body{margin:0;width:1080px;height:1920px;font-family:T,sans-serif;background:linear-gradient(180deg,#fff6f1 0%,#fde3d4 100%);overflow:hidden}.w{position:absolute;left:0;top:0;width:1080px;height:1920px;direction:rtl;overflow:hidden}
.logo{position:absolute;top:70px;left:0;right:0;text-align:center}.logo img{height:90px}
.t{position:absolute;top:230px;left:0;right:0;text-align:center;color:#2a1f1c;font-weight:800;font-size:92px;line-height:1.15}
.m{position:absolute;top:350px;left:0;right:0;text-align:center;color:#e8643a;font-weight:800;font-size:200px;line-height:1.1}
.s{position:absolute;top:610px;left:0;right:0;text-align:center;color:#2a1f1c;font-weight:500;font-size:56px}
.cta{position:absolute;bottom:300px;left:90px;right:90px;text-align:center;background:linear-gradient(90deg,#f48050,#e8643a);color:#fff;font-weight:800;font-size:54px;padding:36px 20px;border-radius:80px;box-shadow:0 20px 50px rgba(232,100,58,.35)}
.d{position:absolute;bottom:520px;left:0;right:0;text-align:center;color:#6d5a52;font-weight:500;font-size:44px}
</style><div class=w><div class=logo><img src="${logo}"></div><div class=t>${c.top}</div><div class=m>${c.mid}</div><div class=s>${c.sub}</div>
<div class=d>اضغط ▶ وشاهد الشرح كاملًا</div><div class=cta>${c.cta}</div></div>`;
(async () => {
  const b = await launch({ port: 9391 });
  try {
    for (const c of CLIPS) {
      const f = path.join(W, `short-${c.id}.html`); fs.writeFileSync(f, html(c));
      await b.send("Page.navigate", { url: "file:///" + f.split(path.sep).join("/") }); await sleep(1500);
      await b.ev("document.fonts.ready.then(()=>1)"); await sleep(400);
      const r = await b.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
      fs.writeFileSync(path.join(W, `short-${c.id}.png`), Buffer.from(r.data, "base64"));
    }
  } finally { await b.close(); }
  for (const c of CLIPS) {
    const out = path.join(OUT, `accounting-short-${c.id}.mp4`);
    const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "30", "-i", path.join(W, `short-${c.id}.png`), "-ss", String(c.ss), "-to", String(c.to), "-i", SRC,
      "-filter_complex", `[1:v]scale=1080:608:flags=lanczos[v];[0:v][v]overlay=0:700:shortest=1,format=yuv420p[o]`, "-map", "[o]", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out], { maxBuffer: 1 << 26 });
    console.log(c.id, r.status, (r.stderr || "").toString().slice(0, 300));
  }
})();

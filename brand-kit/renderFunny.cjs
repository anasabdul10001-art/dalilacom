// "Breaking news" comic pictures for the weekly posts. Every character and shop is invented; the scenes are drawn here as vector art.
// Run: node brand-kit/renderFunny.cjs            (all)      node brand-kit/renderFunny.cjs w1-sack   (one)
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const CH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const W = 1080, H = 1350;
const outDir = path.join(__dirname, "social", "weekly");
fs.mkdirSync(outDir, { recursive: true });
const logoPng = "file:///" + path.join(__dirname, "logo", "logo-full-horizontal-black.png").split(path.sep).join("/");
const fontBase = "file:///" + path.join(__dirname, "fonts").split(path.sep).join("/");

/* ---- little drawing helpers (SVG strings) ---- */
const skin = ["#f2c9a0", "#e0a97a", "#c98d5f", "#8d5a3b"];
function face(cx, cy, r, { tone = 0, mouth = "smile", glasses = false, shades = false, brows = "up", mustache = false } = {}) {
  const s = skin[tone];
  let g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s}" stroke="#3a2418" stroke-width="4"/>`;
  g += `<circle cx="${cx - r * 0.07 - r}" cy="${cy + 6}" r="${r * 0.16}" fill="${s}" stroke="#3a2418" stroke-width="4"/><circle cx="${cx + r + r * 0.07}" cy="${cy + 6}" r="${r * 0.16}" fill="${s}" stroke="#3a2418" stroke-width="4"/>`;
  const ey = cy - r * 0.12, ex = r * 0.36;
  if (shades) g += `<rect x="${cx - ex - r * 0.28}" y="${ey - r * 0.16}" width="${r * 0.56}" height="${r * 0.3}" rx="8" fill="#111"/><rect x="${cx + ex - r * 0.28}" y="${ey - r * 0.16}" width="${r * 0.56}" height="${r * 0.3}" rx="8" fill="#111"/><rect x="${cx - 6}" y="${ey - r * 0.08}" width="12" height="6" fill="#111"/>`;
  else {
    g += `<circle cx="${cx - ex}" cy="${ey}" r="${r * 0.12}" fill="#fff" stroke="#3a2418" stroke-width="3"/><circle cx="${cx + ex}" cy="${ey}" r="${r * 0.12}" fill="#fff" stroke="#3a2418" stroke-width="3"/>`;
    g += `<circle cx="${cx - ex}" cy="${ey}" r="${r * 0.055}" fill="#222"/><circle cx="${cx + ex}" cy="${ey}" r="${r * 0.055}" fill="#222"/>`;
    const b = brows === "up" ? -r * 0.26 : brows === "worry" ? -r * 0.22 : -r * 0.2;
    g += `<path d="M${cx - ex - 22} ${ey + b} q22 ${brows === "worry" ? -12 : -8} 44 ${brows === "worry" ? 8 : 0}" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${cx + ex - 22} ${ey + b + (brows === "worry" ? 8 : 0)} q22 ${brows === "worry" ? -12 : -8} 44 ${brows === "worry" ? -8 : 0}" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  if (glasses) g += `<circle cx="${cx - ex}" cy="${ey}" r="${r * 0.2}" fill="none" stroke="#222" stroke-width="5"/><circle cx="${cx + ex}" cy="${ey}" r="${r * 0.2}" fill="none" stroke="#222" stroke-width="5"/><path d="M${cx - ex + r * 0.2} ${ey} h${2 * ex - r * 0.4}" stroke="#222" stroke-width="5"/>`;
  if (mustache) g += `<path d="M${cx - 46} ${cy + r * 0.38} q23 -22 46 -4 q23 -18 46 4 q-23 14 -46 6 q-23 8 -46 -6z" fill="#3a2a22"/>`;
  const my = cy + r * 0.52;
  if (mouth === "smile") g += `<path d="M${cx - 34} ${my - 6} q34 36 68 0" stroke="#3a2418" stroke-width="5" fill="#fff" stroke-linejoin="round"/>`;
  else if (mouth === "oh") g += `<ellipse cx="${cx}" cy="${my + 4}" rx="20" ry="26" fill="#7a2a22" stroke="#3a2418" stroke-width="4"/>`;
  else if (mouth === "flat") g += `<path d="M${cx - 30} ${my + 4} h60" stroke="#3a2418" stroke-width="6" stroke-linecap="round"/>`;
  else if (mouth === "grin") g += `<path d="M${cx - 42} ${my - 8} q42 56 84 0z" fill="#fff" stroke="#3a2418" stroke-width="5" stroke-linejoin="round"/>`;
  return g;
}
function body(cx, top, w, h, color, extra = "") {
  return `<path d="M${cx - w / 2} ${top + h} v-${h * 0.55} q0 -${h * 0.45} ${w / 2} -${h * 0.45} q${w / 2} 0 ${w / 2} ${h * 0.45} v${h * 0.55}z" fill="${color}" stroke="#3a2418" stroke-width="4"/>${extra}`;
}
function guard(cx, base) {
  return `<g>${body(cx, base - 330, 230, 330, "#1d2b3a", `<rect x="${cx - 26}" y="${base - 250}" width="52" height="38" rx="6" fill="#e9b949"/>`)}
    ${face(cx, base - 380, 70, { tone: 1, mouth: "flat", shades: true })}
    <path d="M${cx - 76} ${base - 424} q76 -74 152 0 v12 h-152z" fill="#1d2b3a" stroke="#3a2418" stroke-width="4"/><rect x="${cx - 88}" y="${base - 414}" width="176" height="14" rx="7" fill="#101b27"/></g>`;
}
const cuffs = (cx, y) => `<g stroke="#3a2418" stroke-width="4"><circle cx="${cx - 26}" cy="${y}" r="17" fill="#cfd5db"/><circle cx="${cx + 26}" cy="${y}" r="17" fill="#cfd5db"/><path d="M${cx - 10} ${y} h20" stroke-width="6"/></g>`;
const bubbleWord = (x, y, t, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})"><path d="M${x - 130} ${y - 44} h260 q22 0 22 22 v34 q0 22 -22 22 h-110 l-26 34 l-4 -34 h-120 q-22 0 -22 -22 v-34 q0 -22 22 -22z" fill="#fff" stroke="#3a2418" stroke-width="4"/><text x="${x}" y="${y + 8}" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="34" fill="#1c1413">${t}</text></g>`;
const shelf = (y) => `<rect x="0" y="${y}" width="${W}" height="14" fill="#b88a5a"/>`;

/* ---- the scenes (1080 x ~860) ---- */
const scenes = {
  // 1. a sack full of receipts is arrested for hiding the expenses
  "w1-sack": () => `
    <rect width="${W}" height="860" fill="#cfe3ee"/><rect y="640" width="${W}" height="220" fill="#d7b98f"/>
    <rect x="70" y="120" width="300" height="210" rx="14" fill="#fff" stroke="#3a2418" stroke-width="4"/><text x="220" y="200" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="40" fill="#c4552b">دفتر المصاريف</text><text x="220" y="260" text-anchor="middle" font-family="Tajawal" font-size="34" fill="#6b5d5b">(فاضي)</text>
    ${guard(160, 760)}${guard(920, 760)}
    <g transform="translate(540 0)">
      <path d="M-170 760 q-40 -230 40 -380 q-30 -50 20 -76 l60 40 l60 -40 l60 40 l60 -40 q40 40 20 76 q80 150 40 380z" fill="#d8b480" stroke="#3a2418" stroke-width="5"/>
      <path d="M-70 316 q70 30 140 0" stroke="#3a2418" stroke-width="5" fill="none"/>
      ${["#fff", "#f9f3d6", "#fff", "#f3f7fb"].map((c, i) => `<g transform="translate(${-90 + i * 66} ${250 - (i % 2) * 28}) rotate(${-18 + i * 14})"><rect width="64" height="86" rx="6" fill="${c}" stroke="#3a2418" stroke-width="3"/><path d="M12 22 h40 M12 40 h40 M12 58 h28" stroke="#9aa" stroke-width="4"/></g>`).join("")}
      <g transform="translate(0 540)"><ellipse cx="-50" cy="0" rx="20" ry="26" fill="#fff" stroke="#3a2418" stroke-width="4"/><ellipse cx="50" cy="0" rx="20" ry="26" fill="#fff" stroke="#3a2418" stroke-width="4"/><circle cx="-50" cy="6" r="9" fill="#222"/><circle cx="50" cy="6" r="9" fill="#222"/><path d="M-24 -50 q24 -16 48 0" stroke="#3a2418" stroke-width="6" fill="none"/><path d="M-52 62 q52 34 104 0" stroke="#3a2418" stroke-width="6" fill="none"/></g>
      <path d="M-150 500 q-40 90 60 150" stroke="#3a2418" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M150 500 q40 90 -60 150" stroke="#3a2418" stroke-width="22" fill="none" stroke-linecap="round"/>${cuffs(0, 656)}
    </g>
    <path d="M232 560 L395 620" stroke="#1d2b3a" stroke-width="26" stroke-linecap="round"/><path d="M848 560 L685 620" stroke="#1d2b3a" stroke-width="26" stroke-linecap="round"/>`,
  // 2. the net profit disappears: a missing-person poster
  "w1-net": () => `
    <rect width="${W}" height="860" fill="#efe3d3"/><rect y="660" width="${W}" height="200" fill="#c9a77c"/>
    <g transform="translate(540 120) rotate(-2)"><rect x="-290" y="0" width="580" height="400" rx="10" fill="#fffdf6" stroke="#3a2418" stroke-width="5"/>
      <text x="0" y="86" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="76" fill="#c0392b">مفقود</text>
      <text x="0" y="150" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="44" fill="#1c1413">الصافي</text>
      <rect x="-90" y="176" width="180" height="150" rx="16" fill="#e7e1d6" stroke="#3a2418" stroke-width="4"/><text x="0" y="285" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="120" fill="#9a8f80">؟</text>
      <text x="0" y="372" text-anchor="middle" font-family="Tajawal" font-size="32" fill="#6b5d5b">آخر ظهور: آخر الشهر</text>
      <circle cx="0" cy="-8" r="14" fill="#c0392b" stroke="#3a2418" stroke-width="4"/></g>
    <g>${body(300, 470, 250, 300, "#2f6f73")}${face(300, 470, 82, { tone: 2, mouth: "oh", mustache: true, brows: "worry" })}
      <g transform="translate(410 470) rotate(25)"><circle cx="0" cy="0" r="46" fill="#dff1f7" fill-opacity=".7" stroke="#3a2418" stroke-width="7"/><rect x="40" y="36" width="70" height="14" rx="7" transform="rotate(45 40 36)" fill="#3a2418"/></g></g>
    <g>${body(790, 500, 230, 270, "#8e44ad")}${face(790, 500, 78, { tone: 1, mouth: "grin" })}</g>
    ${bubbleWord(760, 330, "وين راح؟", 3)}
    <g transform="translate(130 740)"><rect width="170" height="86" rx="10" fill="#7bc47f" stroke="#3a2418" stroke-width="4"/><circle cx="85" cy="43" r="26" fill="#a8e0ab" stroke="#3a2418" stroke-width="4"/><text x="85" y="55" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="34" fill="#1c1413">$</text></g>
    <g transform="translate(560 770)"><rect width="150" height="76" rx="10" fill="#7bc47f" stroke="#3a2418" stroke-width="4"/><circle cx="75" cy="38" r="22" fill="#a8e0ab" stroke="#3a2418" stroke-width="4"/><text x="75" y="49" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="30" fill="#1c1413">$</text></g>`,
  // 3. a customer asks "how much did you earn?" and the shop owner falls off the chair
  "w1-chair": () => `
    <rect width="${W}" height="860" fill="#fbe9d3"/><rect y="640" width="${W}" height="220" fill="#d9b88a"/>
    <rect x="60" y="150" width="340" height="110" rx="10" fill="#fff" stroke="#3a2418" stroke-width="4"/><text x="230" y="222" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="38" fill="#c4552b">سوبرماركت الحارة</text>
    <g transform="translate(150 -40) rotate(-38 330 700)">
      <rect x="150" y="430" width="26" height="250" rx="8" fill="#8a5a38" stroke="#3a2418" stroke-width="4"/>
      <rect x="150" y="650" width="300" height="34" rx="8" fill="#a8764c" stroke="#3a2418" stroke-width="4"/>
      <rect x="165" y="684" width="26" height="110" fill="#8a5a38" stroke="#3a2418" stroke-width="4"/><rect x="415" y="684" width="26" height="110" fill="#8a5a38" stroke="#3a2418" stroke-width="4"/>
      ${body(300, 400, 220, 260, "#d35400")}${face(300, 390, 80, { tone: 1, mouth: "oh", mustache: true, brows: "worry" })}
      <path d="M200 520 l-90 -60" stroke="#3a2418" stroke-width="22" stroke-linecap="round"/><path d="M400 520 l90 -70" stroke="#3a2418" stroke-width="22" stroke-linecap="round"/>
    </g>
    <g>${body(830, 360, 250, 330, "#2e86c1")}${face(830, 340, 88, { tone: 0, mouth: "smile", glasses: true })}<path d="M720 450 l-90 40" stroke="#3a2418" stroke-width="22" stroke-linecap="round"/></g>
    ${bubbleWord(760, 190, "كم ربحت؟", -4)}
    <g transform="translate(40 700)"><rect width="180" height="64" rx="8" fill="#fff" stroke="#3a2418" stroke-width="4"/><text x="90" y="44" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="30" fill="#1c1413">آآآخ!</text></g>`,
};

// A real picture (made with an image tool) goes in brand-kit/social/weekly/photos/<id>.jpg (or .png): it replaces the drawn scene.
const photoFile = (id) => ["jpg", "jpeg", "png", "webp"].map((e) => path.join(__dirname, "social", "weekly", "photos", id + "." + e)).find((f) => fs.existsSync(f));

const items = [
  { id: "w1-sack", scene: "w1-sack", head: ["القبض على ", "صاحب محل", " بتهمة إخفاء المصاريف!"], who: "تصريح صاحب المحل:", quote: "«والله مو قصدي.. بس الفواتير كانت كتير!»" },
  { id: "w1-net", scene: "w1-net", head: ["اختفاء ", "الصافي", " بظروف غامضة!"], who: "تصريح صاحب المحل:", quote: "«بعت كتير هالشهر.. بس وين راحوا؟»" },
  { id: "w1-chair", scene: "w1-chair", head: ["سقوط ", "صاحب محل", " عن الكرسي بعد سؤال: كم ربحت؟"], who: "تصريح صاحب المحل:", quote: "«والله كنت عم أحسبها بالرأس!»" },
];

function page(it) {
  const [a, b, c] = it.head;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Tajawal";font-weight:400;src:url("${fontBase}/tajawal_regular.ttf")}
@font-face{font-family:"Tajawal";font-weight:700;src:url("${fontBase}/tajawal_bold.ttf")}
*{box-sizing:border-box;margin:0}html{direction:ltr;background:#fff;overflow:hidden}
body{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:#1d1a1a;font-family:"Tajawal",sans-serif;direction:rtl}
.scene{position:absolute;left:0;top:0;width:${W}px;height:860px}
.tag{position:absolute;left:34px;top:34px;background:#fff;border-radius:30px;padding:10px 24px;font-weight:700;font-size:32px;color:#c4552b}
.logo{position:absolute;right:34px;top:30px;background:#fff;border-radius:26px;padding:12px 24px;height:84px}.logo img{height:60px;display:block}
.panel{position:absolute;left:0;top:860px;width:${W}px;height:${H - 860}px;background:#1d1a1a;color:#fff}
.alarm{position:absolute;right:0;top:-84px;background:#f48050;color:#fff;font-weight:700;font-size:52px;padding:0 52px 0 70px;border-radius:40px 0 0 0;height:84px;line-height:88px}
.headline{position:absolute;right:46px;left:46px;top:20px;text-align:center;font-weight:700;font-size:62px;line-height:1.3}.headline em{font-style:normal;color:#f48050}
.who{position:absolute;right:50%;transform:translateX(50%);top:196px;background:#f4b43a;color:#1c1413;font-weight:700;font-size:30px;padding:0 26px;height:54px;line-height:56px;border-radius:16px 16px 0 0}
.quote{position:absolute;left:46px;right:46px;top:248px;background:#fff;color:#1c1413;font-weight:700;font-size:44px;text-align:center;border-radius:40px;padding:18px 20px;line-height:1.35}
.cta{position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:34px;font-weight:700;color:#fff}.cta b{color:#f48050}
</style></head><body>
${(() => { const f = photoFile(it.id); return f ? `<img class="scene" style="object-fit:cover;object-position:center 30%" src="file:///${f.split(path.sep).join("/")}">` : `<svg class="scene" viewBox="0 0 ${W} 860">${scenes[it.scene]()}</svg>`; })()}
<div class="tag">😂 خبر مضحك · تمثيل</div><div class="logo"><img src="${logoPng}"></div>
<div class="panel"><div class="alarm">🚨 خبر عاجل</div>
<div class="headline">${a}<em>${b}</em>${c}</div>
<div class="who">${it.who}</div><div class="quote">${it.quote}</div>
<div class="cta">📲 حمّل <b>دليلكم</b> من متجر غوغل بلاي</div></div>
</body></html>`;
}

(async () => {
  const only = process.argv[2];
  for (const it of items) {
    if (only && only !== it.id) continue;
    const html = path.join(__dirname, "social", "weekly", "_" + it.id + ".html");
    fs.writeFileSync(html, page(it));
    const tmp = path.join(outDir, "_raw-" + it.id + ".png");
    execFileSync(CH, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1", `--window-size=${W + 400},${H + 400}`, "--virtual-time-budget=6000", `--screenshot=${tmp}`, "file:///" + html.split(path.sep).join("/")], { stdio: "ignore" });
    const { data, info } = await sharp(tmp).raw().toBuffer({ resolveWithObject: true });
    let left = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (2 * info.width + x) * info.channels;
      if (!(data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255)) { left = x; break; }
    }
    await sharp(tmp).extract({ left, top: 0, width: W, height: H }).toFile(path.join(outDir, it.id + ".png"));
    fs.unlinkSync(tmp); fs.unlinkSync(html);
    console.log("ok", it.id);
  }
})();

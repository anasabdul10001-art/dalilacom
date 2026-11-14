// Week 1 pictures, one per day, in two languages: "sy" (Syrian colloquial, for the Syria Page) and "ar" (Fusha, for the other Page and Instagram).
// Funny days reuse the approved photos in social/weekly/photos; the other days are clean brand text cards. Every character is invented.
// Run: node brand-kit/renderWeek1.cjs            (all)      node brand-kit/renderWeek1.cjs d3   (one day, both languages)
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const CH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const W = 1080, H = 1350;
const outDir = path.join(__dirname, "social", "weekly", "w1");
fs.mkdirSync(outDir, { recursive: true });
const url = (p) => "file:///" + p.split(path.sep).join("/");
const logoPng = url(path.join(__dirname, "logo", "logo-full-horizontal-black.png"));
const fontBase = url(path.join(__dirname, "fonts"));
const photo = (id) => path.join(__dirname, "social", "weekly", "photos", id + ".png");

const CTA = { sy: "حمّل <b>دليلكم</b> من متجر غوغل بلاي", ar: "حمّل <b>دليلكم</b> من متجر غوغل بلاي" };

/* ---- funny "breaking news" days (photo + news panel) ---- */
const funny = (img, head, who, quote) => ({ kind: "funny", img, head, who, quote });
/* ---- text cards ---- */
const steps = (title, list, foot) => ({ kind: "steps", title, list, foot });
const ask = (title, list, foot) => ({ kind: "ask", title, list, foot });
const big = (title, sub, lines, foot) => ({ kind: "big", title, sub, lines, foot });

const days = {
  d1: { sy: funny("w1-chair", ["سقوط ", "صاحب محل", " عن الكرسي بعد سؤال: كم ربحت؟"], "تصريح صاحب المحل:", "«والله كنت عم أحسبها بالرأس!»"),
        ar: funny("w1-chair", ["سقوط ", "صاحب محل", " عن الكرسي بعد سؤال: كم ربحتَ؟"], "تصريح صاحب المحل:", "«والله كنتُ أحسبها في رأسي!»") },
  d2: { sy: funny("w1-net", ["اختفاء ", "الصافي", " بظروف غامضة!"], "تصريح صاحب المحل:", "«بعت كتير هالشهر.. بس وين راحوا؟»"),
        ar: funny("w1-net", ["اختفاء ", "الصافي", " في ظروف غامضة!"], "تصريح صاحب المحل:", "«بِعتُ كثيرًا هذا الشهر.. لكن أين ذهب؟»") },
  d3: { sy: steps("كيف بتسجّل أول دخل؟", ["افتح المحاسبة", "اكبس إضافة حركة", "اختار دخل", "اكتب المبلغ والتصنيف", "احفظ"], "وخلص. الصافي بيتحدّث لحاله."),
        ar: steps("كيف تسجّل أول دخل؟", ["افتح المحاسبة", "اضغط إضافة حركة", "اختر دخل", "اكتب المبلغ والتصنيف", "احفظ"], "وينتهي الأمر. يتحدّث الصافي تلقائيًا.") },
  d4: { sy: ask("كيف بتسجّل حسابات شغلك اليوم؟", ["دفتر", "ملاحظات الموبايل", "بالذاكرة"], "اكتب لنا بالتعليقات"),
        ar: ask("كيف تسجّل حسابات عملك اليوم؟", ["دفتر", "ملاحظات الهاتف", "من الذاكرة"], "شاركنا في التعليقات") },
  d5: { sy: big("بتبيع من بيتك؟", "حساباتك بتستاهل ترتيب.", ["ما بدك محل لتستخدم المحاسبة.", "أي شغل فيه دخل ومصروف، بتسجّله من موبايلك."]),
        ar: big("تبيع من منزلك؟", "حساباتك تستحق الترتيب.", ["لا تحتاج إلى متجر لتستخدم المحاسبة.", "أي عمل فيه دخل ومصروف يمكنك تسجيله من هاتفك."]) },
  d6: { sy: funny("w1-sack", ["القبض على ", "صاحب محل", " بتهمة إخفاء المصاريف!"], "تصريح صاحب المحل:", "«والله مو قصدي.. بس الفواتير كانت كتير!»"),
        ar: funny("w1-sack", ["القبض على ", "صاحب محل", " بتهمة إخفاء المصاريف!"], "تصريح صاحب المحل:", "«لم أقصد.. لكن الفواتير كانت كثيرة!»") },
  d7: { sy: big("٣ شهور مجاناً", "عرض الإطلاق من دليلكم، لفترة محدودة.", ["بعدها ٢ دولار بالشهر، أو ٢٠ دولار بالسنة.", "بدون بطاقة دفع، وما بينسحب منك شي لحاله."]),
        ar: big("٣ أشهر مجانًا", "عرض الإطلاق من دليلكم، لفترة محدودة.", ["بعدها ٢ دولار شهريًا، أو ٢٠ دولارًا سنويًا.", "بدون بطاقة دفع، ولا يُسحب منك أي مبلغ تلقائيًا."]) },
};

const css = `
@font-face{font-family:"Tajawal";font-weight:400;src:url("${fontBase}/tajawal_regular.ttf")}
@font-face{font-family:"Tajawal";font-weight:700;src:url("${fontBase}/tajawal_bold.ttf")}
*{box-sizing:border-box;margin:0}html{direction:ltr;background:#fff;overflow:hidden}
body{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:#1d1a1a;font-family:"Tajawal",sans-serif;direction:rtl;color:#fff}
.logo{position:absolute;right:34px;top:30px;background:#fff;border-radius:26px;padding:12px 24px;height:84px}.logo img{height:60px;display:block}
.cta{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:36px;font-weight:700}.cta b{color:#f48050}
/* funny */
.scene{position:absolute;left:0;top:0;width:${W}px;height:860px;object-fit:cover;object-position:center 30%}
.tag{position:absolute;left:34px;top:34px;background:#fff;border-radius:30px;padding:10px 24px;font-weight:700;font-size:32px;color:#c4552b}
.panel{position:absolute;left:0;top:860px;width:${W}px;height:${H - 860}px;background:#1d1a1a}
.alarm{position:absolute;right:0;top:-84px;background:#f48050;color:#fff;font-weight:700;font-size:52px;padding:0 52px 0 70px;border-radius:40px 0 0 0;height:84px;line-height:88px}
.headline{position:absolute;right:46px;left:46px;top:20px;text-align:center;font-weight:700;font-size:62px;line-height:1.3}.headline em{font-style:normal;color:#f48050}
.who{position:absolute;right:50%;transform:translateX(50%);top:196px;background:#f4b43a;color:#1c1413;font-weight:700;font-size:30px;padding:0 26px;height:54px;line-height:56px;border-radius:16px 16px 0 0}
.quote{position:absolute;left:46px;right:46px;top:248px;background:#fff;color:#1c1413;font-weight:700;font-size:44px;text-align:center;border-radius:40px;padding:18px 20px;line-height:1.35}
/* cards */
.card{position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:linear-gradient(180deg,#2a2321 0,#1d1a1a 100%)}
.card:before{content:"";position:absolute;left:-160px;top:-160px;width:520px;height:520px;border-radius:50%;background:#f48050;opacity:.16}
.title{position:absolute;right:60px;left:60px;top:190px;text-align:center;font-weight:700;font-size:84px;line-height:1.25}
.title em{font-style:normal;color:#f48050}
.list{position:absolute;right:70px;left:70px;top:420px}
.row{display:flex;align-items:center;gap:28px;background:#fff;color:#1c1413;border-radius:36px;padding:20px 30px;margin-bottom:22px;font-weight:700;font-size:48px}
.num{flex:none;width:76px;height:76px;border-radius:50%;background:#f48050;color:#fff;font-size:46px;line-height:80px;text-align:center}
.foot{position:absolute;right:60px;left:60px;top:1130px;text-align:center;font-weight:700;font-size:42px;color:#f4b43a}
.sub{position:absolute;right:60px;left:60px;top:480px;text-align:center;font-weight:700;font-size:56px;color:#f4b43a;line-height:1.35}
.lines{position:absolute;right:70px;left:70px;top:720px}
.line{background:#fff;color:#1c1413;border-radius:36px;padding:26px 34px;margin-bottom:26px;font-weight:700;font-size:46px;text-align:center;line-height:1.4}
`;

function body(d) {
  if (d.kind === "funny") {
    const [a, b, c] = d.head;
    return `<img class="scene" src="${url(photo(d.img))}"><div class="tag">😂 خبر مضحك · تمثيل</div>
<div class="panel"><div class="alarm">🚨 خبر عاجل</div><div class="headline">${a}<em>${b}</em>${c}</div><div class="who">${d.who}</div><div class="quote">${d.quote}</div></div>`;
  }
  if (d.kind === "steps")
    return `<div class="card"></div><div class="title">${d.title}</div><div class="list">${d.list.map((t, i) => `<div class="row"><div class="num">${"١٢٣٤٥"[i]}</div><div>${t}</div></div>`).join("")}</div><div class="foot">${d.foot}</div>`;
  if (d.kind === "ask")
    return `<div class="card"></div><div class="title">${d.title}</div><div class="list" style="top:470px">${d.list.map((t) => `<div class="row" style="justify-content:center;font-size:56px;padding:34px 30px">${t}</div>`).join("")}</div><div class="foot">${d.foot}</div>`;
  return `<div class="card"></div><div class="title" style="top:300px;font-size:110px">${d.title}</div><div class="sub">${d.sub}</div><div class="lines">${d.lines.map((t) => `<div class="line">${t}</div>`).join("")}</div>`;
}

const page = (d, lang) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body(d)}<div class="logo"><img src="${logoPng}"></div><div class="cta">${CTA[lang]}</div></body></html>`;

(async () => {
  const only = process.argv[2];
  for (const [id, byLang] of Object.entries(days)) {
    if (only && only !== id) continue;
    for (const lang of ["sy", "ar"]) {
      const html = path.join(outDir, `_${id}-${lang}.html`);
      fs.writeFileSync(html, page(byLang[lang], lang));
      const tmp = path.join(outDir, `_raw-${id}-${lang}.png`);
      execFileSync(CH, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1", `--window-size=${W + 400},${H + 400}`, "--virtual-time-budget=6000", `--screenshot=${tmp}`, url(html)], { stdio: "ignore" });
      const { data, info } = await sharp(tmp).raw().toBuffer({ resolveWithObject: true });
      let left = 0;
      for (let x = 0; x < info.width; x++) {
        const i = (2 * info.width + x) * info.channels;
        if (!(data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255)) { left = x; break; }
      }
      await sharp(tmp).extract({ left, top: 0, width: W, height: H }).toFile(path.join(outDir, `${id}-${lang}.png`));
      fs.unlinkSync(tmp); fs.unlinkSync(html);
      console.log("ok", id, lang);
    }
  }
})();

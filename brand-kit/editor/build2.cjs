// Builds the GUIDED edit: every logged step (click / field / choice) is narrated literally, in simple Modern Standard Arabic,
// with the owner's cloned voice; the video is retimed step by step to the narration. Overlays: chapter wipes/titles/bullets.
// node build2.cjs --dry   (list the narration, count characters)   |   node build2.cjs voice   (generate audio)   |   node build2.cjs   (build video)
const S = Number(process.env.DLK_SCALE || 1); // 2 = 4K
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { spawnSync } = require("child_process");
const { renderFrames } = require("./render.cjs");
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const UHD = process.env.UHD === "1"; if (UHD) process.env.DLK_SCALE = "2"; const SW = UHD ? 3840 : 1920, SH = UHD ? 2160 : 1080, SUF = UHD ? "-4k" : "";
const RAWDIR = path.join(__dirname, "..", "video-plans", "accounting", "raw");
const RAW = path.join(RAWDIR, "accounting-guided.mp4");
const steps = JSON.parse(fs.readFileSync(RAW.replace(".mp4", ".steps.json"), "utf8"));
const script = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "video-plans", "accounting", "script.json"), "utf8"));
const W = path.join(__dirname, "work2"), VO = path.join(__dirname, "voice2"), OUTD = path.join(__dirname, "out");
[W, VO, OUTD].forEach((d) => fs.mkdirSync(d, { recursive: true }));
const VOICE_ID = process.env.VOICE_ID || "clS4TmlZF18Hafme6bgr"; // "Anas DALILACOM" (the owner's clone)
const AR = "٠١٢٣٤٥٦٧٨٩"; const arNum = (n) => String(n).replace(/\d/g, (d) => AR[d]);
const runAsync = (args, label) => new Promise((res, rej) => { const { spawn } = require("child_process"); const c = spawn(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args]); let e = ""; c.stderr.on("data", (d) => (e += d)); c.on("close", (k) => (k === 0 ? res() : rej(new Error(label + ": " + e.slice(0, 600))))); });
const run = (args, label) => { const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(label + ": " + (r.stderr || "").toString().slice(0, 600)); };
const durOf = (f) => { const r = spawnSync(FF, ["-hide_banner", "-i", f]); const m = /Duration: (\d+):(\d+):([\d.]+)/.exec((r.stderr || "").toString()); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };
const RAW_LEN = durOf(RAW);

// ---- narration text for every step
const clean = (s) => (s || "").replace(/[^\u0600-\u06FFa-zA-Z0-9 .%()\u061F-]/g, " ").replace(/\s+/g, " ").trim();
const SYM = { "+": "زر الزائد لإضافة كمية", "−": "زر الناقص لإنقاص كمية", "-": "زر الناقص لإنقاص كمية" };
function textFor(s) {
  if (s.quiet) return "";
  if (s.kind === "note") return s.text;
  if (s.kind === "tab") return `انتقل إلى تبويب «${clean(s.text)}».`;
  if (s.kind === "click" && (s.text || "").trim() === "on") return "ضع علامة الموافقة على الشروط.";
  if (s.kind === "click") { const t = SYM[(s.text || "").trim()] || clean(s.text).slice(0, 40); return t ? (SYM[(s.text || "").trim()] ? `اضغط على ${t}.` : `اضغط على «${t}».`) : ""; }
  if (s.kind === "select") { const l = clean(s.label); const v = clean(s.value); return l ? `من قائمة «${l}» اختر: ${v}.` : `اختر: ${v}.`; }
  if (s.kind === "fill") {
    const l = clean(s.label), v = clean(String(s.value || ""));
    if (/كلمة المرور|password/i.test(l + (s.text || ""))) return "وفي خانة كلمة المرور، اكتب كلمة مرور قوية.";
    if (/البريد|الإيميل|email/i.test(l)) return "اكتب بريدك الإلكتروني.";
    if (!v) return l ? `في خانة «${l}»، اكتب البيانات المطلوبة.` : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return l ? `في خانة «${l}»، اختر التاريخ.` : "اختر التاريخ.";
    return l ? `في خانة «${l}»، اكتب: ${v}.` : `اكتب: ${v}.`;
  }
  return "";
}
const items = steps.filter((s) => s.kind !== "chapter").map((s) => ({ ...s, say: textFor(s) }));
const chapters = steps.filter((s) => s.kind === "chapter");
const hash = (t) => crypto.createHash("sha1").update(t).digest("hex").slice(0, 12);
const mp3Of = (t) => path.join(VO, hash(t) + ".mp3");
const HOOK_TEXT = script.hook.voice;
const chars = items.reduce((a, i) => a + i.say.length, 0);

if (process.argv.includes("--dry")) {
  items.forEach((i) => console.log(i.t.toFixed(1).padStart(7), i.kind.padEnd(6), i.quiet ? "(quiet)" : "", i.say));
  console.log("items with speech:", items.filter((i) => i.say).length, "of", items.length, "| characters:", chars, "| chapters:", chapters.length, "| raw", RAW_LEN.toFixed(0) + "s");
  process.exit(0);
}

async function genVoice() {
  const KEY = fs.readFileSync("C:/Users/Tom/.elevenlabs-key.txt", "utf8").trim();
  const texts = [...new Set([HOOK_TEXT, ...items.map((i) => i.say).filter(Boolean)])];
  let made = 0, failed = 0;
  for (const t of texts) {
    const f = mp3Of(t); if (fs.existsSync(f)) continue;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, model_id: process.env.TTS_MODEL || "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.1, use_speaker_boost: true } }) });
    if (!r.ok) { failed++; console.error("TTS fail", r.status, (await r.text()).slice(0, 160)); if (r.status === 401 || r.status === 429) break; continue; }
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); made++;
  }
  console.log("voice generated:", made, "failed:", failed, "of", texts.length);
}
if (process.argv[2] === "voice") { genVoice().then(() => process.exit(0)); return; }

(async () => {
  const HOOK_LEN = 9.0;
  if (!fs.existsSync(path.join(__dirname, "work", UHD ? "hook2-4k.mp4" : "hook2.mp4"))) throw new Error("run hook-render2.cjs first");
  // ---- segments: one per step, retimed to its narration
  const segs = [];
  const all = steps.slice().sort((a, b) => a.t - b.t);
  for (let k = 0; k < all.length; k++) {
    const s = all[k], t0 = k === 0 ? 0 : s.t, t1 = Math.max(k + 1 < all.length ? all[k + 1].t : RAW_LEN, t0 + 0.15); // never less than ~4 frames, or the trim is empty and its narration time is lost
    if (s.kind === "chapter") { segs.push({ chapter: s.text, t0, t1, say: "" }); continue; }
    segs.push({ t0, t1, say: textFor(s), kind: s.kind });
  }
  // first segment begins at 0 even if the first mark came later
  if (segs.length && segs[0].t0 > 0) segs.unshift({ t0: 0, t1: segs[0].t0, say: "" });
  let T = HOOK_LEN; const audio = []; const chapterT = [];
  for (const g of segs) {
    const gap = Math.max(0.05, g.t1 - g.t0); let v = 0;
    if (g.say) { const f = mp3Of(g.say); if (fs.existsSync(f)) { v = durOf(f); g.file = f; } else v = g.say.length / 13; }
    let D;
    if (v > 0) D = Math.max(v + 0.45, gap / 4); else D = gap > 4 ? gap / 4 : gap > 1.5 ? gap / 1.6 : gap;
    g.D = Math.max(D, 0.05); g.speed = g.D < gap ? gap / g.D : 1; g.pad = g.D > gap ? g.D - gap : 0; g.T = T; T += g.D;
    if (g.file) audio.push({ file: g.file, at: g.T + 0.05 });
    if (g.chapter) chapterT.push({ name: g.chapter, T: g.T });
  }
  const TOTAL = T;
  console.log("segments", segs.length, "TOTAL", TOTAL.toFixed(0) + "s", "(" + (TOTAL / 60).toFixed(1) + " min)", "voiced", audio.length, "missing voice", segs.filter((g) => g.say && !g.file).length);
  chapterT.forEach((c, n) => console.log("chapter", n, c.T.toFixed(0) + "s", c.name));
  // ---- timeline for the automatic sync check (verify_sync.py): where every narration clip and every raw second ended up in the final video
  const LANG = process.env.VIDEO_LANG || "ar";
  const stepOf = new Map(all.map((s, k) => [s, k]));
  fs.writeFileSync(path.join(OUTD, "accounting-guided.timeline.json"), JSON.stringify({ lang: LANG, hookLen: HOOK_LEN, total: TOTAL, rawLen: RAW_LEN,
    hook: fs.existsSync(mp3Of(HOOK_TEXT)) ? { text: HOOK_TEXT, file: mp3Of(HOOK_TEXT), at: 0.2 } : null,
    segs: segs.map((g, i) => ({ i, kind: g.kind || (g.chapter ? "chapter" : "gap"), t0: g.t0, t1: g.t1, T: g.T, D: g.D, speed: g.speed, pad: g.pad, say: g.say || "", file: g.file || null, at: g.file ? g.T + 0.05 : null })) }, null, 1));
  if (process.argv.includes("--fast")) return;

  // ---- video: one filter graph over the raw file
  const parts = [], labels = [];
  // every segment is forced to an EXACT frame count taken from one cumulative schedule, so rounding can never drift the picture against the narration
  // (a plain trim/fps per segment loses a fraction of a frame each time: 295 segments = about 4 seconds of drift over 17 minutes)
  const FR = 30;
  segs.forEach((g, i) => {
    const sp = g.speed.toFixed(4);
    const N = Math.max(1, Math.round((g.T + g.D - HOOK_LEN) * FR) - Math.round((g.T - HOOK_LEN) * FR)); g.frames = N;
    parts.push(`[0:v]trim=start=${g.t0.toFixed(3)}:end=${g.t1.toFixed(3)},setpts=(PTS-STARTPTS)/${sp},fps=${FR},scale=${SW}:${SH},setsar=1,tpad=stop_mode=clone:stop_duration=${Math.ceil(g.D) + 2},trim=end_frame=${N},setpts=PTS-STARTPTS[v${i}]`);
    labels.push(`[v${i}]`);
  });
  fs.writeFileSync(path.join(W, "graph.txt"), parts.join(";\n") + ";\n" + labels.join("") + `concat=n=${segs.length}:v=1:a=0,setpts=N/${FR}/TB[out]`);
  const bodyP = runAsync(["-i", RAW, "-filter_complex_script", path.join(W, "graph.txt"), "-map", "[out]", "-an", "-c:v", "libx264", "-preset", UHD ? "veryfast" : "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", path.join(W, "body.mp4")], "body");
  bodyP.catch(() => {});

  // ---- overlay events (chapter wipe + title + bullets)
  const ev = [];
  chapterT.forEach((c, n) => {
    const nextT = chapterT[n + 1] ? chapterT[n + 1].T : TOTAL; const D = nextT - c.T;
    if (n > 0) ev.push({ type: "wipe", t0: c.T - 0.4, dur: 0.8, num: arNum(n + 1), text: c.name });
    ev.push({ type: "title", t0: c.T + 0.5, dur: Math.min(5, Math.max(2, D - 1)), num: arNum(n + 1), text: c.name });
    const pts = (script.chapters[n] && script.chapters[n].pts) || []; const span = Math.max(1, D - 2.5);
    pts.forEach((p, k) => ev.push({ type: "bullet", t0: c.T + 1.6 + k * (span / (pts.length + 0.4)), dur: Math.min(4.2, Math.max(1.2, D - 2)), text: p }));
  });
  const FPS = 30, nF = Math.ceil(TOTAL * FPS);
  const sig = (tt) => ev.map((e, i) => (tt >= e.t0 && tt <= e.t0 + e.dur ? ((tt - e.t0 < 0.75 || e.t0 + e.dur - tt < 0.5 || e.type === "wipe") ? "A" + tt : i) : "")).join("|");
  const times = [], durs = []; let last = null;
  for (let i = 0; i < nF; i++) { const tt = i / FPS, s = sig(tt); if (s === last && !s.includes("A")) durs[durs.length - 1] += 1 / FPS; else { times.push(tt.toFixed(4)); durs.push(1 / FPS); } last = s; }
  console.log("overlay frames", times.length);
  const dir = path.join(W, "ovframes"); fs.rmSync(dir, { recursive: true, force: true });
  const files = await renderFrames({ html: path.join(__dirname, "overlay.html"), times: times.map((x) => (Number(x) - HOOK_LEN).toFixed(4)), outDir: dir, transparent: true, port: 9383, setupJs: `window.setup(${JSON.stringify(ev.map((e) => ({ ...e, t0: e.t0 - HOOK_LEN })))})` });
  const bs = String.fromCharCode(92);
  fs.writeFileSync(path.join(W, "ov.txt"), "ffconcat version 1.0\n" + files.map((f, i) => `file '${f.split(bs).join("/")}'\nduration ${durs[i].toFixed(5)}`).join("\n") + `\nfile '${files[files.length - 1].split(bs).join("/")}'\n`);
  await bodyP;
  run(["-i", path.join(__dirname, "work", UHD ? "hook2-4k.mp4" : "hook2.mp4"), "-i", path.join(W, "body.mp4"), "-filter_complex", "[0:v]tpad=stop_mode=clone:stop_duration=1[h];[h][1:v]concat=n=2:v=1:a=0,setpts=N/30/TB[v]", "-map", "[v]", "-c:v", "libx264", "-preset", UHD ? "veryfast" : "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", path.join(W, "base.mp4")], "base");
  // ---- final picture (silent). The audio is mixed separately and deterministically by mix_audio.py (sample-accurate placement of every narration clip + quiet music).
  const prog = `drawbox=x=0:y=${UHD ? 2148 : 1074}:w='iw*max(t-${HOOK_LEN},0)/${(TOTAL - HOOK_LEN).toFixed(2)}':h=${UHD ? 12 : 6}:color=0xf48050:t=fill`;
  const MUSIC = path.join(__dirname, "..", "social", "videos", "dalilacom-register-free-music.wav"), MUSIC_VOL = process.env.MUSIC_VOL || "0.06";
  const out = path.join(OUTD, "accounting-guided-edit" + SUF + ".mp4"), silent = path.join(OUTD, "accounting-guided-silent" + SUF + ".mp4");
  run(["-i", path.join(W, "base.mp4"), "-f", "concat", "-safe", "0", "-i", path.join(W, "ov.txt"), "-filter_complex", `[0:v][1:v]overlay=0:0:format=auto,${prog},format=yuv420p[v]`, "-map", "[v]", "-an", "-r", "30", "-c:v", "libx264", "-preset", UHD ? "veryfast" : "medium", "-crf", "18", "-movflags", "+faststart", "-t", TOTAL.toFixed(2), silent], "final");
  const mx = spawnSync("python", [path.join(__dirname, "mix_audio.py"), "--timeline", path.join(OUTD, "accounting-guided.timeline.json"), "--video-in", silent, "--out", out, "--music", MUSIC, "--vol", MUSIC_VOL], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (mx.status !== 0) throw new Error("mix_audio failed");
  console.log("DONE", out, TOTAL.toFixed(0) + "s");
})().catch((e) => { console.error("BUILD FAILED", e.stack); process.exit(1); });

// Builds the edited accounting video: hook + retimed chapters + animated titles/bullets/wipes + progress bar + voice-over.
// node build.cjs [--fast]   (--fast = skip overlay frames, only checks timing)  Output: out/accounting-full-edit.mp4
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { renderFrames } = require("./render.cjs");
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const RAW = path.join(__dirname, "..", "video-plans", "accounting", "raw", "accounting-full.mp4");
const marks = JSON.parse(fs.readFileSync(RAW.replace(".mp4", ".chapters.json"), "utf8"));
const script = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "video-plans", "accounting", "script.json"), "utf8"));
const W = path.join(__dirname, "work"), VO = path.join(__dirname, "voice"), OUTD = path.join(__dirname, "out");
fs.mkdirSync(W, { recursive: true }); fs.mkdirSync(OUTD, { recursive: true });
const run = (args, label) => { const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(label + ": " + (r.stderr || "").toString().slice(0, 400)); };
const durOf = (f) => { const r = spawnSync(FF, ["-hide_banner", "-i", f]); const m = /Duration: (\d+):(\d+):([\d.]+)/.exec((r.stderr || "").toString()); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };
const RAW_LEN = durOf(RAW);
const AR = "٠١٢٣٤٥٦٧٨٩"; const arNum = (n) => String(n).replace(/\d/g, (d) => AR[d]);

// ---- 1. timing: voice length per chapter (real mp3 if present, else words/2.2)
const est = (t) => t.split(/\s+/).length / 2.2;
const voiceFile = (name) => path.join(VO, name + ".mp3");
const vlen = (name, text) => fs.existsSync(voiceFile(name)) ? durOf(voiceFile(name)) : est(text);
const HOOK_LEN = 10.0;
const items = script.chapters.map((c) => {
  const m = marks[c.i], end = marks[c.i + 1] ? marks[c.i + 1].start : RAW_LEN;
  const v = vlen("ch-" + String(c.i).padStart(2, "0"), c.voice), D = v + 0.9, L = end - m.start;
  return { ...c, rawStart: m.start, rawLen: L, voiceLen: v, D, speed: L / D, hasVoice: fs.existsSync(voiceFile("ch-" + String(c.i).padStart(2, "0"))) };
});
let t = HOOK_LEN; items.forEach((it) => { it.T = t; t += it.D; }); const TOTAL = t;
console.log("chapter  rawLen -> D (speed) voice");
items.forEach((it) => console.log(String(it.i).padStart(2), it.rawLen.toFixed(0).padStart(4), "->", it.D.toFixed(1).padStart(5), "(x" + it.speed.toFixed(2) + ")", it.voiceLen.toFixed(1), it.hasVoice ? "" : "est"));
console.log("TOTAL", TOTAL.toFixed(0) + "s");
if (process.argv.includes("--fast")) process.exit(0);

(async () => {
  // ---- 2. hook clip (rendered by hook-render.cjs)
  if (!fs.existsSync(path.join(W, "hook.mp4"))) throw new Error("run hook-render.cjs first");
  // ---- 3. chapter clips, retimed
  const clips = [path.join(W, "hook.mp4")];
  for (const it of items) {
    const f = path.join(W, "clip" + String(it.i).padStart(2, "0") + ".mp4"); clips.push(f);
    const sp = Math.min(it.speed, 6); const used = Math.min(it.rawLen, it.D * sp); // when too fast we cut the tail instead of racing
    const vf = [`setpts=PTS/${sp.toFixed(4)}`, "fps=30", "scale=1920:1080", it.D * sp > it.rawLen ? `tpad=stop_mode=clone:stop_duration=${(it.D - it.rawLen / sp).toFixed(3)}` : "null", "format=yuv420p"].join(",");
    run(["-ss", String(it.rawStart), "-t", String(used), "-i", RAW, "-vf", vf, "-t", it.D.toFixed(3), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", f], "clip" + it.i);
  }
  fs.writeFileSync(path.join(W, "clips.txt"), clips.map((c) => `file '${c.split(String.fromCharCode(92)).join("/")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", path.join(W, "clips.txt"), "-c", "copy", path.join(W, "base.mp4")], "concat");
  // ---- 4. overlay events
  const ev = [];
  items.forEach((it, n) => {
    ev.push({ type: "wipe", t0: it.T - 0.4, dur: 0.8, num: arNum(n + 1), text: it.title });
    ev.push({ type: "title", t0: it.T + 0.5, dur: Math.min(4.5, it.D - 1.2), num: arNum(n + 1), text: it.title });
    const pts = it.pts || []; const span = Math.max(1, it.D - 2.2);
    pts.forEach((p, k) => ev.push({ type: "bullet", t0: it.T + 1.4 + k * (span / (pts.length + 0.4)), dur: Math.min(4.2, it.D - 1.6 - k * (span / (pts.length + 0.4))), text: p }));
  });
  ev.forEach((e) => { if (e.dur < 0.9) e.dur = 0.9; });
  // frame times: every frame while something animates, one frame per static stretch
  const FPS = 30, nF = Math.ceil(TOTAL * FPS); const sig = (tt) => ev.map((e, i) => (tt >= e.t0 && tt <= e.t0 + e.dur ? ((tt - e.t0 < 0.75 || e.t0 + e.dur - tt < 0.5 || e.type === "wipe") ? "A" + tt : i) : "")).join("|");
  const times = [], durs = []; let last = null;
  for (let i = 0; i < nF; i++) { const tt = i / FPS, s = sig(tt); if (s === last && !s.includes("A")) { durs[durs.length - 1] += 1 / FPS; } else { times.push(tt.toFixed(4)); durs.push(1 / FPS); } last = s; }
  const blank = times.every((_, i) => false);
  console.log("overlay frames", times.length);
  const dir = path.join(W, "ovframes"); fs.rmSync(dir, { recursive: true, force: true });
  const files = await renderFrames({ html: path.join(__dirname, "overlay.html"), times, outDir: dir, transparent: true, port: 9382, setupJs: `window.setup(${JSON.stringify(ev)})` });
  fs.writeFileSync(path.join(W, "ov.txt"), "ffconcat version 1.0\n" + files.map((f, i) => `file '${f.split(String.fromCharCode(92)).join("/")}'\nduration ${durs[i].toFixed(5)}`).join("\n") + `\nfile '${files[files.length - 1].split(String.fromCharCode(92)).join("/")}'\n`);
  // ---- 5. audio
  const aIn = [], aMix = []; let ai = 1;
  const add = (file, at) => { aIn.push("-i", file); aMix.push(`[${ai}:a]adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)}[a${ai}]`); ai++; };
  if (fs.existsSync(voiceFile("hook"))) add(voiceFile("hook"), 0.15);
  items.forEach((it) => { if (it.hasVoice) add(voiceFile("ch-" + String(it.i).padStart(2, "0")), it.T + 0.35); });
  // ---- 6. final composite: base + overlay + progress bar + audio
  const prog = `drawbox=x=0:y=1074:w='iw*t/${TOTAL.toFixed(2)}':h=6:color=0xf48050:t=fill`;
  const fc = `[0:v][1:v]overlay=0:0:format=auto,${prog},format=yuv420p[v]` + (aMix.length ? `;${aMix.join(";")};${aMix.map((_, k) => `[a${k + 1}]`).join("")}amix=inputs=${aMix.length}:normalize=0[a]` : "");
  const out = path.join(OUTD, "accounting-full-edit.mp4");
  run(["-i", path.join(W, "base.mp4"), "-f", "concat", "-safe", "0", "-i", path.join(W, "ov.txt"), ...aIn.slice(0), "-filter_complex", fc.replace(/\[(\d+):a\]/g, (m, d) => `[${+d + 1}:a]`), "-map", "[v]", ...(aMix.length ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", "-t", TOTAL.toFixed(2), out], "final");
  console.log("DONE", out, TOTAL.toFixed(0) + "s");
})().catch((e) => { console.error("BUILD FAILED", e.stack); process.exit(1); });

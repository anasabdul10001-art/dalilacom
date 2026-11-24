// Renders the RUSSIAN hook (first 8 s, silent) to work/hook2-ru.mp4 (or hook2-4k-ru.mp4 with UHD=1).  node hook-render-ru.cjs
// Needs work/hookshot-ru.png (or hookshot-4k-ru.png): a screenshot of the summary screen of the Russian recording, taken by shot-ru.cjs.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { renderFrames } = require("./render.cjs");
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const UHD = process.env.UHD === "1";
const du = (f, m) => `data:${m};base64,` + fs.readFileSync(f).toString("base64");
(async () => {
  const dir = path.join(__dirname, "work", UHD ? "hookframes2-4k-ru" : "hookframes2-ru"); fs.rmSync(dir, { recursive: true, force: true });
  const times = []; for (let i = 0; i < 8 * 30; i++) times.push((i / 30).toFixed(4));
  await renderFrames({ html: path.join(__dirname, "hook2-ru.html"), times, outDir: dir, transparent: false, port: 9381,
    setupJs: `window.setup(${JSON.stringify(du(path.join(__dirname, "work", UHD ? "hookshot-4k-ru.png" : "hookshot-ru.png"), "image/png"))}, ${JSON.stringify(du(path.join(__dirname, "..", "logo", "logo-en-horizontal-color.png"), "image/png"))})` });
  const out = path.join(__dirname, "work", UHD ? "hook2-4k-ru.mp4" : "hook2-ru.mp4");
  const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "30", "-i", path.join(dir, "%06d.png"), "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", out]);
  console.log("hook", r.status, r.stderr && r.stderr.toString().slice(0, 200), out);
})();

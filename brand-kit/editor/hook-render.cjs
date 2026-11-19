// Renders the hook (first ~8 s) to work/hook.mp4 (silent). node hook-render.cjs
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { renderFrames } = require("./render.cjs");
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const du = (f, m) => `data:${m};base64,` + fs.readFileSync(f).toString("base64");
(async () => {
  const dir = path.join(__dirname, "work", "hookframes"); fs.rmSync(dir, { recursive: true, force: true });
  const times = []; for (let i = 0; i < 10 * 30; i++) times.push((i / 30).toFixed(4));
  await renderFrames({ html: path.join(__dirname, "hook.html"), times, outDir: dir, transparent: false, port: 9381,
    setupJs: `window.setup(${JSON.stringify(du(path.join(__dirname, "work", "hookshot26.png"), "image/png"))}, ${JSON.stringify(du(path.join(__dirname, "..", "logo", "logo-full-horizontal-color.png"), "image/png"))})` });
  const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "30", "-i", path.join(dir, "%06d.png"), "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", path.join(__dirname, "work", "hook.mp4")]);
  console.log("hook", r.status, r.stderr && r.stderr.toString().slice(0, 200));
})();

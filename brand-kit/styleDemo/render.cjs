// Renders scene.html (a time-driven animation) to MP4: Chrome via DevTools, one screenshot per frame, ffmpeg from imageio_ffmpeg.
// Run: node brand-kit/styleDemo/render.cjs [outFile] [--stills 1.0,5.5,...]
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const CH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const FPS = 30;
const args = process.argv.slice(2);
const stillsIdx = args.indexOf("--stills");
const stills = stillsIdx >= 0 ? args[stillsIdx + 1].split(",").map(Number) : null;
const out = args.find((a, i) => !a.startsWith("--") && (stillsIdx < 0 || i !== stillsIdx + 1)) || path.join(__dirname, "..", "social", "style-demo", "dalilacom-style-demo.mp4");
const url = "file:///" + path.join(__dirname, process.env.SCENE || "scene.html").split(path.sep).join("/");
const prof = path.join(process.env.TEMP, "dal-style-prof-" + Date.now());

(async () => {
  const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1",
    "--remote-debugging-port=9333", "--user-data-dir=" + prof, "--window-size=1080,1920", "--remote-allow-origins=*", "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 50; i++) {
    try { list = await (await fetch("http://127.0.0.1:9333/json")).json(); if (list.find((x) => x.type === "page")) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2500));
  const dur = (await send("Runtime.evaluate", { expression: "window.DURATION", returnByValue: true })).result.result.value;
  const shot = async (t) => {
    await send("Runtime.evaluate", { expression: `seek(${t})` });
    const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    return Buffer.from(r.result.data, "base64");
  };
  if (stills) {
    for (const t of stills) fs.writeFileSync(path.join(path.dirname(out), `still-${t}.jpg`), await shot(t));
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ff = spawn(FF, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "ignore"] });
    const n = Math.round(dur * FPS);
    for (let f = 0; f < n; f++) {
      const buf = await shot(f / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 90 === 0) console.log("frame", f, "/", n);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
    console.log("wrote", out);
  }
  ws.close(); chrome.kill();
  process.exit(0);
})();

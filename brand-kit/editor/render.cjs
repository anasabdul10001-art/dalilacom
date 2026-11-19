// Frame renderer: draws an HTML page (overlay.html / hook.html) frame by frame in headless Chrome and writes PNGs.
const fs = require("fs"), path = require("path"), os = require("os");
const { launch, sleep } = require("../recorder/cdp.cjs");
async function renderFrames({ html, setupJs, times, outDir, transparent, port = 9380 }) {
  const b = await launch({ port });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    if (transparent) await b.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await b.send("Page.navigate", { url: "file:///" + path.resolve(html).split(path.sep).join("/") }); await sleep(1500);
    await b.ev(`document.fonts.ready.then(()=>1)`); await b.ev(setupJs); await sleep(500);
    const files = [];
    for (let i = 0; i < times.length; i++) {
      await b.ev(`window.draw(${times[i]})`);
      const r = await b.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const f = path.join(outDir, String(i).padStart(6, "0") + ".png"); fs.writeFileSync(f, Buffer.from(r.data, "base64")); files.push(f);
    }
    return files;
  } finally { await b.close(); }
}
module.exports = { renderFrames };

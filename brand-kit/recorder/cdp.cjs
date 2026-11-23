// Dependency-free screen recorder: drives a HEADLESS Chrome over the DevTools protocol (nothing shows on the owner's screen),
// shows a fake mouse cursor, and records the page as 1920x1080 frames that are assembled with ffmpeg afterwards.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// DLK_SCALE=2 records at 3840x2160 (the page is still laid out at 1920x1080 CSS px, just rendered with twice the pixels)
const SCALE = Number(process.env.DLK_SCALE || 1);

const CURSOR_JS = `(() => {
  if (!document.documentElement || document.getElementById('__cur')) return;
  const st = document.createElement('style');
  st.textContent = '#__cur{position:fixed;left:-50px;top:-50px;width:30px;height:30px;z-index:2147483647;pointer-events:none;transition:left .75s cubic-bezier(.4,0,.2,1),top .75s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}' +
    '.__rip{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #f48050;background:rgba(244,128,80,.35);z-index:2147483646;pointer-events:none;animation:__rip .6s ease-out forwards}' +
    '@keyframes __rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}' +
    '#social-dock,.fab-stack,.floating-buttons{display:none!important}';
  document.documentElement.appendChild(st);
  const c = document.createElement('div'); c.id = '__cur';
  c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
  window.__moveCursor = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
  window.__ripple = (x, y) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); };
})();`;

async function launch(opts = {}) {
  const port = opts.port || 9333;
  const keepProfile = !!opts.profile; const profile = opts.profile || fs.mkdtempSync(path.join(os.tmpdir(), "dlk-rec-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--window-size=1920,1080", `--force-device-scale-factor=${SCALE}`, "--hide-scrollbars", "--lang=ar", "--no-first-run",
    "--no-default-browser-check", "--disable-notifications", "--mute-audio", "about:blank",
  ], { stdio: "ignore" });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(500);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = list.find((t) => t.type === "page"); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch {}
  }
  if (!wsUrl) throw new Error("Chrome did not start");
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: SCALE, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: CURSOR_JS });

  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || "").split(String.fromCharCode(10))[0] + " IN: " + expr.replace(/\s+/g, " ").slice(0, 260)); return r.result.value; };
  const goto = async (url) => { await send("Page.navigate", { url }); await sleep(2500); await ev(CURSOR_JS); };

  // ---- recorder (screencast: a frame whenever the screen changes)
  let frames = [], rec = null, T0 = null; const steps = []; let wall0 = null, quiet = false, sup = 0;
  const mark = (kind, data) => { if (!rec || sup > 0) return; steps.push({ t: ((Date.now() - (wall0 || rec.startWall)) / 1000), abs: Date.now() / 1000, kind, quiet, ...data }); };
  const describe = async (expr) => ev(`(() => { const el = (${expr}); if (!el) return {}; const lab = (el.closest('.field') && el.closest('.field').querySelector('label')) || (el.closest('.ui-ask') && el.closest('.ui-ask').querySelector('label')); return { text: ((el.innerText || el.value || el.getAttribute('aria-label') || '') + '').trim().split(String.fromCharCode(10))[0].slice(0, 60), label: lab ? lab.innerText.trim().slice(0, 60) : (el.placeholder || ''), tag: el.tagName }; })()`);
  listeners.push((msg) => {
    if (msg.method === "Page.screencastFrame" && rec) {
      const { data, metadata, sessionId } = msg.params; if (wall0 === null) wall0 = Date.now();
      const file = path.join(rec.dir, String(rec.n++).padStart(6, "0") + ".jpg");
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      rec.frames.push({ file, t: metadata.timestamp }); if (rec.frames.length === 1) { T0 = metadata.timestamp; if (process.env.DLK_DEBUG_CLOCK) console.log('first frame ts', metadata.timestamp, 'now', Date.now() / 1000); }
      send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    }
  });
  // native confirm()/alert() dialogs would freeze the page: accept them (the video shows the app's own dialogs)
  listeners.push((msg) => { if (msg.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true, promptText: "" }).catch(() => {}); });
  const startRec = async () => {
    rec = { dir: fs.mkdtempSync(path.join(os.tmpdir(), "dlk-frames-")), n: 0, frames: [], startWall: Date.now() }; wall0 = null; steps.length = 0;
    await send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920 * SCALE, maxHeight: 1080 * SCALE, everyNthFrame: 1 });
  };
  const stopRec = async (outMp4, tailSec = 1.5) => {
    await sleep(600); await send("Page.stopScreencast"); const r = rec; rec = null;
    const list = r.frames;
    let txt = "ffconcat version 1.0\n";
    for (let i = 0; i < list.length; i++) {
      const dur = i < list.length - 1 ? Math.max(0.0005, list[i + 1].t - list[i].t) : tailSec;
      txt += `file '${list[i].file.replace(/\\/g, "/")}'\nduration ${dur.toFixed(4)}\n`;
    }
    txt += `file '${list[list.length - 1].file.replace(/\\/g, "/")}'\n`;
    const listFile = path.join(r.dir, "list.txt"); fs.writeFileSync(listFile, txt);
    await new Promise((res, rej) => {
      const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", outMp4], { stdio: "inherit" });
      p.on("exit", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    });
    const secs = list[list.length - 1].t - list[0].t + tailSec;
    fs.rmSync(r.dir, { recursive: true, force: true });
    return { frames: list.length, seconds: Math.round(secs) };
  };

  // ---- a human-looking mouse and keyboard
  const rectOf = (expr) => ev(`(() => { const el = (${expr}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`);
  const byText = (t, sel = "button,a,[role=button],label,div.card") => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent !== null && (x.innerText||'').trim().includes(${JSON.stringify(t)})).sort((a,b)=> (a.innerText||'').length - (b.innerText||'').length)[0]`;
  const clickAt = async (p) => {
    await ev(`window.__moveCursor(${p.x}, ${p.y})`); await sleep(900);
    await ev(`window.__ripple(${p.x}, ${p.y})`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await sleep(500);
  };
  const click = async (expr) => { const p = await rectOf(expr); if (!p) throw new Error("not found: " + expr); if (sup === 0) { const d = await describe(expr); mark("click", d); } await sleep(300); await clickAt(p); };
  const clickText = (t, sel) => click(byText(t, sel));
  const type = async (text, delay = 85) => { for (const ch of text) { await send("Input.insertText", { text: ch }); await sleep(delay); } };
  const fillBy = async (expr, text) => { const d = await describe(expr); mark("fill", { ...d, value: text }); sup++; try { await click(expr); } finally { sup--; } await ev(`(()=>{const e=document.activeElement; if(e&&e.select) try{e.select()}catch(_){}})()`); await type(text); await sleep(300); };
  const setSelect = async (expr, label) => {
    const p = await rectOf(expr); mark("select", { ...(await describe(expr)), value: label }); await sleep(250); await ev(`window.__moveCursor(${p.x}, ${p.y})`); await sleep(900); await ev(`window.__ripple(${p.x}, ${p.y})`); await sleep(300);
    await ev(`(() => { const s = (${expr}); const o = [...s.options].find(o => o.text.trim() === ${JSON.stringify(label)} || o.text.trim().startsWith(${JSON.stringify(label)} + ' ')); s.value = o.value; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await sleep(700);
  };
  const scrollBy = async (dy, ms = 1400) => { await ev(`window.scrollBy({top:${dy},behavior:'smooth'})`); await sleep(ms); };
  const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(`!!(${expr})`)) return true; } catch {} await sleep(300); } throw new Error('timeout waiting for: ' + expr.slice(0, 80)); };
  const close = async () => { if (keepProfile) { try { await send("Browser.close"); } catch {} await sleep(1500); } try { ws.close(); } catch {} proc.kill(); await sleep(500); if (!keepProfile) try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
  const note = (text) => mark("note", { text });
  const chapter = (name) => mark("chapter", { text: name });
  const setQuiet = (q) => { quiet = !!q; };
  const silent = async (fn) => { sup++; try { return await fn(); } finally { sup--; } };
  return { frameT0: () => T0, mark, note, chapter, setQuiet, silent, getSteps: () => steps.slice(), send, ev, goto, startRec, stopRec, click, clickText, clickAt, rectOf, byText, type, fillBy, setSelect, scrollBy, sleep, waitFor, close };
}
module.exports = { launch, sleep };

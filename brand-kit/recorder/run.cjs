// Dev runner: node run.cjs ch-a.cjs inventory [seconds]
const { open } = require("./lib.cjs");
const [file, fn, secs] = process.argv.slice(2);
(async () => {
  const b = await open(9360);
  const wd = setTimeout(async () => { console.log("WATCHDOG"); try { await b.shot("hang"); console.log((await b.ev("document.body.innerText")).slice(-400)); } catch (e) { console.log(e.message); } process.exit(2); }, (Number(secs) || 150) * 1000);
  try { await b.enterDashboard(); console.log("in dashboard"); await require("./" + file)[fn](b); console.log("ok"); }
  catch (e) { console.error("FAILED", e.message); await b.shot("fail"); }
  clearTimeout(wd); await b.close(); process.exit(0);
})();

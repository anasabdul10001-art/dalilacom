const { open, sleep, vis } = require("./lib.cjs");
const tab = process.argv[2];
(async () => {
  const b = await open(9351);
  try {
    await b.enterDashboard(); await b.tab(tab);
    await b.shot("x-" + tab);
    console.log(await b.ev(`JSON.stringify({sel:${vis(".site select")}.map(s=>[s.id,[...s.options].map(o=>o.text).slice(0,8)]),inp:${vis(".site input,.site textarea")}.map(x=>[x.id,x.type,x.placeholder]),btn:${vis(".site button")}.map(x=>x.innerText.trim()).filter(Boolean).slice(0,40)})`));
  } catch (e) { console.error("FAILED", e.message); await b.shot("fail"); }
  await b.close();
})();

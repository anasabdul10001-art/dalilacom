const { open, sleep } = require("./lib.cjs"); const a = require("./ch-a.cjs");
(async () => { const b = await open(9363);
  try { await b.enterDashboard(); await a.partyStatement(b, "الزبائن", "أم خالد", "4", "نقداً", "10"); console.log((await b.ev(`document.body.innerText`)).slice(-1300, -400)); } catch (e) { console.log("FAILED", e.message); await b.shot("fail"); } await b.close(); process.exit(0); })();

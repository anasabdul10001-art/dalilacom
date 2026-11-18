const { open, sleep } = require("./lib.cjs"); const A = require("./ch-a.cjs"), B = require("./ch-b.cjs");
(async () => { const b = await open(9365);
  try { await b.enterDashboard(); await A.saleDistributor(b); console.log("sale ok"); await B.settle(b); console.log("settle ok"); }
  catch (e) { console.log("FAILED", e.message); await b.shot("fail"); console.log(await b.ev(`document.querySelector('.site').innerText.slice(300,900)`)); }
  await b.close(); process.exit(0); })();

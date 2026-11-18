const { open, sleep, vis } = require("./lib.cjs");
(async () => { const b = await open(9361);
  try { await b.enterDashboard(); await b.tab("الفروع والموزّعين"); await sleep(1500);
    console.log(await b.ev(`document.querySelector('.site').innerText.slice(400,1600)`));
    console.log(await b.ev(`${vis(".site button")}.map(x=>x.innerText.trim()).filter(Boolean).slice(14).join("|")`));
    await b.shot("loc2");
  } catch (e) { console.log(e.message); } await b.close(); process.exit(0); })();

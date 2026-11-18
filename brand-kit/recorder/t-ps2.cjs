const { open, sleep, vis } = require("./lib.cjs");
(async () => { const b = await open(9364);
  try { await b.enterDashboard(); await b.tab("الزبائن والموردين"); await sleep(1200);
    await b.clickText("كشف الحساب", ".site button"); await sleep(2000);
    await b.clickText("تسجيل دفعة", ".site button"); await sleep(1500); await b.shot("pay-dlg");
    console.log(await b.ev(`document.querySelector('.ui-ask')?.innerText`));
  } catch (e) { console.log("FAILED", e.message); } await b.close(); process.exit(0); })();

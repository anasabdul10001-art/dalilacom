const { open, sleep, vis } = require("./lib.cjs");
(async () => { const b = await open(9362);
  try { await b.enterDashboard(); await b.tab("الموظفون"); await sleep(1500);
    await b.clickText("رمز دعوة", ".site button"); await sleep(2000); await b.shot("st-inv");
    console.log("INV:", await b.ev(`document.body.innerText.slice(-500)`));
    await b.ev(`document.querySelector('[data-no],[data-close]')?.click()`);
    await b.clickText("دفع الراتب الثابت", ".site button"); await sleep(2000); await b.shot("st-pay");
    console.log("PAY:", await b.ev(`document.body.innerText.slice(-400)`));
  } catch (e) { console.log(e.message); } await b.close(); process.exit(0); })();

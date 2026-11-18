const { open, sleep, vis } = require("./lib.cjs");
(async () => {
  const b = await open(9353);
  try {
    await b.enterDashboard(); await b.tab("المخزون");
    await b.clickText("جرد فعلي", "button"); await sleep(1500); await b.shot("inv-count");
    console.log("COUNT:", (await b.ev(`(document.querySelector('.ui-ask,.modal,[role=dialog]')||document.querySelector('.site')).innerText`)).slice(-600));
    await b.ev(`(document.querySelector('[data-no]')||{click(){}}).click()`);
    await sleep(500);
    await b.ev(`${vis(".site button")}.find(x=>x.innerText.trim()==='+').click()`); await sleep(1200); await b.shot("inv-plus");
    console.log("PLUS:", await b.ev(`document.querySelector('.ui-ask')?.innerText`));
    await b.ev(`document.querySelector('[data-no]')?.click()`); await sleep(500);
    await b.ev(`${vis(".site button")}.find(x=>x.innerText.trim()==='الحركات').click()`); await sleep(1500); await b.shot("inv-moves");
    console.log("MOVES:", (await b.ev(`document.body.innerText`)).slice(-500));
  } catch (e) { console.error("FAILED", e.message); await b.shot("fail"); }
  await b.close();
})();

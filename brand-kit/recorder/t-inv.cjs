const { open, sleep } = require("./lib.cjs");
(async () => {
  const b = await open(9350);
  try {
    await b.enterDashboard(); await b.tab("المخزون");
    const n = await b.ev(`${b.inputs()}.length`); console.log("inputs", n);
    console.log(await b.ev(`JSON.stringify(${b.inputs()}.map(x=>[x.placeholder,x.type,x.inputMode]))`));
    await b.fill(0, "6281002"); await b.fill(1, "سكر ناعم 1 كغ"); await b.fill(2, "3.5"); await b.fill(3, "2.4"); await b.fill(4, "40");
    await b.clickText("إضافة المنتج للجرد", "button"); await sleep(2500);
    await b.shot("inv-after");
    console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(0, 900));
  } catch (e) { console.error("FAILED", e.message); await b.shot("fail"); }
  await b.close();
})();

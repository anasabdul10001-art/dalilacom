const { launch, sleep } = require("./cdp.cjs");
const fs=require("fs");
(async () => {
  const b = await launch({ port: 9345 });
  try {
    await b.goto("http://localhost:4000/app/");
    await b.ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent);const o=[...s.options].find(o=>o.text.trim()==='دمشق');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await b.clickText("تأكيد", "button"); await sleep(2000);
    await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2500);
    const r = await b.send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(process.argv[2], Buffer.from(r.data,"base64"));
  } catch (e) { console.error(e.message); }
  await b.close();
})();

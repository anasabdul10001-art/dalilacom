const { open, sleep, vis } = require("./lib.cjs");
(async () => {
  const b = await open(9352);
  try { await b.enterDashboard(); await b.tab(process.argv[2]);
    console.log(await b.ev(`(()=>{const s=document.querySelector('.site');const o=[];const walk=(e,d)=>{if(d>3)return;for(const c of e.children){const r=c.getBoundingClientRect();o.push(' '.repeat(d*2)+c.tagName+'.'+String(c.className).slice(0,40)+' '+Math.round(r.width)+'x'+Math.round(r.height));walk(c,d+1)}};walk(s,0);return o.slice(0,60).join('\n')})()`));
  } catch (e) { console.error(e.message); } await b.close();
})();

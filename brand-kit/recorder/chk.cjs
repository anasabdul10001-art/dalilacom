const { launch, sleep } = require("./cdp.cjs");
const path=require("path");
(async()=>{const b=await launch({port:9348,profile:path.join(process.env.TEMP,"dlk-demo-profile")});
await b.goto("http://localhost:4000/app/");await sleep(1500);
console.log(await b.ev(`JSON.stringify([Object.keys(localStorage),Object.keys(sessionStorage)])`));
await b.close();})();

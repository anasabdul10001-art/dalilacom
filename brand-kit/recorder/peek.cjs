const fs=require("fs");
(async()=>{const list=await (await fetch("http://127.0.0.1:9370/json")).json();const pg=list.find(t=>t.type==="page");const ws=new WebSocket(pg.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
const send=(m,p={})=>new Promise(res=>{const id=Math.floor(Math.random()*1e9);const h=e=>{const d=JSON.parse(e.data);if(d.id===id){ws.removeEventListener("message",h);res(d.result)}};ws.addEventListener("message",h);ws.send(JSON.stringify({id,method:m,params:p}))});
const r=await send("Page.captureScreenshot",{format:"jpeg",quality:60});fs.writeFileSync(process.env.TEMP+"/shots/peek.jpg",Buffer.from(r.data,"base64"));
const t=await send("Runtime.evaluate",{expression:"location.href+' | '+document.body.innerText.slice(-200)",returnByValue:true});console.log(t.result.value);ws.close();process.exit(0)})();

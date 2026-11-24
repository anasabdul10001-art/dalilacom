const { launch, sleep } = require("../../recorder/cdp.cjs");
const fs=require("fs"),path=require("path");
(async()=>{const b=await launch({port:9392});try{
 await b.send("Page.navigate",{url:"file:///"+path.resolve(__dirname,"thumb-ru.html").split(path.sep).join("/")});await sleep(1500);
 const r=await b.send("Page.captureScreenshot",{format:"png",clip:{x:0,y:0,width:1920,height:1080,scale:1}});
 fs.writeFileSync(path.resolve(__dirname,"../../social/accounting-video-thumbnail-ru-1920x1080.png"),Buffer.from(r.data,"base64"));
}finally{await b.close();}})();

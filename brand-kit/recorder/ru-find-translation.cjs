const fs=require("fs"),vm=require("vm");const ctx={LANGS:{},DICT:{},PHRASES:{},PATTERNS:{},WORDS:{}};vm.createContext(ctx);
for(const f of["ar","ru"])vm.runInContext(fs.readFileSync(`../../public/app/i18n.${f}.js`,"utf8"),ctx);
for(const q of process.argv.slice(2)){console.log("##",q);let n=0;for(const[k,v]of Object.entries(ctx.DICT.ar)){if(v.includes(q)&&ctx.DICT.ru[k]&&n++<4)console.log("  ",k,"|",v.slice(0,70),"=>",ctx.DICT.ru[k].slice(0,90));}}

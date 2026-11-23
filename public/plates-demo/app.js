"use strict";
/* ============ أدوات عامة ============ */
const $ = (s,r=document)=>r.querySelector(s);
const fmt = n => Number(n).toLocaleString("ar-EG");
const money = n => fmt(n)+" ل.س";
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KEY="motPlatesDemo.v3";
const CAP_MULT=10, WATCH_MS=300000;
const CATS={repeated:{n:"أرقام مكرّرة",start:3000000,inc:100000},sequence:{n:"أرقام متسلسلة",start:2500000,inc:100000},short:{n:"أرقام قصيرة",start:6000000,inc:250000},regular:{n:"عادية (سعر ثابت)",start:350000,inc:0}};
const GOVS=["دمشق","ريف دمشق","حلب","حمص","حماة","اللاذقية","طرطوس","درعا","إدلب","دير الزور"];
const ANTI_SNIPE_MS=120000, EXTEND_MS=120000;

async function sha(str){
  try{ if(crypto&&crypto.subtle){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}}catch(e){}
  let h=5381;for(const c of str){h=((h<<5)+h+c.charCodeAt(0))>>>0}return ("00000000"+h.toString(16)).slice(-8).repeat(8);
}
function toast(m){const t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display="none",3500)}

/* ============ الحالة ============ */
let S;
function seed(){
  const now=Date.now(), m=60000;
  const mk=(id,gov,num,cat,start,inc,endMin)=>({id,gov,num,cat,start,inc,deposit:Math.round(start*0.1),ends:now+endMin*m,status:"open",bids:[],winner:null,extended:0,proxies:{},fixed:cat==="regular"});
  return {
    user:null, wallet:0, held:{}, // held: {auctionId: amount}
    auctions:[
      mk(1,"دمشق","777777","repeated",5000000,100000,3.5),
      mk(2,"حلب","111222","repeated",2500000,50000,6),
      mk(3,"اللاذقية","999","short",8000000,250000,9),
      mk(4,"حمص","500500","repeated",1800000,50000,14),
      mk(5,"ريف دمشق","123123","sequence",3200000,100000,22),
      mk(6,"طرطوس","888","short",6000000,200000,40),
      mk(7,"دمشق","482915","regular",350000,0,0)
    ],
    log:[], bots:["م-4821","م-1937","م-7704","م-2256","م-6110"], seq:0, flags:[], deposits:[], watch:[], alerted:{}
  };
}
function load(){try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}if(!S||!S.auctions){S=seed();audit("SYSTEM","تهيئة بيانات النموذج التجريبي",{});}if(!S.deposits)S.deposits=[];if(!S.watch)S.watch=[];if(!S.alerted)S.alerted={};}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

/* ============ سجل التدقيق (سلسلة تجزئة غير قابلة للتعديل دون كشف) ============ */
let auditQueue=Promise.resolve();
function audit(type,detail,data){
  const e={n:++S.seq,t:Date.now(),type,detail,data:data||{}};
  auditQueue=auditQueue.then(async()=>{
    const prev=S.log.length?S.log[S.log.length-1].hash:"0".repeat(64);
    e.prev=prev;e.hash=await sha(prev+"|"+e.n+"|"+e.t+"|"+e.type+"|"+e.detail+"|"+JSON.stringify(e.data));
    S.log.push(e);save();
  });
  return auditQueue;
}
async function verifyChain(){
  let prev="0".repeat(64);
  for(const e of S.log){
    const h=await sha(prev+"|"+e.n+"|"+e.t+"|"+e.type+"|"+e.detail+"|"+JSON.stringify(e.data));
    if(e.prev!==prev||e.hash!==h)return {ok:false,at:e.n};
    prev=e.hash;
  }
  return {ok:true,count:S.log.length};
}

/* ============ منطق المزاد ============ */
const topBid = a => a.bids.length?a.bids[a.bids.length-1]:null;
const curPrice = a => topBid(a)?topBid(a).amount:a.start;
const nextMin = a => topBid(a)?topBid(a).amount+a.inc:a.start;
const me = () => S.user?S.user.badge:null;
const remaining = a => Math.max(0,a.ends-Date.now());
function tfmt(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;const p=n=>String(n).padStart(2,"0");return (h?p(h)+":":"")+p(m)+":"+p(x)}

const heldTotal = () => Object.values(S.held).reduce((x,y)=>x+y,0);
const bidCap = () => (S.wallet+heldTotal())*CAP_MULT;
function pushBid(a,who,amount,tag){
  a.bids.push({who,amount,t:Date.now(),auto:tag==="auto",hall:tag==="hall"});
  audit("BID",tag==="auto"?"مزايدة تلقائية بالنيابة عن المزايد (سقفه غير معلن)":tag==="hall"?"مزايدة من القاعة (مزاد هجين)":"مزايدة جديدة",{auction:a.id,who,amount});
  if(a.ends-Date.now()<ANTI_SNIPE_MS){a.ends=Date.now()+EXTEND_MS;a.extended++;audit("EXTEND","تمديد تلقائي دقيقتين لمنع المزايدة في اللحظة الأخيرة",{auction:a.id});}
}
/* المزايدة التلقائية: تزايد المنصة بالنيابة عن صاحب السقف بأقل زيادة لازمة */
function resolveProxies(a){
  for(let i=0;i<30;i++){
    const t=topBid(a);if(!t)return;
    const hp=a.proxies[t.who]||0;let o=null;
    for(const w in a.proxies){if(w===t.who)continue;if(a.proxies[w]>=nextMin(a)&&(!o||a.proxies[w]>a.proxies[o]))o=w}
    if(!o)return;
    const om=a.proxies[o];
    if(hp>=om){ /* صاحب أعلى مزايدة يدافع بسقفه الأعلى */
      pushBid(a,o,om,"auto");delete a.proxies[o];
      const amt=Math.min(hp,om+a.inc);if(amt>=nextMin(a))pushBid(a,t.who,amt,"auto");
      if(!a.proxies[t.who]||a.proxies[t.who]<=curPrice(a))delete a.proxies[t.who];
      return;
    }
    if(hp>=nextMin(a))pushBid(a,t.who,hp,"auto");
    delete a.proxies[t.who];
    pushBid(a,o,Math.min(om,curPrice(a)+a.inc),"auto");
    if(a.proxies[o]<=curPrice(a))delete a.proxies[o];
  }
}
function placeBid(a,amount,who,max,hall){
  if(a.fixed)return "هذه اللوحة تُباع بسعر ثابت، لا مزايدة عليها.";
  if(a.status!=="open"||remaining(a)<=0)return "انتهى هذا المزاد.";
  const t=topBid(a), mine=(who===me()&&!hall);
  if(mine){
    if(!S.user)return "سجّل دخولك أولاً.";
    if(!S.user.verified)return "يجب توثيق الهوية قبل المزايدة.";
    if(Math.max(amount,max||0)>bidCap())return "المبلغ يتجاوز سقف مزايدتك ("+money(bidCap())+")، وهو مرتبط بتأمينك: "+fmt(CAP_MULT)+" أضعاف ما أودعته. أودِع تأميناً إضافياً لرفع السقف.";
  }
  if(t&&t.who===who){
    if(max&&max>t.amount){a.proxies[who]=max;audit("PROXY_SET","رفع سقف المزايدة التلقائية (المبلغ غير معلن)",{auction:a.id,who});save();return null}
    return "أنت صاحب أعلى مزايدة حالياً. يمكنك رفع سقف المزايدة التلقائية فقط.";
  }
  if(amount<nextMin(a))return "الحد الأدنى للمزايدة: "+money(nextMin(a));
  if(mine&&!S.held[a.id]){
    if(S.wallet<a.deposit)return "الرصيد لا يكفي لتأمين المزايدة ("+money(a.deposit)+"). أودِع التأمين من صفحة حسابي وانتظر تأكيد الوزارة.";
    S.wallet-=a.deposit;S.held[a.id]=a.deposit;
    audit("DEPOSIT_HOLD","حجز تأمين للمزايدة",{auction:a.id,who,amount:a.deposit});
  }
  pushBid(a,who,amount,hall?"hall":"");
  if(max&&max>amount){a.proxies[who]=max;audit("PROXY_SET","تفعيل مزايدة تلقائية (السقف غير معلن)",{auction:a.id,who})}else delete a.proxies[who];
  resolveProxies(a);
  detectFraud(a,who);
  save();return null;
}
function buyFixed(a){
  if(!a.fixed||a.status!=="open")return "غير متاحة.";
  if(!S.user||!S.user.verified)return "يجب توثيق الهوية أولاً.";
  a.status="closed";a.winner=me();a.bids.push({who:me(),amount:a.start,t:Date.now()});
  audit("FIXED_SALE","بيع بسعر ثابت (دون مزاد)",{auction:a.id,who:me(),amount:a.start});save();return null;
}
function toggleWatch(id){const k=S.watch.indexOf(id);if(k>=0)S.watch.splice(k,1);else S.watch.push(id);save()}
function detectFraud(a,who){
  const recent=a.bids.filter(b=>b.who===who&&Date.now()-b.t<30000).length;
  if(recent>=4&&!S.flags.some(f=>f.auction===a.id&&f.who===who)){
    S.flags.push({auction:a.id,who,t:Date.now(),reason:"عدد مزايدات غير معتاد خلال 30 ثانية"});
    audit("FLAG","تنبيه آلي: نشاط مشبوه",{auction:a.id,who});
  }
}
function closeAuction(a){
  if(a.status!=="open")return;
  a.status="closed";const t=topBid(a);
  if(t){a.winner=t.who;audit("CLOSE","إغلاق المزاد وإعلان الفائز",{auction:a.id,winner:t.who,amount:t.amount});}
  else audit("CLOSE","إغلاق المزاد دون مزايدات",{auction:a.id});
  if(S.held[a.id]!==undefined){
    if(t&&t.who===me()){audit("SETTLE_WIN","الفائز: يُخصم التأمين من الثمن النهائي",{auction:a.id,deposit:S.held[a.id]});}
    else{S.wallet+=S.held[a.id];audit("DEPOSIT_REFUND","ردّ التأمين للخاسر",{auction:a.id,amount:S.held[a.id]});delete S.held[a.id];}
  }
  save();
}
/* مزايدون وهميون لإظهار المنصة حيّة */
function botTick(){
  S.auctions.filter(a=>a.status==="open"&&!a.fixed&&remaining(a)>0).forEach(a=>{
    const hot=remaining(a)<5*60000;
    if(Math.random()<(hot?0.12:0.04)){
      const cands=S.bots.filter(b=>!topBid(a)||topBid(a).who!==b);
      const who=cands[Math.floor(Math.random()*cands.length)];
      placeBid(a,nextMin(a)+(Math.random()<.3?a.inc:0),who);
    }
  });
}
setInterval(()=>{
  botTick();
  S.auctions.forEach(a=>{if(a.status==="open"&&!a.fixed&&remaining(a)<=0)closeAuction(a)});
  S.auctions.forEach(a=>{if(S.watch.includes(a.id)&&a.status==="open"&&!a.fixed&&remaining(a)<WATCH_MS&&!S.alerted[a.id]){S.alerted[a.id]=1;save();toast("تنبيه: لوحة "+a.gov+" "+a.num+" التي تراقبها ستنتهي خلال 5 دقائق")}});
  tick();
},1000);

/* ============ الواجهات ============ */
function plateHTML(a,big){return `<div class="plate ${big?"big":""}"><span class="gov">${esc(a.gov)}</span><span class="num">${esc(a.num)}</span></div>`}
const catBadge = a => `<span class="badge gold">${CATS[a.cat]?CATS[a.cat].n:""}</span>`;
const star = a => `<button class="star ${S.watch.includes(a.id)?"on":""}" data-w="${a.id}" title="مراقبة هذه اللوحة" aria-label="مراقبة هذه اللوحة">${S.watch.includes(a.id)?"★":"☆"}</button>`;
function stateBadge(a){return a.status==="open"?(a.fixed?'<span class="badge">متاحة بسعر ثابت</span>':'<span class="badge">مفتوح للمزايدة</span>'):'<span class="badge end">منتهي</span>'}

function viewHome(){
  const open=S.auctions.filter(a=>a.status==="open"),closed=S.auctions.filter(a=>a.status!=="open");
  const watched=S.auctions.filter(a=>S.watch.includes(a.id)&&a.status==="open");
  return `<h1>المزادات الجارية</h1>
  <div class="note">أي زائر يستطيع تصفّح المزادات. المزايدة تحتاج حساباً موثّقاً بالهوية وتأميناً مستردّاً. جرّب التسجيل ثم المزايدة، وراقب كيف يتمدّد المزاد تلقائياً إذا وصلت مزايدة في آخر دقيقتين. يمكنك أيضاً تحديد سقف للمزايدة التلقائية، ومراقبة لوحة بالنجمة لتصلك إشارة قبل انتهائها.</div>
  ${watched.length?`<h2>لوحات أراقبها</h2><div class="grid" style="margin-bottom:20px">${watched.map(card).join("")}</div><h2>كل اللوحات</h2>`:""}
  <div class="grid">${open.map(card).join("")||"<p>لا توجد مزادات مفتوحة.</p>"}</div>
  ${closed.length?`<h1 style="margin-top:26px">المزادات المنتهية</h1><div class="grid">${closed.map(card).join("")}</div>`:""}`;
}
function card(a){
  if(a.fixed)return `<div class="card">${star(a)}${plateHTML(a)}${catBadge(a)}
  <div class="row"><span>السعر الثابت</span><span class="price">${money(a.start)}</span></div>
  <div class="row"><span>الحالة</span><span>${stateBadge(a)}</span></div>
  <a class="btn block" href="#/auction/${a.id}" style="text-align:center">${a.status==="open"?"عرض وشراء":"عرض النتيجة"}</a></div>`;
  return `<div class="card">${star(a)}${plateHTML(a)}${catBadge(a)}
  <div class="row"><span>السعر الحالي</span><span class="price" data-price="${a.id}">${money(curPrice(a))}</span></div>
  <div class="row"><span>عدد المزايدات</span><b data-cnt="${a.id}">${fmt(a.bids.length)}</b></div>
  <div class="row"><span>${a.status==="open"?"الوقت المتبقي":"الحالة"}</span><span>${a.status==="open"?`<span class="timer" data-t="${a.id}"></span>`:stateBadge(a)}</span></div>
  <a class="btn block" href="#/auction/${a.id}" style="text-align:center">${a.status==="open"?"عرض والمزايدة":"عرض النتيجة"}</a></div>`;
}

function viewAuction(id){
  const a=S.auctions.find(x=>x.id==id);if(!a)return "<p>المزاد غير موجود.</p>";
  const mineHold=S.held[a.id]!==undefined;
  const t=topBid(a);
  return `<p><a href="#/">← كل المزادات</a></p>
  <div class="two">
   <div class="card">${star(a)}${plateHTML(a,true)}
     <div class="row"><span>الفئة</span>${catBadge(a)}</div>
     <div class="row"><span>الحالة</span>${stateBadge(a)}</div>
     ${a.fixed?`<div class="row"><span>السعر الثابت</span><span class="price">${money(a.start)}</span></div>`:`<div class="row"><span>سعر الافتتاح</span><b>${money(a.start)}</b></div>
     <div class="row"><span>السعر الحالي</span><span class="price" data-price="${a.id}">${money(curPrice(a))}</span></div>
     <div class="row"><span>الحد الأدنى للزيادة</span><b>${money(a.inc)}</b></div>
     <div class="row"><span>التأمين المطلوب (يُردّ للخاسر)</span><b>${money(a.deposit)}</b></div>`}
     <div class="row"><span>${a.status==="open"?(a.fixed?"طريقة البيع":"الوقت المتبقي"):"النتيجة"}</span><span>${a.status==="open"?(a.fixed?"بيع مباشر دون مزاد":`<span class="timer" data-t="${a.id}" style="font-size:20px"></span>`):(a.winner?`فاز <b>${esc(a.winner)}</b> بمبلغ <b>${money(t.amount)}</b>`:"أُغلق بدون مزايدات")}</span></div>
     ${a.fixed?"":`<div class="row"><span>تمديدات تلقائية</span><b>${fmt(a.extended)}</b></div>`}
     ${a.status==="open"?(a.fixed?fixedBox(a):bidBox(a,mineHold)):""}
     <div class="note">هوية المزايدين تظهر للجمهور كأرقام مجهولة (مثل م-4821)، وتبقى الهوية الحقيقية محفوظة للوزارة فقط.</div>
   </div>
   <div class="card"><h2>${a.fixed?"سجل البيع":"سجل المزايدات"}</h2>
     <table><thead><tr><th>المزايد</th><th>المبلغ</th><th>الوقت</th></tr></thead><tbody id="bidsBody">${bidRows(a)}</tbody></table>
   </div>
  </div>`;
}
function fixedBox(a){
  if(!S.user||!S.user.verified)return `<div class="note warnbox">لشراء هذه اللوحة <a href="#/register">أنشئ حساباً</a> وأكمل توثيق الهوية.</div>`;
  return `<button class="btn block" id="buyBtn" data-a="${a.id}">اشترِ بالسعر الثابت (${money(a.start)})</button>
   <div class="note">الفئات العادية تُباع بسعر ثابت دون مزاد، ويُدفع الثمن إلى حساب الوزارة مباشرة.</div>`;
}
function bidBox(a,hold){
  const guest=!S.user, unver=S.user&&!S.user.verified;
  if(guest)return `<div class="note warnbox">للمزايدة <a href="#/register">أنشئ حساباً</a> وأكمل توثيق الهوية.</div>`;
  if(unver)return `<div class="note warnbox">أكمل <a href="#/register">توثيق الهوية</a> للمزايدة.</div>`;
  const px=(a.proxies[me()]>=nextMin(a)||topBid(a)&&topBid(a).who===me())?a.proxies[me()]:0;
  return `<label>مبلغ مزايدتك (ل.س)</label>
   <input id="bidAmt" type="number" inputmode="numeric" value="${nextMin(a)}" min="${nextMin(a)}" step="${a.inc}">
   <label>السقف الأقصى للمزايدة التلقائية (اختياري)</label>
   <input id="bidMax" type="number" inputmode="numeric" placeholder="مثلاً ${nextMin(a)+a.inc*5}" step="${a.inc}">
   <div class="note" style="margin:6px 0">إذا حدّدت سقفاً، تزايد المنصة عنك بأقل زيادة لازمة كلما تفوّق عليك أحد، حتى بلوغ السقف. السقف لا يراه أحد.</div>
   ${px?`<div class="row"><span>سقفك التلقائي الحالي (لا يراه غيرك)</span><b>${money(px)}</b></div>`:""}
   <button class="btn block" id="bidBtn" data-a="${a.id}">قدّم المزايدة</button>
   <div class="row" style="margin-top:8px"><span>رصيد تأمينك لدى الوزارة</span><b>${money(S.wallet)}</b></div>
   <div class="row"><span>${hold?"تأمين محجوز لهذا المزاد":"سيُحجز تأمين عند أول مزايدة"}</span><b>${money(a.deposit)}</b></div>
   <div class="row"><span>سقف مزايدتك (${fmt(CAP_MULT)} أضعاف تأمينك)</span><b>${money(bidCap())}</b></div>`;
}
function bidRows(a){
  if(!a.bids.length)return `<tr><td colspan="3" style="color:#777">لا توجد مزايدات بعد.</td></tr>`;
  return [...a.bids].reverse().slice(0,25).map(b=>`<tr class="${b.who===me()?"mine":""}"><td>${esc(b.who)}${b.who===me()?" (أنت)":""}${b.auto?' <span class="badge">تلقائية</span>':""}${b.hall?' <span class="badge gold">من القاعة</span>':""}</td><td>${money(b.amount)}</td><td>${new Date(b.t).toLocaleTimeString("ar-EG")}</td></tr>`).join("");
}

function viewRegister(){
  const u=S.user;
  if(!u)return `<h1>إنشاء حساب مزايد</h1>
  <div class="steps"><span class="on">١. البيانات</span><span>٢. توثيق الهوية</span><span>٣. إيداع التأمين</span></div>
  <div class="card" style="max-width:520px">
   <label>الاسم الكامل</label><input id="rName" value="مزايد تجريبي">
   <label>الرقم الوطني (11 رقماً)</label><input id="rNid" inputmode="numeric" maxlength="11" value="01234567890">
   <label>رقم الهاتف</label><input id="rTel" value="+963 900 000 000">
   <div class="note">في النسخة الفعلية: يُتحقّق من الرقم الوطني عبر واجهة ربط مع السجل المدني (متوفرة حسب جواب الوزارة)، ويُرسل رمز تحقق للهاتف، ولا يُسمح بأكثر من حساب للرقم الوطني الواحد.</div>
   <button class="btn block" id="regBtn">متابعة</button></div>`;
  if(!u.verified)return `<h1>توثيق الهوية</h1>
  <div class="steps"><span>١. البيانات</span><span class="on">٢. توثيق الهوية</span><span>٣. إيداع التأمين</span></div>
  <div class="card" style="max-width:520px"><p>أُرسل رمز تحقق إلى هاتفك (في النموذج: <b>123456</b>).</p>
   <label>رمز التحقق</label><input id="otp" value="123456" inputmode="numeric">
   <div class="note">يجري هنا مطابقة الرقم الوطني مع السجل المدني (محاكاة): <b class="ok">مطابق</b>.</div>
   <button class="btn block" id="otpBtn">تأكيد وتوثيق</button></div>`;
  return `<h1>حسابي</h1>
  <div class="steps"><span>١. البيانات</span><span>٢. توثيق الهوية</span><span class="on">٣. إيداع التأمين</span></div>
  <div class="two"><div class="card"><div class="row"><span>الاسم</span><b>${esc(u.name)}</b></div>
   <div class="row"><span>رقم المزايد المجهول</span><b>${esc(u.badge)}</b></div>
   <div class="row"><span>الهوية</span><span class="badge">موثّقة</span></div>
   <div class="row"><span>الرصيد المتاح</span><span class="price">${money(S.wallet)}</span></div>
   <div class="row"><span>تأمينات محجوزة</span><b>${money(heldTotal())}</b></div>
   <div class="row"><span>سقف المزايدة (${fmt(CAP_MULT)} أضعاف التأمين)</span><b>${money(bidCap())}</b></div></div>
   <div class="card"><h2>إيداع التأمين</h2>
    <div class="row"><span>رمزك المرجعي (اكتبه في الحوالة)</span><b style="font-size:18px;direction:ltr">${esc(u.ref||"")}</b></div>
    <p style="font-size:13px;color:#5d6b64;margin:6px 0">١. حوّل مبلغ التأمين إلى حساب الوزارة (رقم الحساب معروض هنا في النسخة الفعلية) واكتب رمزك المرجعي في الحوالة.<br>٢. اضغط «أعلنتُ عن الإيداع»، فيرى موظف الوزارة الطلب ويؤكّده بعد مطابقته مع كشف البنك.<br>٣. بعد التأكيد يتفعّل رصيد تأمينك.</p>
    <label>المبلغ الذي حوّلته</label><select id="topup"><option value="500000">500,000 ل.س</option><option value="1000000" selected>1,000,000 ل.س</option><option value="5000000">5,000,000 ل.س</option></select>
    <button class="btn block" id="topBtn">أعلنتُ عن الإيداع (محاكاة)</button>
    <table style="margin-top:10px"><thead><tr><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${S.deposits.filter(d=>d.who===u.badge).map(d=>`<tr><td>${money(d.amount)}</td><td>${d.status==="pending"?'<span class="badge warn">بانتظار تأكيد الوزارة</span>':d.status==="confirmed"?'<span class="badge">مؤكَّد</span>':'<span class="badge end">مرفوض</span>'}</td></tr>`).join("")||'<tr><td colspan="2" style="color:#777">لا توجد إيداعات.</td></tr>'}</tbody></table>
    <div class="note">الأموال تُودَع مباشرة في حساب الوزارة، ولا يستلمها المشغّل. هنا يتم التأكيد يدوياً من موظف الوزارة، ويمكن لاحقاً ربطه آلياً مع بنك أو مزوّد دفع مرخّص.</div></div></div>`;
}

function viewAdmin(){
  const open=S.auctions.filter(a=>a.status==="open").length;
  const sum=S.auctions.filter(a=>a.status==="closed"&&a.winner).reduce((s,a)=>s+topBid(a).amount,0);
  const bids=S.auctions.reduce((s,a)=>s+a.bids.length,0);
  return `<h1>لوحة تحكم الوزارة</h1>
  <div class="stats"><div class="stat"><span>مزادات مفتوحة</span><b>${fmt(open)}</b></div><div class="stat"><span>إجمالي المزايدات</span><b>${fmt(bids)}</b></div><div class="stat"><span>عائدات المزادات المنتهية</span><b>${money(sum)}</b></div><div class="stat"><span>تنبيهات احتيال</span><b>${fmt(S.flags.length)}</b></div></div>
  <div class="two">
   <div class="card"><h2>إنشاء مزاد جديد</h2>
    <label>الفئة</label><select id="nCat">${Object.keys(CATS).map(k=>`<option value="${k}">${CATS[k].n}</option>`).join("")}</select>
    <label>المحافظة</label><select id="nGov">${GOVS.map(g=>`<option>${g}</option>`).join("")}</select>
    <label>رقم اللوحة</label><input id="nNum" value="2025">
    <label>سعر الافتتاح (ل.س)</label><input id="nStart" type="number" value="1000000">
    <label>الحد الأدنى للزيادة (ل.س)</label><input id="nInc" type="number" value="50000">
    <label>المدة (دقائق، لا تُستخدم للسعر الثابت)</label><input id="nMin" type="number" value="10">
    <button class="btn block" id="nBtn">نشر المزاد</button>
    <div class="note">في النسخة الفعلية: الإنشاء يحتاج موافقة موظفَين (مبدأ الفصل بين الصلاحيات)، وأي تعديل أو إلغاء يُسجَّل بالاسم والسبب.</div></div>
   <div class="card"><h2>المزادات</h2><table><thead><tr><th>اللوحة</th><th>الحالة</th><th></th></tr></thead><tbody>
     ${S.auctions.map(a=>`<tr><td>${esc(a.gov)} ${esc(a.num)}</td><td>${a.status==="open"?(a.fixed?"سعر ثابت":"مفتوح"):"منتهي"}</td><td>${a.status==="open"&&!a.fixed?`<button class="btn sec" data-close="${a.id}">إغلاق الآن</button>`:`<span style="color:#777">${a.winner?esc(a.winner):"—"}</span>`}</td></tr>`).join("")}
   </tbody></table></div></div>
  <div class="card" style="margin-top:16px"><h2>مزاد هجين: إدخال مزايدة من القاعة</h2>
   <p style="font-size:13px;color:#5d6b64;margin:0 0 8px">يرفع الحاضر في القاعة رقم لوحته، ويدخل موظف الوزارة مزايدته فتظهر فوراً لكل المتصلين عبر المنصة وتدخل سجل التدقيق.</p>
   <div class="two"><div><label>المزاد</label><select id="hAuc">${S.auctions.filter(a=>a.status==="open"&&!a.fixed).map(a=>`<option value="${a.id}">${esc(a.gov)} ${esc(a.num)}</option>`).join("")}</select></div>
   <div><label>رقم لوحة الحاضر</label><input id="hPad" type="number" value="12"></div></div>
   <label>المبلغ (ل.س)، يُترك فارغاً للحد الأدنى الحالي</label><input id="hAmt" type="number">
   <button class="btn block" id="hBtn">إدخال مزايدة من القاعة</button></div>
  <div class="card" style="margin-top:16px"><h2>إيداعات التأمين بانتظار التأكيد</h2>
   ${S.deposits.some(d=>d.status==="pending")?`<table><thead><tr><th>المزايد</th><th>الرمز المرجعي</th><th>المبلغ</th><th></th></tr></thead><tbody>${S.deposits.filter(d=>d.status==="pending").map(d=>`<tr><td>${esc(d.who)}</td><td><span class="hash">${esc(d.ref)}</span></td><td>${money(d.amount)}</td><td><button class="btn" data-dep="${d.id}" data-act="ok">تأكيد (مطابق لكشف البنك)</button> <button class="btn sec" data-dep="${d.id}" data-act="no">رفض</button></td></tr>`).join("")}</tbody></table>`:'<p style="color:#777;margin:0">لا توجد إعلانات إيداع. سجّل كمزايد، أعلن عن إيداع، ثم عد إلى هنا لتأكيده.</p>'}
  </div>
  <div class="card" style="margin-top:16px"><h2>رفع كشف البنك للمطابقة الآلية</h2>
   <p style="font-size:13px;color:#5d6b64;margin:0 0 8px">ارفع ملف CSV بالأعمدة: التاريخ، المبلغ، الوصف. تستخرج المنصة الرمز المرجعي من الوصف وتطابقه مع إعلانات الإيداع، فتؤكّد المطابق تلقائياً وتضع الباقي للمراجعة.</p>
   <input type="file" id="stFile" accept=".csv,text/csv" style="max-width:340px">
   <button class="btn sec" id="stSample" type="button">إنشاء ملف تجريبي</button>
   <div id="stRes"></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>تنبيهات مكافحة التواطؤ والاحتيال</h2>
   ${S.flags.length?`<table><thead><tr><th>المزاد</th><th>المزايد</th><th>السبب</th></tr></thead><tbody>${S.flags.map(f=>`<tr><td>#${f.auction}</td><td>${esc(f.who)}</td><td>${esc(f.reason)}</td></tr>`).join("")}</tbody></table>`:'<p style="color:#777;margin:0">لا توجد تنبيهات. (القاعدة التجريبية: 4 مزايدات أو أكثر من المزايد نفسه خلال 30 ثانية. جرّب أن تزايد بسرعة مع حسابين.)</p>'}
  </div>`;
}

function viewResults(){
  const done=S.auctions.filter(a=>a.status==="closed");
  return `<h1>نتائج المزادات</h1>
  <div class="note">صفحة عامة اختيارية بقرار الوزارة: تنشر السعر النهائي لكل لوحة بعد انتهاء المزاد، فتبني ثقة الجمهور. الفائز يظهر برقم مجهول فقط.</div>
  <div class="card" style="overflow:auto"><table><thead><tr><th>اللوحة</th><th>الفئة</th><th>سعر الافتتاح</th><th>السعر النهائي</th><th>المزايدات</th><th>الفائز</th></tr></thead><tbody>
  ${done.map(a=>{const t=topBid(a);return `<tr><td>${esc(a.gov)} ${esc(a.num)}</td><td>${CATS[a.cat]?CATS[a.cat].n:""}</td><td>${money(a.start)}</td><td>${a.winner?`<b>${money(t.amount)}</b>`:"—"}</td><td>${fmt(a.bids.length)}</td><td>${a.winner?esc(a.winner):"لم يُبَع"}</td></tr>`}).join("")||'<tr><td colspan="6" style="color:#777">لا توجد نتائج بعد. تنتهي المزادات تباعاً، أو اضغط «إغلاق الآن» من لوحة الوزارة.</td></tr>'}
  </tbody></table></div>`;
}

function viewAudit(){
  return `<h1>سجل التدقيق</h1>
  <div class="note">كل حدث (مزايدة، تأمين، إغلاق، تعديل) يُسجَّل في سلسلة مترابطة بالتجزئة (SHA-256): كل سجل يحتوي بصمة السجل الذي قبله، فأي تعديل أو حذف لاحق يكسر السلسلة ويظهر فوراً.</div>
  <p><button class="btn" id="vBtn">تحقق من سلامة السجل</button>
  <button class="btn sec" id="tBtn">محاكاة تلاعب بسجل قديم</button> <span id="vRes"></span></p>
  <div class="card" style="overflow:auto"><table><thead><tr><th>#</th><th>الوقت</th><th>الحدث</th><th>التفاصيل</th><th>البصمة</th></tr></thead><tbody>
  ${[...S.log].reverse().slice(0,60).map(e=>`<tr><td>${e.n}</td><td>${new Date(e.t).toLocaleTimeString("ar-EG")}</td><td><span class="badge gold">${esc(e.type)}</span></td><td>${esc(e.detail)} <span class="hash">${esc(JSON.stringify(e.data))}</span></td><td><span class="hash">${e.hash?e.hash.slice(0,14)+"…":""}</span></td></tr>`).join("")}
  </tbody></table></div>`;
}

/* ============ مطابقة كشف البنك ============ */
async function processStatement(text,name){
  const rows=text.replace(/^﻿/,"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const fileHash=(await sha(text)).slice(0,16);
  if((S.statements||[]).includes(fileHash)){$("#stRes").innerHTML='<div class="note warnbox">هذا الملف رُفع سابقاً (نفس البصمة)، ولن يُعالَج مرة ثانية.</div>';return}
  const ok=[],review=[];let n=0;
  rows.slice(1).forEach(line=>{
    n++;const c=line.split(",");const amount=Number((c[1]||"").replace(/[^\d.]/g,""));const desc=c.slice(2).join(",");
    const m=desc.match(/DP-\d{6}/);
    if(!m){review.push({n,line,why:"لا يوجد رمز مرجعي في الوصف (سطر لا يخص التأمينات)"});return}
    const dep=S.deposits.find(d=>d.ref===m[0]&&d.status==="pending");
    if(!dep){const used=S.deposits.some(d=>d.ref===m[0]&&d.status==="confirmed");review.push({n,line,why:used?"إيداع مكرر: هذا الرمز أُكِّد سابقاً":"الرمز "+m[0]+" غير موجود أو لا يوجد إعلان إيداع بانتظار"});return}
    if(dep.amount!==amount){review.push({n,line,why:"المبلغ في الكشف ("+money(amount)+") يختلف عن المعلَن ("+money(dep.amount)+")"});return}
    dep.status="confirmed";if(dep.who===me())S.wallet+=dep.amount;
    audit("DEPOSIT_CONFIRM","تأكيد آلي بمطابقة كشف البنك",{who:dep.who,ref:dep.ref,amount:dep.amount,file:fileHash});ok.push({n,ref:dep.ref,who:dep.who,amount});
  });
  S.statements=(S.statements||[]).concat(fileHash);
  audit("STATEMENT","رفع كشف بنك ومطابقته آلياً (موظف مخوّل)",{file:fileHash,name,rows:rows.length-1,matched:ok.length,review:review.length});
  save();
  $("#stRes").innerHTML=`<div class="note"><b class="ok">${fmt(ok.length)} إيداع مطابق وأُكِّد آلياً</b> · <b class="${review.length?"bad":"ok"}">${fmt(review.length)} بحاجة لمراجعة</b> · بصمة الملف <span class="hash">${fileHash}</span></div>
   ${ok.length?`<table><thead><tr><th>السطر</th><th>المزايد</th><th>الرمز</th><th>المبلغ</th></tr></thead><tbody>${ok.map(o=>`<tr><td>${o.n}</td><td>${esc(o.who)}</td><td><span class="hash">${esc(o.ref)}</span></td><td>${money(o.amount)}</td></tr>`).join("")}</tbody></table>`:""}
   ${review.length?`<h3>للمراجعة اليدوية</h3><table><thead><tr><th>السطر</th><th>المحتوى</th><th>السبب</th></tr></thead><tbody>${review.map(o=>`<tr><td>${o.n}</td><td><span class="hash">${esc(o.line)}</span></td><td>${esc(o.why)}</td></tr>`).join("")}</tbody></table>`:""}`;
}

/* ============ التوجيه والأحداث ============ */
function nav(){
  const r=location.hash||"#/";
  const L=[["#/","المزادات"],["#/register",S.user?"حسابي":"إنشاء حساب"],["#/results","النتائج"],["#/admin","لوحة الوزارة"],["#/audit","سجل التدقيق"]];
  $("#nav").innerHTML=L.map(([h,t])=>`<a href="${h}" class="${r===h||(h==="#/"&&r.startsWith("#/auction"))?"on":""}">${t}</a>`).join("");
}
let lastView="";
function render(){
  const h=location.hash||"#/";
  if(h==="#/reset"){localStorage.removeItem(KEY);S=seed();audit("SYSTEM","إعادة ضبط البيانات التجريبية",{});location.hash="#/";return;}
  nav();
  let html;
  if(h.startsWith("#/auction/"))html=viewAuction(h.split("/")[2]);
  else if(h==="#/register")html=viewRegister();
  else if(h==="#/admin")html=viewAdmin();
  else if(h==="#/results")html=viewResults();
  else if(h==="#/audit")html=viewAudit();
  else html=viewHome();
  $("#app").innerHTML=html;lastView=h;bind();tick();window.scrollTo(0,0);
}
function tick(){
  document.querySelectorAll("[data-t]").forEach(el=>{const a=S.auctions.find(x=>x.id==el.dataset.t);if(!a)return;const r=remaining(a);el.textContent=a.status==="open"?tfmt(r):"انتهى";el.classList.toggle("hot",r<ANTI_SNIPE_MS)});
  document.querySelectorAll("[data-price]").forEach(el=>{const a=S.auctions.find(x=>x.id==el.dataset.price);if(a)el.textContent=money(curPrice(a))});
  document.querySelectorAll("[data-cnt]").forEach(el=>{const a=S.auctions.find(x=>x.id==el.dataset.cnt);if(a)el.textContent=fmt(a.bids.length)});
  const h=location.hash||"#/";
  if(h.startsWith("#/auction/")){
    const a=S.auctions.find(x=>x.id==h.split("/")[2]);
    if(a&&!a.fixed){const tb=$("#bidsBody");if(tb){const sig=a.bids.length+"|"+a.status;if(tb.dataset.sig!==sig){tb.innerHTML=bidRows(a);tb.dataset.sig=sig;
      const inp=$("#bidAmt");if(inp&&document.activeElement!==inp){inp.value=nextMin(a);inp.min=nextMin(a)}
      if(a.status!=="open"&&!$(".card .badge.end"))render();}}}
  }
}
function bind(){
  const on=(id,fn)=>{const e=$(id);if(e)e.onclick=fn};
  on("#bidBtn",e=>{const a=S.auctions.find(x=>x.id==e.target.dataset.a);const v=Number($("#bidAmt").value);const mx=Number(($("#bidMax")||{}).value)||0;if(mx&&mx<v)return toast("السقف الأقصى يجب ألا يقل عن مبلغ مزايدتك.");const err=placeBid(a,v,me(),mx);if(err)toast(err);else{toast(mx?"تم تسجيل مزايدتك وتفعيل المزايدة التلقائية":"تم تسجيل مزايدتك");render()}});
  on("#buyBtn",e=>{const a=S.auctions.find(x=>x.id==e.target.dataset.a);const err=buyFixed(a);if(err)toast(err);else{toast("تم شراء اللوحة بالسعر الثابت");render()}});
  document.querySelectorAll("[data-w]").forEach(b=>b.onclick=ev=>{ev.preventDefault();const id=Number(b.dataset.w);toggleWatch(id);toast(S.watch.includes(id)?"أُضيفت اللوحة إلى قائمة المراقبة":"أُزيلت من المراقبة");render()});
  on("#hBtn",()=>{const a=S.auctions.find(x=>x.id==$("#hAuc").value);if(!a)return toast("لا توجد مزادات مفتوحة.");const pad=$("#hPad").value.trim();const v=Number($("#hAmt").value)||nextMin(a);const err=placeBid(a,v,"ق-"+pad,0,true);if(err)toast(err);else{toast("أُدخلت مزايدة من القاعة");render()}});
  const nc=$("#nCat");if(nc)nc.onchange=()=>{const c=CATS[nc.value];$("#nStart").value=c.start;$("#nInc").value=c.inc||0};
  on("#regBtn",()=>{const n=$("#rName").value.trim(),id=$("#rNid").value.trim();if(!n||!/^\d{11}$/.test(id))return toast("أدخل الاسم ورقماً وطنياً من 11 رقماً.");
    S.user={name:n,nid:id,verified:false,badge:"م-"+(1000+Math.floor(Math.random()*8999)),ref:"DP-"+(100000+Math.floor(Math.random()*899999))};audit("REGISTER","تسجيل حساب جديد (الرقم الوطني محفوظ مشفّراً لدى الوزارة)",{who:S.user.badge});save();render()});
  on("#otpBtn",()=>{if($("#otp").value!=="123456")return toast("الرمز غير صحيح.");S.user.verified=true;audit("KYC","توثيق الهوية بنجاح",{who:S.user.badge});save();render()});
  on("#topBtn",()=>{const v=Number($("#topup").value);S.deposits.push({id:S.deposits.length+1,who:me(),ref:S.user.ref,amount:v,status:"pending",t:Date.now()});audit("DEPOSIT_CLAIM","إعلان إيداع بانتظار تأكيد الوزارة",{who:me(),ref:S.user.ref,amount:v});save();toast("أُرسل الإعلان للوزارة، بانتظار التأكيد");render()});
  document.querySelectorAll("[data-dep]").forEach(b=>b.onclick=()=>{const d=S.deposits.find(x=>x.id==b.dataset.dep);const ok=b.dataset.act==="ok";d.status=ok?"confirmed":"rejected";if(ok&&d.who===me())S.wallet+=d.amount;audit(ok?"DEPOSIT_CONFIRM":"DEPOSIT_REJECT",ok?"تأكيد إيداع من موظف الوزارة بعد مطابقته مع كشف البنك":"رفض إعلان إيداع",{who:d.who,ref:d.ref,amount:d.amount});save();render()});
  on("#nBtn",()=>{const cat=$("#nCat").value,fx=cat==="regular",g=$("#nGov").value,num=$("#nNum").value.trim(),st=Number($("#nStart").value),inc=Number($("#nInc").value),mn=Number($("#nMin").value);
    if(!num||st<=0||(!fx&&(inc<=0||mn<=0)))return toast("تحقق من الحقول.");
    const id=Math.max(...S.auctions.map(a=>a.id))+1;S.auctions.push({id,gov:g,num,cat,start:st,inc:fx?0:inc,deposit:Math.round(st*.1),ends:fx?Date.now()+1e12:Date.now()+mn*60000,status:"open",bids:[],winner:null,extended:0,proxies:{},fixed:fx});
    audit("CREATE",fx?"عرض لوحة بسعر ثابت":"إنشاء مزاد جديد",{auction:id,plate:g+" "+num,start:st,cat});save();toast("تم نشر المزاد");render()});
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{const a=S.auctions.find(x=>x.id==b.dataset.close);a.ends=Date.now();closeAuction(a);render()});
  const stf=$("#stFile");if(stf)stf.onchange=()=>{const f=stf.files[0];if(!f)return;const r=new FileReader();r.onload=()=>processStatement(String(r.result),f.name);r.readAsText(f)};
  on("#stSample",()=>{const p=S.deposits.filter(d=>d.status==="pending");const lines=["date,amount,description","2026-12-02,250000,حوالة DP-000000","2026-12-02,1200,رسوم بنكية"];
    p.forEach((d,i)=>lines.push("2026-12-02,"+(i===1?d.amount-1000:d.amount)+",حوالة "+d.ref));if(p[0])lines.push("2026-12-03,"+p[0].amount+",حوالة "+p[0].ref);
    const b=new Blob([String.fromCharCode(65279)+lines.join(String.fromCharCode(10))],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="bank-statement-sample.csv";a.click();toast("نُزّل ملف تجريبي: فيه سطر مطابق وآخر بمبلغ خاطئ ورمز غير موجود وتكرار")});
  on("#vBtn",async()=>{await auditQueue;const r=await verifyChain();$("#vRes").innerHTML=r.ok?`<span class="ok">السلسلة سليمة (${fmt(r.count)} سجلاً).</span>`:`<span class="bad">تم اكتشاف تلاعب عند السجل رقم ${r.at}!</span>`});
  on("#tBtn",async()=>{await auditQueue;const e=S.log.find(x=>x.type==="BID")||S.log[1];if(!e)return;e.detail="(تم تعديله خفية)";save();toast("عُدّل سجل قديم، اضغط التحقق.")});
}
window.addEventListener("hashchange",render);
load();
/* الجولة الأولى: بعض المزايدات الوهمية الأولية لتبدو المنصة حيّة */
if(!S.auctions.some(a=>a.bids.length)){S.auctions.filter(a=>!a.fixed).slice(0,4).forEach((a,i)=>{for(let k=0;k<2+i;k++)placeBid(a,nextMin(a),S.bots[(k+i)%S.bots.length])});save();}
render();

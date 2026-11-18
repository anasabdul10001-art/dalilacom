// Chapters: inventory, sale invoice, purchases, customers and suppliers.
const { sleep, vis } = require("./lib.cjs");
const ask = async (b, text) => { await b.waitFor(`document.querySelector('.ui-ask input')`); await sleep(500); await b.fillBy(`document.querySelector('.ui-ask input')`, text); await b.clickText("حفظ", ".ui-ask button"); await sleep(1800); };
const pick = async (b, text) => { await b.waitFor(`document.querySelector('.ui-ask [data-v]')`); await sleep(900); await b.clickText(text, ".ui-ask button"); await sleep(1800); };
const rowBtn = (b, prod, label) => b.click(`(() => { const rows = ${vis(".site .title-line")}.filter(r => r.innerText.includes(${JSON.stringify(prod)})); const r = rows[rows.length-1]; return [...r.querySelectorAll('button')].find(x => x.innerText.trim() === ${JSON.stringify(label)}); })()`);
const PRODUCTS = [
  ["6281001", "أرز مصري 1 كغ", "3.5", "2.4", "40"],
  ["6281002", "سكر ناعم 1 كغ", "2.2", "1.6", "60"],
  ["6281003", "زيت دوّار الشمس 1 لتر", "4.8", "3.9", "25"],
  ["6281004", "شاي أحمد 450 غ", "6.5", "5", "18"],
];
async function inventory(b) {
  await b.tab("المخزون"); await sleep(2000);
  for (const p of PRODUCTS) {
    for (let i = 0; i < 5; i++) await b.fill(i, p[i]);
    await b.clickText("إضافة المنتج للجرد", "button"); await sleep(2200);
  }
  await b.scrollBy(700, 1500); await sleep(1500);
  // change a cost price
  await rowBtn(b, "شاي", "تعديل تكلفة الشراء"); await ask(b, "5.2");
  // low-stock alert threshold: above the quantity, so the alert shows
  await rowBtn(b, "شاي", "حد التنبيه"); await ask(b, "20");
  await b.scrollBy(-900, 1500); await sleep(2500);
  // stock in / stock out
  await b.scrollBy(900, 1200);
  await rowBtn(b, "أرز", "+"); await ask(b, "10");
  await rowBtn(b, "أرز", "−"); await ask(b, "2");
  // the movement history of a product
  await rowBtn(b, "أرز", "الحركات"); await sleep(3500);
  await b.clickText("إغلاق", "button"); await sleep(800);
}
async function stockCount(b) {
  await b.tab("المخزون"); await sleep(800);
  await b.clickText("جرد فعلي", "button"); await sleep(1800);
  await b.scrollBy(300, 1000);
  await b.shot("count");
}

module.exports = { pick, ask, rowBtn, PRODUCTS, inventory, stockCount };

// ---- sale invoice
const fld = (label) => `${vis('.site .field')}.find(f => f.querySelector('label') && f.querySelector('label').innerText.includes(${JSON.stringify(label)})).querySelector('input,select,textarea')`;
const selById = (id) => `document.getElementById(${JSON.stringify(id)})`;
async function sale(b) {
  await b.tab("فاتورة بيع"); await sleep(1500);
  await b.setSelect(selById("sale-product"), "أرز"); await b.fillBy(selById("sale-qty"), "3");
  await b.clickText("أضف للفاتورة", "button"); await sleep(1400);
  await b.setSelect(selById("sale-product"), "سكر"); await b.fillBy(selById("sale-qty"), "2");
  await b.clickText("أضف للفاتورة", "button"); await sleep(1400);
  // by barcode
  await b.fillBy(selById("sale-barcode"), "6281003");
  await b.clickText("أضف بالباركود", "button"); await sleep(1800);
  await b.scrollBy(500, 1200);
  // a registered-by-name customer who pays only part (the rest is a debt), a percentage discount, the payment method and the sales channel
  await b.setSelect(fld("الزبون (للبيع"), "أم خالد");
  await b.fillBy(fld("المدفوع"), "12");
  await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("حسم بالنسبة")))`, "حسم بالنسبة (%)");
  await b.fillBy(selById("sale-discount"), "5");
  await b.setSelect(fld("طريقة الدفع"), "بنك"); await sleep(900); await b.setSelect(fld("طريقة الدفع"), "نقداً");
  await b.setSelect(fld("وين "), "بيع بالشارع"); await sleep(900); await b.setSelect(fld("وين "), "المحل");
  await b.scrollBy(400, 1000); await sleep(1500);
  await b.clickText("حفظ الفاتورة", "button"); await sleep(3000);
  await sleep(3000); await b.shot("sale-saved");
  // a return from the saved invoice
  await b.scrollBy(300, 800);
  await b.clickText("مرتجع", ".site button"); await sleep(1800); await b.shot("sale-return");
  await b.fillBy(`document.querySelector(".ui-ask .ret-in")`, "1");
  await sleep(800); await b.clickText("تسجيل المرتجع", ".ui-ask button"); await sleep(3000);
}
module.exports.sale = sale;

// ---- customers and suppliers
async function parties(b) {
  await b.tab("الزبائن والموردين"); await sleep(1500);
  await b.fill(0, "أم خالد"); await b.fill(1, "0933111222"); await b.clickText("إضافة", ".site button"); await sleep(2200);
  await b.fill(0, "أبو يوسف"); await b.fill(1, "0944555666"); await b.clickText("إضافة", ".site button"); await sleep(2200);
  await b.shot("parties-cust");
  await b.clickText("الموردين", ".site button"); await sleep(1500);
  await b.fill(0, "مستودع الشام للجملة"); await b.fill(1, "0955777888"); await b.clickText("إضافة", ".site button"); await sleep(2200);
  await b.shot("parties-sup");
  console.log(await b.ev(`document.querySelector('.site').innerText.slice(-700)`));
}
module.exports.parties = parties;

// ---- purchases from a supplier
async function purchases(b) {
  await b.tab("المشتريات"); await sleep(1500);
  await b.setSelect(selById("buy-product"), "أرز"); await b.fillBy(selById("buy-qty"), "50"); await b.fillBy(selById("buy-cost"), "2.3");
  await b.clickText("أضف للفاتورة", "button"); await sleep(1400);
  await b.setSelect(selById("buy-product"), "سكر"); await b.fillBy(selById("buy-qty"), "30"); await b.fillBy(selById("buy-cost"), "1.5");
  await b.clickText("أضف للفاتورة", "button"); await sleep(1400);
  await b.scrollBy(500, 1200);
  await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("بدون مورد")))`, "مستودع الشام للجملة");
  await b.fillBy(fld("المبلغ المدفوع"), "60");
  await b.fillBy(fld("ملاحظة"), "دفعة أولى والباقي آجل");
  await b.scrollBy(400, 1000); await sleep(1200);
  await b.clickText("حفظ فاتورة الشراء", "button"); await sleep(3200); await b.shot("buy-saved");
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(-500));
  console.log(await b.ev(`${vis(".site .field label")}.map(x=>x.innerText).join("|")`));
}
module.exports.purchases = purchases;

async function statement(b) {
  await b.tab("الزبائن والموردين"); await sleep(1200);
  await b.clickText("كشف الحساب", ".site button"); await sleep(2200); await b.shot("stmt");
  console.log((await b.ev(`document.body.innerText`)).slice(-700));
}
module.exports.statement = statement;

// ---- a sale made by the distributor from his own stock
async function saleDistributor(b) {
  await b.tab("فاتورة بيع"); await sleep(1500);
  const cur = await b.ev(`!!${vis(".site button")}.find(x => x.innerText.includes("فاتورة جديدة"))`);
  if (cur) { await b.clickText("فاتورة جديدة", "button"); await sleep(1200); }
  await b.setSelect(fld("وين "), "موزّع"); await sleep(1200);
  await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("موزّع الريف")))`, "موزّع الريف"); await sleep(1200);
  await b.setSelect(selById("sale-product"), "أرز"); await b.fillBy(selById("sale-qty"), "4");
  await b.clickText("أضف للفاتورة", "button"); await sleep(1400);
  await b.scrollBy(900, 1200);
  await b.shot("sale-dist");
  await b.clickText("حفظ الفاتورة", "button"); await sleep(3000);
  console.log((await b.ev(`document.querySelector('.site').innerText`)).slice(300, 900));
}
module.exports.saleDistributor = saleDistributor;

// ---- the account statement of one customer or supplier: record a payment
async function partyStatement(b, tabLabel, name, pay, method = "نقداً", charge = "") {
  await b.tab("الزبائن والموردين"); await sleep(1200);
  if (await b.ev(`!!${vis(".site button")}.find(x => x.innerText.includes("رجوع للقائمة"))`)) { await b.clickText("رجوع للقائمة", ".site button"); await sleep(1500); }
  await b.click(`${vis(".site button")}.find(x => x.innerText.trim() === ${JSON.stringify(tabLabel)})`); await sleep(1500);
  await b.click(`(() => { const rows = ${vis(".site div")}.filter(d => d.innerText.includes(${JSON.stringify(name)}) && d.querySelector("button") && [...d.querySelectorAll("button")].some(x => x.innerText.includes("كشف الحساب"))).sort((a, c) => a.innerText.length - c.innerText.length); return [...rows[0].querySelectorAll("button")].find(x => x.innerText.includes("كشف الحساب")); })()`);
  await sleep(2500);
  await b.clickText("تسجيل دفعة", ".site button"); await ask(b, pay); await pick(b, method); await sleep(2000);
  if (charge) { await b.clickText("دين أو رصيد سابق", ".site button"); await ask(b, charge); await pick(b, "نعم").catch(() => {}); await sleep(2000); }
  await b.scrollBy(300, 900); await sleep(1500);
  await b.shot("party-stmt");
}
module.exports.partyStatement = partyStatement;

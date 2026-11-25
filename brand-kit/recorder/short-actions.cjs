// What happens on screen in the short clips 3 and later (clips 1 and 2 are in short.cjs). Every key is a "do" in a clip's JSON.
const { vis } = require("./lib.cjs");
const { fld, byId, setDate, daysAgo, card: locCard } = require("./ch-b.cjs");
const { ask, pick, rowBtn } = require("./ch-a.cjs");

module.exports = ({ sleep, uncard, id, button, tabClick, addProduct, PREP }) => {
  const EMAIL = `demo.shop.${Date.now()}@example.test`;
  const tab = (label) => (b) => tabClick(b, label);
  const scroll = (y) => (b) => b.scrollBy(y, 1500);
  const top = async (b) => { await b.ev(`window.scrollTo({top:0,behavior:"smooth"})`); await sleep(1200); };
  const sel = (label, value) => (b) => b.setSelect(fld(label), value);
  const fill = (elementId, value) => (b) => b.fillBy(id(elementId), value);
  const press = (label) => async (b) => { await sleep(900); await button(b, label); await sleep(900); };
  const typeIn = (label, value) => (b) => b.fillBy(fld(label), value);

  // ---- data that must exist before the camera starts
  const sell = async (b, qty) => {
    await b.tab("فاتورة بيع"); await sleep(1500);
    await b.setSelect(id("sale-product"), "أرز"); await b.fillBy(id("sale-qty"), qty); await button(b, "أضف إلى الفاتورة");
    await button(b, "حفظ الفاتورة"); await sleep(1500);
  };
  const addParty = async (b, name, phone) => { await b.fill(0, name); await b.fill(1, phone); await button(b, "إضافة"); await sleep(1200); };
  const parties = async (b) => {
    await b.tab("الزبائن والموردون"); await sleep(1500);
    await addParty(b, "أم خالد", "0933111222");
    await b.clickText("الموردون", ".site button"); await sleep(1500);
    await addParty(b, "مستودع الشام للجملة", "0955777888");
  };
  const expense = async (b, cat, desc, amount) => {
    await b.tab("إضافة حركة"); await sleep(1200);
    await b.setSelect(fld("نوع الحركة"), "المصاريف"); await b.setSelect(fld("طريقة الدفع"), "نقدًا");
    await b.fillBy(byId("acc-category"), cat); await b.fillBy(byId("acc-description"), desc); await b.fillBy(byId("acc-amount"), amount);
    await button(b, "حفظ"); await sleep(1500);
  };
  const buy = async (b, paid) => {
    await b.tab("المشتريات"); await sleep(1500);
    await b.setSelect(id("buy-product"), "أرز"); await b.fillBy(id("buy-qty"), "50"); await b.fillBy(id("buy-cost"), "2.5"); await button(b, "أضف إلى الفاتورة");
    await b.setSelect(supplierSelect, "مستودع الشام للجملة"); await b.fillBy(fld("المبلغ المدفوع"), paid);
    await button(b, "حفظ فاتورة الشراء"); await sleep(1800);
  };
  const supplierSelect = `${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("بدون مورد")))`;
  const withParties = async (b) => { await PREP.twoProducts(b); await parties(b); };

  Object.assign(PREP, {
    withParties,
    supplierDebt: async (b) => { await withParties(b); await buy(b, "60"); },
    oneSale: async (b) => { await PREP.twoProducts(b); await sell(b, "3"); },
    saleAndExpense: async (b) => { await PREP.twoProducts(b); await sell(b, "10"); await expense(b, "كهرباء", "فاتورة الكهرباء", "5"); },
  });

  // ---- customer / supplier statement
  const listOf = async (b, which) => {
    await tabClick(b, "الزبائن والموردون");
    await b.waitFor(`${vis(".site button")}.some(x => x.innerText.trim() === ${JSON.stringify(which)})`);
    await b.clickText(which, ".site button"); await sleep(1500);
  };
  const statement = (name) => (b) => b.click(`(() => { const rows = ${vis(".site div")}.filter(d => d.innerText.includes(${JSON.stringify(name)}) && [...d.querySelectorAll("button")].some(x => x.innerText.includes("كشف الحساب"))).sort((a, c) => a.innerText.length - c.innerText.length); return [...rows[0].querySelectorAll("button")].find(x => x.innerText.includes("كشف الحساب")); })()`);

  const ACTIONS = {
    // 3 expenses
    openMoves: tab("إضافة حركة"),
    moveType: sel("نوع الحركة", "المصاريف"),
    movePay: sel("طريقة الدفع", "نقدًا"),
    moveCategory: fill("acc-category", "كهرباء"),
    moveDesc: fill("acc-description", "فاتورة الكهرباء"),
    moveAmount: fill("acc-amount", "45"),
    moveSave: press("حفظ"),
    openSummary: async (b) => { await top(b); await tabClick(b, "الملخص"); await sleep(1200); },
    scroll: scroll(420),
    scrollMore: scroll(520),
    scrollTop: top,
    wait: async () => {},
    // 4 purchases
    openBuy: tab("المشتريات"),
    buyProduct: (b) => b.setSelect(id("buy-product"), "أرز"),
    buyQty: fill("buy-qty", "50"),
    buyCost: fill("buy-cost", "2.5"),
    buyLine: press("أضف إلى الفاتورة"),
    buySupplier: async (b) => { await b.scrollBy(350, 1200); await b.setSelect(supplierSelect, "مستودع الشام للجملة"); },
    buyPaid: typeIn("المبلغ المدفوع", "60"),
    buySave: press("حفظ فاتورة الشراء"),
    openStockAfter: async (b) => { await top(b); await tabClick(b, "المخزون"); await b.scrollBy(420, 1500); },
    // 5 customer debt
    openSaleTab: tab("فاتورة بيع"),
    debtLine: async (b) => { await b.setSelect(id("sale-product"), "أرز"); await b.fillBy(id("sale-qty"), "10"); await button(b, "أضف إلى الفاتورة"); },
    debtCustomer: async (b) => { await b.setSelect(fld("الزبون (للبيع"), "أم خالد"); },
    debtPaid: typeIn("المدفوع", "20"),
    debtSave: press("حفظ الفاتورة"),
    openCustomers: async (b) => { await top(b); await listOf(b, "الزبائن"); },
    customerStatement: statement("أم خالد"),
    payButton: (b) => b.clickText("تسجيل دفعة", ".site button"),
    payAmount: (b) => ask(b, "10"),
    payMethod: (b) => pick(b, "نقدًا"),
    // 6 supplier payment
    openSuppliers: (b) => listOf(b, "الموردون"),
    supplierStatement: statement("مستودع الشام"),
    supplierAmount: (b) => ask(b, "40"),
    supplierMethod: (b) => pick(b, "بنك"),
    // 7 customer return
    returnButton: async (b) => { await b.scrollBy(500, 1500); await b.clickText("مرتجع", ".site button"); },
    returnQty: (b) => b.fillBy(`document.querySelector(".ui-ask .ret-in")`, "1"),
    returnSave: async (b) => { await sleep(900); await b.clickText("تسجيل المرتجع", ".ui-ask button"); await sleep(1800); },
    // 8 stock count and low stock
    openStockTab: tab("المخزون"),
    limitButton: async (b) => { await b.scrollBy(420, 1500); await rowBtn(b, "سكر", "حد التنبيه"); },
    limitValue: (b) => ask(b, "70"),
    countButton: (b) => b.clickText("جرد فعلي", "button"),
    countFill: async (b) => {
      const box = `${vis(".site div")}.filter(d => d.innerText.includes("تطبيق الجرد") && d.querySelector("input")).sort((a, c) => a.innerText.length - c.innerText.length)[0]`;
      await b.fillBy(`(${box}).querySelectorAll("input")[0]`, "39");
    },
    countApply: async (b) => { await sleep(900); await b.clickText("تطبيق الجرد", ".site button"); await sleep(2000); },
    // 9 daily cash drawer
    drawer: scroll(520),
    openingButton: (b) => b.clickText("تغيير رصيد البداية", ".site button"),
    openingValue: (b) => ask(b, "100"),
    counted: fill("acc-cash-counted", "130"),
    closeDay: press("إقفال اليوم"),
    // 10 profit
    openReports: tab("التقارير"),
    periodWeek: (b) => b.clickText("آخر 7 أيام", ".site button"),
    periodMonth: (b) => b.clickText("هذا الشهر", ".site button"),
    // 11 recurring
    openRecurring: tab("المتكررة"),
    recKind: async (b) => { await b.setSelect(fld("النوع"), "المصاريف"); await b.setSelect(fld("التكرار"), "كل شهر"); },
    recPay: sel("طريقة الدفع", "بنك"),
    recText: async (b) => { await b.fillBy(byId("rec-category"), "إيجار"); await b.fillBy(byId("rec-description"), "إيجار المحل"); },
    recAmount: fill("rec-amount", "300"),
    recStart: (b) => setDate(b, byId("rec-start"), daysAgo(65)),
    recBackfill: (b) => b.click(byId("rec-backfill")),
    recAdd: press("إضافة حركة متكررة"),
    // 12 distributor
    openLocations: tab("الفروع والموزّعين"),
    locName: fill("loc-name", "موزّع الريف"),
    locType: sel("النوع", "موزّع"),
    locAdd: press("أضف"),
    giveStock: async (b) => {
      const c = locCard("موزّع الريف"); await b.waitFor(c, 25000);
      await b.setSelect(`${c}.querySelector("select")`, "أرز"); await b.fillBy(`${c}.querySelector("input")`, "10");
    },
    giveButton: async (b) => { const c = locCard("موزّع الريف"); await b.click(`[...${c}.querySelectorAll("button")].find(x => x.innerText.trim() === "وزّع عليه")`); await sleep(2200); },
    distSale: async (b) => {
      await top(b); await tabClick(b, "فاتورة بيع");
      await b.setSelect(fld("أين "), "موزّع"); await sleep(900);
      await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("موزّع الريف")))`, "موزّع الريف");
    },
    distLine: async (b) => { await b.setSelect(id("sale-product"), "أرز"); await b.fillBy(id("sale-qty"), "4"); await button(b, "أضف إلى الفاتورة"); },
    distSave: async (b) => { await b.scrollBy(600, 1200); await button(b, "حفظ الفاتورة"); await sleep(1500); },
    settleView: async (b) => {
      await top(b); await tabClick(b, "المخزون"); await tabClick(b, "الفروع والموزّعين");
      await b.waitFor(locCard("موزّع الريف"), 25000); await b.scrollBy(600, 1500);
    },
    handover: async (b) => { await b.fillBy(`document.querySelector('[id^="loc-h-"]')`, "10"); await button(b, "استلام"); await sleep(1500); },
    // 13 staff
    openStaff: tab("الموظفون"),
    staffName: fill("staff-name", "سامر العلي"),
    staffRole: sel("الدور", "كاشير"),
    staffPay: async (b) => { await b.fillBy(byId("staff-rate"), "2"); await b.fillBy(byId("staff-fixed"), "150"); },
    staffAdd: press("إضافة موظف"),
    invite: async (b) => { await sleep(900); await b.clickText("رمز دعوة", ".site button"); await sleep(2000); },
    // 14 open an account and start the free trial (recorded from the very first screen)
    city: async (b) => {
      await uncard(b); await b.waitFor(`document.getElementById("city-q")`);
      await b.setSelect(`document.getElementById("city-country")`, "سوريا"); await sleep(800);
      await b.fillBy(`document.getElementById("city-q")`, "دمشق");
      await b.waitFor(`document.querySelector(".city-result")`); await b.click(`document.querySelector(".city-result")`);
      await b.waitFor(`!document.querySelector(".city-gate")`); await sleep(2500);
    },
    accountant: async (b) => {
      await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2500);
      if (!(await b.ev(`document.body.innerText.includes("إنشاء حساب")`))) await b.clickText("المحاسب", "button,a,[role=button]");
    },
    register: async (b) => { await b.clickText("إنشاء حساب", "button,a,[role=button]"); await sleep(2200); await b.clickText("لدي نشاط", "button,[role=button]"); },
    myName: (b) => b.fillBy(`${vis("input#f-name")}[0]`, "أبو سامر للمواد الغذائية"),
    myEmail: (b) => b.fillBy(`${vis('input[type="email"],input[placeholder="name@example.com"]')}[0]`, EMAIL),
    myPassword: (b) => b.fillBy(`${vis('input[type="password"]')}[0]`, "Demo-pass-2026!"),
    myPlace: async (b) => {
      await b.scrollBy(300, 900);
      await b.setSelect(`${vis("select")}[0]`, "سوريا"); await b.setSelect(`${vis("select")}[1]`, "دمشق"); await b.setSelect(`${vis("select")}[2]`, "دمشق");
      await b.scrollBy(420, 1100);
    },
    agree: (b) => b.click(`${vis('input[type="checkbox"]')}[0]`),
    createAccount: async (b) => { await b.clickText("إنشاء الحساب", "button"); await sleep(3500); },
    openPlans: async (b) => {
      await b.goto("http://localhost:4000/app/"); await sleep(1500);
      await b.waitFor(b.byText("المحاسب", "button,a,[role=button]"));
      await b.clickText("المحاسب", "button,a,[role=button]"); await sleep(2200);
      await b.clickText("افتح لوحة المحاسب", "button,a"); await sleep(2200);
      await b.clickText("شاهد الباقات", "button,a"); await sleep(1500); await b.scrollBy(600, 1500);
    },
    startTrial: async (b) => {
      await b.click(`(() => { const btns = ${vis("button")}.filter(x => x.innerText.includes("ابدأ التجربة")); return btns.find(x => { let e = x; for (let i = 0; i < 5 && e; i++) { e = e.parentElement; if (e && (e.innerText || "").includes("المحاسبة – شهري") && !(e.innerText || "").includes("المحاسبة – سنوي")) return true; } return false; }); })()`);
      await sleep(3000);
    },
  };
  return { PREP, ACTIONS };
};

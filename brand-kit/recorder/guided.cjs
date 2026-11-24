// Guided walkthrough chapters: every action is a step the narration describes (the recorder logs each click / field / choice).
// b.note(text) = an explanation sentence (spoken at that moment); b.setQuiet(true) = repeated actions that are not narrated again.
const { sleep, vis } = require("./lib.cjs");
const { money: $ } = require("./ru-map.cjs");
const A = require("./ch-a.cjs"), B = require("./ch-b.cjs");
const { ask, pick, rowBtn, PRODUCTS } = A; const { fld, byId, setDate, daysAgo, card } = B;
const selById = (id) => `document.getElementById(${JSON.stringify(id)})`;
const idle = (ms) => sleep(ms);
const safe = async (b, fn) => { try { await fn(); } catch (e) { console.log("   (skipped step:", e.message.slice(0, 120) + ")"); } };

async function inventory(b) {
  await b.tab("المخزون"); await idle(1500);
  b.note("هنا تسجّل بضاعتك. كل منتج له باركود واسم وسعر بيع وتكلفة شراء وكمية. نبدأ بإضافة أول منتج.");
  await idle(2500);
  for (let k = 0; k < PRODUCTS.length; k++) {
    b.setQuiet(k > 0);
    for (let i = 0; i < 5; i++) await b.fill(i, PRODUCTS[k][i]);
    await b.clickText("إضافة المنتج إلى الجرد", "button"); await idle(2200);
    if (k === 0) b.note("وبالطريقة نفسها نضيف بقية المنتجات: أرز، سكر، زيت، وشاي.");
  }
  b.setQuiet(false);
  await b.scrollBy(700, 1500); await idle(1500);
  b.note("لاحظ أن كل منتج له أزرار: بيع، تعديل تكلفة الشراء، حد التنبيه، ضريبة، الحركات، وزيادة أو إنقاص الكمية.");
  await idle(4500);
  b.note("إذا تغيّر سعر الشراء، عدّل التكلفة من هنا، فيبقى حساب ربحك صحيحاً.");
  await rowBtn(b, "شاي", "تعديل تكلفة الشراء"); await ask(b, $("5.2"));
  b.note("وحدّد حد التنبيه: عندما تنزل الكمية إلى هذا الرقم، ينبّهك الموقع أن البضاعة قاربت على النفاد.");
  await rowBtn(b, "شاي", "حد التنبيه"); await ask(b, "20");
  await b.scrollBy(-900, 1500); await idle(1500);
  b.note("وهذا هو التنبيه، يظهر لك في أعلى صفحة المخزون.");
  await idle(3500);
  await b.scrollBy(900, 1200);
  await rowBtn(b, "أرز", "+"); await ask(b, "10");
  await rowBtn(b, "أرز", "−"); await ask(b, "2");
  b.note("وهذا سجل حركات المنتج، يعرض كل دخول وكل خروج وسببه.");
  await rowBtn(b, "أرز", "الحركات"); await idle(4000);
  await b.silent(() => b.clickText("إغلاق", "button")); await idle(800);
}
async function stockCount(b) {
  await b.tab("المخزون"); await idle(800);
  b.note("وعند الجرد، اضغط جرد فعلي، واكتب الكمية التي عددتها على الرف لكل منتج. أي فرق يُسجَّل في سجل الحركات.");
  await b.clickText("جرد فعلي", "button"); await idle(1800);
  await safe(b, async () => {
    const box = `${vis(".site div")}.filter(d => d.innerText.includes("تطبيق الجرد") && d.querySelector("input")).sort((a, c) => a.innerText.length - c.innerText.length)[0]`;
    const inputs = await b.ev(`(${box}).querySelectorAll("input").length`);
    for (let i = 0; i < Math.min(inputs, 2); i++) await b.fillBy(`(${box}).querySelectorAll("input")[${i}]`, i === 0 ? "7" : "58");
    await b.clickText("تطبيق الجرد", ".site button"); await idle(2500);
  });
}
async function parties(b) {
  await b.tab("الزبائن والموردون"); await idle(1500);
  b.note("قبل البيع بالدين، سجّل زبائنك وموردّيك. اكتب الاسم ورقم الهاتف، ثم اضغط إضافة.");
  await b.fill(0, "أم خالد"); await b.fill(1, "0933111222"); await b.clickText("إضافة", ".site button"); await idle(2200);
  b.setQuiet(true);
  await b.fill(0, "أبو يوسف"); await b.fill(1, "0944555666"); await b.clickText("إضافة", ".site button"); await idle(2200);
  b.setQuiet(false);
  b.note("ثم انتقل إلى قائمة الموردين، وأضف المورّد بالطريقة نفسها.");
  await b.silent(() => b.clickText("الموردون", ".site button")); await idle(1500);
  await b.fill(0, "مستودع الشام للجملة"); await b.fill(1, "0955777888"); await b.clickText("إضافة", ".site button"); await idle(2200);
}
async function sale(b) {
  await b.tab("فاتورة بيع"); await idle(1500);
  b.note("هذه فاتورة البيع. اختر المنتج، وحدّد الكمية، ثم أضفه إلى الفاتورة.");
  await b.setSelect(selById("sale-product"), "أرز"); await b.fillBy(selById("sale-qty"), "3");
  await b.clickText("أضف إلى الفاتورة", "button"); await idle(1400);
  b.setQuiet(true);
  await b.setSelect(selById("sale-product"), "سكر"); await b.fillBy(selById("sale-qty"), "2");
  await b.clickText("أضف إلى الفاتورة", "button"); await idle(1400);
  b.setQuiet(false);
  b.note("وإن كان عندك باركود المنتج، اكتبه هنا، ويُضاف المنتج تلقائياً.");
  await b.fillBy(selById("sale-barcode"), "6281003");
  await b.clickText("أضف بالباركود", "button"); await idle(1800);
  await b.scrollBy(500, 1200);
  b.note("الآن بيانات الفاتورة. اختر الزبون من القائمة.");
  await b.setSelect(fld("الزبون (للبيع"), "أم خالد");
  b.note("إذا دفع الزبون جزءاً من المبلغ فقط، اكتب المبلغ المدفوع، والباقي يُسجَّل ديناً عليه.");
  await b.fillBy(fld("المدفوع"), $("12"));
  await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("حسم بالنسبة")))`, "حسم بالنسبة (%)");
  b.note("ويمكنك إضافة خصم، بالمبلغ أو بالنسبة المئوية.");
  await b.fillBy(selById("sale-discount"), "5");
  await b.setSelect(fld("طريقة الدفع"), "بنك"); await sleep(700); await b.setSelect(fld("طريقة الدفع"), "نقدًا");
  b.note("اختر طريقة الدفع: نقداً، أو بنك، أو محفظة. وحدّد أين تمّ البيع: في المحل، أو في الشارع، أو عبر موزّع.");
  await b.setSelect(fld("أين "), "بيع في الشارع"); await sleep(700); await b.setSelect(fld("أين "), "المحل");
  await b.scrollBy(400, 1000); await idle(1500);
  b.note("لاحظ الأرقام: المجموع، والإجمالي بعد الخصم، والمتبقي على الزبون. ثم احفظ الفاتورة.");
  await idle(2500);
  await b.clickText("حفظ الفاتورة", "button"); await idle(3000);
  b.note("تم الحفظ. الفاتورة أنقصت المخزون، وسجّلت الدخل وتكلفة البضاعة تلقائياً. ويمكنك طباعتها من هنا.");
  await idle(3500);
  await b.scrollBy(300, 800);
  b.note("وإذا أعاد الزبون شيئاً، اضغط مرتجع، واكتب الكمية المُعادة، ثم سجّل المرتجع. يعود المخزون والمبلغ تلقائياً.");
  await b.clickText("مرتجع", ".site button"); await idle(1800);
  await b.fillBy(`document.querySelector(".ui-ask .ret-in")`, "1");
  await idle(800); await b.clickText("تسجيل المرتجع", ".ui-ask button"); await idle(3000);
}
async function purchases(b) {
  await b.tab("المشتريات"); await idle(1500);
  b.note("وعندما تشتري بضاعة من مورّد، تسجّل ذلك هنا. اختر المنتج، واكتب الكمية، وتكلفة الوحدة.");
  await b.setSelect(selById("buy-product"), "أرز"); await b.fillBy(selById("buy-qty"), "50"); await b.fillBy(selById("buy-cost"), $("2.3"));
  await b.clickText("أضف إلى الفاتورة", "button"); await idle(1400);
  b.setQuiet(true);
  await b.setSelect(selById("buy-product"), "سكر"); await b.fillBy(selById("buy-qty"), "30"); await b.fillBy(selById("buy-cost"), $("1.5"));
  await b.clickText("أضف إلى الفاتورة", "button"); await idle(1400);
  b.setQuiet(false);
  await b.scrollBy(500, 1200);
  await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("بدون مورد")))`, "مستودع الشام للجملة");
  b.note("اكتب المبلغ الذي دفعته الآن. الباقي يُسجَّل ديناً للمورّد.");
  await b.fillBy(fld("المبلغ المدفوع"), $("60"));
  await b.fillBy(fld("ملاحظة"), "دفعة أولى والباقي آجل");
  await b.scrollBy(400, 1000); await idle(1200);
  await b.clickText("حفظ فاتورة الشراء", "button"); await idle(3200);
  b.note("بعد الحفظ، تزيد كميات المخزون، وتتحدّث تكلفة المنتجات تلقائياً.");
  await idle(3000);
}
async function partyStatement(b, tabLabel, name, pay, method = "نقدًا", charge = "") {
  await b.tab("الزبائن والموردون"); await idle(1200);
  if (await b.ev(`!!${vis(".site button")}.find(x => x.innerText.includes("رجوع للقائمة"))`)) { await b.silent(() => b.clickText("رجوع للقائمة", ".site button")); await idle(1500); }
  await b.waitFor(`${vis(".site button")}.some(x => x.innerText.trim() === ${JSON.stringify(tabLabel)})`, 20000); // 4K renders slower: wait for the loaded list
  await b.silent(() => b.click(`${vis(".site button")}.find(x => x.innerText.trim() === ${JSON.stringify(tabLabel)})`)); await idle(1500);
  await b.click(`(() => { const rows = ${vis(".site div")}.filter(d => d.innerText.includes(${JSON.stringify(name)}) && [...d.querySelectorAll("button")].some(x => x.innerText.includes("كشف الحساب"))).sort((a, c) => a.innerText.length - c.innerText.length); return [...rows[0].querySelectorAll("button")].find(x => x.innerText.includes("كشف الحساب")); })()`);
  await idle(2500);
  b.note(tabLabel === "الزبائن" ? "هذا كشف حساب الزبون: كل فاتورة وكل دفعة، والرصيد بعد كل حركة. عندما يدفع الزبون، اضغط تسجيل دفعة." : "وهذا كشف حساب المورّد. اضغط تسجيل دفعة لتسجّل ما سدّدته له.");
  await b.clickText("تسجيل دفعة", ".site button"); await ask(b, pay); await pick(b, method); await idle(2000);
  if (charge) { b.note("وإذا كان على الزبون دين قديم قبل استخدامك الموقع، سجّله كدين أو رصيد سابق."); await b.clickText("دين أو رصيد سابق", ".site button"); await ask(b, charge); await pick(b, "نعم").catch(() => {}); await idle(2000); }
  await b.scrollBy(300, 900); await idle(2500);
}
async function moves(b) {
  await b.tab("إضافة حركة"); await idle(1200);
  b.note("ليست كل حركات المال فواتير. هنا تسجّل المصاريف والدخل الأخرى، مثل الكهرباء وأجرة النقل.");
  const add = async (type, pay, cat, desc, amt) => {
    await b.setSelect(fld("نوع الحركة"), type); await b.setSelect(fld("طريقة الدفع"), pay);
    await b.fillBy(byId("acc-category"), cat); await b.fillBy(byId("acc-description"), desc); await b.fillBy(byId("acc-amount"), amt);
    await b.clickText("حفظ", ".site button"); await idle(2400);
  };
  await add("المصاريف", "نقدًا", "كهرباء", "فاتورة الكهرباء", $("45"));
  b.setQuiet(true); await add("المصاريف", "بنك", "نقل", "أجرة نقل بضاعة", $("30")); await add("الدخل", "محفظة", "خدمات", "عمولة تعبئة رصيد", $("18")); b.setQuiet(false);
  b.note("وبالطريقة نفسها سجّلنا مصروفاً آخر، ودخلاً من المحفظة.");
  await idle(2000);
}
async function recurring(b) {
  await b.tab("المتكررة"); await idle(1200);
  b.note("الإيجار والاشتراكات لا تحتاج أن تكتبها كل شهر. أضفها مرة واحدة هنا.");
  await b.setSelect(fld("النوع"), "المصاريف"); await b.setSelect(fld("التكرار"), "كل شهر"); await b.setSelect(fld("طريقة الدفع"), "بنك");
  await b.fillBy(byId("rec-category"), "إيجار"); await b.fillBy(byId("rec-description"), "إيجار المحل"); await b.fillBy(byId("rec-amount"), $("300"));
  b.mark("fill", { label: "تاريخ البداية", value: "تاريخ قبل شهرين" }); await setDate(b, byId("rec-start"), daysAgo(65));
  b.note("وإذا بدأ الإيجار قبل استخدامك الموقع، فعّل تسجيل الأشهر الماضية أيضاً.");
  await b.click(byId("rec-backfill")); await idle(800);
  await b.clickText("إضافة حركة متكررة", ".site button"); await idle(2800);
  await b.scrollBy(500, 1200); await idle(1500);
  b.note("ويمكنك إيقافها مؤقتاً، أو تغيير المبلغ إذا زاد الإيجار، أو حذفها.");
  await safe(b, async () => { await b.clickText("تغيير المبلغ", ".site button"); await ask(b, $("320")); });
  await idle(1500);
}
async function summary(b) {
  await b.tab("الملخص"); await idle(2500);
  if (process.env.VIDEO_LANG) await b.shot("hookshot-" + process.env.VIDEO_LANG); // background of the video hook (a full-size screenshot of the summary screen)
  b.note("هذا الملخص: إجمالي الدخل، والمصاريف، والصافي، وقيمة الجرد، وتنبيهات المخزون.");
  await b.scrollBy(500, 1500); await idle(3000);
  b.note("وهنا صندوق اليوم: رصيد البداية، وما قبضته نقداً، وما دفعته، والمبلغ المتوقع في الصندوق.");
  await b.scrollBy(500, 1500); await idle(2500);
  b.note("اكتب رصيد بداية اليوم، ثم عدّ النقد الموجود فعلاً، واكتب المبلغ، واضغط إقفال اليوم.");
  await b.clickText("تغيير رصيد البداية", ".site button"); await ask(b, $("200")); await idle(1500);
  await b.fillBy(byId("acc-cash-counted"), $("105"));
  await b.clickText("إقفال اليوم", ".site button"); await idle(2800);
  b.note("يعرض لك الموقع الفرق بين المتوقع والمعدود، زيادة أو نقصاً. ويمكنك إعادة فتح اليوم عند الحاجة.");
  await b.scrollBy(500, 1200); await idle(3000);
  b.note("وفي الأسفل آخر الحركات. يمكنك تعديل الحركات اليدوية أو حذفها.");
  await idle(2500);
}
async function locations(b) {
  await b.tab("الفروع والموزّعين"); await idle(2000);
  b.note("إذا كان لك أكثر من فرع، أو موزّعون يبيعون عنك، فأضفهم من هنا: اكتب الاسم، واختر النوع، ثم اضغط أضف.");
  await b.fillBy(byId("loc-name"), "فرع المزة"); await b.setSelect(fld("النوع"), "فرع");
  await b.clickText("أضف", ".site button"); await idle(2500);
  await b.fillBy(byId("loc-name"), "موزّع الريف"); await b.setSelect(fld("النوع"), "موزّع");
  await b.clickText("أضف", ".site button"); await idle(2500);
}
async function distribute(b) {
  await b.tab("الفروع والموزّعين"); await idle(1500);
  const c = card("موزّع الريف"); await b.waitFor(c, 25000); await idle(800);
  b.note("لتعطي الموزّع بضاعة من المستودع، اختر المنتج، واكتب الكمية، واضغط وزّع عليه.");
  await b.setSelect(`${c}.querySelector("select")`, "أرز");
  await b.fillBy(`${c}.querySelector("input")`, "10");
  await b.click(`[...${c}.querySelectorAll("button")].find(x => x.innerText.trim() === "وزّع عليه")`);
  await idle(2500);
}
async function saleDistributor(b) {
  b.note("الآن يبيع الموزّع من البضاعة التي معه. نذهب إلى فاتورة البيع، ونختار أن البيع تمّ عبر موزّع.");
  await b.tab("فاتورة بيع"); await idle(1500);
  if (await b.ev(`!!${vis(".site button")}.find(x => x.innerText.includes("فاتورة جديدة"))`)) { await b.silent(() => b.clickText("فاتورة جديدة", "button")); await idle(1200); }
  for (let i = 0; i < 3 && !(await b.ev(`(() => { try { return !!(${fld("أين ")}); } catch (e) { return false; } })()`)); i++) { await b.silent(() => b.clickText("فاتورة بيع", ".site-tabs *, .site-tab, button")); await idle(2200); } // the tab click can land while the page is still redrawing
  await b.setSelect(fld("أين "), "موزّع"); await idle(1200);
  await b.setSelect(`${vis(".site select")}.find(s => [...s.options].some(o => o.text.includes("موزّع الريف")))`, "موزّع الريف"); await idle(1200);
  await b.setSelect(selById("sale-product"), "أرز"); await b.fillBy(selById("sale-qty"), "4");
  await b.clickText("أضف إلى الفاتورة", "button"); await idle(1400);
  await b.scrollBy(900, 1200);
  await b.clickText("حفظ الفاتورة", "button"); await idle(3000);
}
async function settle(b) {
  await b.tab("المخزون"); await idle(800);
  await b.tab("الفروع والموزّعين"); await idle(1500);
  const c = card("موزّع الريف"); await b.waitFor(c, 25000);
  await b.scrollBy(1100, 1400); await idle(2000);
  b.note("هنا تظهر تسوية الموزّع: مبيعاته، والنقد الذي قبضه، وما سلّمه، وما بقي معه.");
  const hf = `document.querySelector('[id^="loc-h-"]')`;
  if (await b.waitFor(hf, 20000).then(() => true, () => false)) {
    b.note("عندما يسلّمك المبلغ، اكتبه واضغط استلام. ولا يمكنك استلام أكثر مما معه.");
    await b.fillBy(hf, $("14"));
    await b.clickText("استلام", ".site button"); await idle(2800);
  }
  b.note("وإذا بقيت عنده بضاعة، اختر المنتج والكمية، واضغط رجّع للمستودع.");
  await b.setSelect(`${c}.querySelector("select")`, "أرز");
  await b.fillBy(`${c}.querySelector("input")`, "2");
  await b.click(`[...${c}.querySelectorAll("button")].find(x => x.innerText.trim() === "إرجاع إلى المستودع")`); await idle(2500);
  await b.scrollBy(900, 1400);
  b.note("وفي الأسفل تقرير مبيعات الموقع لأي فترة. اضغط عرض.");
  await b.clickText("عرض", ".site button"); await idle(3500);
}
async function tax(b) {
  await b.tab("الضريبة"); await idle(2200);
  b.note("إذا كان نشاطك يحتاج ضريبة، اكتب الرقم الضريبي واسم النشاط، وحدّد هل الأسعار شاملة الضريبة أم تُضاف عليها.");
  await b.fillBy(byId("tax-number"), "123456789"); await b.fillBy(byId("tax-business"), "أبو سامر للمواد الغذائية");
  await b.setSelect(fld("كيف تُكتب الأسعار"), "تُضاف الضريبة إلى السعر");
  b.note("ثم أضف نسبة الضريبة: اكتب اسمها ونسبتها.");
  await b.fillBy(byId("tax-rate-name"), "ضريبة المبيعات"); await b.fillBy(byId("tax-rate-pct"), process.env.VIDEO_LANG === "ru" ? "19" : "5");
  await b.clickText("إضافة نسبة", ".site button"); await idle(2500);
  await b.scrollBy(-600, 1000);
  await b.setSelect(fld("النسبة الافتراضية"), "ضريبة المبيعات · 5%");
  await b.clickText("حفظ الإعدادات", ".site button"); await idle(2200);
  await b.scrollBy(500, 1400); await idle(2000);
  b.note("وفي الأسفل تقرير الضريبة: ضريبة المبيعات المحصّلة، وضريبة المشتريات المدفوعة، والمستحق للجهة الضريبية.");
  await idle(4000);
}
async function reports(b) {
  await b.tab("التقارير"); await idle(2500);
  b.note("في التقارير، اختر الفترة التي تريدها: آخر سبعة أيام، أو هذا الشهر، أو آخر ثلاثين يوماً، أو اليوم.");
  for (const t of ["آخر 7 أيام", "هذا الشهر", "آخر 30 يوم", "اليوم"]) { await b.clickText(t, ".site button"); await idle(2200); }
  b.note("ويمكنك تجميع الصافي يومياً أو أسبوعياً أو شهرياً.");
  await b.setSelect(fld("تجميع الصافي"), "شهري"); await idle(1500);
  await b.scrollBy(600, 1600); await idle(2500);
  b.note("هنا المبيعات، وتكلفة البضاعة المباعة، والربح الإجمالي، والمصاريف الأخرى، وعدد الفواتير، والخصومات.");
  await idle(3500); await b.scrollBy(600, 1600); await idle(2500);
  b.note("وتحتها الدخل والمصاريف حسب التصنيف، والأهم: ربح كل منتج على حدة. وتستطيع تنزيل التقرير أو طباعته.");
  await idle(3500); await b.scrollBy(700, 1600); await idle(2500);
}
async function statements(b) {
  await b.tab("الكشوف"); await idle(2500);
  b.note("هنا قائمة الدخل، والمركز المالي المبسّط. اختر الفترة. وهي ميزة تجريبية، فراجعها مع محاسبك قبل أي تصريح.");
  for (const t of ["آخر 30 يوم", "هذا الشهر"]) { await b.clickText(t, ".site button"); await idle(2200); }
  await b.scrollBy(600, 1600); await idle(2500); await b.scrollBy(600, 1600); await idle(2500);
}
async function staff(b) {
  await b.tab("الموظفون"); await idle(2200);
  b.note("إذا كان عندك موظفون، أضفهم من هنا. اكتب اسم الموظف، واختر دوره، ثم حدّد عمولته من المبيعات، أو راتبه الثابت.");
  await b.fillBy(byId("staff-name"), "سامر العلي"); await b.setSelect(fld("الدور"), "كاشير");
  await b.fillBy(byId("staff-rate"), "2"); await b.fillBy(byId("staff-fixed"), $("150"));
  await b.clickText("إضافة موظف", ".site button"); await idle(3000);
  b.note("ثم اضغط رمز دعوة، وأعطِ الرمز للموظف، فيدخل بحسابه ولا يرى إلا ما يخصّه.");
  await safe(b, async () => { await b.clickText("رمز دعوة", ".site button"); await idle(3000); });
  b.note("ويمكنك تعديل العمولة، أو دفع الراتب الثابت، أو إزالة الموظف."); await idle(3500);
}
async function photoInvoices(b) {
  await b.tab("الفواتير"); await idle(2500);
  b.note("وإذا كانت عندك فاتورة ورقية، اضغط اختيار ملف، وارفع صورتها. يقرأ الذكاء الاصطناعي المبلغ والمورّد، وتراجع البيانات وتؤكدها قبل الحفظ.");
  await idle(5000);
}
async function finalSummary(b) {
  await b.tab("الملخص"); await idle(2500);
  b.note("وفي النهاية، ارجع إلى الملخص. هنا ترى محلّك كله بنظرة واحدة.");
  await b.scrollBy(600, 1600); await idle(3500);
  await b.tab("الرئيسية"); await idle(3000);
}
module.exports = { inventory, stockCount, parties, sale, purchases, partyStatement, moves, recurring, summary, locations, distribute, saleDistributor, settle, tax, reports, statements, staff, photoInvoices, finalSummary };

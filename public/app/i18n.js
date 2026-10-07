// Languages for the web preview. To add one:
//   1. add it to LANGS (name shown in the menu + text direction),
//   2. add a dictionary under DICT with the same keys (missing keys fall back to Arabic),
//   3. add its category names on the server (CategoryTranslation rows / prisma/categories.data.ts).
// Nothing else in the app needs to change.
const LANGS = {
  ar: { name: "العربية", dir: "rtl" },
  en: { name: "English", dir: "ltr" },
};
const DEFAULT_LANG = "ar";

const DICT = {
  ar: {
    "tab.map": "الخريطة", "tab.card": "بطاقتي", "tab.cart": "السلة", "tab.orders": "طلباتي", "tab.account": "حسابي",

    "search.placeholder": "دوّر على محل أو خدمة...",
    "search.recent": "عمليات بحث سابقة",
    "login.pill": "دخول",
    "filter.all": "الكل", "filter.openNow": "🕒 مفتوح الآن", "filter.discounts": "🏷️ فيها حسم", "filter.sections": "☰ الأقسام",
    "radius.any": "أي مسافة", "radius.km": "{n} كم",
    "area.search": "🔍 ابحث بهالمنطقة", "area.clear": "✕ مسح حدود المنطقة",
    "fab.myLocation": "موقعي", "fab.darkMode": "الوضع الداكن", "fab.lightMode": "الوضع الفاتح", "fab.language": "اللغة",
    "loc.unsupported": "المتصفح ما بيدعم تحديد الموقع",
    "loc.denied": "ما قدرنا نحدد موقعك — فعّل صلاحية الموقع من المتصفح لنعرض الأقرب إلك",

    "sheet.nearby": "المحلات القريبة منك", "sheet.directory": "دليل المحلات", "sheet.count": "{n} محل",
    "sheet.empty": "ما لقينا محلات بهالفلاتر — جرّب تغيّر البحث",
    "sheet.emptyRadius": "ما في محلات ضمن {n} كم منك — جرّب مسافة أكبر",

    "card.details": "التفاصيل", "card.directions": "🧭 الاتجاهات", "card.save": "حفظ",
    "unit.m": "م", "unit.km": "كم",

    "place.call": "اتصال", "place.whatsapp": "واتساب", "place.directions": "الاتجاهات", "place.share": "مشاركة",
    "place.save": "حفظ", "place.saved": "محفوظ", "place.discounts": "الحسوم", "place.products": "المنتجات",
    "place.noProducts": "ما في منتجات بعد", "place.notFound": "هذا المحل غير متوفر", "place.unavailable": "غير متوفر",
    "place.forMembers": "لأعضاء دليلكم", "place.linkCopied": "تم نسخ الرابط ✅", "place.copyLink": "انسخ الرابط:",
    "place.shareText": "{name} على دليلكم",

    "hours.title": "ساعات العمل", "hours.closed": "مغلق", "hours.allDay": "24 ساعة", "hours.sep": "، ",
    "hours.openUntil": "مفتوح · يسكّر {time}", "hours.opensAt": "مغلق · يفتح {day} {time}",
    "hours.today": "اليوم", "hours.tomorrow": "بكرا", "time.am": "ص", "time.pm": "م",
    "day.sat": "السبت", "day.sun": "الأحد", "day.mon": "الإثنين", "day.tue": "الثلاثاء", "day.wed": "الأربعاء", "day.thu": "الخميس", "day.fri": "الجمعة",

    "route.to": "إلى {name}", "route.calculating": "عم نحسب الطريق...", "route.google": "افتح بجوجل",
    "route.failed": "تعذّر حساب الطريق", "route.needLocation": "فعّل صلاحية الموقع من المتصفح لنرسم لك الطريق، أو افتحه بخرائط جوجل",
    "dur.min1": "دقيقة", "dur.min2": "دقيقتان", "dur.min3to10": "{n} دقائق", "dur.min": "{n} دقيقة", "dur.hm": "{h} س {m} د",

    "profile.edit": "✏️ تعديل ملفي الشخصي", "profile.myAccount": "حسابي",
    "profile.merchantMode": "وضع التاجر", "profile.registerMerchant": "سجّل كتاجر",
    "profile.favorites": "♥ أماكني المحفوظة", "profile.affiliates": "مسوّقياتي", "profile.responder": "🤖 المجيب الآلي",
    "profile.wallet": "💰 محفظتي", "profile.logout": "تسجيل الخروج",
    "verify.title": "✉️ بريدك غير موثّق", "verify.sub": "وثّق بريدك لتحمي حسابك وتقدر تسترجع كلمة السرّ.",
    "verify.resend": "إعادة إرسال رابط التوثيق", "verify.sent": "أرسلنا رابط التوثيق لبريدك ✅", "verify.failed": "تعذّر الإرسال، جرّب بعد شوي",

    "guest.login": "تسجيل الدخول", "guest.register": "إنشاء حساب جديد",
    "guest.card.title": "بطاقة دليلكم", "guest.card.sub": "افتح حساب لتحصل على بطاقة الحسم الرقمية وتوفّر بكل محل على الخريطة.",
    "guest.card.p1": "حسم فوري عند أي تاجر مشترك", "guest.card.p2": "كود QR يتجدّد لحمايتك", "guest.card.p3": "سجل بكل حسوماتك",
    "guest.cart.title": "سلة مشترياتك", "guest.cart.sub": "سجّل دخولك لتضيف منتجات وتكمل طلبك.",
    "guest.cart.p1": "اطلب من عدة محلات بسلة وحدة", "guest.cart.p2": "أسعار خاصة للأعضاء",
    "guest.orders.title": "طلباتك", "guest.orders.sub": "سجّل دخولك لتتابع طلباتك وحالتها.",
    "guest.orders.p1": "تتبّع كل طلب خطوة بخطوة", "guest.orders.p2": "إلغاء الطلب قبل الشحن",
    "guest.profile.title": "افتح حسابك", "guest.profile.sub": "الخريطة ودليل المحلات مفتوحين للكل. الحساب بتحتاجه إذا بدك بطاقة حسم أو تسجّل محلك كتاجر.",
    "guest.profile.p1": "احصل على بطاقة الحسم", "guest.profile.p2": "سجّل محلك كتاجر وأضف منتجاتك وعروضك", "guest.profile.p3": "فعّل المجيب الآلي لمحادثات زبائنك",

    "browse.title": "تصفّح الأقسام", "browse.all": "كل {name}", "browse.count": "{n} محل", "browse.soon": "قريباً",
    "browse.back": "‹ رجوع", "browse.close": "إغلاق",
    "picker.section": "القسم", "picker.profession": "المهنة / النوع", "picker.specialty": "التخصص", "picker.choose": "اختر...",
    "lang.title": "اللغة",

    "pricing.title": "الباقات والأسعار", "pricing.sub": "كل خدمات دليلكم بأسعارها — والسعر اللي بتشوفه هو سعر بلدك.",
    "pricing.link": "💳 الباقات والأسعار",
    "service.MEMBERSHIP": "عضوية الزبون (بطاقة الحسم)", "service.MERCHANT_ACCOUNT": "باقات التاجر",
    "service.RESPONDER_CUSTOMER": "المجيب الآلي — للزبائن", "service.RESPONDER_MERCHANT": "المجيب الآلي — للتجار",
    "pricing.free": "مجاني", "pricing.notPriced": "السعر غير محدد بعد", "pricing.credits": "{n} {credit}",
    "pricing.days": "{n} يوم", "pricing.trial": "تجربة مجانية {n} يوم", "pricing.yourCountry": "سعر بلدك",
    "pricing.broadcasts": "{n} رسالة جماعية بالشهر", "pricing.subscribe": "اشترك", "pricing.empty": "ما في باقات متاحة حاليًا",
    "pricing.subscribed": "تم الاشتراك ✅", "pricing.failed": "تعذّر الاشتراك",
  },

  en: {
    "tab.map": "Map", "tab.card": "My card", "tab.cart": "Cart", "tab.orders": "Orders", "tab.account": "Account",

    "search.placeholder": "Search for a place or service...",
    "search.recent": "Recent searches",
    "login.pill": "Sign in",
    "filter.all": "All", "filter.openNow": "🕒 Open now", "filter.discounts": "🏷️ Has discount", "filter.sections": "☰ Categories",
    "radius.any": "Any distance", "radius.km": "{n} km",
    "area.search": "🔍 Search this area", "area.clear": "✕ Clear area",
    "fab.myLocation": "My location", "fab.darkMode": "Dark mode", "fab.lightMode": "Light mode", "fab.language": "Language",
    "loc.unsupported": "This browser doesn't support location",
    "loc.denied": "We couldn't get your location — allow location access in the browser to see what's nearest",

    "sheet.nearby": "Places near you", "sheet.directory": "Places directory", "sheet.count": "{n} places",
    "sheet.empty": "No places match these filters — try changing your search",
    "sheet.emptyRadius": "No places within {n} km of you — try a larger distance",

    "card.details": "Details", "card.directions": "🧭 Directions", "card.save": "Save",
    "unit.m": "m", "unit.km": "km",

    "place.call": "Call", "place.whatsapp": "WhatsApp", "place.directions": "Directions", "place.share": "Share",
    "place.save": "Save", "place.saved": "Saved", "place.discounts": "Discounts", "place.products": "Products",
    "place.noProducts": "No products yet", "place.notFound": "This place isn't available", "place.unavailable": "Unavailable",
    "place.forMembers": "for Dalilacom members", "place.linkCopied": "Link copied ✅", "place.copyLink": "Copy the link:",
    "place.shareText": "{name} on Dalilacom",

    "hours.title": "Opening hours", "hours.closed": "Closed", "hours.allDay": "24 hours", "hours.sep": ", ",
    "hours.openUntil": "Open · closes {time}", "hours.opensAt": "Closed · opens {day} {time}",
    "hours.today": "today", "hours.tomorrow": "tomorrow", "time.am": "AM", "time.pm": "PM",
    "day.sat": "Saturday", "day.sun": "Sunday", "day.mon": "Monday", "day.tue": "Tuesday", "day.wed": "Wednesday", "day.thu": "Thursday", "day.fri": "Friday",

    "route.to": "To {name}", "route.calculating": "Calculating the route...", "route.google": "Open in Google Maps",
    "route.failed": "Couldn't calculate the route", "route.needLocation": "Allow location access to draw the route, or open it in Google Maps",
    "dur.min1": "1 min", "dur.min2": "2 min", "dur.min3to10": "{n} min", "dur.min": "{n} min", "dur.hm": "{h} h {m} min",

    "profile.edit": "✏️ Edit my profile", "profile.myAccount": "My account",
    "profile.merchantMode": "Merchant mode", "profile.registerMerchant": "Register as a merchant",
    "profile.favorites": "♥ Saved places", "profile.affiliates": "My affiliations", "profile.responder": "🤖 Auto-responder",
    "profile.wallet": "💰 My wallet", "profile.logout": "Sign out",
    "verify.title": "✉️ Email not verified", "verify.sub": "Verify your email to protect your account and recover your password.",
    "verify.resend": "Resend verification link", "verify.sent": "We sent the verification link to your email ✅", "verify.failed": "Couldn't send, try again shortly",

    "guest.login": "Sign in", "guest.register": "Create an account",
    "guest.card.title": "Dalilacom card", "guest.card.sub": "Open an account to get your digital discount card and save at every place on the map.",
    "guest.card.p1": "Instant discount at any partner merchant", "guest.card.p2": "A QR code that refreshes to protect you", "guest.card.p3": "A record of all your savings",
    "guest.cart.title": "Your cart", "guest.cart.sub": "Sign in to add products and complete your order.",
    "guest.cart.p1": "Order from several shops in one cart", "guest.cart.p2": "Special member prices",
    "guest.orders.title": "Your orders", "guest.orders.sub": "Sign in to follow your orders and their status.",
    "guest.orders.p1": "Track each order step by step", "guest.orders.p2": "Cancel an order before it ships",
    "guest.profile.title": "Open your account", "guest.profile.sub": "The map and the directory are open to everyone. You only need an account for a discount card or to list your shop.",
    "guest.profile.p1": "Get the discount card", "guest.profile.p2": "List your shop and add your products and offers", "guest.profile.p3": "Turn on the auto-responder for your customers' messages",

    "browse.title": "Browse categories", "browse.all": "All {name}", "browse.count": "{n} places", "browse.soon": "Coming soon",
    "browse.back": "‹ Back", "browse.close": "Close",
    "picker.section": "Category", "picker.profession": "Profession / type", "picker.specialty": "Specialty", "picker.choose": "Choose...",
    "lang.title": "Language",

    "pricing.title": "Plans & pricing", "pricing.sub": "Every Dalilacom service and its price — the price you see is the one for your country.",
    "pricing.link": "💳 Plans & pricing",
    "service.MEMBERSHIP": "Customer membership (discount card)", "service.MERCHANT_ACCOUNT": "Merchant plans",
    "service.RESPONDER_CUSTOMER": "Auto-responder — customers", "service.RESPONDER_MERCHANT": "Auto-responder — merchants",
    "pricing.free": "Free", "pricing.notPriced": "Price not set yet", "pricing.credits": "{n} {credit}",
    "pricing.days": "{n} days", "pricing.trial": "{n}-day free trial", "pricing.yourCountry": "Your country's price",
    "pricing.broadcasts": "{n} follower broadcasts per month", "pricing.subscribe": "Subscribe", "pricing.empty": "No plans available right now",
    "pricing.subscribed": "Subscribed ✅", "pricing.failed": "Couldn't subscribe",
  },
};

function loadSavedLang() {
  try {
    const saved = localStorage.getItem("dlk_lang");
    if (saved && LANGS[saved]) return saved;
  } catch (e) {}
  return DEFAULT_LANG; // Arabic first — the browser's language is not guessed
}

let LANG = loadSavedLang();

/** t("sheet.count", { n: 5 }) -> the current language's text; falls back to Arabic, then to the key itself. */
function t(key, vars) {
  let text = (DICT[LANG] && DICT[LANG][key]) ?? DICT[DEFAULT_LANG][key] ?? key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] !== undefined ? vars[name] : `{${name}}`));
  return text;
}

function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANGS[LANG].dir;
}
applyLang();

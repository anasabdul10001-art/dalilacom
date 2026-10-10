/**
 * More professions and specialties (the list is meant to be so complete that a shop rarely has to propose its own).
 * Same shape as categories.data.ts; slugs are unique across both files (a test checks that). Imported by categories.data.ts.
 */
import type { CategorySeed } from "./categories.data";

const c = (slug: string, ar: string, en: string, icon?: string, synAr?: string, synEn?: string, children?: CategorySeed[]): CategorySeed => ({
  slug, ar, en, icon, synAr, synEn, children,
});

/* ---------- professions added under sections that were empty ---------- */

export const RESTAURANT_KINDS: CategorySeed[] = [
  c("rs-shawarma", "شاورما وفلافل", "Shawarma & falafel", "🌯", "شاورما|فلافل|فروج شاورما|ساندويش|عرنوس|سندويشات", "shawarma|falafel|wraps|sandwiches"),
  c("rs-grill", "مشاوي وكباب", "Grills & kebab", "🍢", "مشاوي|كباب|شيش طاووق|لحمة مشوية|فحم|مندي|مظبي", "grill|bbq|kebab|shish tawook|mandi"),
  c("rs-fastfood", "وجبات سريعة وبرغر", "Fast food & burgers", "🍔", "برغر|وجبات سريعة|ناغتس|هوت دوغ|ساندويش|سناك", "fast food|burger|nuggets|hot dog|snack"),
  c("rs-pizza", "بيتزا ومعجنات", "Pizza & bakery items", "🍕", "بيتزا|معجنات|فطاير|مناقيش|لحم بعجين|صفيحة", "pizza|pastries|manakish|pies"),
  c("rs-chicken", "فروج وبروستد", "Chicken & broasted", "🍗", "فروج|بروستد|دجاج مقلي|فروج مشوي|وجبات فروج", "chicken|broasted|fried chicken|roast chicken"),
  c("rs-seafood", "مأكولات بحرية", "Seafood", "🐟", "سمك|مأكولات بحرية|روبيان|جمبري|سمك مشوي|بحري", "seafood|fish|shrimp|grilled fish"),
  c("rs-syrian", "أكل شعبي وبيتي", "Traditional & home food", "🥘", "اكل شعبي|اكل بيتي|فتة|فول|حمص|كبة|محشي|اكل شامي|اكل حلبي", "traditional|home food|fatteh|foul|hummus|kibbeh|stuffed"),
  c("rs-international", "مطابخ عالمية", "International cuisine", "🍝", "ايطالي|صيني|هندي|تركي|مكسيكي|سوشي|باستا|اسيوي", "italian|chinese|indian|turkish|mexican|sushi|pasta|asian"),
  c("rs-healthy", "أكل صحي ونباتي", "Healthy & vegetarian", "🥗", "اكل صحي|نباتي|دايت|سلطات|سموذي|كيتو|بدون غلوتين", "healthy|vegetarian|vegan|salads|diet|keto|gluten free"),
  c("rs-breakfast", "فطور وسناك", "Breakfast & snacks", "🍳", "فطور|بيض|فول وحمص|مسبحة|فطائر|سناك صباحي", "breakfast|eggs|brunch|morning snacks"),
  c("rs-catering", "طبخ منزلي وتجهيز طلبات", "Home cooking & orders", "👩‍🍳", "طبخ منزلي|طبخ بيت|تجهيز طلبات|عزائم|ولائم|وجبات جاهزة|سفرة", "home cooking|catering orders|prepared meals|feasts"),
];

export const CAFE_KINDS: CategorySeed[] = [
  c("cf-coffee", "كافيهات وقهوة مختصة", "Cafes & specialty coffee", "☕", "كافيه|قهوة مختصة|اسبريسو|لاتيه|كابتشينو|قهوة", "cafe|specialty coffee|espresso|latte|cappuccino"),
  c("cf-shisha", "نراجيل وكوفي شوب", "Shisha & coffee shops", "💨", "نرجيلة|نراجيل|ارجيلة|شيشة|مقهى شعبي", "shisha|hookah|waterpipe|coffee shop"),
  c("cf-juice", "عصائر وآيس كريم", "Juice & ice cream", "🍦", "عصير|عصائر|بوظة|آيس كريم|ايس كريم|سموذي|مثلجات|كوكتيل", "juice|ice cream|smoothie|cocktail|gelato"),
  c("cf-sweets", "حلويات ومعجنات", "Desserts & pastries", "🧁", "حلويات|كيك|كاتو|وافل|كريب|دونات|معجنات", "desserts|cake|waffle|crepe|donuts|pastries"),
  c("cf-internet", "نت كافيه وألعاب", "Internet & gaming cafe", "🎮", "نت كافيه|انترنت|بلايستيشن|العاب|كافيه ألعاب|ليجا", "internet cafe|gaming|playstation|esports"),
  c("cf-tea", "شاي وأعشاب", "Tea & herbs", "🍵", "شاي|اعشاب|زهورات|مشروبات ساخنة|مته", "tea|herbs|herbal drinks|mate"),
];

export const CLOTHING_KINDS: CategorySeed[] = [
  c("cl-men", "ملابس رجالية", "Men's clothing", "👔", "رجالي|ملابس رجالية|بنطلون|قميص|جاكيت|بدلة|تيشيرت", "men's clothing|shirts|trousers|suits|jackets", [
    c("cl-men-suits", "بدلات وقمصان رسمية", "Suits & formal shirts", "🤵", "بدلة|قميص|كرافات|رسمي|طقم", "suit|formal shirt|tie|formal"),
    c("cl-men-casual", "ملابس يومية وجينز", "Casual & jeans", "👖", "جينز|بنطلون|تيشيرت|قميص|كاجوال|سبور", "casual|jeans|t-shirt|sportswear"),
    c("cl-men-under", "ملابس داخلية رجالية", "Men's underwear", "🩲", "داخلي|فنيلة|بوكسر|جرابات", "underwear|boxers|socks|vest"),
  ]),
  c("cl-women", "ملابس نسائية", "Women's clothing", "👗", "نسائي|ملابس نسائية|فستان|بلوزة|تنورة|جينز نسائي|بنطلون نسائي", "women's clothing|dress|blouse|skirt|women's jeans", [
    c("cl-women-dress", "فساتين وسهرة", "Dresses & evening wear", "👗", "فستان|فساتين|سهرة|فستان سهرة|مناسبات", "dress|dresses|evening wear|occasion"),
    c("cl-women-daily", "ملابس يومية", "Everyday wear", "👚", "بلوزة|تنورة|جينز|بنطلون|يومي|كاجوال", "blouse|skirt|jeans|everyday|casual"),
    c("cl-women-maternity", "ملابس حوامل", "Maternity wear", "🤰", "حوامل|حمل|مرضعة|ملابس حامل", "maternity|pregnancy|nursing"),
  ]),
  c("cl-kids", "ملابس أطفال وبيبي", "Kids & baby clothing", "🧒", "اطفال|ملابس اطفال|بيبي|مواليد|حديثي الولادة|ملابس اولاد|ملابس بنات", "kids clothing|baby clothes|newborn|boys|girls"),
  c("cl-hijab", "حجاب وعبايات", "Hijab & abayas", "🧕", "حجاب|عباية|عبايات|اوشحة|طرح|جلباب|اسدال|ايشارب", "hijab|abaya|scarves|shawl|jilbab|modest wear"),
  c("cl-shoes", "أحذية", "Shoes", "👟", "حذاء|احذية|صرماية|جزمة|صندل|كندرة|بوط|سنيكرز", "shoes|footwear|sandals|boots|sneakers"),
  c("cl-bags", "حقائب وإكسسوارات", "Bags & accessories", "👜", "حقيبة|شنط|حقائب|محفظة|حزام|نظارات شمسية|اكسسوار", "bags|handbags|wallets|belts|sunglasses|accessories"),
  c("cl-lingerie", "ملابس داخلية ونوم", "Lingerie & nightwear", "🩱", "ملابس داخلية|لانجري|بيجاما|قميص نوم|بيجامات", "lingerie|nightwear|pajamas|underwear"),
  c("cl-uniform", "بدلات عمل ويونيفورم", "Work wear & uniforms", "🦺", "يونيفورم|بدلة عمل|ملابس عمل|مريول|زي موحد|ملابس مدرسية|اوفرول", "uniform|work wear|overalls|school uniform|scrubs"),
  c("cl-wedding", "فساتين أعراس وبدلات عرسان", "Wedding dresses & groom suits", "👰", "فستان عرس|فساتين اعراس|فستان زفاف|بدلة عريس|ايجار فساتين|تأجير فساتين", "wedding dress|bridal|groom suit|dress rental"),
  c("cl-fabric", "أقمشة وخيوط", "Fabrics & threads", "🧵", "قماش|اقمشة|خيوط|زرايير|بطانة|شيفون|حرير|قطن", "fabric|textile|threads|buttons|silk|cotton"),
  c("cl-used", "ملابس مستعملة (بالة)", "Second-hand clothing", "♻️", "بالة|مستعمل|ملابس مستعملة|اوروبي|ستوك", "second hand|used clothing|thrift|stock"),
];

export const BEAUTY_KINDS: CategorySeed[] = [
  c("bt-barber", "حلاقة رجالية", "Men's barber", "💈", "حلاق|حلاقة|حلاق رجالي|صالون رجالي|قص شعر|ذقن|لحية|تحديد", "barber|men's haircut|beard|shave|men's salon"),
  c("bt-salon", "صالونات نسائية", "Women's salons", "💇‍♀️", "صالون|كوافير|قص شعر|صبغة|سشوار|تسريحة|بروتين شعر|كيراتين", "salon|hairdresser|haircut|coloring|blow dry|keratin"),
  c("bt-nails", "أظافر وعناية باليدين", "Nails & hand care", "💅", "اظافر|مانيكير|باديكير|جل|اكرليك|عناية اظافر", "nails|manicure|pedicure|gel|acrylic"),
  c("bt-makeup", "مكياج وتجهيز عرائس", "Makeup & bridal", "💄", "مكياج|ميك اب|عروس|تجهيز عروس|مكياج سهرة|ميكب ارتست", "makeup|bridal|makeup artist|bride preparation"),
  c("bt-skin", "عناية بالبشرة وليزر", "Skin care & laser", "✨", "بشرة|تنظيف بشرة|ليزر|ازالة شعر|فيشيال|ميزوثيرابي|تقشير", "skin care|facial|laser|hair removal|peeling"),
  c("bt-spa", "سبا ومساج وحمامات", "Spa, massage & baths", "🧖", "سبا|مساج|تدليك|حمام مغربي|حمام تركي|ساونا|جاكوزي|استرخاء", "spa|massage|moroccan bath|turkish bath|sauna|jacuzzi"),
  c("bt-cosmetics", "محلات مكياج وعطور", "Cosmetics & perfume shops", "🧴", "مكياج|عطور|عطر|كريمات|مستحضرات تجميل|بخور|عود|دهن عود", "cosmetics|perfume|creams|beauty products|incense|oud"),
  c("bt-hair", "تركيب وتجميل شعر", "Hair extensions & care", "👩‍🦰", "تركيب شعر|باروكة|زراعة شعر|شعر مستعار|وصلات|علاج شعر", "hair extensions|wigs|hair transplant|hair treatment"),
  c("bt-henna", "حنة ووشم", "Henna & tattoo", "🖋️", "حنة|حناء|نقش|وشم|تاتو|رسم", "henna|mehndi|tattoo|body art"),
];

/** Extra doctor specialties (appended to the ones already in categories.data.ts). */
export const DOCTOR_EXTRA: CategorySeed[] = [
  c("health-doctors-neuro", "أعصاب ودماغ", "Neurologist", "🧠", "اعصاب|دماغ|صرع|شلل|صداع نصفي|جلطة|مخ واعصاب|تخطيط دماغ", "neurologist|neurology|brain|epilepsy|migraine|stroke"),
  c("health-doctors-nephrology", "كلية وغسيل كلى", "Nephrologist", "🫘", "كلية|غسيل كلى|فشل كلوي|زرع كلية|ضغط وكلى", "nephrologist|kidney|dialysis|renal failure"),
  c("health-doctors-rheumatology", "روماتيزم ومناعة", "Rheumatologist", "🦴", "روماتيزم|مفاصل|مناعة|نقرس|لوبوس|التهاب مفاصل", "rheumatologist|arthritis|gout|lupus|autoimmune"),
  c("health-doctors-allergy", "حساسية وربو", "Allergy & asthma", "🤧", "حساسية|ربو|ازمة|حساسية صدر|حساسية انف|طعام", "allergy|asthma|allergist|hay fever|food allergy"),
  c("health-doctors-hematology", "أمراض دم", "Hematologist", "🩸", "دم|فقر دم|ثلاسيميا|تخثر|سيولة|ابيضاض", "hematologist|blood|anemia|thalassemia|clotting"),
  c("health-doctors-infertility", "عقم وأطفال أنابيب", "Fertility specialist", "👶", "عقم|اطفال انابيب|تأخر حمل|حقن مجهري|اخصاب", "fertility|ivf|infertility|icsi|conception"),
  c("health-doctors-neonatal", "حديثي الولادة وحواضن", "Neonatologist", "🍼", "حديثي الولادة|حواضن|خدج|رضع|مولود جديد", "neonatologist|newborn|nicu|premature"),
  c("health-doctors-pain", "ألم وتخدير", "Pain & anesthesia", "💉", "الم|تخدير|مسكنات|حقن ظهر|علاج الم مزمن", "pain management|anesthesia|anesthetist|chronic pain"),
  c("health-doctors-geriatric", "مسنين وأمراض شيخوخة", "Geriatrician", "👴", "مسنين|شيخوخة|كبار السن|الزهايمر|رعاية مسنين", "geriatrician|elderly|aging|alzheimer"),
  c("health-doctors-sports", "طب رياضي", "Sports medicine", "🏅", "طب رياضي|اصابات ملاعب|اصابات رياضيين|رباط صليبي", "sports medicine|athlete injuries|acl"),
  c("health-doctors-speech", "نطق وتخاطب وسمع", "Speech & hearing", "🗣️", "نطق|تخاطب|تأخر كلام|سمع|عيوب نطق|تأهيل سمعي", "speech therapy|hearing|language delay|audiology"),
  c("health-doctors-forensic", "طب شرعي وتقارير", "Forensic & reports", "📄", "طب شرعي|تقارير طبية|معاينة|شهادة طبية", "forensic|medical reports|medical certificate"),
];

/* ---------- new sections ---------- */

export const MORE_SECTIONS: CategorySeed[] = [
  c("services-home", "الخدمات المنزلية والصيانة", "Home services & repairs", "🛠️", "خدمات|صيانة|فني|تصليح|معلم|حرفي|مهنة", "services|repairs|handyman|technician|maintenance", [
    c("svc-plumber", "سباكة (مواسرجي)", "Plumber", "🚰", "سباك|سباكة|مواسرجي|تمديدات|صرف صحي|تسريب|مجاري|سخان", "plumber|plumbing|pipes|drain|leak|sewage", [
      c("svc-plumber-leaks", "كشف وإصلاح تسريبات", "Leak detection & repair", "💧", "تسريب|نش|رطوبة|كشف تسريب|تسرب مياه", "leak detection|water leak|dampness"),
      c("svc-plumber-heaters", "سخانات (كهرباء وشمسي)", "Water heaters", "♨️", "سخان|سخانات|سخان شمسي|بويلر|ماء ساخن", "water heater|solar heater|boiler|hot water"),
      c("svc-plumber-bath", "تمديدات حمامات ومطابخ", "Bathroom & kitchen plumbing", "🚿", "حمام|مطبخ|تمديد|تركيب مغسلة|تركيب بانيو|جلي", "bathroom plumbing|kitchen plumbing|install sink|bathtub"),
      c("svc-plumber-drain", "فتح مجاري وتسليك", "Drain unblocking", "🪠", "مجاري|تسليك|فتح مجاري|انسداد|بيارة|نضح", "drain unblocking|clogged|sewer|septic"),
    ]),
    c("svc-electrician", "كهرباء (كهربجي)", "Electrician", "⚡", "كهربجي|كهربائي|تمديدات كهرباء|فني كهرباء|قاطع|اسلاك|فيوز|ماس", "electrician|wiring|electrical|circuit breaker|short circuit", [
      c("svc-electrician-wiring", "تمديدات وتأسيس", "Wiring & installation", "🔌", "تأسيس|تمديد|اسلاك|لوحة كهرباء|عداد", "wiring|installation|panel|meter"),
      c("svc-electrician-lighting", "إنارة وديكور ضوئي", "Lighting & light decor", "💡", "انارة|اضاءة|سبوتات|ثريات|ليد|ديكور ضوئي", "lighting|spotlights|chandeliers|led"),
      c("svc-electrician-generators", "مولدات وأنظمة طوارئ", "Generators & backup", "🔋", "مولدة|مولدات|امبيرات|ups|شاحن|بطاريات|طاقة بديلة", "generator|backup power|ups|batteries"),
    ]),
    c("svc-carpenter", "نجارة", "Carpenter", "🪚", "نجار|نجارة|خشب|معلم نجار|ابواب خشب|مطابخ خشب", "carpenter|carpentry|woodwork|wooden doors", [
      c("svc-carpenter-doors", "أبواب ونوافذ خشب", "Wooden doors & windows", "🚪", "باب|ابواب|شبابيك خشب|نوافذ|باب خشب", "wooden doors|windows|door installation"),
      c("svc-carpenter-kitchens", "مطابخ وخزائن خشب", "Wooden kitchens & wardrobes", "🗄️", "مطبخ|خزانة|خزائن|دولاب|مكتبة|جزامة", "kitchen|wardrobe|cabinets|closets"),
      c("svc-carpenter-repair", "تصليح وتنجيد أثاث", "Furniture repair & upholstery", "🛋️", "تصليح اثاث|تنجيد|كنب|كراسي|ترميم اثاث|تلبيس", "furniture repair|upholstery|sofa|restoration"),
    ]),
    c("svc-painter", "دهان وديكورات جدران", "Painter & wall decor", "🎨", "دهان|دهّان|طلاء|صباغ|دهانات|ورق جدران|ديكور", "painter|painting|wall paint|wallpaper|decor", [
      c("svc-painter-interior", "دهان داخلي وخارجي", "Interior & exterior painting", "🖌️", "دهان داخلي|دهان خارجي|طلاء بيت|دهان شقة|ترميم", "interior painting|exterior painting|apartment painting"),
      c("svc-painter-gypsum", "جبصين وديكورات", "Gypsum & decorations", "🏛️", "جبصين|جبس|اسقف مستعارة|ديكور جبس|كورنيش|سقف", "gypsum|false ceiling|plaster decor|cornice"),
      c("svc-painter-wallpaper", "ورق جدران وتلبيس", "Wallpaper & cladding", "🧱", "ورق جدران|ورق حائط|تلبيس|3d|ستيكر جدران", "wallpaper|wall cladding|3d panels|stickers"),
    ]),
    c("svc-tiles", "بلاط وسيراميك ورخام", "Tiles, ceramic & marble", "🧱", "بلاط|سيراميك|رخام|غرانيت|مبلط|تبليط|بورسلان", "tiles|ceramic|marble|granite|tiler|porcelain", [
      c("svc-tiles-floor", "تبليط أرضيات وجدران", "Floor & wall tiling", "🪟", "تبليط|ارضيات|جدران|حمام|مطبخ|سيراميك", "tiling|floors|walls|bathroom tiles"),
      c("svc-tiles-marble", "رخام وغرانيت وتفصيل", "Marble & granite", "💎", "رخام|غرانيت|مرمر|درج|سطح مطبخ|تفصيل", "marble|granite|stairs|countertop"),
    ]),
    c("svc-aluminum", "ألمنيوم وزجاج", "Aluminum & glass", "🪟", "المنيوم|ألمنيوم|زجاج|سكريت|شبابيك|نوافذ|واجهات", "aluminum|glass|windows|facades|upvc", [
      c("svc-aluminum-windows", "نوافذ وأبواب ألمنيوم", "Aluminum windows & doors", "🚪", "نوافذ المنيوم|ابواب المنيوم|بي في سي|upvc|شباك|شبك", "aluminum windows|upvc|doors"),
      c("svc-aluminum-glass", "زجاج ومرايا وسكريت", "Glass, mirrors & shower screens", "🪞", "زجاج|مرايا|سكريت|كابينة حمام|زجاج سيكوريت|طاولات زجاج", "glass|mirrors|shower screens|tempered glass"),
    ]),
    c("svc-welding", "حدادة ولحام", "Blacksmith & welding", "🔩", "حداد|حدادة|لحام|ابواب حديد|درابزين|سحابات|هناجر", "blacksmith|welding|iron doors|railings|shutters", [
      c("svc-welding-doors", "أبواب وبوابات حديد", "Iron doors & gates", "🚪", "باب حديد|بوابة|بوابات|شبك|قضبان|حماية نوافذ", "iron doors|gates|window bars"),
      c("svc-welding-railings", "درابزين وسلالم ومظلات", "Railings, stairs & canopies", "🪜", "درابزين|سلالم|مظلة|شاحنة|مظلات|هيكل معدني|بيرغولا", "railings|stairs|canopies|metal structure|pergola"),
    ]),
    c("svc-ac", "تكييف وتبريد", "AC & refrigeration", "❄️", "مكيف|تكييف|تبريد|برادات|فني تكييف|تعبئة فريون|غاز", "ac|air conditioning|refrigeration|fridge|freon|hvac", [
      c("svc-ac-install", "تركيب وصيانة مكيفات", "AC installation & service", "🧊", "تركيب مكيف|صيانة مكيف|تنظيف مكيف|سبليت|مركزي", "ac installation|ac service|split|central ac"),
      c("svc-ac-fridge", "تصليح برادات وغسالات", "Fridge & washer repair", "🧺", "تصليح براد|تصليح غسالة|براد|غسالة|ثلاجة|جلاية", "fridge repair|washer repair|refrigerator|dishwasher"),
    ]),
    c("svc-cleaning", "تنظيف وتعقيم", "Cleaning & sanitizing", "🧹", "تنظيف|تعقيم|نظافة|شركة تنظيف|عاملة تنظيف|جلي|مكافحة", "cleaning|sanitizing|housekeeping|cleaning company", [
      c("svc-cleaning-home", "تنظيف منازل وشركات", "Home & office cleaning", "🏠", "تنظيف منزل|تنظيف شقة|تنظيف مكاتب|بعد البناء|بعد الدهان", "home cleaning|office cleaning|post-construction cleaning"),
      c("svc-cleaning-carpets", "غسيل سجاد وكنب وموكيت", "Carpet & sofa washing", "🛋️", "غسيل سجاد|غسيل كنب|غسيل موكيت|غسيل مفروشات|تنظيف بالبخار", "carpet washing|sofa cleaning|upholstery|steam clean"),
      c("svc-cleaning-tanks", "تنظيف خزانات وتعقيم مياه", "Tank cleaning", "🛢️", "خزانات|تنظيف خزان|تعقيم مياه|بئر|مياه شرب", "tank cleaning|water sterilization|well|drinking water"),
      c("svc-cleaning-pest", "مكافحة حشرات وقوارض", "Pest control", "🐜", "مكافحة حشرات|رش مبيدات|صراصير|فئران|نمل|بق الفراش|ابادة", "pest control|insects|rodents|ants|bed bugs|fumigation"),
    ]),
    c("svc-moving", "نقل أثاث وعفش", "Furniture moving", "🚛", "نقل عفش|نقل اثاث|نقل بيت|سيارة عفش|تغليف|فك وتركيب|رافعة", "furniture moving|movers|house move|packing|crane"),
    c("svc-locksmith", "أقفال ومفاتيح", "Locksmith", "🔑", "قفال|اقفال|مفاتيح|نسخ مفتاح|فتح باب|خزنة|كوداتور|قفل سيارة", "locksmith|locks|keys|safe|door opening|car key"),
    c("svc-garden", "حدائق وتنسيق", "Gardens & landscaping", "🌳", "حدائق|تنسيق حدائق|عشب|ري|تقليم|حدائق منزلية|مشتل", "gardens|landscaping|lawn|irrigation|pruning"),
    c("svc-satellite", "ستالايت وشبكات وإنترنت", "Satellite & networks", "📡", "ستالايت|دش|رسيفر|انترنت|راوتر|شبكات|واي فاي|تمديد انترنت", "satellite|dish|receiver|internet|router|wifi|networking"),
    c("svc-solar", "تركيب ألواح وأنظمة شمسية", "Solar installation", "☀️", "طاقة شمسية|الواح شمسية|انفرتر|بطاريات شمسية|نظام شمسي|تركيب الواح", "solar installation|solar panels|inverter|solar system"),
    c("svc-laundry", "مغاسل وكوي", "Laundry & dry cleaning", "👔", "مغسلة|كوي|دراي كلين|غسيل ملابس|تنظيف جاف|غسيل بطانيات", "laundry|dry cleaning|ironing|clothes washing"),
    c("svc-handyman", "فني صيانة عام (معلم)", "General handyman", "🧰", "معلم|فني|صيانة عامة|تصليحات|تركيبات|فك وتركيب|اعمال بسيطة", "handyman|odd jobs|general repairs|installations"),
    c("svc-curtains", "ستائر وبرادي وتركيب", "Curtains & blinds", "🪟", "ستائر|برادي|ستارة|رولر|ستائر طبية|تركيب ستائر|بيرق", "curtains|blinds|roller|window treatments"),
  ]),

  c("auto", "السيارات والمركبات", "Cars & vehicles", "🚗", "سيارة|سيارات|مركبة|مركبات|سيارات", "cars|vehicles|auto|automotive", [
    c("auto-sales", "معارض سيارات", "Car showrooms", "🚘", "معرض سيارات|بيع سيارات|شراء سيارات|سيارات مستعملة|سيارات جديدة|تقسيط", "car showroom|car sales|used cars|new cars|dealer", [
      c("auto-sales-new", "سيارات جديدة ووكالات", "New cars & dealers", "🆕", "وكالة|جديد|زيرو|سيارة جديدة|وكيل", "new cars|dealership|zero km"),
      c("auto-sales-used", "سيارات مستعملة", "Used cars", "🚙", "مستعمل|سيارة مستعملة|بيع وشراء|سمسار سيارات", "used cars|second hand|buy and sell|car broker"),
    ]),
    c("auto-mechanic", "ميكانيك وصيانة", "Mechanics & service", "🔧", "ميكانيكي|ميكانيك|صيانة سيارات|كراج|ورشة|تصليح سيارات|معلم سيارات", "mechanic|car repair|garage|workshop|car service", [
      c("auto-mechanic-engine", "محركات وجير", "Engines & transmissions", "⚙️", "محرك|جير|اوتوماتيك|مكينة|توضيب|قير|صيانة محرك", "engine|transmission|gearbox|automatic|overhaul"),
      c("auto-mechanic-electric", "كهرباء وكمبيوتر سيارات", "Auto electric & diagnostics", "🔌", "كهرباء سيارات|كمبيوتر|فحص كمبيوتر|سكانر|حساسات|دينمو|مارش", "auto electrician|diagnostics|scanner|sensors|alternator|starter"),
      c("auto-mechanic-brakes", "فرامل ومقدمة وتعليق", "Brakes & suspension", "🛞", "فرامل|مقدمة|تعليق|مساعدات|ترصيص|محاذاة|دبرياج", "brakes|suspension|shocks|alignment|clutch"),
      c("auto-mechanic-ac", "تكييف سيارات", "Car AC", "❄️", "تكييف سيارات|مكيف سيارة|فريون سيارة|تعبئة غاز", "car ac|auto air conditioning|freon"),
    ]),
    c("auto-body", "سمكرة ودهان", "Body & paint", "🎨", "سمكري|سمكرة|دهان سيارات|بويا|صدمة|تعديل|شاسيه|ترميم", "body shop|paint|dent|collision|repair|chassis"),
    c("auto-tires", "كوشوك وبطاريات وزيوت", "Tires, batteries & oil", "🛞", "كوشوك|كفرات|بطارية|زيت|تبديل زيت|فلاتر|جنطات|ترصيص", "tires|batteries|oil change|filters|rims|wheels", [
      c("auto-tires-tires", "كفرات وجنطات", "Tires & rims", "🛞", "كوشوك|كفر|جنط|جنطات|ترصيص|بنشر|بنشرجي", "tires|rims|puncture repair|balancing"),
      c("auto-tires-batteries", "بطاريات", "Car batteries", "🔋", "بطارية سيارة|بطاريات|شحن بطارية|امبير", "car battery|batteries|charging"),
      c("auto-tires-oil", "زيوت وفلاتر وتبديل زيت", "Oil, filters & oil change", "🛢️", "زيت|فلتر|تبديل زيت|تشحيم|زيوت محرك|غيار زيت", "oil|filters|oil change|lubrication"),
    ]),
    c("auto-parts", "قطع غيار سيارات", "Car spare parts", "🧩", "قطع غيار|قطع سيارات|اكسسوارات|تشليح|قطع مستعملة|اصلي|تجاري", "spare parts|car parts|used parts|original|aftermarket", [
      c("auto-parts-asian", "قطع يابانية وكورية", "Japanese & Korean parts", "🇯🇵", "تويوتا|هيونداي|كيا|نيسان|ميتسوبيشي|مازدا|قطع يابانية|قطع كورية", "toyota|hyundai|kia|nissan|mitsubishi|mazda|japanese parts|korean parts"),
      c("auto-parts-european", "قطع أوروبية وألمانية", "European & German parts", "🇩🇪", "مرسيدس|بي ام|اودي|فولكس|اوبل|رينو|بيجو|قطع المانية", "mercedes|bmw|audi|volkswagen|opel|renault|peugeot|german parts"),
      c("auto-parts-used", "تشليح وقطع مستعملة", "Salvage & used parts", "♻️", "تشليح|قطع مستعملة|خردة|هيكل|جسم|مفكك", "salvage|used parts|scrap|breaker yard"),
    ]),
    c("auto-wash", "غسيل وتلميع وتنظيف", "Car wash & detailing", "🧽", "غسيل سيارات|تلميع|تنظيف داخلي|بوليش|سيراميك|حماية|تعقيم", "car wash|detailing|polish|interior cleaning|ceramic coating"),
    c("auto-accessories", "إكسسوارات وصوتيات وتظليل", "Accessories, audio & tint", "🎶", "اكسسوارات سيارات|صوتيات|تظليل|زجاج|سبيكر|شاشة|كاميرا خلفية|فرش", "car accessories|audio|window tint|speakers|screen|rear camera|seat covers"),
    c("auto-rental", "تأجير سيارات", "Car rental", "🚖", "تأجير سيارات|ايجار سيارات|سيارة مع سائق|ريزرفيشن|سيارات اعراس", "car rental|rent a car|chauffeur|wedding cars"),
    c("auto-towing", "سطحة وإنقاذ طرق", "Towing & roadside help", "🛻", "سطحة|سحب سيارات|انقاذ|وينش|عطل طريق|تشغيل بطارية", "towing|roadside assistance|winch|breakdown|jump start"),
    c("auto-moto", "دراجات نارية وهوائية", "Motorcycles & bicycles", "🏍️", "دراجة نارية|موتور|دراجة هوائية|بسكليت|سكوتر|قطع دراجات|صيانة دراجات", "motorcycle|scooter|bicycle|bike shop|bike parts"),
    c("auto-driving", "مدارس تعليم قيادة", "Driving schools", "🚦", "تعليم قيادة|مدرسة قيادة|رخصة قيادة|سواقة|تدريب سواقة|امتحان", "driving school|driving lessons|license|learn to drive"),
    c("auto-papers", "معاملات وتسجيل سيارات", "Car paperwork & registration", "📋", "معاملات سيارات|تسجيل|نقل ملكية|فحص فني|ترخيص|تأمين سيارات|تعقيب", "car paperwork|registration|ownership transfer|inspection|insurance"),
  ]),

  c("food-shops", "المواد الغذائية والأسواق", "Food shops & markets", "🛒", "مواد غذائية|بقالة|سوبرماركت|اسواق|تموين|محل مواد", "groceries|food shops|supermarket|market|provisions", [
    c("food-supermarket", "سوبرماركت ومولات", "Supermarkets & malls", "🛒", "سوبرماركت|بقالة|مول|هايبر|مولات|تسوق|مركز تسوق", "supermarket|grocery|mall|hypermarket|shopping center"),
    c("food-bakery", "أفران ومخابز", "Bakeries", "🥖", "فرن|افران|مخبز|خبز|خبز عربي|خبز صاج|صمون|توست", "bakery|bread|arabic bread|toast|baker", [
      c("food-bakery-bread", "خبز عربي وصمون", "Arabic bread & rolls", "🫓", "خبز|فرن آلي|فرن حجري|صمون|صاج", "bread|arabic bread|stone oven|rolls"),
      c("food-bakery-pastry", "معجنات ومناقيش", "Pastries & manakish", "🥐", "معجنات|مناقيش|فطاير|كرواسون|سمبوسك", "pastries|manakish|croissant|samosa"),
    ]),
    c("food-sweets", "حلويات وبقلاوة", "Sweets & baklava", "🍯", "حلويات|بقلاوة|كنافة|معمول|بسبوسة|حلاوة|هريسة|مشبك|تمر", "sweets|baklava|kunafa|maamoul|basbousa|halawa|dates", [
      c("food-sweets-arabic", "حلويات عربية وشرقية", "Arabic sweets", "🥮", "حلويات عربية|بقلاوة|كنافة|معمول|ملبن|راحة|حلبية", "arabic sweets|baklava|kunafa|maamoul|turkish delight"),
      c("food-sweets-cakes", "كاتو وشوكولا وتورتات", "Cakes & chocolate", "🎂", "كاتو|تورتة|شوكولا|حلويات غربية|كب كيك|بسكويت|تورتات", "cakes|chocolate|western sweets|cupcakes|cookies"),
    ]),
    c("food-butcher", "لحوم وجزارة", "Butcher", "🥩", "جزار|لحمة|لحوم|لحم غنم|لحم عجل|ذبح|ذبائح|مفروم|سجق|مرتديلا", "butcher|meat|lamb|beef|minced|sausage"),
    c("food-poultry", "دجاج وبيض", "Poultry & eggs", "🐔", "فروج|دجاج|بيض|فروج مذبوح|ديك رومي|بط", "poultry|chicken|eggs|turkey|duck"),
    c("food-fish", "أسماك ومأكولات بحرية", "Fish & seafood", "🐟", "سمك|اسماك|سمّاك|روبيان|جمبري|محار|سمك طازج|سمك مجمد", "fish|seafood|fishmonger|shrimp|fresh fish"),
    c("food-vegetables", "خضار وفواكه", "Vegetables & fruits", "🥬", "خضار|فواكه|فاكهة|بسطة|حسبة|بقدونس|ليمون|طماطم|بطاطا", "vegetables|fruits|greengrocer|produce|market stall"),
    c("food-spices", "عطارة وبهارات ومكسرات", "Spices, nuts & herbs", "🌿", "عطار|عطارة|بهارات|مكسرات|اعشاب|زهورات|لوز|فستق|بذر|تمور", "spices|nuts|herbs|attar|almonds|pistachio|seeds|dates", [
      c("food-spices-spices", "بهارات وتوابل", "Spices", "🌶️", "بهارات|توابل|كمون|فلفل|كاري|زعتر|سماق", "spices|cumin|pepper|curry|thyme|sumac"),
      c("food-spices-nuts", "مكسرات وبذر وتمور", "Nuts, seeds & dates", "🥜", "مكسرات|لوز|فستق|جوز|بذر|حمص|تمر|كاجو", "nuts|almonds|pistachio|walnuts|seeds|dates|cashew"),
      c("food-spices-herbs", "أعشاب طبية وزهورات", "Medicinal herbs", "🍃", "اعشاب طبية|زهورات|يانسون|بابونج|مريمية|علاج بالاعشاب", "medicinal herbs|herbal tea|anise|chamomile|sage"),
    ]),
    c("food-dairy", "ألبان وأجبان", "Dairy & cheese", "🧀", "ألبان|حليب|لبن|جبنة|اجبان|سمنة|قشطة|لبنة|شنكليش", "dairy|milk|yogurt|cheese|ghee|cream|labneh"),
    c("food-wholesale", "جملة مواد غذائية", "Food wholesale", "📦", "جملة|تجار جملة|مستودع غذائي|سكر|رز|زيت|معلبات|توزيع", "wholesale|food distribution|warehouse|sugar|rice|oil|canned"),
    c("food-honey", "عسل وزيوت ومونة", "Honey, oils & pantry goods", "🍯", "عسل|زيت زيتون|مونة|مخللات|مربيات|دبس|رب البندورة|مكدوس|صابون", "honey|olive oil|preserves|pickles|jam|molasses|tomato paste"),
    c("food-water", "مياه وتعبئة", "Water & refills", "💧", "مياه|تعبئة مياه|مياه شرب|غالونات|فلتر مياه|صهريج", "water|water refill|drinking water|gallons|water filter|tanker"),
    c("food-frozen", "مجمدات ومعلبات", "Frozen & canned food", "🧊", "مجمدات|معلبات|ثلج|ايس|كبة مجمدة|خضار مجمد", "frozen food|canned|ice|frozen vegetables"),
    c("food-coffee", "محامص بن وقهوة", "Coffee roasters", "☕", "محمصة|بن|قهوة|قهوة عربية|قهوة تركية|هيل|محامص", "coffee roaster|beans|arabic coffee|turkish coffee|cardamom"),
    c("food-drinks", "عصائر ومشروبات ومثلجات", "Drinks & ice cream", "🥤", "عصير|مشروبات|مياه غازية|مثلجات|بوظة|مشروب طاقة", "drinks|juice|soft drinks|ice cream|energy drinks"),
  ]),

  c("education", "التعليم والتدريب", "Education & training", "🎓", "تعليم|مدرسة|دورة|تدريب|معهد|جامعة|درس|مدرس", "education|school|course|training|institute|university|tutor", [
    c("edu-schools", "مدارس", "Schools", "🏫", "مدرسة|مدارس|ابتدائية|اعدادية|ثانوية|خاصة|عامة|دولية", "school|primary|middle|high school|private school|international school", [
      c("edu-schools-primary", "مدارس ابتدائية وإعدادية", "Primary & middle schools", "📘", "ابتدائية|اعدادية|حلقة اولى|حلقة ثانية|تعليم اساسي", "primary|middle school|elementary"),
      c("edu-schools-secondary", "مدارس ثانوية", "Secondary schools", "📗", "ثانوية|علمي|ادبي|بكالوريا|تاسع|عاشر|حادي عشر", "secondary|high school|baccalaureate|grade 12"),
      c("edu-schools-international", "مدارس دولية ولغات", "International & language schools", "🌍", "دولية|لغات|بريطانية|امريكية|فرنسية|ألمانية|منهج دولي", "international school|british|american|french|german curriculum"),
    ]),
    c("edu-kindergarten", "حضانات ورياض أطفال", "Nurseries & kindergartens", "🧸", "حضانة|روضة|رياض اطفال|حضانات|روضات|رعاية اطفال|مربية", "nursery|kindergarten|daycare|preschool|childcare"),
    c("edu-institutes", "معاهد وجامعات", "Institutes & universities", "🏛️", "جامعة|معهد|كلية|دراسات عليا|ماجستير|دكتوراه|معهد متوسط", "university|institute|college|postgraduate|masters|phd", [
      c("edu-institutes-universities", "جامعات وكليات", "Universities & colleges", "🎓", "جامعة|كلية|خاصة|حكومية|افتراضية|تعليم مفتوح", "university|college|private|public|virtual|open learning"),
      c("edu-institutes-technical", "معاهد تقنية ومتوسطة", "Technical institutes", "🛠️", "معهد تقني|معهد متوسط|مهني|تمريض|هندسي|تجاري", "technical institute|vocational|nursing|engineering|commercial"),
    ]),
    c("edu-languages", "معاهد لغات", "Language institutes", "🗣️", "لغات|انكليزي|المانية|تركي|فرنسي|ايطالي|روسي|معهد لغة|ايلتس|توفل", "languages|english|german|turkish|french|italian|russian|ielts|toefl", [
      c("edu-languages-english", "لغة إنكليزية وآيلتس", "English & IELTS", "🇬🇧", "انكليزي|انجليزي|ايلتس|توفل|محادثة|english", "english|ielts|toefl|conversation"),
      c("edu-languages-german", "لغة ألمانية", "German language", "🇩🇪", "المانية|ألماني|غوته|تليك|امتحان لغة المانية|المانيا", "german|goethe|telc|german exam"),
      c("edu-languages-turkish", "لغة تركية", "Turkish language", "🇹🇷", "تركي|تركية|اللغة التركية|اسطنبول|تومر", "turkish|tomer|istanbul"),
      c("edu-languages-other", "فرنسي وإيطالي وروسي وغيرها", "French, Italian, Russian & more", "🌐", "فرنسي|فرنسية|ايطالي|روسي|اسباني|صيني|كوري|عربي لغير الناطقين", "french|italian|russian|spanish|chinese|korean|arabic for foreigners"),
    ]),
    c("edu-tutors", "دروس خصوصية ومدرسون", "Private tutors", "👩‍🏫", "مدرس خصوصي|دروس خصوصية|استاذ|معلم|تدريس|مدرسة خصوصية|تقوية", "private tutor|private lessons|teacher|tutoring|coaching", [
      c("edu-tutors-math", "رياضيات وفيزياء وكيمياء", "Math, physics & chemistry", "➗", "رياضيات|فيزياء|كيمياء|علوم|مدرس رياضيات|مدرس فيزياء|مدرس كيمياء", "math|physics|chemistry|science tutor"),
      c("edu-tutors-languages", "عربي وإنكليزي وفرنسي (مدرسين)", "Language teachers", "📖", "مدرس عربي|مدرس انكليزي|مدرس فرنسي|قواعد|املاء|تعبير", "arabic teacher|english teacher|french teacher|grammar"),
      c("edu-tutors-biology", "أحياء وجغرافيا وتاريخ", "Biology, geography & history", "🧬", "احياء|جغرافيا|تاريخ|تربية وطنية|فلسفة|علم نفس", "biology|geography|history|philosophy"),
      c("edu-tutors-primary", "تقوية ابتدائي وتأسيس", "Primary support & basics", "✏️", "تأسيس|تقوية|ابتدائي|قراءة وكتابة|صعوبات تعلم|تأخر دراسي", "primary support|basics|reading and writing|learning difficulties"),
    ]),
    c("edu-training", "دورات تدريبية", "Training courses", "📚", "دورة|دورات|تدريب|كورس|كورسات|ورشة|شهادة|تأهيل", "course|courses|training|workshop|certificate", [
      c("edu-training-computer", "حاسوب وبرمجة وتصميم", "Computer, coding & design", "💻", "حاسوب|كمبيوتر|برمجة|تصميم|فوتوشوب|اكسل|ويب|ICDL|مونتاج", "computer|coding|design|photoshop|excel|web|icdl|video editing"),
      c("edu-training-accounting", "محاسبة وإدارة وتسويق", "Accounting, management & marketing", "🧮", "محاسبة|ادارة|تسويق|مبيعات|موارد بشرية|اكسل محاسبة|برنامج محاسبة", "accounting|management|marketing|sales|hr|accounting software"),
      c("edu-training-vocational", "دورات مهنية وحرفية", "Vocational courses", "🔧", "كهرباء|سباكة|ميكانيك|حلاقة|خياطة|طبخ|تجميل|تمديدات|دورة مهنية", "electrical|plumbing|mechanics|barber|sewing|cooking|beauty|vocational"),
      c("edu-training-medical", "دورات طبية وإسعاف", "Medical & first-aid courses", "⛑️", "اسعاف|اسعافات اولية|تمريض|دورة طبية|تحاليل|اشعة|مساعد طبيب", "first aid|nursing course|medical course|lab technician"),
      c("edu-training-personal", "تنمية بشرية ومهارات", "Personal development & skills", "🧠", "تنمية بشرية|مهارات|قيادة|تواصل|ثقة بالنفس|اتيكيت|برمجة لغوية", "personal development|soft skills|leadership|communication|etiquette|nlp"),
    ]),
    c("edu-music", "تعليم موسيقى وفنون", "Music & arts lessons", "🎵", "موسيقى|عود|غيتار|بيانو|رسم|فن|خط عربي|كمان|ناي|تعليم موسيقى", "music|oud|guitar|piano|drawing|calligraphy|violin|arts lessons"),
    c("edu-special", "تعليم خاص ودعم تعلّم", "Special education & learning support", "💛", "ذوي احتياجات|توحد|صعوبات تعلم|فرط حركة|تعليم خاص|تخاطب|تأهيل|مراكز دمج", "special needs|autism|learning difficulties|adhd|special education|inclusion"),
  ]),

  c("realestate", "العقارات", "Real estate", "🏠", "عقار|عقارات|بيت|شقة|ارض|مكتب عقاري|سمسار", "real estate|property|house|apartment|land|agent|broker", [
    c("re-sale", "بيع وشراء عقارات", "Property sales", "🏘️", "بيع شقة|شراء شقة|بيع بيت|شقق للبيع|فيلا|محل للبيع|مكتب للبيع", "property for sale|apartments for sale|villa|shop for sale"),
    c("re-rent", "إيجار عقارات", "Property rentals", "🔑", "ايجار|شقة للايجار|بيت للايجار|محل للايجار|مكتب للايجار|مستودع للايجار", "for rent|apartment for rent|shop for rent|office for rent|warehouse for rent"),
    c("re-land", "أراضي وأراضي زراعية", "Land & farms", "🌄", "ارض|اراضي|ارض زراعية|ارض بناء|مزرعة|عقار زراعي|اسهم", "land|plots|agricultural land|building land|farm"),
    c("re-furnished", "شقق مفروشة وسياحية", "Furnished & holiday apartments", "🛏️", "مفروش|شقق مفروشة|ايجار يومي|شقق سياحية|استديو|استراحة|شاليه", "furnished|holiday apartments|daily rent|studio|chalet"),
    c("re-management", "إدارة وصيانة أملاك", "Property management", "📑", "ادارة املاك|تحصيل ايجارات|صيانة عقارات|حارس عمارة|ادارة عمارات", "property management|rent collection|building maintenance"),
    c("re-valuation", "تقييم وتخمين عقاري", "Property valuation", "📊", "تخمين|تقييم عقار|خبير عقاري|كشف عقاري|خبير مثمن", "valuation|appraisal|real estate expert|survey"),
  ]),

  c("legal", "القانونية والمحاسبة", "Legal & accounting", "⚖️", "قانون|قانوني|محاماة|محامي|محاسب|كاتب عدل|ترجمة", "legal|law|lawyer|accountant|notary|translation", [
    c("legal-lawyers", "محامون", "Lawyers", "👨‍⚖️", "محامي|محامية|مكتب محاماة|استشارة قانونية|دعوى|قضية|وكيل", "lawyer|attorney|law firm|legal advice|case", [
      c("legal-lawyers-civil", "قضايا مدنية وتجارية", "Civil & commercial", "📜", "مدني|تجاري|عقود|شركات|ديون|تعويضات|ملكية", "civil|commercial|contracts|companies|debts|compensation"),
      c("legal-lawyers-family", "أحوال شخصية وأسرة", "Family law", "👨‍👩‍👧", "احوال شخصية|طلاق|زواج|حضانة|نفقة|ارث|وصية|عائلي", "family law|divorce|marriage|custody|alimony|inheritance|will"),
      c("legal-lawyers-criminal", "قضايا جزائية", "Criminal law", "🚔", "جزائي|جنائي|جنحة|جناية|دفاع|قضايا جزائية|محكمة جزاء", "criminal|felony|misdemeanor|defense"),
      c("legal-lawyers-realestate", "قضايا عقارية", "Real estate law", "🏠", "عقاري|تسجيل عقاري|نزاع عقار|ملكية عقار|ايجارات|اخلاء", "real estate law|property dispute|ownership|eviction|rent law"),
      c("legal-lawyers-labor", "عمل وعمال وتأمينات", "Labor law", "👷", "عمل|عمال|فصل تعسفي|تأمينات|رواتب|عقد عمل", "labor law|employment|wrongful dismissal|insurance|contract"),
    ]),
    c("legal-notary", "كاتب عدل وتوثيق", "Notary & attestation", "🖋️", "كاتب عدل|توثيق|وكالة|تصديق|اعتماد|كتابة عدل|وكالات", "notary|attestation|power of attorney|certification"),
    c("legal-accounting", "محاسبة وضرائب وتدقيق", "Accounting, tax & audit", "🧮", "محاسب|محاسبة|ضرائب|تدقيق|ميزانية|دفاتر|ضريبة دخل|ضريبة قيمة مضافة", "accountant|accounting|tax|audit|balance sheet|bookkeeping|vat"),
    c("legal-translation", "مكاتب ترجمة", "Translation offices", "🌐", "ترجمة|مترجم|ترجمة معتمدة|ترجمة محلفة|ترجمة وثائق|ترجمة فورية", "translation|translator|certified translation|document translation|interpreting"),
    c("legal-documents", "تعقيب معاملات وخدمات حكومية", "Paperwork & government services", "📂", "تعقيب|معاملات|معقب|جوازات|اوراق ثبوتية|سجل تجاري|ترخيص|اخراج قيد", "paperwork|government services|passports|documents|commercial register|permits"),
  ]),

  c("events", "المناسبات والأفراح", "Events & weddings", "🎉", "مناسبات|افراح|عرس|حفلة|زفاف|حفل|خطوبة|تنظيم", "events|weddings|party|celebration|engagement|planning", [
    c("ev-halls", "صالات أفراح ومناسبات", "Wedding & event halls", "🏛️", "صالة|صالات|قاعة|قاعات|صالة افراح|صالة عزاء|مسرح|قاعة حفلات", "hall|wedding hall|event hall|banquet|venue|ballroom"),
    c("ev-photo", "تصوير وفيديو مناسبات", "Event photography & video", "📸", "مصور|تصوير|فيديو|تصوير اعراس|تصوير حفلات|دورون|سينمائي|البوم", "photographer|photography|wedding video|drone|album"),
    c("ev-planners", "تنظيم حفلات وديكور", "Event planning & decor", "🎈", "تنظيم حفلات|ديكور|كوشة|تزيين|بالونات|منظم حفلات|ديكور اعراس", "event planner|decor|stage|balloons|wedding decor"),
    c("ev-music", "فرق موسيقية ودي جي", "Bands & DJs", "🎤", "فرقة|دي جي|مطرب|زفة|دبكة|عرضة|اوركسترا|صوتيات حفلات", "band|dj|singer|zaffe|dabke|orchestra|sound system"),
    c("ev-catering", "ضيافة وبوفيهات", "Catering & buffets", "🍽️", "ضيافة|بوفيه|كاترينغ|طعام مناسبات|ولائم|مناسف|ضيافة عزاء|تحضير", "catering|buffet|banquet food|feast|hospitality"),
    c("ev-flowers", "ورد وهدايا", "Flowers & gifts", "💐", "ورد|زهور|باقة|هدايا|بوكيه|تغليف هدايا|ورد صناعي|تنسيق ورد", "flowers|bouquet|gifts|gift wrapping|artificial flowers"),
    c("ev-cars", "سيارات أعراس", "Wedding cars", "🚗", "سيارة عرس|سيارة زفة|ليموزين|سيارات فخمة|تأجير سيارة عروس", "wedding car|limousine|luxury cars|bridal car"),
    c("ev-cards", "بطاقات دعوة وطباعة", "Invitations & printing", "💌", "بطاقات دعوة|كروت افراح|طباعة بطاقات|دعوات|شكر|بطاقة", "invitations|wedding cards|printing|thank you cards"),
    c("ev-rental", "تأجير مستلزمات حفلات", "Party equipment rental", "🪑", "تأجير كراسي|تأجير طاولات|خيم|مظلات|تأجير مستلزمات|اطباق|فرش حفلات", "party rental|chairs|tables|tents|canopies|tableware"),
  ]),

  c("home-furniture", "الأثاث والمفروشات والديكور", "Furniture, home textiles & decor", "🛋️", "اثاث|مفروشات|ديكور|غرف|مفروشات بيت|اثاث منزلي", "furniture|home textiles|decor|rooms|home furnishing", [
    c("fur-shops", "محلات أثاث", "Furniture shops", "🛋️", "اثاث|غرفة نوم|غرفة جلوس|غرفة سفرة|كنب|طقم|مكتب|اثاث مكتبي", "furniture|bedroom|living room|dining|sofa|office furniture", [
      c("fur-living", "غرف جلوس وكنب", "Living rooms & sofas", "🛋️", "جلوس|كنب|صالون|طقم جلوس|قعدة عربية|زاوية|طاولات", "living room|sofa|salon|corner sofa|tables"),
      c("fur-bedroom", "غرف نوم", "Bedrooms", "🛏️", "غرفة نوم|سرير|خزانة|تسريحة|كومودينو|غرف نوم|غرفة مفرد", "bedroom|bed|wardrobe|dresser|nightstand"),
      c("fur-dining", "غرف سفرة وطعام", "Dining rooms", "🍽️", "سفرة|طاولة طعام|كراسي سفرة|بوفيه|غرفة طعام|مطبخ", "dining|dining table|chairs|buffet"),
      c("fur-kids", "غرف أطفال وتسالي", "Kids' rooms", "🧸", "غرفة اطفال|سرير اطفال|اولاد|بنات|مكتب اطفال|مهد", "kids room|kids bed|crib|children's desk"),
      c("fur-office", "أثاث مكتبي وتجهيز محلات", "Office furniture & shop fitting", "🗄️", "اثاث مكتبي|مكتب|كراسي مكاتب|رفوف|فترينات|تجهيز محلات|ستاندات", "office furniture|desks|chairs|shelves|display cases|shop fitting"),
      c("fur-outdoor", "أثاث حدائق وخارجي", "Outdoor furniture", "⛱️", "اثاث حدائق|جلسات خارجية|مظلات|كراسي بلاستيك|طاولات خارجية|بحرة", "garden furniture|outdoor seating|umbrellas|plastic chairs"),
    ]),
    c("fur-kitchen", "مطابخ وخزائن جاهزة", "Kitchens & built-in cabinets", "🍳", "مطبخ|مطابخ|خزائن مطبخ|مطبخ جاهز|الومنيوم مطبخ|مطبخ خشب|اكسسوار مطبخ", "kitchen|kitchens|kitchen cabinets|ready kitchen|built-in"),
    c("fur-mattress", "فرشات وأسرّة", "Mattresses & beds", "🛌", "فرشة|فرشات|مرتبة|مخدات|سرير طبي|فرش اسفنج|لحاف", "mattress|mattresses|pillows|medical bed|foam"),
    c("fur-carpets", "سجاد وموكيت", "Carpets & rugs", "🧶", "سجاد|موكيت|كليم|بساط|سجادة|سجاد عجمي|سجاد تركي|ارضيات", "carpets|rugs|carpeting|persian rug|turkish carpet|flooring"),
    c("fur-lighting", "ثريات وإنارة", "Chandeliers & lighting", "💡", "ثريا|ثريات|انارة|اباجورة|اضاءة|ليد|فوانيس|اضاءات", "chandelier|lighting|lamp|led|lanterns"),
    c("fur-decor", "ديكور وإكسسوارات منزل", "Home decor & accessories", "🖼️", "ديكور|اكسسوارات|لوحات|مرايا|تحف|شمعدانات|ورد صناعي|اطارات|ساعات حائط", "home decor|accessories|paintings|mirrors|ornaments|candles|frames|wall clocks"),
    c("fur-linen", "مفروشات منزلية وبياضات", "Home linen & bedding", "🛏️", "مفروشات|بياضات|شراشف|بطانيات|حرامات|مناشف|اطقم نوم|لحف|منشفة", "linen|bedding|sheets|blankets|towels|bed sets|duvets"),
    c("fur-antiques", "أنتيكا وتحف", "Antiques & collectibles", "🏺", "انتيكا|تحف|قديم|تراث|نحاسيات|ساعات قديمة|عملات|طوابع", "antiques|collectibles|heritage|brassware|old watches|coins|stamps"),
  ]),

  c("hardware", "العدة والأدوات ومواد البناء", "Hardware, tools & building supplies", "🧰", "عدة|ادوات|مواد بناء|حدادة|ادوات صحية|دهانات|بويا", "hardware|tools|building supplies|paint|sanitary", [
    c("hw-tools", "عدة وأدوات يدوية وكهربائية", "Hand & power tools", "🔨", "عدة|ادوات|مثقاب|مفك|شنيور|صاروخ|عدة يدوية|عدة كهربائية|براغي", "tools|drill|screwdriver|grinder|hand tools|power tools|screws"),
    c("hw-paint", "دهانات ومواد طلاء", "Paints & coatings", "🎨", "دهانات|بويا|طلاء|معجون|سيلر|فرشاة|رول|ألوان|مواد عزل", "paints|coatings|putty|sealer|brushes|rollers|insulation"),
    c("hw-sanitary", "أدوات صحية وسيراميك", "Sanitary ware & ceramics", "🚽", "ادوات صحية|مغاسل|بانيو|كرسي حمام|سيراميك|بلاط|خلاطات|بورسلان", "sanitary ware|sinks|bathtubs|toilets|ceramics|tiles|mixers|porcelain"),
    c("hw-electric", "مواد كهربائية وإنارة", "Electrical supplies", "🔌", "مواد كهربائية|اسلاك|قواطع|مفاتيح|لمبات|ليد|كابلات|لوحات|كهرباء جملة", "electrical supplies|wires|breakers|switches|bulbs|led|cables|panels"),
    c("hw-iron", "حديد وإسمنت وبلوك", "Iron, cement & blocks", "🏗️", "حديد|اسمنت|بلوك|رمل|بحص|حجر|طوب|مواد انشائية|اسفلت|زفت", "iron|steel|cement|blocks|sand|gravel|stone|bricks|construction materials"),
    c("hw-wood", "خشب وأبواب وأرضيات", "Wood, doors & flooring", "🪵", "خشب|اخشاب|ابواب|باركيه|ايه دي اف|mdf|خشب زان|موزاييك|ابواب خشبية", "wood|timber|doors|parquet|mdf|flooring"),
    c("hw-plumbing", "مواد سباكة وأنابيب", "Plumbing supplies & pipes", "🚰", "مواد سباكة|انابيب|بوري|جلب|وصلات|فلاتر|صنابير|خزانات|بوريات", "plumbing supplies|pipes|fittings|taps|tanks|filters"),
    c("hw-glass", "مواد ألمنيوم وزجاج", "Aluminum & glass supplies", "🪟", "مواد المنيوم|بروفيل|زجاج|مواد زجاج|اكسسوار المنيوم|سكريت", "aluminum supplies|profiles|glass sheets|accessories"),
    c("hw-agri", "أدوات زراعية وري", "Garden tools & irrigation", "🌱", "ادوات زراعية|ري|رشاش|منجل|مضخات|انابيب ري|معدات ري", "garden tools|irrigation|sprinklers|pumps|hoses"),
  ]),

  c("travel", "السفر والسياحة", "Travel & tourism", "✈️", "سفر|سياحة|رحلات|فندق|طيران|حجز|تأشيرة", "travel|tourism|trips|hotel|flights|booking|visa", [
    c("tr-agency", "مكاتب سفر وسياحة", "Travel agencies", "🧳", "مكتب سفر|مكتب سياحة|حجز طيران|تذاكر|رحلات سياحية|عمرة|حج|باكج", "travel agency|flight booking|tickets|tours|umrah|hajj|package"),
    c("tr-hotels", "فنادق ونزل", "Hotels & guesthouses", "🏨", "فندق|فنادق|نزل|بيت ضيافة|موتيل|اوتيل|منتجع|استراحة", "hotel|guesthouse|motel|resort|lodging"),
    c("tr-visa", "خدمات تأشيرات وإقامات", "Visa & residency services", "🛂", "تأشيرة|فيزا|اقامة|جواز|تقديم هجرة|لم شمل|لجوء|ترجمة سفر", "visa|residency|passport|immigration|family reunion|asylum"),
    c("tr-guides", "مرشدون سياحيون ورحلات", "Tour guides & excursions", "🗺️", "مرشد سياحي|دليل سياحي|جولات|رحلة يومية|سفاري|رحلات جبلية|معالم", "tour guide|excursions|day trips|safari|hiking trips|sights"),
    c("tr-transport", "نقل سياحي ورحلات بين المدن", "Tourist & intercity transport", "🚌", "نقل سياحي|باص|حافلة|ميكروباص|رحلات بين المدن|ترانسفير|مطار", "tourist transport|bus|minibus|intercity|transfer|airport"),
  ]),

  c("kids", "الأطفال والألعاب", "Kids & toys", "🧸", "اطفال|العاب|بيبي|رضع|مواليد|مستلزمات اطفال", "kids|toys|baby|infants|newborn|children's items", [
    c("kid-toys", "ألعاب أطفال", "Toys", "🧸", "العاب|لعب|دمى|سيارات اطفال|ليجو|بازل|دراجة اطفال|ألعاب تعليمية", "toys|dolls|toy cars|lego|puzzles|kids bikes|educational toys"),
    c("kid-baby", "مستلزمات أطفال وبيبي", "Baby supplies", "🍼", "بيبي|رضاعة|حفاضات|عربة اطفال|كرسي سيارة|حليب اطفال|مهد|مستلزمات رضع", "baby supplies|bottles|diapers|stroller|car seat|formula|crib"),
    c("kid-play", "ملاهي وصالات ألعاب أطفال", "Play areas & kids entertainment", "🎠", "ملاهي|ملعب اطفال|صالة العاب|مدينة ملاهي|حفلات اطفال|عيد ميلاد|بالونات", "play area|kids entertainment|amusement|children's parties|birthday"),
    c("kid-school", "قرطاسية ومستلزمات مدرسية", "School supplies", "🎒", "قرطاسية|حقائب مدرسية|دفاتر|اقلام|مريول|مستلزمات مدرسية|كتب مدرسية", "stationery|school bags|notebooks|pens|school supplies|textbooks"),
  ]),

  c("pets", "الحيوانات الأليفة", "Pets & animals", "🐾", "حيوانات|قطط|كلاب|طيور|اسماك زينة|بيطري|حيوان اليف", "pets|cats|dogs|birds|aquarium|vet|animals", [
    c("pet-vet", "أطباء بيطريون", "Veterinarians", "🩺", "بيطري|طبيب بيطري|عيادة بيطرية|تلقيح|تعقيم حيوانات|مواشي|حيوانات اليفة", "vet|veterinarian|animal clinic|vaccination|spay|livestock vet"),
    c("pet-shop", "محلات حيوانات أليفة", "Pet shops", "🐶", "قطط|كلاب|طيور|ببغاء|حمام|ارانب|اسماك زينة|حوض|هامستر|بيع حيوانات", "cats|dogs|birds|parrot|pigeons|rabbits|aquarium fish|pet shop"),
    c("pet-food", "أعلاف ومستلزمات حيوانات", "Pet food & supplies", "🦴", "طعام قطط|طعام كلاب|اعلاف|رمل قطط|اقفاص|مستلزمات حيوانات|اكسسوارات حيوانات", "pet food|cat food|dog food|feed|cat litter|cages|pet accessories"),
    c("pet-grooming", "عناية وتدريب حيوانات", "Grooming & training", "✂️", "تجميل حيوانات|استحمام|قص|تدريب كلاب|فندق حيوانات|رعاية|بنسيون", "grooming|bathing|dog training|pet hotel|boarding|pet care"),
  ]),

  c("agriculture", "الزراعة والثروة الحيوانية", "Agriculture & livestock", "🌾", "زراعة|مزرعة|فلاح|مواشي|نباتات|ثروة حيوانية|اسمدة|بذور", "agriculture|farm|farmer|livestock|plants|fertilizer|seeds", [
    c("ag-supplies", "مستلزمات زراعية (أسمدة وبذور)", "Farm supplies", "🌱", "سماد|اسمدة|بذور|مبيدات|اشتال|تربة|مستلزمات زراعية|بيت بلاستيكي", "fertilizer|seeds|pesticides|seedlings|soil|farm supplies|greenhouse"),
    c("ag-nursery", "مشاتل ونباتات زينة", "Nurseries & ornamental plants", "🪴", "مشتل|نباتات|نبتة|ورد|اشجار|اشجار مثمرة|نباتات زينة|اصيص|زريعة", "nursery|plants|flowers|trees|fruit trees|ornamental|pots|saplings"),
    c("ag-equipment", "معدات وآلات زراعية", "Farm machinery", "🚜", "جرار|معدات زراعية|حصادة|محراث|مضخة|الات زراعية|قطع جرارات", "tractor|farm machinery|harvester|plow|pump|tractor parts"),
    c("ag-poultry", "مداجن ومزارع", "Poultry & farms", "🐓", "مداجن|مزرعة|دجاج|بيض|مزارع ابقار|اغنام|مزرعة سمك", "poultry farm|farm|eggs|dairy farm|sheep|fish farm"),
    c("ag-bees", "نحل وعسل", "Beekeeping & honey", "🐝", "نحل|عسل|خلايا|مناحل|شمع عسل|غذاء ملكات|نحال", "bees|honey|hives|apiary|beeswax|royal jelly"),
    c("ag-irrigation", "ري وطاقة زراعية", "Irrigation & farm energy", "💧", "ري|ري بالتنقيط|آبار|مضخات|طاقة شمسية زراعية|تمديد ري", "irrigation|drip|wells|pumps|solar farm power"),
    c("ag-livestock", "تجارة مواشي وأعلاف", "Livestock & feed trade", "🐑", "مواشي|اغنام|ابقار|اعلاف|تجارة مواشي|اضاحي|عجول|ماعز", "livestock|sheep|cattle|feed|animal trade|goats|calves"),
  ]),

  c("crafts", "الحرف والمهن اليدوية", "Crafts & handmade", "🧵", "حرفة|حرف|يدوي|مهنة|صناعة يدوية|تراث|معلم", "crafts|handmade|artisan|heritage|handicraft", [
    c("cr-tailor", "خياطة وتفصيل", "Tailoring", "✂️", "خياط|خياطة|تفصيل|تعديل ملابس|خياط رجالي|خياطة نسائية|تطريز", "tailor|sewing|bespoke|alterations|men's tailor|women's tailor", [
      c("cr-tailor-men", "خياطة رجالية", "Men's tailoring", "🤵", "خياط رجالي|بدلات|تفصيل بدلة|قمصان|دشداشة|ثوب", "men's tailor|suits|bespoke suit|shirts|thobe"),
      c("cr-tailor-women", "خياطة نسائية وفساتين", "Women's tailoring & dresses", "👗", "خياطة نسائية|فساتين|تفصيل فستان|عبايات|تعديل|موديلات", "women's tailor|dresses|dressmaking|abayas|alterations"),
      c("cr-tailor-alter", "تعديل وتصليح ملابس", "Alterations & repair", "🪡", "تعديل|تقصير|تصليح|سحاب|رتي|ترقيع", "alterations|hemming|repair|zipper|mending"),
    ]),
    c("cr-shoemaker", "إصلاح أحذية وجلديات", "Shoe & leather repair", "👞", "اسكافي|اصلاح احذية|تصليح حذاء|جلديات|حقائب|ترميم جلد|مفاتيح", "cobbler|shoe repair|leather repair|bags|keys"),
    c("cr-watch", "ساعات وتصليحها", "Watches & repair", "⌚", "ساعات|ساعاتي|تصليح ساعات|بطارية ساعة|ساعة يد|ساعات ذكية|اساور", "watches|watchmaker|watch repair|watch battery|smartwatch"),
    c("cr-glass", "زجاج يدوي وفخار", "Hand-blown glass & pottery", "🏺", "زجاج يدوي|فخار|خزف|سيراميك يدوي|تحف زجاج|نفخ زجاج|فخاري", "hand-blown glass|pottery|ceramics|handmade|glassware"),
    c("cr-soap", "صابون وزيوت (غار وحلبي)", "Soap & oils (Aleppo)", "🧼", "صابون غار|صابون حلبي|صابون|زيت غار|زيوت|مستحضرات طبيعية|طبيعي", "aleppo soap|laurel soap|soap|natural oils|natural cosmetics"),
    c("cr-embroidery", "تطريز وأعمال يدوية", "Embroidery & handmade work", "🪢", "تطريز|كروشيه|تريكو|شغل ابرة|مكرمة|شغل يدوي|اعمال يدوية|هدايا يدوية", "embroidery|crochet|knitting|needlework|macrame|handmade gifts"),
    c("cr-mosaic", "موزاييك وخشب مطعّم وأرابيسك", "Mosaic, inlay & arabesque", "🔷", "موزاييك|خشب مطعم|ارابيسك|صدف|نقش خشب|عجمي|تحف شرقية", "mosaic|wood inlay|arabesque|mother of pearl|oriental crafts"),
    c("cr-carpet", "سجاد يدوي وكليم", "Handmade carpets & kilims", "🧶", "سجاد يدوي|كليم|نسيج يدوي|حياكة|نول|سجاد عجمي", "handmade carpets|kilim|handloom|weaving|persian"),
    c("cr-brass", "نحاسيات وحدادة فنية", "Brassware & art metalwork", "🔔", "نحاس|نحاسيات|حدادة فنية|فضيات|تحف معدنية|ابريق|دلة", "brassware|art metalwork|silverware|metal crafts|dallah"),
  ]),

  c("jewelry", "الذهب والمجوهرات والساعات", "Gold, jewelry & watches", "💍", "ذهب|مجوهرات|صاغة|خاتم|اساور|فضة|الماس|دبلة", "gold|jewelry|goldsmith|ring|bracelets|silver|diamond", [
    c("jw-gold", "محلات ذهب وصاغة", "Gold shops & goldsmiths", "🥇", "ذهب|صايغ|صاغة|دبل|محبس|خاتم|عقد|اسوارة|سبائك|ليرات", "gold|goldsmith|wedding rings|necklace|bracelet|bullion|gold coins"),
    c("jw-silver", "فضة وإكسسوارات", "Silver & fashion jewelry", "💎", "فضة|اكسسوار|اكسسوارات|بجوتري|عقود|اساور|خواتم فضة|حلق", "silver|fashion jewelry|bijouterie|necklaces|earrings"),
    c("jw-watches", "ساعات ماركات وتقليد", "Watches", "⌚", "ساعات|ساعة|ماركات|اورجينال|رولكس|ساعات رجالية|ساعات نسائية|ساعة ذكية", "watches|brand watches|original|men's watches|women's watches|smartwatch"),
    c("jw-gems", "ألماس وأحجار كريمة", "Diamonds & gemstones", "💠", "الماس|احجار كريمة|عقيق|فيروز|زمرد|ياقوت|لؤلؤ|مرجان", "diamonds|gemstones|agate|turquoise|emerald|ruby|pearls"),
    c("jw-repair", "تفصيل وتصليح مجوهرات", "Jewelry design & repair", "🔧", "تفصيل ذهب|تصليح ذهب|لحام ذهب|تصميم مجوهرات|تلميع|حفر|نقش اسم", "jewelry design|gold repair|soldering|polishing|engraving"),
  ]),

  c("stationery", "المكتبات والقرطاسية والطباعة", "Books, stationery & printing", "📚", "مكتبة|قرطاسية|كتب|طباعة|تصوير مستندات|مطبعة", "bookstore|stationery|books|printing|photocopy|print shop", [
    c("st-books", "مكتبات وكتب", "Bookstores", "📖", "مكتبة|كتب|روايات|كتب دينية|كتب طبية|كتب جامعية|مجلات|كتب اطفال", "bookstore|books|novels|religious books|medical books|university books|magazines|kids books"),
    c("st-stationery", "قرطاسية ومستلزمات مكتبية", "Stationery & office supplies", "✏️", "قرطاسية|اقلام|دفاتر|ورق|ملفات|حبر|طابعات|مستلزمات مكتب|هدايا", "stationery|pens|notebooks|paper|files|ink|printers|office supplies"),
    c("st-printing", "مطابع وطباعة", "Printing houses", "🖨️", "مطبعة|طباعة|اوفست|طباعة دفاتر|كروت|فواتير|ملصقات|بنرات|طباعة كبيرة", "print shop|printing|offset|brochures|business cards|invoices|stickers|banners"),
    c("st-copy", "تصوير مستندات وتجليد وأختام", "Photocopy, binding & stamps", "📠", "تصوير مستندات|تصوير اوراق|تجليد|مكتبة تصوير|ختم|اختام|لامينيت|سكان", "photocopy|binding|stamps|laminating|scanning|document copy"),
  ]),

  c("creative", "التصوير والتصميم والإعلام", "Photo, design & media", "🎬", "تصوير|تصميم|اعلام|فيديو|مونتاج|جرافيك|اعلان", "photography|design|media|video|editing|graphics|advertising", [
    c("cre-photo", "استوديوهات تصوير", "Photo studios", "📷", "استوديو|تصوير|مصور|صور شخصية|صور جواز|تصوير منتجات|تصوير مواليد|فوتوغراف", "photo studio|photographer|portraits|passport photos|product photography|newborn photos"),
    c("cre-video", "إنتاج فيديو ومونتاج", "Video production & editing", "🎥", "فيديو|مونتاج|اخراج|اعلانات|تصوير فيديو|ريلز|يوتيوب|دورون|فيديو ترويجي", "video production|editing|directing|ads|reels|youtube|drone|promo video"),
    c("cre-design", "تصميم جرافيك وهويات", "Graphic design & branding", "🎨", "تصميم|جرافيك|شعار|لوغو|هوية بصرية|بوستر|بروشور|فلاير|تصميم اعلانات", "graphic design|logo|branding|poster|brochure|flyer"),
    c("cre-signs", "لوحات وإعلانات طرقية", "Signs & billboards", "🪧", "لوحات|يافطات|اعلانات طرقية|ليد|حروف بارزة|لوحة محل|ستيكر|بانر", "signs|billboards|led signs|channel letters|shop sign|stickers|banners"),
    c("cre-3d", "طباعة ثلاثية الأبعاد ونماذج", "3D printing & models", "🧊", "طباعة ثلاثية|3d|نماذج|ماكيت|ليزر|قص ليزر|cnc|تصنيع نماذج", "3d printing|models|maquette|laser cutting|cnc|prototyping"),
    c("cre-voice", "تعليق صوتي وتسجيل", "Voice-over & recording", "🎙️", "تعليق صوتي|تسجيل|استوديو صوت|بودكاست|دبلجة|صوتيات", "voice over|recording|sound studio|podcast|dubbing"),
  ]),

  c("transport", "النقل والتوصيل", "Transport & delivery", "🚚", "نقل|توصيل|شحن|تكسي|سائق|ديليفري|بضائع", "transport|delivery|shipping|taxi|driver|goods|courier", [
    c("tp-taxi", "تكسي وسيارات أجرة", "Taxis", "🚕", "تكسي|اجرة|سيرفيس|سواق|سائق خاص|تكسي مطار|اوبر|توصيل ركاب", "taxi|cab|service|driver|private driver|airport taxi|ride"),
    c("tp-delivery", "توصيل طلبات وديليفري", "Order delivery", "🛵", "ديليفري|توصيل طلبات|دليفري|موتور توصيل|توصيل طعام|توصيل منزلي|مندوب", "delivery|order delivery|courier bike|food delivery|home delivery|rider"),
    c("tp-trucks", "شاحنات ونقل بضائع", "Trucks & freight", "🚛", "شاحنة|براد|نقل بضائع|نقل ثقيل|سيارة نقل|بيك اب|نقل مواد|قلاب", "trucks|freight|heavy transport|pickup|cargo|dump truck"),
    c("tp-buses", "حافلات وباصات", "Buses & minibuses", "🚌", "باص|حافلة|ميكروباص|نقل طلاب|نقل موظفين|رحلات|باصات سياحية", "bus|minibus|school transport|staff transport|trips|coach"),
    c("tp-courier", "بريد سريع وشحن دولي", "Courier & international shipping", "📮", "بريد سريع|شحن دولي|دي اتش ال|حوالة|شحن طرود|ارسال|استلام طرود|شحن جوي", "courier|international shipping|dhl|parcels|air freight|send packages"),
  ]),

  c("tech-services", "التقنية والكمبيوتر والإنترنت", "Tech, computers & internet", "💻", "تقنية|كمبيوتر|حاسوب|انترنت|برمجة|صيانة كمبيوتر|شبكات", "tech|computers|internet|programming|computer repair|networks", [
    c("tech-repair", "صيانة كمبيوتر ولابتوب", "Computer & laptop repair", "🔧", "صيانة كمبيوتر|صيانة لابتوب|تصليح لابتوب|شاشة لابتوب|فورمات|ويندوز|ريكفري|ترقية", "computer repair|laptop repair|screen replacement|format|windows|recovery|upgrade"),
    c("tech-isp", "مزودو إنترنت وشبكات", "Internet providers & networks", "🌐", "انترنت|مزود خدمة|راوتر|فايبر|ADSL|واي فاي|شبكة|ستارلينك|اشتراك انترنت", "internet provider|router|fiber|adsl|wifi|network|starlink|internet subscription"),
    c("tech-web", "تصميم مواقع وتطبيقات", "Web & app development", "🖥️", "تصميم مواقع|برمجة مواقع|تطبيقات|متجر الكتروني|سيو|استضافة|نطاق|وردبريس", "web design|web development|apps|online store|seo|hosting|domain|wordpress"),
    c("tech-data", "استرجاع بيانات وأمن معلومات", "Data recovery & security", "🔐", "استرجاع بيانات|هارد|فلاشة|حماية|فيروسات|اختراق|نسخ احتياطي|امن معلومات", "data recovery|hard drive|flash|security|virus|hacking|backup|cybersecurity"),
    c("tech-printers", "طابعات وأحبار", "Printers & ink", "🖨️", "طابعة|طابعات|حبر|تونر|تعبئة حبر|صيانة طابعات|ماسح ضوئي|ريكو", "printer|printers|ink|toner|ink refill|printer repair|scanner"),
    c("tech-pos", "أنظمة كاشير ومحاسبة", "POS & business systems", "🧾", "كاشير|نقاط بيع|pos|برنامج محاسبة|باركود|ميزان|نظام مخزون|طابعة فواتير", "pos|cashier|barcode|accounting software|scale|inventory system|receipt printer"),
  ]),

  c("home-services-more", "خدمات الأسرة والمجتمع", "Family & community services", "🤝", "خدمات|اسرة|رعاية|خادمة|مربية|مسنين|جمعية|مساعدة", "services|family|care|housekeeper|nanny|elderly|charity|help", [
    c("fam-care", "رعاية مسنين وأطفال في المنزل", "Home care for elderly & kids", "👵", "رعاية مسنين|مربية|ممرضة منزلية|مرافقة|جليسة|رعاية اطفال|رعاية مريض", "elderly care|nanny|home nurse|companion|babysitter|patient care"),
    c("fam-maids", "مكاتب خدم وعاملات منزل", "Domestic help offices", "🧹", "خادمة|عاملة منزل|مكتب استقدام|عاملة نظافة|يومية|تنظيف يومي|طباخة", "housemaid|domestic help|recruitment office|daily cleaner|cook"),
    c("fam-charity", "جمعيات ومنظمات خيرية", "Charities & associations", "💛", "جمعية|خيرية|منظمة|تبرعات|كفالة|مساعدات|اغاثة|ايتام|متطوعين", "charity|association|ngo|donations|sponsorship|aid|relief|orphans|volunteers"),
    c("fam-marriage", "مكاتب زواج وخطابة", "Matchmaking & marriage offices", "💍", "خطابة|زواج|مكتب زواج|تعارف|استشارات اسرية|مصلح اسري", "matchmaking|marriage office|family counseling"),
    c("fam-funeral", "خدمات جنائز وتغسيل", "Funeral services", "🕊️", "جنائز|تغسيل|تكفين|دفن|ترب|شواهد|خدمات وفاة|عزاء", "funeral|burial|washing|shroud|cemetery|headstones|condolence"),
    c("fam-religious", "مراكز دينية وتحفيظ", "Religious & Quran centers", "🕌", "مسجد|تحفيظ|قرآن|مركز اسلامي|كنيسة|دروس دينية|شيخ|فتوى|اوقاف", "mosque|quran memorization|islamic center|church|religious classes|sheikh"),
  ]),

  c("shopping-misc", "تسوق ومنتجات متنوعة", "Shopping & general goods", "🛍️", "تسوق|محلات|بيع|متجر|بازار|هدايا|اغراض", "shopping|shops|store|bazaar|gifts|goods", [
    c("shp-gifts", "هدايا وتحف ومستلزمات", "Gifts & novelties", "🎁", "هدايا|تحف|اكسسوارات|بوكسات|هدايا شركات|هدايا مطبوعة|مج|ميداليات", "gifts|novelties|gift boxes|corporate gifts|printed gifts|mugs|medals"),
    c("shp-bazaar", "بازار ومحلات متنوعة (بسطات)", "Bazaar & general stalls", "🏪", "بازار|بسطة|محل متنوع|دولار ستور|مفرق|اغراض منزلية|بلاستيك|منظفات", "bazaar|stall|variety store|dollar store|household items|plastics|cleaners"),
    c("shp-cleaning", "منظفات ومستلزمات تنظيف", "Cleaning products", "🧴", "منظفات|صابون|معقمات|شامبو|ورق تواليت|مناديل|كلور|مستلزمات تنظيف", "cleaning products|soap|disinfectant|shampoo|toilet paper|tissues|bleach"),
    c("shp-camping", "رحلات وتخييم وصيد", "Camping & fishing gear", "⛺", "تخييم|خيم|صيد|سنارة|مستلزمات رحلات|سلاح صيد|بساط|اغراض رحلات|ادوات شوي", "camping|tents|fishing|rods|trip supplies|hunting|bbq tools"),
    c("shp-music", "آلات موسيقية وأجهزة صوت", "Musical instruments & audio", "🎸", "عود|غيتار|بيانو|اورغ|طبلة|ربابة|آلات موسيقية|سماعات|ميكروفون|صوتيات", "oud|guitar|piano|keyboard|drum|instruments|headphones|microphone|audio"),
    c("shp-medical-equipment", "مستلزمات وأجهزة طبية", "Medical supplies & equipment", "🩼", "مستلزمات طبية|اجهزة طبية|كرسي متحرك|عكازات|جهاز ضغط|سكر|اوكسجين|ضماد|فرشة طبية", "medical supplies|medical equipment|wheelchair|crutches|blood pressure|oxygen|bandages"),
    c("shp-perfume", "عطور وبخور وعود", "Perfume, incense & oud", "🪔", "عطور|بخور|عود|دهن عود|مسك|عنبر|مباخر|دخون|عطر شرقي|عطر فرنسي", "perfume|incense|oud|musk|amber|burners|oriental|french perfume"),
    c("shp-vape", "سجائر وتبغ ومعسل", "Tobacco & shisha supplies", "🚬", "سجائر|تبغ|معسل|دخان|نراجيل|فحم|فيب|لف", "cigarettes|tobacco|shisha tobacco|hookah supplies|charcoal|vape"),
  ]),
];

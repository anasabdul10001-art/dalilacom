/**
 * The platform's section / profession / specialty tree. Seeded on every deploy (prisma/seed.ts):
 * rows with these slugs are owned by this file — names, icons, order and synonyms are refreshed
 * from here; categories an admin creates with other slugs are never touched.
 *
 * To add a language: add its name/synonyms to the nodes below (the `en` column is the template).
 * Synonyms are what people really type; they are searched in every language, so "dentist" finds
 * the Arabic specialty even when the app is in Arabic.
 */

export interface CategorySeed {
  slug: string;
  ar: string;
  en: string;
  icon?: string;
  /** extra search words, "|"-separated, per language */
  synAr?: string;
  synEn?: string;
  /** other languages: `tr: { de: { name: "Zahnarzt", syn: "zahnarzt|zähne" } }` (see docs/I18N.md) */
  tr?: Record<string, { name: string; syn?: string }>;
  children?: CategorySeed[];
}

const c = (slug: string, ar: string, en: string, icon?: string, synAr?: string, synEn?: string, children?: CategorySeed[]): CategorySeed => ({
  slug, ar, en, icon, synAr, synEn, children,
});

export const CATEGORY_TREE: CategorySeed[] = [
  c("health", "الطبي", "Medical", "🩺", "صحة|طب|علاج|عيادة|عيادات", "health|medicine|clinic|healthcare", [
    c("health-doctors", "أطباء", "Doctors", "👨‍⚕️", "دكتور|طبيب|اطباء|دكاتره|عيادة", "doctor|physician|clinic", [
      c("health-doctors-dentist", "أسنان", "Dentist", "🦷", "دكتور اسنان|طبيب اسنان|سنان|تقويم|حشو|زراعة اسنان|تبييض|تجميل اسنان", "dentist|dental|teeth|orthodontist|braces"),
      c("health-doctors-pediatrics", "أطفال", "Pediatrician", "🧒", "دكتور اطفال|طبيب اطفال|طب الاطفال|حديثي الولادة|رضع", "pediatrician|pediatrics|kids doctor|child doctor|baby doctor"),
      c("health-doctors-cardiology", "قلبية", "Cardiologist", "❤️", "قلب|امراض القلب|دكتور قلب|اوعية|ضغط", "cardiologist|cardiology|heart|blood pressure"),
      c("health-doctors-dermatology", "جلدية", "Dermatologist", "🧴", "جلد|دكتور جلدية|حب الشباب|حساسية جلد|تساقط شعر|ليزر", "dermatologist|dermatology|skin|acne|hair loss"),
      c("health-doctors-ophthalmology", "عيون", "Eye doctor", "👁️", "دكتور عيون|طبيب عيون|نظر|ليزك|ماء ابيض|شبكية", "ophthalmologist|eye|eyes|vision|lasik|cataract"),
      c("health-doctors-orthopedics", "عظمية ومفاصل", "Orthopedist", "🦴", "عظام|كسور|مفاصل|عمود فقري|ركبة|ديسك|عظمية", "orthopedist|orthopedic|bones|joints|spine|fracture"),
      c("health-doctors-gynecology", "نسائية وتوليد", "Gynecologist", "🤰", "نسائية|توليد|حمل|ولادة|دكتورة نسائية|عقم|اطفال انابيب", "gynecologist|obstetrician|pregnancy|ob-gyn|fertility"),
      c("health-doctors-internal", "باطنية", "Internal medicine", "🩻", "باطني|دكتور باطنية|طب باطني", "internal medicine|internist"),
      c("health-doctors-ent", "أنف وأذن وحنجرة", "ENT", "👂", "اذن|انف|حنجرة|سمعيات|لوزتين|جيوب انفية", "ent|ear nose throat|ear|nose|throat|sinus"),
      c("health-doctors-psychiatry", "نفسية وعصبية", "Psychiatry", "🧠", "نفسي|اكتئاب|قلق|معالج نفسي|استشارات نفسية|اعصاب|دماغ|صرع", "psychiatrist|psychologist|therapist|depression|anxiety|neurologist|neurology|brain"),
      c("health-doctors-urology", "مسالك بولية وكلى", "Urologist", "🫘", "كلى|بولية|مثانة|حصى|بروستات|كلية", "urologist|urology|kidney|bladder|prostate|nephrologist"),
      c("health-doctors-surgery", "جراحة عامة", "General surgeon", "🔪", "جراح|عمليات|فتق|مرارة|زائدة", "surgeon|surgery|general surgery|hernia"),
      c("health-doctors-general", "طبيب عام وأسرة", "General practitioner", "🩺", "طبيب عام|طب اسرة|دكتور عام|طبيب اسرة", "gp|general practitioner|family doctor|family medicine"),
      c("health-doctors-endocrine", "غدد وسكري", "Endocrinologist", "🍬", "سكري|سكر|غدة درقية|هرمونات|سمنة", "endocrinologist|diabetes|thyroid|hormones|obesity"),
      c("health-doctors-gastro", "هضمية وكبد", "Gastroenterologist", "🍽️", "معدة|كبد|هضم|قولون|منظار|التهاب كبد", "gastroenterologist|stomach|liver|colon|endoscopy"),
      c("health-doctors-chest", "صدرية وتنفسية", "Pulmonologist", "🫁", "رئة|ربو|صدر|حساسية صدر|تنفس", "pulmonologist|chest|lungs|asthma|respiratory"),
      c("health-doctors-plastic", "جراحة تجميلية", "Plastic surgeon", "✨", "تجميل|شد|نفخ|حقن|بوتوكس|فيلر|عمليات تجميل", "plastic surgeon|cosmetic surgery|botox|filler|rhinoplasty"),
      c("health-doctors-oncology", "أورام", "Oncologist", "🎗️", "سرطان|اورام|علاج كيماوي", "oncologist|cancer|chemotherapy"),
      c("health-doctors-vascular", "أوعية وجراحة وعائية", "Vascular surgeon", "🩸", "دوالي|اوعية دموية|جلطة", "vascular|varicose veins|thrombosis"),
    ]),
    c("health-pharmacy", "صيدليات", "Pharmacies", "💊", "صيدلية|دواء|ادوية|صيدلي|مناوبة", "pharmacy|drugstore|medicine|chemist"),
    c("health-lab", "مخابر ومختبرات طبية", "Medical labs", "🔬", "مخبر|مختبر|تحاليل|تحليل دم|فحوصات|مخابر", "lab|laboratory|blood test|tests|diagnostics"),
    c("health-radiology", "أشعة وتصوير طبي", "Radiology & imaging", "🩻", "اشعة|طبقي|رنين|ايكو|سونار|تصوير|ماموغرافي|صورة", "radiology|x-ray|mri|ct|ultrasound|imaging|mammogram"),
    c("health-hospital", "مشافي ومراكز طبية", "Hospitals & medical centers", "🏥", "مشفى|مستشفى|مستوصف|مركز طبي|اسعاف|طوارئ", "hospital|medical center|emergency|er|polyclinic"),
    c("health-physio", "علاج فيزيائي وتأهيل", "Physiotherapy", "🦵", "فيزيو|علاج طبيعي|تأهيل|مساج طبي|اصابات", "physiotherapy|physical therapy|rehab|rehabilitation|sports injury"),
    c("health-nutrition", "تغذية وحميات", "Nutrition & diet", "🥗", "دايت|تغذية|حمية|نظام غذائي|اخصائي تغذية|تخسيس", "nutritionist|dietitian|diet|weight loss"),
    c("health-optics", "بصريات ونظارات", "Optics & eyewear", "👓", "نظارات|عدسات|بصريات|عدسات لاصقة|فحص نظر", "optics|glasses|eyewear|lenses|contact lenses"),
    c("health-nursing", "تمريض ورعاية منزلية", "Home nursing & care", "🧑‍⚕️", "ممرض|تمريض|رعاية منزلية|مرافقة مريض|حقن منزلي", "nurse|home care|nursing|caregiver"),
    c("health-dental-lab", "مخابر وأجهزة أسنان", "Dental labs & supplies", "🦷", "مخبر اسنان|تقويم اسنان|مواد اسنان|اجهزة طبية|مستلزمات طبية", "dental lab|dental supplies|medical supplies|medical equipment"),
  ]),

  c("electronics", "الإلكترونيات", "Electronics", "🔌", "الكترونيات|كهربائيات|اجهزة", "electronics|electrical|gadgets", [
    c("electronics-appliances", "كهربائيات منزلية", "Home appliances", "🧺", "كهربائيات|براد|ثلاجة|غسالة|غسالات|فرن|غاز|سخان|مكيف|مروحة", "appliances|fridge|refrigerator|washing machine|oven|heater|ac|air conditioner", [
      c("electronics-appliances-fridges", "برادات وغسالات", "Fridges & washers", "🧊", "براد|برادات|ثلاجة|غسالة|غسالات|ناشفة|جلاية", "fridge|refrigerator|washer|washing machine|dryer|dishwasher"),
      c("electronics-appliances-tv", "تلفزيونات وشاشات", "TVs & screens", "📺", "تلفزيون|شاشة|شاشات|ستلايت|ريسيفر|سمارت", "tv|television|screen|smart tv|satellite"),
      c("electronics-appliances-ac", "مكيفات وتدفئة", "AC & heating", "❄️", "مكيف|مكيفات|سبلت|تدفئة|مدفأة|صوبية|سخانات|دفاية", "ac|air conditioner|split|heater|heating|boiler|water heater"),
      c("electronics-appliances-kitchen", "أدوات ومعدات مطبخ", "Kitchen appliances", "🍳", "خلاط|غلاية|مكرويف|مايكرويف|طباخ|فرن|مطبخ|عجانة", "blender|kettle|microwave|cooker|oven|mixer"),
    ]),
    c("electronics-computers", "كمبيوتر ولابتوب", "Computers & laptops", "💻", "كمبيوتر|حاسوب|لابتوب|لاب توب|طابعة|راوتر", "computer|pc|laptop|printer|router", [
      c("electronics-computers-laptops", "لابتوبات وحواسيب", "Laptops & PCs", "💻", "لابتوب|لاب توب|كمبيوتر|حاسوب|ماك|ديسكتوب", "laptop|desktop|pc|computer|macbook"),
      c("electronics-computers-parts", "قطع وملحقات", "Parts & accessories", "🖱️", "قطع كمبيوتر|رام|هارد|ماوس|كيبورد|كرت شاشة|معالج|فلاش", "computer parts|ram|ssd|hard drive|keyboard|mouse|gpu"),
      c("electronics-computers-printers", "طابعات وأحبار", "Printers & ink", "🖨️", "طابعة|طابعات|حبر|احبار|تونر|تصوير مستندات", "printer|printers|ink|toner|scanner"),
      c("electronics-computers-repair", "صيانة كمبيوتر", "Computer repair", "🛠️", "صيانة كمبيوتر|صيانة لابتوب|تصليح|فورمات|ويندوز", "computer repair|laptop repair|format|windows"),
    ]),
    c("electronics-power", "طاقة وبطاريات وطاقة شمسية", "Power & solar", "☀️", "طاقة شمسية|الواح|انفرتر|بطارية|بطاريات|مولدة|يو بي اس|امبيرات", "solar|panels|inverter|battery|batteries|generator|ups|power", [
      c("electronics-power-solar", "ألواح وأنظمة شمسية", "Solar panels & systems", "🌞", "الواح شمسية|طاقة شمسية|نظام شمسي|تركيب الواح|شحن", "solar panels|solar system|solar installation"),
      c("electronics-power-inverters", "انفرترات وبطاريات", "Inverters & batteries", "🔋", "انفرتر|انفيرتر|بطارية|بطاريات|جل|ليثيوم|شاحن|منظم", "inverter|battery|batteries|lithium|gel battery|charger"),
      c("electronics-power-generators", "مولدات وأمبيرات", "Generators", "⚡", "مولدة|مولدات|ديزل|بنزين|امبيرات|محول|كهرباء", "generator|generators|diesel|transformer"),
    ]),
    c("electronics-cctv", "كاميرات مراقبة وأمان", "CCTV & security", "📹", "كاميرات|كاميرا مراقبة|انذار|جرس|اقفال ذكية|امان", "cctv|security camera|alarm|security|smart lock"),
    c("electronics-gaming", "ألعاب وكونسول", "Gaming", "🎮", "بلايستيشن|ps5|اكس بوكس|العاب|كونسول|جويستك", "playstation|xbox|gaming|console|games"),
    c("electronics-repair", "صيانة أجهزة كهربائية", "Appliance repair", "🔧", "صيانة براد|صيانة غسالة|تصليح|فني|كهربائي صيانة", "appliance repair|fix|technician"),
  ]),

  c("mobiles", "الموبايلات", "Mobiles", "📱", "موبايل|جوال|هاتف|تلفون|موبايلات|جوالات", "mobile|phone|cell|smartphone|mobiles", [
    c("mobiles-new", "موبايلات جديدة", "New phones", "📱", "موبايل جديد|ايفون|سامسونج|شاومي|هواوي|اوبو|ريلمي|جهاز جديد", "new phone|iphone|samsung|xiaomi|huawei|oppo|realme"),
    c("mobiles-used", "موبايلات مستعملة", "Used phones", "♻️", "مستعمل|موبايل مستعمل|بيع وشراء|تبديل|ايفون مستعمل", "used phone|second hand|trade in|buy sell"),
    c("mobiles-repair", "صيانة موبايلات", "Phone repair", "🛠️", "صيانة|تصليح|شاشة|تبديل شاشة|بطارية|سوفت وير|برمجة|فك حظر|ايكلاود|مياه", "phone repair|screen repair|battery replacement|software|unlock|icloud"),
    c("mobiles-accessories", "إكسسوارات وكفرات وشواحن", "Accessories & chargers", "🔌", "اكسسوارات|كفر|كفرات|شاحن|سماعات|حماية شاشة|لزقة|باور بنك|كبل", "accessories|case|cover|charger|headphones|screen protector|power bank|cable"),
    c("mobiles-tablets", "تابلت وساعات ذكية", "Tablets & smartwatches", "⌚", "تابلت|ايباد|ساعة ذكية|سمارت واتش|ساعات", "tablet|ipad|smartwatch|watch|wearables"),
    c("mobiles-telecom", "اتصالات وتعبئة رصيد", "Telecom & top-up", "📶", "خط|خطوط|رصيد|تعبئة|اتصالات|سيرياتيل|mtn|انترنت", "sim|line|top up|recharge|telecom|internet|data"),
  ]),

  c("factories", "المعامل", "Factories & workshops", "🏭", "معمل|مصنع|معامل|مصانع|ورشة|ورش|انتاج", "factory|factories|manufacturer|workshop|plant|production", [
    c("factories-food", "معامل غذائية", "Food factories", "🥫", "معمل غذائي|البان|اجبان|مخللات|معلبات|حلويات|مكسرات|مياه|عصائر|مواد غذائية", "food factory|dairy|pickles|canned|sweets|nuts|juice|food production"),
    c("factories-textile", "معامل نسيج وألبسة", "Textile & garments", "🧵", "نسيج|ألبسة|خياطة|قماش|ملابس جملة|غزل|جوارب|مفروشات", "textile|garments|clothing factory|fabric|sewing|knitting|bedding"),
    c("factories-plastic", "معامل بلاستيك وتغليف", "Plastic & packaging", "🧴", "بلاستيك|تغليف|اكياس|عبوات|نايلون|قوالب|كرتون", "plastic|packaging|bags|containers|molds|cartons"),
    c("factories-metal", "حدادة ومعادن", "Metalwork", "⚙️", "حدادة|معادن|لحام|خراطة|المنيوم|زجاج|ابواب حديد|هياكل", "metalwork|welding|blacksmith|aluminum|lathe|steel|glass"),
    c("factories-wood", "خشب وأثاث", "Wood & furniture", "🪑", "نجارة|خشب|اثاث|مفروشات|مطابخ|غرف نوم|موبيليا|ابواب خشب", "carpentry|wood|furniture|kitchens|bedrooms|joinery"),
    c("factories-building", "مواد بناء", "Building materials", "🧱", "بلوك|اسمنت|رخام|سيراميك|بلاط|حجر|بيتون|طوب|بويا|دهانات", "building materials|cement|marble|ceramic|tiles|stone|concrete|paint"),
    c("factories-chemicals", "كيماويات ومنظفات", "Chemicals & cleaning", "🧪", "كيماويات|منظفات|صابون|عطور|مبيدات|اسمدة|جلي", "chemicals|detergents|soap|perfume|pesticides|fertilizer"),
    c("factories-printing", "مطابع وورق", "Printing & paper", "🖨️", "مطبعة|مطابع|طباعة|ورق|دفاتر|كرتون|لافتات|دعاية", "printing|print shop|paper|notebooks|signage|banners"),
    c("factories-leather", "جلديات وأحذية", "Leather & shoes", "👞", "جلد|جلديات|احذية|حقائب|شنط|صرماية|جزمة", "leather|shoes|footwear|bags|handbags"),
    c("factories-machinery", "آلات ومعدات صناعية", "Industrial machinery", "🏗️", "الات|معدات|ماكينات|قطع غيار صناعية|ورشة ميكانيك|مولدات صناعية", "machinery|industrial equipment|machines|spare parts"),
  ]),

  c("companies", "الشركات", "Companies", "🏢", "شركة|شركات|مؤسسة|مؤسسات|اعمال", "company|companies|business|corporate|enterprise", [
    c("companies-trading", "تجارة واستيراد وتصدير", "Trading, import & export", "🚢", "استيراد|تصدير|تجارة|جملة|وكيل|وكالة|موزع|توزيع", "import|export|trading|wholesale|agent|distributor"),
    c("companies-contracting", "مقاولات وإنشاءات", "Contracting & construction", "🏗️", "مقاول|مقاولات|بناء|انشاءات|ترميم|تشطيب|اكساء|عمار", "contractor|contracting|construction|renovation|finishing|building"),
    c("companies-engineering", "مكاتب هندسية واستشارات", "Engineering offices", "📐", "مكتب هندسي|مهندس|هندسة|تصميم|معماري|اشراف|مخططات|دراسة جدوى", "engineering office|engineer|architect|design|supervision|blueprints|feasibility"),
    c("companies-it", "برمجيات وتقنية معلومات", "Software & IT", "👨‍💻", "برمجة|تطبيقات|مواقع|تصميم مواقع|نظم|ويب|اندرويد|سوفتوير", "software|it|apps|websites|web development|programming|developers"),
    c("companies-logistics", "شحن ونقل وتخليص", "Shipping & logistics", "🚚", "شحن|نقل|توصيل|تخليص جمركي|بضائع|سطحة|مستودعات|تخزين", "shipping|logistics|transport|delivery|customs clearance|cargo|warehouse"),
    c("companies-marketing", "تسويق وإعلان", "Marketing & advertising", "📣", "تسويق|اعلان|اعلانات|دعاية|سوشيال ميديا|تصوير|هوية بصرية|مونتاج", "marketing|advertising|ads|social media|branding|photography|video"),
    c("companies-finance", "صرافة وخدمات مالية وتأمين", "Finance & insurance", "💱", "صرافة|حوالات|تأمين|محاسبة|محاسب|ضرائب|تدقيق", "exchange|remittance|insurance|accounting|accountant|tax|audit"),
    c("companies-hr", "توظيف واستشارات إدارية", "Recruitment & consulting", "🤝", "توظيف|موارد بشرية|استشارات|تدريب|دورات|ادارة", "recruitment|hr|consulting|training|courses|management"),
  ]),

  c("restaurants", "مطاعم", "Restaurants", "🍽️", "مطعم|اكل|وجبات|شاورما|مشاوي|فروج|برغر|بيتزا", "restaurant|food|meals|shawarma|grill|burger|pizza"),
  c("cafes", "مقاهي", "Cafes", "☕", "مقهى|كافيه|قهوة|نرجيلة|حلويات", "cafe|coffee|coffee shop|hookah|desserts"),
  c("clothing", "ملابس", "Clothing", "👗", "ملابس|ثياب|احذية|بوتيك|موضة|اطفال ملابس", "clothing|clothes|fashion|boutique|shoes"),
  c("beauty", "تجميل وعناية", "Beauty & care", "💇", "حلاق|صالون|تجميل|سبا|مكياج|عناية|عروس|حلاقة", "barber|salon|beauty|spa|makeup|hair|bridal"),
];

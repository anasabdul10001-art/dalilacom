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

  c("sport", "الرياضة", "Sports & fitness", "🏅", "رياضة|رياضي|لياقة|لياقه|جيم|نادي|تمارين|تدريب|كمال اجسام|صحة بدنية", "sport|sports|fitness|gym|training|workout|exercise|bodybuilding", [
    c("gym", "الجيمات والنوادي الرياضية", "Gyms & fitness clubs", "🏋️", "جيم|جيمات|نادي رياضي|نادي لياقة|صالة رياضية|صالة تمارين|هيلث كلوب|نادي صحي", "gym|gyms|fitness club|health club|fitness center|workout", [
      c("gym-bodybuilding", "بناء أجسام وأثقال", "Bodybuilding & weights", "💪", "كمال اجسام|بناء اجسام|اثقال|حديد|تضخيم|عضلات", "bodybuilding|weights|weightlifting|muscle|strength"),
      c("gym-fitness", "لياقة بدنية وتخسيس", "Fitness & weight loss", "🏃", "لياقة|تخسيس|رشاقة|حرق دهون|كارديو|تنحيف|رجيم", "fitness|weight loss|cardio|slimming|fat loss|aerobics"),
      c("gym-men", "نادي رجالي", "Men's gym", "👨", "نادي رجالي|جيم رجالي|للرجال|شباب|رجال فقط", "men's gym|men only|male fitness"),
      c("gym-mixed", "نادي مختلط", "Mixed gym", "👫", "نادي مختلط|جيم مختلط|رجال ونساء|للجنسين|عائلي", "mixed gym|co-ed|unisex gym|family gym"),
      c("gym-split", "أوقات منفصلة للنساء والرجال", "Separate hours for women and men", "🕒", "اوقات نساء|اوقات رجال|دوام نسائي|دوام رجالي|اوقات منفصلة|فترة نسائية|فترة رجالية|وقت للنساء|وقت للرجال", "separate hours|women's hours|men's hours|women only times|split schedule"),
      c("gym-women", "نادي نسائي", "Women's gym", "👩", "نادي نسائي|جيم نسائي|جيم حريمي|نسائي|سيدات|للنساء|بنات", "women's gym|ladies gym|female fitness|women only"),
      c("gym-crossfit", "كروس فيت ووظيفي", "CrossFit & functional", "🔥", "كروس فيت|تدريب وظيفي|هيت|دائري|كالستنكس", "crossfit|functional training|hiit|circuit|calisthenics"),
    ]),
    c("coach", "المدربون", "Coaches & trainers", "🧑‍🏫", "مدرب|كوتش|كوتشات|مدربين|مدرب رياضي|مدرب شخصي|اشراف تدريب", "coach|coaches|trainer|personal trainer|fitness coach", [
      c("coach-personal", "مدرب شخصي", "Personal trainer", "🎯", "مدرب شخصي|كوتش شخصي|تدريب خاص|برنامج تمارين|اونلاين", "personal trainer|private coach|one to one|training plan|online coaching"),
      c("coach-bodybuilding", "مدرب كمال أجسام", "Bodybuilding coach", "🏆", "مدرب كمال اجسام|مدرب بناء اجسام|مدرب حديد|تحضير بطولات", "bodybuilding coach|muscle coach|contest prep|strength coach"),
      c("coach-fitness", "مدرب لياقة وتخسيس", "Fitness & weight-loss coach", "⚖️", "مدرب لياقة|مدرب تخسيس|مدرب رشاقة|كوتش تخسيس|برنامج رجيم", "fitness coach|weight loss coach|slimming coach|diet plan"),
      c("coach-football", "مدرب كرة قدم", "Football coach", "⚽", "مدرب كرة|مدرب كرة قدم|كابتن|مدرب ناشئين|اكاديمية", "football coach|soccer coach|youth coach|academy"),
      c("coach-swimming", "مدرب سباحة", "Swimming coach", "🏊", "مدرب سباحة|تعليم سباحة|كابتن سباحة|انقاذ", "swimming coach|swim teacher|swimming lessons|lifeguard"),
      c("coach-martial", "مدرب فنون قتالية", "Martial arts coach", "🥋", "مدرب كاراتيه|مدرب تايكواندو|مدرب ملاكمة|مدرب جودو|مدرب فنون قتالية", "martial arts coach|karate coach|taekwondo coach|boxing coach|judo coach"),
      c("coach-yoga", "مدرب يوغا وبيلاتس", "Yoga & pilates coach", "🧘", "مدرب يوغا|مدربة يوغا|بيلاتس|استرخاء|تأمل|مرونة", "yoga instructor|pilates instructor|stretching|meditation|flexibility"),
      c("coach-nutrition", "أخصائي تغذية رياضية", "Sports nutritionist", "🥗", "تغذية رياضية|اخصائي تغذية|دايت|نظام غذائي|مكملات|بروتين", "sports nutritionist|dietitian|diet|nutrition plan|supplements advice"),
    ]),
    c("sport-martial", "فنون قتالية", "Martial arts", "🥊", "فنون قتالية|كاراتيه|تايكواندو|ملاكمة|بوكسينغ|جودو|كيك بوكسينغ|مصارعة|ام ام اي", "martial arts|karate|taekwondo|boxing|judo|kickboxing|wrestling|mma", [
      c("sport-martial-karate", "كاراتيه وتايكواندو وجودو", "Karate, taekwondo & judo", "🥋", "كاراتيه|تايكواندو|جودو|حزام", "karate|taekwondo|judo|belt"),
      c("sport-martial-boxing", "ملاكمة وكيك بوكسينغ", "Boxing & kickboxing", "🥊", "ملاكمة|بوكسينغ|كيك بوكسينغ|مواي تاي", "boxing|kickboxing|muay thai"),
      c("sport-martial-mma", "مصارعة وفنون مختلطة", "Wrestling & MMA", "🤼", "مصارعة|ام ام اي|فنون مختلطة|برازيلي جيو جيتسو", "wrestling|mma|mixed martial arts|jiu jitsu"),
    ]),
    c("sport-swimming", "مسابح", "Swimming pools", "🏊", "مسبح|مسابح|سباحة|حمام سباحة|مسبح خاص|مسبح اطفال", "swimming pool|pool|swim|swimming|kids pool"),
    c("sport-football", "ملاعب وأكاديميات كرة", "Pitches & football academies", "🏟️", "ملعب|ملاعب|ملعب خماسي|كرة قدم|كرة سلة|كرة طائرة|اكاديمية كرة|حجز ملعب", "pitch|stadium|football field|five-a-side|basketball|volleyball|football academy|book a pitch"),
    c("sport-yoga", "يوغا وبيلاتس ورقص رياضي", "Yoga, pilates & dance fitness", "🧘", "يوغا|بيلاتس|زومبا|رقص رياضي|ايروبيك|استرخاء", "yoga|pilates|zumba|dance fitness|aerobics|relaxation"),
    c("sport-physio", "علاج إصابات رياضية وتدليك", "Sports injury & massage", "💆", "اصابات رياضية|تدليك رياضي|مساج رياضي|علاج طبيعي رياضي|تأهيل لاعبين", "sports injury|sports massage|physio|rehab|athlete recovery"),
    c("sport-stores", "ملابس ومعدات ومكملات رياضية", "Sportswear, equipment & supplements", "🛍️", "ملابس رياضية|معدات رياضية|اجهزة رياضية|مكملات غذائية|بروتين|احذية رياضية|دراجات", "sportswear|sports equipment|gym equipment|supplements|protein|sneakers|bikes", [
      c("sport-stores-wear", "ملابس وأحذية رياضية", "Sportswear & shoes", "👟", "ملابس رياضية|احذية رياضية|شورت|ترنج|كابات|حقيبة رياضية", "sportswear|sneakers|tracksuit|gym bag|sports shoes"),
      c("sport-stores-equipment", "معدات وأجهزة رياضية", "Equipment & machines", "🏓", "اجهزة رياضية|معدات|اوزان|دمبل|مشاية|دراجة ثابتة|كرات", "gym equipment|machines|dumbbells|treadmill|exercise bike|balls"),
      c("sport-stores-supplements", "مكملات غذائية رياضية", "Sports supplements", "🧃", "مكملات|بروتين|كرياتين|فيتامينات|احماض امينية|مكملات رياضية", "supplements|protein|creatine|vitamins|amino acids|sports nutrition"),
    ]),
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

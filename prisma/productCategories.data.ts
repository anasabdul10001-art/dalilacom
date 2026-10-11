/**
 * The categories a shop files its PRODUCTS under (a different list from the professions a shop is registered under).
 * Departments > categories > kinds. Every department says which of the store's front-page sections it belongs to.
 * `syn` holds the words people type, in Arabic and English, separated by "|".
 */
export interface ProductCategorySeed {
  slug: string;
  ar: string;
  en: string;
  icon?: string;
  syn?: string;
  /** departments only: the store section (see src/lib/storeSections.ts) the products of this department appear in */
  section?: string;
  children?: ProductCategorySeed[];
}

const c = (slug: string, ar: string, en: string, syn = "", children?: ProductCategorySeed[], icon?: string): ProductCategorySeed => ({ slug, ar, en, syn, children, icon });
const d = (slug: string, section: string, icon: string, ar: string, en: string, syn: string, children: ProductCategorySeed[]): ProductCategorySeed => ({ slug, section, icon, ar, en, syn, children });

export const PRODUCT_CATEGORIES: ProductCategorySeed[] = [
  d("p-electronics", "electronics", "📱", "إلكترونيات", "Electronics", "الكترونيات|اجهزة|تقنية|electronic|gadgets", [
    c("p-phones", "موبايلات وأجهزة لوحية", "Phones & tablets", "موبايل|هاتف|جوال|تلفون|ايباد|تابلت|phone|mobile|tablet|smartphone", [
      c("p-phones-new", "موبايلات جديدة", "New phones", "ايفون|سامسونج|شاومي|هواوي|iphone|samsung|xiaomi"),
      c("p-phones-used", "موبايلات مستعملة", "Used phones", "مستعمل|مجدد|used|refurbished"),
      c("p-tablets", "أجهزة لوحية", "Tablets", "تابلت|ايباد|ipad|tablet"),
    ]),
    c("p-phone-acc", "إكسسوارات الموبايل", "Phone accessories", "كفر|حماية شاشة|شاحن|كبل|سماعة|case|screen protector|charger|cable|powerbank", [
      c("p-cases", "أغطية وحمايات", "Cases & protectors", "كفر|جراب|حماية|اسكرين|case|cover|protector"),
      c("p-chargers", "شواحن وكوابل وباور بانك", "Chargers, cables & power banks", "شاحن|كبل|كيبل|باور بانك|بطارية متنقلة|charger|cable|power bank"),
      c("p-headphones", "سماعات", "Headphones & earbuds", "سماعة|ايربودز|بلوتوث|headphones|earbuds|airpods|bluetooth"),
    ]),
    c("p-computers", "كمبيوتر ولابتوب", "Computers & laptops", "لابتوب|حاسوب|كمبيوتر|بي سي|laptop|pc|computer|desktop", [
      c("p-laptops", "لابتوبات", "Laptops", "لابتوب|محمول|laptop|notebook"),
      c("p-desktops", "كمبيوترات مكتبية", "Desktop computers", "مكتبي|كيس|desktop|pc"),
      c("p-pc-parts", "قطع وملحقات كمبيوتر", "Computer parts & accessories", "رام|هارد|كرت شاشة|ماوس|كيبورد|ram|ssd|mouse|keyboard|monitor"),
      c("p-printers", "طابعات وأحبار", "Printers & ink", "طابعة|حبر|تونر|printer|ink|toner"),
    ]),
    c("p-tv-audio", "تلفزيونات وصوتيات", "TVs & audio", "تلفزيون|شاشة|ستيريو|سبيكر|tv|television|speaker|soundbar", [
      c("p-tvs", "تلفزيونات", "Televisions", "تلفزيون|شاشة|ليد|سمارت|tv|led|smart tv"),
      c("p-speakers", "سماعات وصوتيات", "Speakers & sound", "سبيكر|مكبر|ساوند|speaker|soundbar"),
      c("p-receivers", "رسيفرات وأجهزة بث", "Receivers & streaming", "رسيفر|ستالايت|ريسيفر|receiver|satellite|android box"),
    ]),
    c("p-cameras", "كاميرات وتصوير", "Cameras & photography", "كاميرا|تصوير|مراقبة|camera|photography|cctv|gopro", [
      c("p-cam-photo", "كاميرات تصوير", "Photo & video cameras", "كاميرا|كانون|نيكون|camera|canon|nikon"),
      c("p-cam-security", "كاميرات مراقبة", "Security cameras", "مراقبة|امن|cctv|security camera"),
    ]),
    c("p-gaming", "ألعاب فيديو", "Video games", "بلايستيشن|اكس بوكس|العاب|joystick|playstation|xbox|nintendo|gaming", [
      c("p-consoles", "أجهزة الألعاب", "Consoles", "بلايستيشن|اكس بوكس|ps5|xbox|nintendo|console"),
      c("p-games", "ألعاب وبطاقات", "Games & cards", "لعبة|بطاقة|شحن|game|gift card|top up"),
    ]),
    c("p-smartwatch", "ساعات ذكية", "Smart watches", "ساعة ذكية|سمارت واتش|smartwatch|smart watch|band"),
    c("p-power", "طاقة شمسية وبطاريات", "Solar power & batteries", "طاقة شمسية|الواح|انفرتر|بطارية|يو بي اس|solar|panel|inverter|battery|ups"),
    c("p-appliances-small", "أجهزة صغيرة", "Small electronics", "مروحة|سخان|مدفأة|fan|heater"),
  ]),

  d("p-fashion", "fashion", "👗", "أزياء", "Fashion", "ملابس|لبس|موضة|clothes|clothing|fashion|wear", [
    c("p-women", "ملابس نسائية", "Women's clothing", "نسائي|نساء|حريمي|women|ladies|female", [
      c("p-women-dress", "فساتين", "Dresses", "فستان|فساتين|dress|gown"),
      c("p-women-tops", "بلايز وقمصان", "Tops & shirts", "بلوزة|قميص|توب|blouse|shirt|top"),
      c("p-women-pants", "بناطيل وتنانير", "Pants & skirts", "بنطلون|جينز|تنورة|jeans|pants|skirt"),
      c("p-women-abaya", "عبايات وحجاب وإسدالات", "Abayas & hijab", "عباية|حجاب|اسدال|وشاح|ايشارب|abaya|hijab|scarf|jilbab"),
      c("p-women-under", "ملابس داخلية ونوم", "Underwear & sleepwear", "داخلي|منامة|بيجاما|lingerie|underwear|pajamas|sleepwear"),
      c("p-women-coat", "جاكيتات ومعاطف", "Jackets & coats", "جاكيت|معطف|بالطو|jacket|coat"),
    ]),
    c("p-men", "ملابس رجالية", "Men's clothing", "رجالي|رجال|men|male", [
      c("p-men-shirts", "قمصان وتيشيرتات", "Shirts & T-shirts", "قميص|تيشيرت|بلوزة|shirt|tshirt|polo"),
      c("p-men-pants", "بناطيل وجينز", "Pants & jeans", "بنطلون|جينز|بنطال|pants|jeans|trousers"),
      c("p-men-suits", "بدلات وقمصان رسمية", "Suits & formal", "بدلة|كرافات|رسمي|suit|tie|formal"),
      c("p-men-traditional", "ملابس تقليدية", "Traditional wear", "جلابية|دشداشة|ثوب|عباءة رجالية|thobe|jalabiya|traditional"),
      c("p-men-under", "ملابس داخلية وجوارب", "Underwear & socks", "داخلي|جوارب|سروال|underwear|socks|boxer"),
      c("p-men-coat", "جاكيتات ومعاطف", "Jackets & coats", "جاكيت|معطف|بالطو|jacket|coat|hoodie"),
    ]),
    c("p-kids-wear", "ملابس أطفال", "Kids' clothing", "اطفال|ولادي|بناتي|بيبي|kids|children|baby clothes|boys|girls", [
      c("p-baby-wear", "ملابس مواليد", "Baby clothes", "مواليد|رضع|بيبي|newborn|baby|infant"),
      c("p-boys-wear", "ملابس أولاد", "Boys' clothing", "اولاد|ولادي|boys"),
      c("p-girls-wear", "ملابس بنات", "Girls' clothing", "بنات|بناتي|girls"),
      c("p-school-uniform", "لباس مدرسي", "School uniforms", "مدرسي|زي مدرسي|school uniform"),
    ]),
    c("p-shoes", "أحذية", "Shoes", "حذاء|جزمة|صندل|شحاطة|shoes|sneakers|boots|sandals", [
      c("p-shoes-women", "أحذية نسائية", "Women's shoes", "حذاء نسائي|كعب|women shoes|heels"),
      c("p-shoes-men", "أحذية رجالية", "Men's shoes", "حذاء رجالي|men shoes"),
      c("p-shoes-sport", "أحذية رياضية", "Sports shoes", "رياضي|سنيكرز|كوتشي|sneakers|trainers|sport shoes"),
      c("p-shoes-kids", "أحذية أطفال", "Kids' shoes", "حذاء اطفال|kids shoes"),
    ]),
    c("p-bags", "حقائب وشنط", "Bags & luggage", "شنطة|حقيبة|حقائب|شنط|bag|handbag|backpack|luggage|suitcase", [
      c("p-handbags", "حقائب يد", "Handbags", "شنطة يد|حقيبة نسائية|handbag|purse"),
      c("p-backpacks", "حقائب ظهر ومدرسية", "Backpacks & school bags", "ظهر|مدرسية|backpack|school bag"),
      c("p-travel-bags", "حقائب سفر", "Travel bags & suitcases", "سفر|سوتكيس|travel|suitcase|luggage"),
    ]),
    c("p-accessories", "إكسسوارات وساعات", "Accessories & watches", "اكسسوار|ساعة|نظارة|حزام|accessory|watch|sunglasses|belt", [
      c("p-watches", "ساعات", "Watches", "ساعة|watch"),
      c("p-glasses", "نظارات", "Sunglasses & glasses", "نظارة|نظارات|glasses|sunglasses"),
      c("p-belts-scarves", "أحزمة وأوشحة وقبعات", "Belts, scarves & hats", "حزام|وشاح|قبعة|طاقية|belt|scarf|hat|cap"),
    ]),
    c("p-jewelry", "مجوهرات وإكسسوارات زينة", "Jewelry", "مجوهرات|ذهب|فضة|خاتم|سوار|عقد|jewelry|gold|silver|ring|bracelet|necklace", [
      c("p-gold", "ذهب", "Gold", "ذهب|gold"),
      c("p-silver", "فضة", "Silver", "فضة|silver"),
      c("p-fashion-jewelry", "إكسسوارات تقليد وزينة", "Fashion jewelry", "اكسسوارات|تقليد|بدل|fashion jewelry|costume"),
    ]),
    c("p-sportswear", "ملابس رياضية", "Sportswear", "رياضي|تدريب|طقم رياضي|sportswear|activewear|tracksuit"),
    c("p-wedding", "ملابس أعراس ومناسبات", "Wedding & occasion wear", "عروس|فستان عرس|سهرة|مناسبات|bridal|wedding|evening dress|occasion"),
  ]),

  d("p-home", "home", "🏠", "المنزل والمطبخ", "Home & Kitchen", "بيت|منزل|مطبخ|اثاث|home|kitchen|house|furniture", [
    c("p-furniture", "أثاث", "Furniture", "اثاث|كنب|سرير|خزانة|طاولة|كرسي|furniture|sofa|bed|wardrobe|table|chair", [
      c("p-living", "غرف جلوس وصالونات", "Living room", "كنب|صالون|طقم جلوس|sofa|couch|living room"),
      c("p-bedroom", "غرف نوم وأسرّة", "Bedroom", "غرفة نوم|سرير|خزانة|bed|bedroom|wardrobe|mattress"),
      c("p-dining", "طاولات وكراسي", "Dining & chairs", "سفرة|طاولة|كرسي|dining|table|chair"),
      c("p-office-furniture", "أثاث مكتبي", "Office furniture", "مكتب|كرسي مكتب|office desk|office chair"),
      c("p-outdoor-furniture", "أثاث حدائق وخارجي", "Outdoor furniture", "حديقة|خارجي|جلسة|garden furniture|outdoor|patio"),
    ]),
    c("p-kitchenware", "أدوات مطبخ", "Kitchenware", "مطبخ|طنجرة|صحون|اواني|سكاكين|kitchenware|pots|pans|dishes|cutlery", [
      c("p-cookware", "أواني طبخ", "Pots & pans", "طنجرة|مقلاة|حلة|pot|pan|cookware"),
      c("p-dinnerware", "صحون وأكواب", "Plates & cups", "صحن|كوب|فنجان|plate|cup|mug|dinnerware"),
      c("p-cutlery", "ملاعق وسكاكين", "Cutlery & knives", "ملعقة|سكين|شوكة|cutlery|knife|spoon|fork"),
      c("p-storage", "حافظات وتخزين", "Food storage", "حافظة|علب|تخزين|container|storage|lunch box"),
    ]),
    c("p-appliances", "أجهزة منزلية", "Home appliances", "ثلاجة|غسالة|فرن|مكيف|fridge|washing machine|oven|air conditioner|appliance", [
      c("p-fridges", "ثلاجات وفريزرات", "Refrigerators & freezers", "ثلاجة|براد|فريزر|fridge|refrigerator|freezer"),
      c("p-washers", "غسالات ونشافات", "Washers & dryers", "غسالة|نشافة|washer|washing machine|dryer"),
      c("p-cookers", "أفران وبوتاجازات", "Ovens & cookers", "فرن|بوتاغاز|غاز|oven|cooker|stove"),
      c("p-ac", "مكيفات ومراوح وسخانات", "A/C, fans & heaters", "مكيف|مروحة|سخان|مدفأة|ac|fan|heater|air conditioner"),
      c("p-small-appliances", "أجهزة مطبخ صغيرة", "Small kitchen appliances", "خلاط|غلاية|محمصة|مكنسة|blender|kettle|toaster|vacuum|mixer|air fryer"),
    ]),
    c("p-bedding", "مفروشات وبياضات", "Bedding & linens", "مفروشات|بياضات|لحاف|فرشة|مخدة|بطانية|bedding|linen|duvet|pillow|blanket|towel", [
      c("p-sheets", "شراشف ولحف", "Sheets & duvets", "شرشف|لحاف|sheet|duvet|comforter"),
      c("p-pillows-mattress", "مخدات وفرشات", "Pillows & mattresses", "مخدة|وسادة|فرشة|pillow|mattress"),
      c("p-blankets", "بطانيات", "Blankets", "بطانية|blanket"),
      c("p-towels", "مناشف", "Towels", "منشفة|مناشف|towel"),
    ]),
    c("p-decor", "ديكور وإضاءة", "Decor & lighting", "ديكور|ثريا|لوحات|مرايا|ستائر|سجاد|decor|lighting|chandelier|mirror|curtains|carpet|rug", [
      c("p-curtains-carpets", "ستائر وسجاد", "Curtains & carpets", "ستارة|سجاد|موكيت|curtain|carpet|rug"),
      c("p-lighting", "إنارة وثريات", "Lighting", "ثريا|اضاءة|لمبة|lamp|light|chandelier"),
      c("p-wall-decor", "لوحات ومرايا وساعات حائط", "Wall art & mirrors", "لوحة|مرآة|ساعة حائط|wall art|mirror|wall clock|frame"),
      c("p-vases-candles", "مزهريات وشموع", "Vases & candles", "مزهرية|شمعة|vase|candle"),
    ]),
    c("p-bathroom", "أدوات الحمام", "Bathroom", "حمام|دش|مناشف|bathroom|shower|toilet"),
    c("p-cleaning", "منظفات ومستلزمات تنظيف", "Cleaning supplies", "منظف|تنظيف|مكنسة|مسّاحة|cleaning|detergent|broom|mop"),
    c("p-tools", "عدد وأدوات", "Tools & hardware", "عدة|عدد|مفك|شنيور|ادوات|tools|drill|hardware|screwdriver", [
      c("p-hand-tools", "عدد يدوية", "Hand tools", "مفك|مطرقة|زرادية|hand tools|hammer|pliers|wrench"),
      c("p-power-tools", "عدد كهربائية", "Power tools", "شنيور|صاروخ|power tools|drill|grinder"),
      c("p-plumbing-electric", "سباكة وكهرباء", "Plumbing & electrical", "سباكة|كهرباء|اسلاك|مفاتيح|plumbing|electrical|wires|switch"),
      c("p-paint", "دهانات ولوازمها", "Paint & supplies", "دهان|بوية|فرشاة|paint|brush"),
    ]),
    c("p-garden", "حديقة ونباتات", "Garden & plants", "حديقة|نباتات|بذور|اصص|garden|plants|seeds|pots|flowers", [
      c("p-plants", "نباتات وأزهار", "Plants & flowers", "نبات|ورد|زهور|plant|flower"),
      c("p-seeds-fertilizer", "بذور وأسمدة", "Seeds & fertilizer", "بذور|سماد|seeds|fertilizer"),
      c("p-garden-tools", "أدوات حدائق", "Garden tools", "ادوات حديقة|مقص|garden tools|hose"),
    ]),
    c("p-pets", "حيوانات أليفة", "Pets", "حيوانات|قطط|كلاب|طيور|اسماك|pets|cats|dogs|birds|fish", [
      c("p-pet-food", "أطعمة حيوانات", "Pet food", "طعام قطط|طعام كلاب|pet food|cat food|dog food"),
      c("p-pet-acc", "مستلزمات حيوانات", "Pet supplies", "قفص|رمل|مستلزمات|cage|litter|leash|pet supplies"),
      c("p-pet-live", "طيور وأسماك وحيوانات", "Birds, fish & animals", "طيور|اسماك|عصافير|birds|fish|aquarium"),
    ]),
  ]),

  d("p-beauty", "beauty", "💄", "الجمال والعناية", "Beauty & Care", "جمال|عناية|تجميل|beauty|care|cosmetics|makeup", [
    c("p-makeup", "مكياج", "Makeup", "مكياج|روج|ماسكارا|بودرة|makeup|lipstick|mascara|foundation", [
      c("p-face-makeup", "مكياج الوجه", "Face makeup", "فاونديشن|بودرة|كونسيلر|foundation|powder|concealer"),
      c("p-eyes", "مكياج العيون", "Eye makeup", "ماسكارا|كحل|ظلال|mascara|eyeliner|eyeshadow"),
      c("p-lips", "أحمر الشفاه", "Lipstick & lip care", "روج|احمر شفاه|lipstick|lip gloss"),
      c("p-nails", "مناكير وأظافر", "Nails", "مناكير|اظافر|طلاء|nail polish|nails"),
    ]),
    c("p-skincare", "عناية بالبشرة", "Skincare", "كريم|ترطيب|سيروم|بشرة|skincare|cream|serum|moisturizer|sunscreen", [
      c("p-face-care", "كريمات وسيروم", "Creams & serums", "كريم|سيروم|cream|serum"),
      c("p-sun", "واقي شمس", "Sunscreen", "واقي شمس|sunscreen|spf"),
      c("p-cleansers", "غسولات ومنظفات", "Cleansers", "غسول|منظف|cleanser|face wash"),
    ]),
    c("p-haircare", "عناية بالشعر", "Hair care", "شامبو|بلسم|زيت شعر|صبغة|shampoo|conditioner|hair oil|hair dye", [
      c("p-shampoo", "شامبو وبلسم", "Shampoo & conditioner", "شامبو|بلسم|shampoo|conditioner"),
      c("p-hair-tools", "أدوات شعر", "Hair tools", "سشوار|مكواة شعر|مقص|dryer|straightener|curler|hair tools"),
      c("p-hair-dye", "صبغات", "Hair dye", "صبغة|dye|hair color"),
    ]),
    c("p-perfume", "عطور", "Perfumes", "عطر|عطور|بخور|perfume|fragrance|cologne|oud", [
      c("p-perfume-women", "عطور نسائية", "Women's perfume", "عطر نسائي|women perfume"),
      c("p-perfume-men", "عطور رجالية", "Men's perfume", "عطر رجالي|men perfume"),
      c("p-oud", "عود وبخور", "Oud & incense", "عود|بخور|دخون|oud|incense|bakhoor"),
    ]),
    c("p-bodycare", "عناية بالجسم", "Body care", "لوشن|صابون|مزيل عرق|body lotion|soap|deodorant|shower gel"),
    c("p-mens-grooming", "عناية بالرجال", "Men's grooming", "حلاقة|لحية|ماكينة|shaving|beard|razor|trimmer"),
    c("p-beauty-tools", "أدوات تجميل", "Beauty tools", "فرش|اسفنجة|مرآة|brushes|sponge|tweezers"),
  ]),

  d("p-grocery", "grocery", "🛒", "البقالة والطعام", "Grocery & Food", "بقالة|طعام|اكل|مواد غذائية|grocery|food|supermarket", [
    c("p-staples", "مواد أساسية", "Staples", "رز|سكر|زيت|طحين|معكرونة|rice|sugar|oil|flour|pasta", [
      c("p-rice-grains", "رز وحبوب وبقوليات", "Rice, grains & legumes", "رز|عدس|حمص|فول|rice|lentils|chickpeas|beans"),
      c("p-oil-sugar", "زيوت وسكر وطحين", "Oil, sugar & flour", "زيت|سمنة|سكر|طحين|oil|ghee|sugar|flour"),
      c("p-pasta", "معكرونة وشعيرية", "Pasta & noodles", "معكرونة|شعيرية|pasta|noodles"),
      c("p-canned", "معلبات", "Canned food", "معلبات|تونة|فول معلب|canned|tuna"),
      c("p-spices", "بهارات وتوابل", "Spices & seasonings", "بهارات|توابل|ملح|spices|seasoning|salt|pepper"),
    ]),
    c("p-dairy", "ألبان وأجبان وبيض", "Dairy, cheese & eggs", "حليب|جبنة|لبنة|زبدة|بيض|milk|cheese|yogurt|butter|eggs", [
      c("p-milk", "حليب ولبن", "Milk & yogurt", "حليب|لبن|زبادي|milk|yogurt|laban"),
      c("p-cheese", "أجبان", "Cheese", "جبنة|جبن|cheese"),
      c("p-eggs", "بيض", "Eggs", "بيض|eggs"),
    ]),
    c("p-meat", "لحوم ودواجن وأسماك", "Meat, poultry & fish", "لحم|دجاج|سمك|مجمدات|meat|chicken|fish|beef|lamb", [
      c("p-red-meat", "لحوم حمراء", "Red meat", "لحم|غنم|عجل|meat|lamb|beef"),
      c("p-poultry", "دواجن", "Poultry", "دجاج|فروج|chicken|poultry"),
      c("p-seafood", "أسماك ومأكولات بحرية", "Fish & seafood", "سمك|روبيان|fish|shrimp|seafood"),
    ]),
    c("p-produce", "خضار وفواكه", "Fruits & vegetables", "خضار|فواكه|فاكهة|vegetables|fruits|produce"),
    c("p-bakery", "مخبوزات وحلويات", "Bakery & sweets", "خبز|حلويات|كعك|معمول|بقلاوة|bread|sweets|cake|baklava|cookies", [
      c("p-bread", "خبز ومعجنات", "Bread & pastries", "خبز|معجنات|bread|pastry|manakish"),
      c("p-sweets", "حلويات شرقية", "Oriental sweets", "حلويات|بقلاوة|كنافة|معمول|baklava|knafeh|sweets"),
      c("p-cakes", "كيك وتورتات", "Cakes", "كيك|تورتة|cake|cupcake"),
      c("p-chocolate", "شوكولا وسكاكر", "Chocolate & candy", "شوكولا|سكاكر|بونبون|chocolate|candy"),
    ]),
    c("p-drinks", "مشروبات", "Drinks", "مشروبات|عصير|مياه|مشروب غازي|ماء|drinks|juice|water|soda", [
      c("p-juice-soda", "عصائر ومشروبات غازية", "Juice & soft drinks", "عصير|غازي|pepsi|juice|soda|soft drink"),
      c("p-water", "مياه", "Water", "مياه|ماء|water"),
      c("p-coffee-tea", "قهوة وشاي", "Coffee & tea", "قهوة|شاي|نسكافيه|coffee|tea|nescafe|mate"),
    ]),
    c("p-nuts", "مكسرات وتمور وبهارات", "Nuts, dates & dried fruit", "مكسرات|تمر|تين|زبيب|nuts|dates|dried fruit|almonds"),
    c("p-honey", "عسل ومربيات ومونة", "Honey, jams & preserves", "عسل|مربى|مونة|دبس|honey|jam|preserves|molasses|pickles"),
    c("p-frozen", "مجمدات", "Frozen food", "مجمد|مجمدات|frozen"),
    c("p-baby-food", "أغذية أطفال", "Baby food", "حليب اطفال|سيريلاك|baby formula|baby food"),
    c("p-homemade", "أكل بيتي بالطلب", "Homemade food on order", "أكل بيتي|بيتي|بالطلب|مونة|homemade|home cooked|on order"),
  ]),

  d("p-sports", "sports", "⚽", "الرياضة", "Sports", "رياضة|رياضي|sports|fitness|gym", [
    c("p-gym", "معدات رياضية ولياقة", "Gym & fitness equipment", "اثقال|دمبل|جهاز مشي|دراجة ثابتة|weights|dumbbell|treadmill|exercise bike|gym equipment", [
      c("p-weights", "أثقال وبار", "Weights & barbells", "اثقال|دمبل|بار|weights|dumbbell|barbell"),
      c("p-cardio", "أجهزة كارديو", "Cardio machines", "جهاز مشي|دراجة|treadmill|bike|elliptical"),
      c("p-yoga-mats", "يوغا وتمارين منزلية", "Yoga & home workout", "يوغا|مات|حبل|yoga|mat|resistance band|jump rope"),
    ]),
    c("p-team-sports", "رياضات جماعية", "Team sports", "كرة قدم|سلة|طائرة|football|soccer|basketball|volleyball", [
      c("p-football", "كرة القدم", "Football", "كرة قدم|حذاء كرة|football|soccer|cleats"),
      c("p-basketball-volley", "كرة سلة وطائرة", "Basketball & volleyball", "سلة|طائرة|basketball|volleyball"),
    ]),
    c("p-combat", "رياضات قتالية", "Combat sports", "ملاكمة|كاراتيه|جودو|boxing|karate|judo|mma|taekwondo"),
    c("p-swimming", "سباحة", "Swimming", "سباحة|مايوه|نظارات سباحة|swimming|swimsuit|goggles"),
    c("p-bikes", "دراجات وسكوترات", "Bikes & scooters", "دراجة|سكوتر|bike|bicycle|scooter|skateboard"),
    c("p-camping", "تخييم ورحلات", "Camping & outdoors", "تخييم|خيمة|رحلات|camping|tent|hiking|fishing", [
      c("p-tents", "خيم ومعدات تخييم", "Tents & gear", "خيمة|كيس نوم|tent|sleeping bag"),
      c("p-fishing-hunting", "صيد", "Fishing & hunting", "صيد|سنارة|fishing|hunting"),
    ]),
    c("p-sports-wear", "ملابس وأحذية رياضية", "Sports clothing & shoes", "ملابس رياضية|حذاء رياضي|sportswear|sports shoes|jersey"),
    c("p-supplements", "مكملات غذائية رياضية", "Sports supplements", "بروتين|كرياتين|مكملات|protein|creatine|supplements|whey|bcaa"),
  ]),

  d("p-kids", "kids", "🧸", "الأطفال والألعاب", "Kids & Toys", "اطفال|العاب|بيبي|kids|toys|baby", [
    c("p-toys", "ألعاب", "Toys", "لعبة|العاب|toy|toys", [
      c("p-dolls", "دمى وعرائس", "Dolls & plush", "دمية|عروسة|دب|doll|plush|teddy"),
      c("p-building", "ألعاب تركيب وتعليمية", "Building & educational toys", "ليغو|تركيب|تعليمية|lego|puzzle|educational|blocks"),
      c("p-rc-cars", "سيارات وألعاب تحكم", "Cars & remote control toys", "سيارة|ريموت|car|remote control|rc|drone"),
      c("p-outdoor-toys", "ألعاب خارجية", "Outdoor toys", "مسبح|زحليقة|outdoor|slide|swing|ball"),
      c("p-board-games", "ألعاب طاولة", "Board games", "طاولة|شطرنج|board game|chess|cards"),
    ]),
    c("p-baby-gear", "مستلزمات الأطفال والرضع", "Baby gear", "عربة|كرسي سيارة|سرير اطفال|stroller|car seat|crib|baby gear", [
      c("p-strollers", "عربات", "Strollers", "عربة|stroller|pram"),
      c("p-cribs", "أسرّة وأثاث أطفال", "Cribs & kids furniture", "سرير اطفال|crib|cot"),
      c("p-feeding", "رضاعة وتغذية", "Feeding", "رضاعة|بزازة|feeding|bottle|pacifier|breast pump"),
      c("p-diapers", "حفاضات ومناديل", "Diapers & wipes", "حفاض|حفاضات|diaper|nappy|wipes"),
    ]),
    c("p-kids-clothes", "ملابس أطفال", "Kids' clothes", "ملابس اطفال|kids clothes"),
    c("p-school", "مستلزمات مدرسية", "School supplies", "حقيبة مدرسية|دفاتر|اقلام|school bag|notebook|pens"),
  ]),

  d("p-books", "books", "📚", "كتب وقرطاسية", "Books & Stationery", "كتب|قرطاسية|مكتبة|books|stationery|office supplies", [
    c("p-books-all", "كتب", "Books", "كتاب|رواية|كتب|book|novel", [
      c("p-novels", "روايات وأدب", "Novels & literature", "رواية|ادب|شعر|novel|literature|poetry"),
      c("p-academic", "كتب دراسية وجامعية", "Textbooks", "دراسي|جامعي|منهاج|textbook|academic|curriculum"),
      c("p-religious", "كتب دينية", "Religious books", "ديني|قرآن|مصحف|religious|quran|islamic"),
      c("p-kids-books", "كتب أطفال", "Kids' books", "قصص|اطفال|kids books|stories"),
      c("p-self-dev", "تنمية وإدارة", "Self-development & business", "تنمية|ادارة|self help|business|development"),
    ]),
    c("p-stationery", "قرطاسية", "Stationery", "قلم|دفتر|ملف|ورق|pen|notebook|paper|folder", [
      c("p-pens-notebooks", "أقلام ودفاتر", "Pens & notebooks", "قلم|دفتر|pen|pencil|notebook"),
      c("p-paper-files", "ورق وملفات", "Paper & files", "ورق|ملف|paper|file|folder|printer paper"),
      c("p-art", "أدوات رسم وفنون", "Art supplies", "الوان|رسم|فرشاة|art|paint|drawing|colors"),
    ]),
    c("p-office", "مستلزمات مكتبية", "Office supplies", "مكتب|دباسة|الة حاسبة|office|stapler|calculator"),
    c("p-gifts-cards", "هدايا وبطاقات", "Gifts & cards", "هدية|هدايا|بطاقة|gift|cards|wrapping"),
  ]),

  d("p-auto", "auto", "🚗", "السيارات", "Automotive", "سيارات|سيارة|مركبات|cars|vehicles|auto", [
    c("p-car-parts", "قطع غيار", "Spare parts", "قطع غيار|فلتر|فرامل|spare parts|filter|brakes|engine", [
      c("p-engine-parts", "قطع محرك", "Engine parts", "محرك|بوجي|engine|spark plug|belt"),
      c("p-brakes-suspension", "فرامل وتعليق", "Brakes & suspension", "فرامل|مساعدات|brakes|suspension|shock"),
      c("p-body-parts", "قطع هيكل وإضاءة", "Body parts & lights", "صدام|مرايا|اضاءة|bumper|headlight|mirror|body"),
      c("p-filters-oils", "فلاتر وزيوت", "Filters & oils", "فلتر|زيت|filter|oil|lubricant"),
    ]),
    c("p-tires", "إطارات وجنوط", "Tires & rims", "كفرات|اطارات|جنوط|tires|tyres|rims|wheels"),
    c("p-car-acc", "إكسسوارات وديكور السيارة", "Car accessories", "اكسسوارات سيارة|فرش|car accessories|seat covers|mats|stickers", [
      c("p-car-interior", "إكسسوارات داخلية", "Interior accessories", "فرش|مقاعد|مسند|seat cover|floor mats|interior"),
      c("p-car-audio", "صوتيات وشاشات", "Car audio & screens", "صوتيات|شاشة|راديو|car audio|stereo|screen"),
      c("p-car-care", "عناية وتنظيف", "Car care & cleaning", "غسيل|تلميع|car wash|polish|cleaning"),
    ]),
    c("p-batteries", "بطاريات ومضخات وشواحن", "Batteries & chargers", "بطارية سيارة|شاحن|car battery|jump starter"),
    c("p-motorcycles", "دراجات نارية وملحقاتها", "Motorcycles & gear", "دراجة نارية|موتور|خوذة|motorcycle|helmet|motorbike"),
    c("p-vehicles", "سيارات للبيع", "Vehicles for sale", "سيارة للبيع|سيارات|car for sale|used car"),
  ]),

  d("p-health", "health", "💊", "الصحة", "Health", "صحة|دواء|طبي|health|medical|pharmacy", [
    c("p-medical", "أجهزة ومستلزمات طبية", "Medical devices & supplies", "جهاز ضغط|سكر|كمامة|medical|blood pressure|glucose|mask|thermometer", [
      c("p-monitors", "أجهزة قياس", "Monitors & meters", "ضغط|سكر|حرارة|blood pressure|glucose|thermometer|oximeter"),
      c("p-mobility", "كراسي متحركة وعكازات", "Mobility aids", "كرسي متحرك|عكاز|wheelchair|crutches|walker"),
      c("p-first-aid", "إسعافات أولية", "First aid", "اسعافات|ضماد|first aid|bandage|gauze"),
      c("p-masks-gloves", "كمامات وقفازات", "Masks & gloves", "كمامة|قفاز|mask|gloves"),
    ]),
    c("p-vitamins", "فيتامينات ومكملات", "Vitamins & supplements", "فيتامين|مكمل|اوميغا|vitamin|supplement|omega|zinc"),
    c("p-herbal", "أعشاب ومنتجات طبيعية", "Herbs & natural products", "اعشاب|عطارة|طبيعي|herbs|herbal|natural|spices"),
    c("p-personal-care", "عناية شخصية", "Personal care", "عناية شخصية|فوط|شفرات|personal care|pads|razors"),
    c("p-dental-eye", "عناية بالأسنان والعيون", "Dental & eye care", "فرشاة اسنان|معجون|عدسات|toothpaste|toothbrush|contact lenses|eye drops"),
    c("p-orthopedic", "مستلزمات طبية للعظام", "Orthopedic supplies", "مشد|دعامة|وسادة طبية|brace|support|orthopedic|posture"),
  ]),

  d("p-handmade", "home", "🎨", "حرف يدوية وهدايا", "Handmade & Gifts", "يدوي|حرف|هدايا|handmade|crafts|gifts", [
    c("p-crafts", "مشغولات يدوية", "Handmade crafts", "يدوي|كروشيه|تطريز|خزف|handmade|crochet|embroidery|pottery", [
      c("p-crochet-knit", "كروشيه وتريكو", "Crochet & knitting", "كروشيه|تريكو|حياكة|crochet|knitting"),
      c("p-embroidery", "تطريز وخياطة", "Embroidery & sewing", "تطريز|خياطة|embroidery|sewing"),
      c("p-pottery-wood", "خزف وخشب وزجاج", "Pottery, wood & glass", "خزف|خشب|زجاج|فخار|pottery|wood|glass|ceramic"),
      c("p-soap-candles", "صابون وشموع يدوية", "Handmade soap & candles", "صابون|شموع|soap|candles"),
    ]),
    c("p-gift-items", "هدايا وتغليف", "Gifts & wrapping", "هدية|هدايا|تغليف|بوكيه|gift|gifts|wrapping|bouquet", [
      c("p-gift-sets", "بوكسات هدايا", "Gift boxes & sets", "بوكس|هدية|gift box|gift set|hamper"),
      c("p-custom-gifts", "هدايا بالطلب مخصصة", "Custom gifts", "طباعة|اسم|مخصص|custom|personalized|engraved|print"),
      c("p-flowers", "ورد وبوكيهات", "Flowers & bouquets", "ورد|بوكيه|زهور|flowers|bouquet|roses"),
    ]),
    c("p-party", "حفلات ومناسبات", "Party supplies", "حفلة|بالونات|زينة|عيد ميلاد|party|balloons|decorations|birthday"),
    c("p-antiques", "تحف وأنتيكا", "Antiques & collectibles", "تحف|انتيكا|قديم|antique|collectible|vintage"),
    c("p-religious-items", "مستلزمات دينية", "Religious items", "سجادة صلاة|مسبحة|prayer mat|rosary|misbaha|quran stand"),
  ]),

  d("p-industrial", "home", "🏭", "مواد بناء وصناعة", "Building & Industrial", "بناء|صناعة|مواد بناء|building|industrial|construction", [
    c("p-building-materials", "مواد بناء", "Building materials", "اسمنت|حديد|بلاط|سيراميك|cement|steel|tiles|ceramic|bricks"),
    c("p-doors-windows", "أبواب ونوافذ", "Doors & windows", "باب|نافذة|شباك|door|window|aluminum"),
    c("p-pipes-electrical", "أنابيب وكابلات", "Pipes & cables", "انابيب|كابلات|pipes|cables|wires"),
    c("p-machinery", "آلات ومعدات", "Machinery & equipment", "آلات|معدات|مولد|machinery|equipment|generator|compressor"),
    c("p-safety", "معدات سلامة", "Safety equipment", "سلامة|خوذة|قفازات|safety|helmet|gloves|extinguisher"),
  ]),

  d("p-digital", "electronics", "💾", "منتجات رقمية وخدمات", "Digital Products & Services", "رقمي|اشتراك|برامج|digital|subscription|software|service", [
    c("p-subscriptions", "اشتراكات وحسابات", "Subscriptions & accounts", "اشتراك|حساب|نتفلكس|subscription|account|netflix|spotify"),
    c("p-software", "برامج وتطبيقات", "Software & apps", "برنامج|تطبيق|software|app|license"),
    c("p-gift-cards-digital", "بطاقات شحن وهدايا", "Gift & top-up cards", "بطاقة شحن|رصيد|gift card|top up|recharge|voucher"),
    c("p-design-templates", "تصاميم وقوالب", "Designs & templates", "تصميم|قالب|design|template|logo"),
    c("p-courses", "دورات وكتب إلكترونية", "Courses & e-books", "دورة|كورس|كتاب الكتروني|course|ebook|e-book|lesson"),
  ]),
];

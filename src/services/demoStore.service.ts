import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * Sample shops and 50 sample products so the online store can be looked at and judged before real merchants
 * fill it. Everything made here is recognisable (the shops' e-mails end in DEMO_DOMAIN) so removeDemoStore()
 * deletes exactly this and nothing else.
 */
export const DEMO_DOMAIN = "@demo-store.dalilacom.invalid";

// where each sample shop is (so the city and "around me" filters of the store can be tried)
const SHOPS = [
  { name: "تكنو بلس", phone: "+963 11 555 0101", city: "دمشق", lat: 33.5138, lng: 36.2765 },
  { name: "بيت الأزياء", phone: "+963 11 555 0102", city: "دمشق", lat: 33.5352, lng: 36.3074 },
  { name: "سوق البيت", phone: "+963 21 555 0103", city: "حلب", lat: 36.2021, lng: 37.1343 },
  { name: "ركن الجمال والصحة", phone: "+963 31 555 0104", city: "حمص", lat: 34.7324, lng: 36.7137 },
  { name: "عالم الرياضة والمعرفة", phone: "+963 41 555 0105", city: "اللاذقية", lat: 35.5317, lng: 35.79 },
];

// [section, icon, name, description, price €, member price € (0 = none), stock, rating, ratings, sold, shop]
type Row = [string, string, string, string, number, number, number, number, number, number, number];

const PRODUCTS: Row[] = [
  // ---- electronics (تكنو بلس)
  ["electronics", "📱", "هاتف ذكي 128 جيجا", "شاشة 6.5 إنش، كاميرا ثلاثية 50 ميجابكسل، بطارية تدوم يومين، ضمان سنتين.", 299, 279, 40, 4.5, 812, 1930, 0],
  ["electronics", "🎧", "سماعات لاسلكية عازلة للضجيج", "بلوتوث 5.3، عزل نشط للضجيج، تشغيل 30 ساعة، علبة شحن.", 59, 52, 120, 4.4, 1543, 4210, 0],
  ["electronics", "⌚", "ساعة ذكية رياضية", "مقاومة للماء، قياس نبض القلب والنوم، شاشة AMOLED.", 79, 0, 75, 4.2, 530, 1260, 0],
  ["electronics", "💻", "حاسوب محمول 15.6 إنش", "معالج حديث، ذاكرة 16 جيجا، تخزين SSD سعة 512 جيجا.", 649, 619, 18, 4.6, 276, 540, 0],
  ["electronics", "🔌", "شاحن سريع 65 واط", "منفذان USB-C وUSB-A، يشحن الهاتف واللابتوب، حماية من الحرارة.", 19, 0, 300, 4.7, 2210, 8800, 0],
  // ---- fashion (بيت الأزياء)
  ["fashion", "👟", "حذاء رياضي خفيف", "نعل مرن مريح للمشي والجري، قماش يسمح بمرور الهواء.", 45, 39, 90, 4.3, 740, 2100, 1],
  ["fashion", "👜", "حقيبة يد جلد طبيعي", "جلد طبيعي بخياطة متقنة، جيوب داخلية وسحاب متين.", 89, 0, 35, 4.6, 322, 690, 1],
  ["fashion", "🧥", "جاكيت شتوي مبطّن", "حشوة دافئة، مقاوم للمطر، متوفر بعدة مقاسات.", 69, 62, 55, 4.4, 410, 980, 1],
  ["fashion", "👔", "قميص رجالي قطن", "قطن 100% بقصّة مريحة للعمل والمناسبات.", 24, 0, 160, 4.1, 668, 3100, 1],
  ["fashion", "🕶️", "نظارة شمسية بعدسات مستقطبة", "حماية كاملة من الأشعة فوق البنفسجية، إطار خفيف.", 29, 25, 85, 4.0, 255, 760, 1],
  // ---- home (سوق البيت)
  ["home", "🍳", "طقم أواني طهي 10 قطع", "غير لاصق، مناسب لجميع أنواع المواقد، مقابض عازلة للحرارة.", 79, 69, 45, 4.6, 905, 2400, 2],
  ["home", "☕", "ماكينة قهوة أوتوماتيكية", "تحضير إسبرسو وكابتشينو بضغطة زر، خزان 1.5 لتر.", 129, 0, 22, 4.5, 388, 840, 2],
  ["home", "🛏️", "طقم شراشف قطن مصري", "ثلاث قطع ناعمة الملمس، لا تتغير ألوانها بالغسيل.", 49, 44, 70, 4.4, 512, 1500, 2],
  ["home", "💡", "مصباح مكتب LED قابل للتعديل", "ثلاث درجات إضاءة، شحن USB، ذراع مرنة.", 21, 0, 140, 4.3, 430, 1750, 2],
  ["home", "🧹", "مكنسة كهربائية لاسلكية", "قوة شفط عالية، بطارية 40 دقيقة، فلتر قابل للغسل.", 109, 99, 30, 4.2, 297, 620, 2],
  // ---- beauty (ركن الجمال والصحة)
  ["beauty", "🧴", "كريم مرطب للبشرة الجافة", "بزبدة الشيا وفيتامين E، امتصاص سريع دون ملمس دهني.", 12, 0, 200, 4.5, 1320, 5600, 3],
  ["beauty", "💄", "طقم أحمر شفاه 6 ألوان", "ثبات طويل وترطيب، ألوان عصرية للنهار والسهرة.", 18, 15, 150, 4.3, 876, 3300, 3],
  ["beauty", "🌸", "عطر نسائي 100 مل", "رائحة زهرية منعشة تدوم طويلًا، عبوة أنيقة.", 39, 0, 80, 4.4, 540, 1450, 3],
  ["beauty", "🪒", "ماكينة حلاقة كهربائية", "شفرات ثلاثية، شحن لاسلكي، تنظيف بالماء.", 35, 31, 95, 4.2, 611, 1980, 3],
  ["beauty", "🧼", "صابون طبيعي بزيت الزيتون", "حلب أصلي، لطيف على البشرة، عبوة 6 قطع.", 9, 0, 400, 4.8, 2450, 9700, 3],
  // ---- grocery (سوق البيت)
  ["grocery", "🫒", "زيت زيتون بكر ممتاز 1 لتر", "عصرة أولى باردة من مزارع سورية، حموضة منخفضة.", 14, 12, 250, 4.8, 1980, 7400, 2],
  ["grocery", "🍯", "عسل طبيعي 500 غرام", "عسل جبلي صافٍ بدون إضافات، مختوم.", 17, 0, 180, 4.7, 1210, 4300, 2],
  ["grocery", "☕", "قهوة عربية بالهيل 250 غرام", "محمصة طازجة، نكهة غنية مع الهيل الفاخر.", 8, 0, 320, 4.6, 1655, 6100, 2],
  ["grocery", "🥜", "مكسّرات مشكلة 500 غرام", "لوز وكاجو وفستق مملّح خفيف، طازجة.", 13, 11, 210, 4.5, 934, 3900, 2],
  ["grocery", "🍫", "شوكولاتة داكنة 70% علبة", "كاكاو فاخر، مناسبة للهدايا، 12 قطعة.", 7, 0, 280, 4.4, 702, 2800, 2],
  // ---- sports (عالم الرياضة والمعرفة)
  ["sports", "🏋️", "طقم دمبل قابل للتعديل", "من 2 إلى 20 كيلو، تغيير سريع للأوزان، قبضة مريحة.", 85, 76, 28, 4.5, 365, 710, 4],
  ["sports", "🧘", "سجادة يوغا سميكة", "مانعة للانزلاق، سماكة 8 ملم، مع حقيبة حمل.", 17, 0, 170, 4.4, 820, 2900, 4],
  ["sports", "🚴", "دراجة هوائية جبلية 26 إنش", "هيكل ألمنيوم، 21 سرعة، فرامل قرصية.", 249, 229, 12, 4.3, 148, 260, 4],
  ["sports", "⚽", "كرة قدم احترافية", "مقاس 5، جلد صناعي، تحمّل الاستخدام المكثف.", 22, 0, 130, 4.6, 940, 3400, 4],
  ["sports", "🎒", "حقيبة ظهر للرحلات 40 لتر", "مقاومة للماء، حزام ظهر مبطّن، جيوب متعددة.", 33, 29, 66, 4.4, 392, 1010, 4],
  // ---- kids (بيت الأزياء)
  ["kids", "🧸", "دبدوب قطني ناعم", "حجم كبير، آمن للأطفال، قابل للغسل.", 15, 0, 120, 4.7, 1105, 3600, 1],
  ["kids", "🧩", "لعبة تركيب تعليمية 200 قطعة", "تنمّي التفكير والتركيز لأعمار 5 سنوات فما فوق.", 14, 12, 140, 4.6, 640, 2250, 1],
  ["kids", "🚗", "سيارة تحكم عن بعد", "سرعة عالية، بطارية قابلة للشحن، مقاومة للصدمات.", 27, 0, 75, 4.2, 355, 980, 1],
  ["kids", "🎨", "حقيبة ألوان ورسم 80 قطعة", "ألوان خشبية وشمعية ومائية في حقيبة مرتّبة.", 16, 14, 150, 4.5, 470, 1700, 1],
  ["kids", "👶", "عربة أطفال خفيفة قابلة للطي", "هيكل متين، مظلة شمسية، تطوى بيد واحدة.", 119, 109, 16, 4.3, 190, 330, 1],
  // ---- books (عالم الرياضة والمعرفة)
  ["books", "📚", "مجموعة روايات عربية مختارة", "ثلاث روايات من أبرز الأدب العربي المعاصر.", 18, 0, 90, 4.6, 410, 1100, 4],
  ["books", "📓", "دفتر ملاحظات فاخر بغلاف جلدي", "200 ورقة مسطّرة، ورق سميك لا ينفذ الحبر.", 9, 0, 240, 4.5, 560, 2400, 4],
  ["books", "✏️", "طقم أقلام وأدوات مكتبية 30 قطعة", "أقلام وممحاة ومسطرة وأدوات هندسية في علبة.", 11, 9, 200, 4.3, 330, 1500, 4],
  ["books", "🎒", "حقيبة مدرسية مريحة", "ظهر مبطّن، جيوب منظّمة، قماش قوي.", 26, 23, 110, 4.4, 480, 1650, 4],
  ["books", "🔬", "قاموس إنكليزي عربي شامل", "أكثر من 100 ألف مدخل مع أمثلة وصور.", 21, 0, 60, 4.7, 270, 740, 4],
  // ---- auto (تكنو بلس)
  ["auto", "🛢️", "زيت محرك صناعي 5 لتر", "5W-30 لحماية المحرك وتوفير الوقود.", 38, 34, 100, 4.6, 520, 1900, 0],
  ["auto", "📷", "كاميرا سيارة أمامية بدقة 2K", "رؤية ليلية، تسجيل متواصل، شاشة 3 إنش.", 54, 0, 55, 4.2, 305, 760, 0],
  ["auto", "🔋", "جهاز تشغيل بطارية السيارة", "قدرة 12000 مللي أمبير، مصباح طوارئ، شاحن هاتف.", 42, 38, 48, 4.5, 270, 590, 0],
  ["auto", "🧽", "طقم تنظيف السيارة 12 قطعة", "شامبو ومناشف وفرش وملمّع في حقيبة.", 24, 0, 85, 4.3, 215, 640, 0],
  ["auto", "🪑", "غطاء مقاعد سيارة جلد صناعي", "طقم كامل لجميع المقاعد، مقاوم للماء والخدوش.", 59, 52, 40, 4.1, 180, 410, 0],
  // ---- health (ركن الجمال والصحة)
  ["health", "💊", "فيتامين د3 1000 وحدة", "60 كبسولة، يدعم العظام والمناعة.", 11, 0, 260, 4.6, 1410, 5200, 3],
  ["health", "🩺", "جهاز قياس ضغط الدم", "شاشة كبيرة، ذاكرة 90 قراءة، دقيق وسهل الاستخدام.", 32, 28, 70, 4.5, 690, 1800, 3],
  ["health", "🌡️", "ميزان حرارة رقمي بالأشعة", "قياس خلال ثانية دون ملامسة، مناسب للأطفال.", 17, 0, 130, 4.4, 750, 2600, 3],
  ["health", "😷", "كمامات طبية علبة 50 قطعة", "ثلاث طبقات، ربطة مرنة مريحة.", 5, 0, 500, 4.3, 980, 7800, 3],
  ["health", "🦴", "وسادة طبية للرقبة", "ذاكرة فوم تدعم الرقبة والعمود الفقري أثناء النوم.", 23, 20, 80, 4.5, 360, 920, 3],
];

export async function addDemoStore() {
  const category = (await prisma.category.findFirst({ orderBy: { sortOrder: "asc" } }))
    ?? (await prisma.category.create({ data: { name: "متاجر", slug: "demo-shops" } }));

  const cities = await prisma.geoUnit.findMany({ where: { country: { isoCode2: "SY" }, level: "CITY" }, select: { id: true, name: true, nameArabic: true } });
  const cityOf = (hint: string) => cities.find((c) => c.nameArabic === hint || c.name === hint)?.id ?? null;

  const shopIds: string[] = [];
  for (let i = 0; i < SHOPS.length; i++) {
    const email = `shop${i + 1}${DEMO_DOMAIN}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { countryCode: "SY", cityId: cityOf(SHOPS[i].city) },
      create: {
        email,
        countryCode: "SY",
        cityId: cityOf(SHOPS[i].city),
        fullName: SHOPS[i].name,
        role: Role.MERCHANT,
        isEmailVerified: true,
        // nobody can sign in to a demo shop: the password is thrown away
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
      },
    });
    const profile = await prisma.merchantProfile.upsert({
      where: { userId: user.id },
      update: { approvalStatus: "APPROVED", latitude: SHOPS[i].lat, longitude: SHOPS[i].lng },
      create: { userId: user.id, businessName: SHOPS[i].name, categoryId: category.id, phone: SHOPS[i].phone, latitude: SHOPS[i].lat, longitude: SHOPS[i].lng, approvalStatus: "APPROVED" },
    });
    shopIds.push(profile.id);
  }

  // two real photos per product, shipped in public/product-photos (demo-01-a.jpg, demo-01-b.jpg, ...)
  const photos = (i: number) => ["a", "b"].map((x) => `/product-photos/demo-${String(i + 1).padStart(2, "0")}-${x}.jpg`);

  const have = await prisma.product.findMany({ where: { merchantId: { in: shopIds } }, select: { id: true, merchantId: true, name: true } });
  const key = (merchantId: string, name: string) => `${merchantId}|${name}`;
  const existingByKey = new Map(have.map((p) => [key(p.merchantId, p.name), p.id]));
  // products added by an earlier run only get their photos
  for (const [i, r] of PRODUCTS.entries()) {
    const id = existingByKey.get(key(shopIds[r[10]], r[2]));
    if (id) await prisma.product.update({ where: { id }, data: { images: photos(i), imageUrl: photos(i)[0] } });
  }

  // spread the "added" times over the last weeks so "newest" sorts differently from "best selling"
  const now = Date.now();
  const fresh = PRODUCTS.map((r, i) => ({ r, i })).filter(({ r }) => !existingByKey.has(key(shopIds[r[10]], r[2])));
  await prisma.product.createMany({
    data: fresh.map(({ r, i }) => ({
      merchantId: shopIds[r[10]],
      images: photos(i),
      imageUrl: photos(i)[0],
      storeSection: r[0],
      icon: r[1],
      name: r[2],
      description: r[3],
      priceCents: r[4] * 100,
      memberDiscountEnabled: r[5] > 0,
      memberPriceCents: r[5] > 0 ? r[5] * 100 : null,
      stock: r[6],
      rating: r[7],
      ratingCount: r[8],
      soldCount: r[9],
      createdAt: new Date(now - i * 14 * 3600 * 1000),
    })),
  });
  return { shops: shopIds.length, products: PRODUCTS.length, created: fresh.length };
}

/** Deletes the sample shops, their products and anything that points at them. */
export async function removeDemoStore() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true, merchantProfile: { select: { id: true } } } });
  const merchantIds = users.map((u) => u.merchantProfile?.id).filter((id): id is string => !!id);
  const productIds = (await prisma.product.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((p) => p.id);
  const orders = await prisma.order.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } });
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { productId: { in: productIds } } }),
    prisma.orderItem.deleteMany({ where: { OR: [{ productId: { in: productIds } }, { orderId: { in: orders.map((o) => o.id) } }] } }),
    prisma.affiliateReferral.deleteMany({ where: { productId: { in: productIds } } }),
    prisma.order.deleteMany({ where: { merchantId: { in: merchantIds } } }),
    prisma.product.deleteMany({ where: { merchantId: { in: merchantIds } } }),
    prisma.merchantProfile.deleteMany({ where: { id: { in: merchantIds } } }),
    prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }),
  ]);
  return { shops: merchantIds.length, products: productIds.length };
}

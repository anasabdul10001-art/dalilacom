/**
 * Starting geography for Syria: governorate (REGION) > city or town (CITY) > neighbourhood (AREA).
 * A first list so the pickers and the announcements have something to choose from — the super admin adds, renames and
 * hides places in the admin panel (قسم المدن والأحياء). Seeding only creates what is missing; it never renames or deletes.
 */
export type Named = [ar: string, en: string];

export interface CitySeed {
  ar: string;
  en: string;
  /** Neighbourhoods (AREA) — only listed for the biggest cities. */
  areas?: Named[];
}

export interface RegionSeed {
  ar: string;
  en: string;
  cities: CitySeed[];
}

const city = (ar: string, en: string, areas?: Named[]): CitySeed => ({ ar, en, areas });

export const SYRIA_REGIONS: RegionSeed[] = [
  {
    ar: "دمشق",
    en: "Damascus",
    cities: [
      city("دمشق", "Damascus", [
        ["المزة", "Mezzeh"],
        ["كفرسوسة", "Kafr Sousa"],
        ["المالكي", "Maliki"],
        ["أبو رمانة", "Abu Rummaneh"],
        ["الشعلان", "Shaalan"],
        ["الصالحية", "Salihiyya"],
        ["ركن الدين", "Rukn al-Din"],
        ["المهاجرين", "Muhajirin"],
        ["القصاع", "Qassaa"],
        ["باب توما", "Bab Touma"],
        ["الميدان", "Midan"],
        ["برزة", "Barzeh"],
        ["القابون", "Qaboun"],
        ["دمر", "Dummar"],
        ["المزرعة", "Mazraa"],
        ["البرامكة", "Baramkeh"],
        ["جوبر", "Jobar"],
        ["القدم", "Qadam"],
        ["العباسيين", "Abbasiyyin"],
        ["الدويلعة", "Duwaylaa"],
      ]),
    ],
  },
  {
    ar: "ريف دمشق",
    en: "Rif Dimashq",
    cities: [
      city("دوما", "Douma"),
      city("داريا", "Darayya"),
      city("جرمانا", "Jaramana"),
      city("التل", "Tell"),
      city("يبرود", "Yabroud"),
      city("الزبداني", "Zabadani"),
      city("قطنا", "Qatana"),
      city("صحنايا", "Sahnaya"),
      city("النبك", "Nabk"),
      city("قدسيا", "Qudsaya"),
      city("الكسوة", "Kiswah"),
      city("معضمية الشام", "Muadamiyat al-Sham"),
      city("عربين", "Arbin"),
      city("حرستا", "Harasta"),
    ],
  },
  {
    ar: "حلب",
    en: "Aleppo",
    cities: [
      city("حلب", "Aleppo", [
        ["الفرقان", "Furqan"],
        ["الجميلية", "Jamiliyah"],
        ["العزيزية", "Aziziyah"],
        ["السليمانية", "Sulaymaniyah"],
        ["الشهباء", "Shahba"],
        ["حلب الجديدة", "New Aleppo"],
        ["صلاح الدين", "Salah al-Din"],
        ["الحمدانية", "Hamdaniyah"],
        ["الأشرفية", "Ashrafiyah"],
        ["الشيخ مقصود", "Sheikh Maqsoud"],
        ["سيف الدولة", "Saif al-Dawla"],
        ["الميدان", "Maydan"],
        ["الكلاسة", "Kallaseh"],
        ["بستان القصر", "Bustan al-Qasr"],
        ["الصاخور", "Sakhour"],
        ["هنانو", "Hanano"],
      ]),
      city("منبج", "Manbij"),
      city("الباب", "Al-Bab"),
      city("عفرين", "Afrin"),
      city("اعزاز", "A'zaz"),
      city("جرابلس", "Jarabulus"),
      city("السفيرة", "Safira"),
      city("عين العرب", "Ayn al-Arab"),
    ],
  },
  {
    ar: "حمص",
    en: "Homs",
    cities: [
      city("حمص", "Homs", [
        ["الوعر", "Waer"],
        ["الإنشاءات", "Inshaat"],
        ["الحمراء", "Hamra"],
        ["كرم اللوز", "Karm al-Loz"],
        ["الخالدية", "Khalidiyya"],
        ["بابا عمرو", "Baba Amr"],
        ["الغوطة", "Ghouta"],
        ["عكرمة", "Akrama"],
        ["الزهراء", "Zahraa"],
        ["المحطة", "Mahatta"],
        ["القصور", "Qusour"],
        ["وادي الذهب", "Wadi al-Dahab"],
      ]),
      city("تدمر", "Palmyra"),
      city("القصير", "Qusayr"),
      city("الرستن", "Rastan"),
      city("تلكلخ", "Talkalakh"),
      city("تلبيسة", "Talbiseh"),
      city("القريتين", "Qaryatayn"),
    ],
  },
  {
    ar: "حماة",
    en: "Hama",
    cities: [
      city("حماة", "Hama", [
        ["الحاضر", "Hadher"],
        ["الأربعين", "Arbaeen"],
        ["طريق حلب", "Aleppo Road"],
        ["القصور", "Qusour"],
        ["الحميدية", "Hamidiyah"],
        ["الصابونية", "Sabuniyah"],
        ["الشريعة", "Sharia"],
      ]),
      city("سلمية", "Salamiyah"),
      city("مصياف", "Masyaf"),
      city("محردة", "Mhardeh"),
      city("السقيلبية", "Suqaylabiyah"),
      city("كفرزيتا", "Kafr Zita"),
    ],
  },
  {
    ar: "اللاذقية",
    en: "Latakia",
    cities: [
      city("اللاذقية", "Latakia", [
        ["الزراعة", "Zira'a"],
        ["الصليبة", "Sleibeh"],
        ["الرمل الشمالي", "North Raml"],
        ["الرمل الجنوبي", "South Raml"],
        ["الأميركان", "Americain"],
        ["المشروع العاشر", "Project 10"],
        ["الشيخ ضاهر", "Sheikh Daher"],
      ]),
      city("جبلة", "Jableh"),
      city("القرداحة", "Qardaha"),
      city("الحفة", "Haffa"),
      city("كسب", "Kessab"),
    ],
  },
  {
    ar: "طرطوس",
    en: "Tartus",
    cities: [
      city("طرطوس", "Tartus"),
      city("بانياس", "Baniyas"),
      city("صافيتا", "Safita"),
      city("دريكيش", "Duraykish"),
      city("الشيخ بدر", "Sheikh Badr"),
      city("القدموس", "Qadmus"),
      city("مشتى الحلو", "Mashta al-Helu"),
      city("أرواد", "Arwad"),
    ],
  },
  {
    ar: "إدلب",
    en: "Idlib",
    cities: [
      city("إدلب", "Idlib"),
      city("معرة النعمان", "Maarat al-Numan"),
      city("جسر الشغور", "Jisr al-Shughur"),
      city("أريحا", "Ariha"),
      city("سراقب", "Saraqib"),
      city("خان شيخون", "Khan Shaykhun"),
      city("حارم", "Harem"),
      city("سلقين", "Salqin"),
      city("بنش", "Binnish"),
    ],
  },
  {
    ar: "الحسكة",
    en: "Al-Hasakah",
    cities: [
      city("الحسكة", "Al-Hasakah"),
      city("القامشلي", "Qamishli"),
      city("رأس العين", "Ras al-Ayn"),
      city("المالكية", "Al-Malikiyah"),
      city("عامودا", "Amuda"),
      city("الشدادي", "Shaddadi"),
      city("الدرباسية", "Darbasiyah"),
    ],
  },
  {
    ar: "دير الزور",
    en: "Deir ez-Zor",
    cities: [city("دير الزور", "Deir ez-Zor"), city("الميادين", "Mayadin"), city("البوكمال", "Abu Kamal")],
  },
  {
    ar: "الرقة",
    en: "Raqqa",
    cities: [city("الرقة", "Raqqa"), city("الطبقة", "Tabqa"), city("تل أبيض", "Tell Abyad")],
  },
  {
    ar: "درعا",
    en: "Daraa",
    cities: [
      city("درعا", "Daraa"),
      city("إزرع", "Izra"),
      city("بصرى الشام", "Busra al-Sham"),
      city("نوى", "Nawa"),
      city("جاسم", "Jasim"),
      city("طفس", "Tafas"),
      city("الصنمين", "Sanamayn"),
      city("الحراك", "Harak"),
    ],
  },
  {
    ar: "السويداء",
    en: "As-Suwayda",
    cities: [city("السويداء", "As-Suwayda"), city("شهبا", "Shahba"), city("صلخد", "Salkhad"), city("القريا", "Qurayya")],
  },
  {
    ar: "القنيطرة",
    en: "Quneitra",
    cities: [city("القنيطرة", "Quneitra"), city("خان أرنبة", "Khan Arnabah"), city("جباتا الخشب", "Jubata al-Khashab")],
  },
];

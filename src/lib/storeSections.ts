/** The sections of the online store (a shopper's "departments"). A product is listed under one of these keys. */
export interface StoreSection {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
}

export const STORE_SECTIONS: StoreSection[] = [
  { id: "electronics", name: "إلكترونيات", nameEn: "Electronics", icon: "📱" },
  { id: "fashion", name: "أزياء", nameEn: "Fashion", icon: "👗" },
  { id: "home", name: "المنزل والمطبخ", nameEn: "Home & Kitchen", icon: "🏠" },
  { id: "beauty", name: "الجمال والعناية", nameEn: "Beauty & Care", icon: "💄" },
  { id: "grocery", name: "البقالة", nameEn: "Grocery", icon: "🛒" },
  { id: "sports", name: "الرياضة", nameEn: "Sports", icon: "⚽" },
  { id: "kids", name: "الأطفال والألعاب", nameEn: "Kids & Toys", icon: "🧸" },
  { id: "books", name: "كتب وقرطاسية", nameEn: "Books & Stationery", icon: "📚" },
  { id: "auto", name: "السيارات", nameEn: "Automotive", icon: "🚗" },
  { id: "health", name: "الصحة", nameEn: "Health", icon: "💊" },
];

export const isStoreSection = (id: string) => STORE_SECTIONS.some((s) => s.id === id);

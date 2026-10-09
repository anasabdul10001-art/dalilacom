/** The sections of the online store (a shopper's "departments"). A product is listed under one of these keys. */
export interface StoreSection {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  /** The section's picture (a real photo, like the big marketplaces), served from public/store-sections. */
  image: string;
}

export const STORE_SECTIONS: StoreSection[] = [
  { id: "electronics", name: "إلكترونيات", nameEn: "Electronics", icon: "📱", image: "/store-sections/electronics.jpg" },
  { id: "fashion", name: "أزياء", nameEn: "Fashion", icon: "👗", image: "/store-sections/fashion.jpg" },
  { id: "home", name: "المنزل والمطبخ", nameEn: "Home & Kitchen", icon: "🏠", image: "/store-sections/home.jpg" },
  { id: "beauty", name: "الجمال والعناية", nameEn: "Beauty & Care", icon: "💄", image: "/store-sections/beauty.jpg" },
  { id: "grocery", name: "البقالة", nameEn: "Grocery", icon: "🛒", image: "/store-sections/grocery.jpg" },
  { id: "sports", name: "الرياضة", nameEn: "Sports", icon: "⚽", image: "/store-sections/sports.jpg" },
  { id: "kids", name: "الأطفال والألعاب", nameEn: "Kids & Toys", icon: "🧸", image: "/store-sections/kids.jpg" },
  { id: "books", name: "كتب وقرطاسية", nameEn: "Books & Stationery", icon: "📚", image: "/store-sections/books.jpg" },
  { id: "auto", name: "السيارات", nameEn: "Automotive", icon: "🚗", image: "/store-sections/auto.jpg" },
  { id: "health", name: "الصحة", nameEn: "Health", icon: "💊", image: "/store-sections/health.jpg" },
];

export const isStoreSection = (id: string) => STORE_SECTIONS.some((s) => s.id === id);

import express, { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { STORE_SECTIONS, isStoreSection } from "../lib/storeSections";
import { DEFAULT_COUNTRY, currencyOf, onlyCountry, viewerCountry } from "../services/viewerCountry.service";
import { AD_SLOTS, liveAds } from "../services/ads.service";
import { getSettings } from "../services/settings.service";
import { describePhotoForSearch, visionAvailable } from "../services/ai.service";
import { sniffImageMime } from "../lib/image";
import { normalizeText } from "../services/category.service";
import { route } from "../lib/asyncRoute";

/**
 * The online store: every shop's products in one place, like a marketplace. Read-only and public; buying goes
 * through the ordinary cart and checkout (/cart), which already splits an order per shop.
 */
export const storeRouter = Router();

type ProductWithShop = Prisma.ProductGetPayload<{ include: { merchant: { select: { id: true; businessName: true } } } }>;

/** A stable colour (0-359) from the id, used by the clients to paint the picture when a product has no photo. */
function hueOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function view(p: ProductWithShop) {
  const section = STORE_SECTIONS.find((s) => s.id === p.storeSection) ?? null;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    memberDiscountEnabled: p.memberDiscountEnabled && p.memberPriceCents != null,
    memberPriceCents: p.memberPriceCents,
    stock: p.stock,
    imageUrl: p.imageUrl ?? p.images[0] ?? null,
    specs: Array.isArray(p.specs) ? p.specs : [],
    condition: p.condition,
    images: p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : [],
    icon: p.icon ?? section?.icon ?? "🛍️",
    hue: hueOf(p.id),
    rating: p.rating,
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
    section: section ? { id: section.id, name: section.name, nameEn: section.nameEn, icon: section.icon } : null,
    merchant: { id: p.merchant.id, name: p.merchant.businessName },
  };
}

const countryOwner = (country: string): Prisma.UserWhereInput => ({
  OR: [{ countryCode: country }, ...(country === DEFAULT_COUNTRY ? [{ countryCode: null }] : [])],
});

const scopeSchema = z.object({
  scope: z.enum(["country", "city", "radius"]).default("country"),
  cityId: z.string().uuid().optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * What this shopper may see. Always their own country's approved shops (the shop owner's country; a shop whose owner
 * never set one belongs to the platform's first country). They can narrow that to one city (or all the cities of a
 * governorate), or to the shops within some kilometres of a point (their own position).
 */
async function visibleFor(query: unknown, country: string): Promise<Prisma.ProductWhereInput> {
  const parsed = scopeSchema.safeParse(query);
  const { scope, cityId, radiusKm, lat, lng } = parsed.success ? parsed.data : scopeSchema.parse({});
  // one country on the platform: every shop is in it, whatever its owner's account says
  const everyone = (await onlyCountry()) !== null;
  const merchant: Prisma.MerchantProfileWhereInput = { approvalStatus: "APPROVED", ...(everyone ? {} : { user: countryOwner(country) }) };

  if (scope === "city" && cityId) {
    const children = await prisma.geoUnit.findMany({ where: { parentId: cityId }, select: { id: true } });
    const inCity = { cityId: { in: [cityId, ...children.map((c) => c.id)] } };
    merchant.user = everyone ? inCity : { AND: [countryOwner(country), inCity] };
  } else if (scope === "radius" && radiusKm && lat !== undefined && lng !== undefined) {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    const near = await prisma.merchantProfile.findMany({
      where: { ...merchant, latitude: { gte: lat - dLat, lte: lat + dLat }, longitude: { gte: lng - dLng, lte: lng + dLng } },
      select: { id: true, latitude: true, longitude: true },
    });
    merchant.id = { in: near.filter((m) => distanceKm(lat, lng, m.latitude!, m.longitude!) <= radiusKm).map((m) => m.id) };
  }
  return { isActive: true, stock: { gt: 0 }, merchant };
}

const include = { merchant: { select: { id: true, businessName: true } } } as const;

const sorts: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  popular: [{ soldCount: "desc" }, { createdAt: "desc" }],
  new: [{ createdAt: "desc" }],
  rating: [{ rating: "desc" }, { ratingCount: "desc" }],
  price_asc: [{ priceCents: "asc" }],
  price_desc: [{ priceCents: "desc" }],
};

async function sectionsWithCounts(visible: Prisma.ProductWhereInput) {
  const grouped = await prisma.product.groupBy({ by: ["storeSection"], where: { ...visible, storeSection: { not: null } }, _count: { _all: true } });
  const counts = new Map(grouped.map((g) => [g.storeSection, g._count._all]));
  return STORE_SECTIONS.map((s) => ({ ...s, count: counts.get(s.id) ?? 0 })).filter((s) => s.count > 0);
}

// The store's front page in one call: departments, best sellers, deals for members, newest.
storeRouter.get("/home", async (req, res) => {
  const country = await viewerCountry(req);
  const visible = await visibleFor(req.query, country);
  const [sections, best, deals, newest] = await Promise.all([
    sectionsWithCounts(visible),
    prisma.product.findMany({ where: visible, include, orderBy: sorts.popular, take: 12 }),
    prisma.product.findMany({ where: { ...visible, memberDiscountEnabled: true, memberPriceCents: { not: null } }, include, orderBy: sorts.popular, take: 12 }),
    prisma.product.findMany({ where: visible, include, orderBy: sorts.new, take: 12 }),
  ]);

  // the advertising spaces: a shop's paid product where one is running, otherwise the country's best sellers
  const settings = await getSettings();
  const live = (await liveAds(country)).filter((a) => a.product.isActive && a.product.stock > 0);
  const bySlot = new Map(live.map((a) => [a.slot, a]));
  const advertised = new Set(live.map((a) => a.productId));
  const fillers = (await prisma.product.findMany({ where: await visibleFor({}, country), include, orderBy: sorts.popular, take: AD_SLOTS * 2 })).filter((p) => !advertised.has(p.id));
  const slots = Array.from({ length: AD_SLOTS }, (_, i) => {
    const ad = bySlot.get(i + 1);
    if (ad) return { slot: i + 1, ad: true, adId: ad.id, product: view(ad.product) };
    const filler = fillers.shift();
    return filler ? { slot: i + 1, ad: false, adId: null, product: view(filler) } : null;
  }).filter((s) => s !== null);
  if (live.length) void prisma.adBooking.updateMany({ where: { id: { in: live.map((a) => a.id) } }, data: { impressions: { increment: 1 } } }).catch(() => {});
  const cheapest = [...settings.ads.packages].sort((a, b) => a.credits - b.credits)[0];
  const adOffer = cheapest ? { fromCredits: cheapest.credits, days: cheapest.days, creditName: settings.creditName } : null;

  res.json({ country, currency: await currencyOf(country), sections, slots, adOffer, bestSellers: best.map(view), deals: deals.map(view), newest: newest.map(view) });
});

const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  section: z.string().optional(),
  merchantId: z.string().uuid().optional(),
  deals: z.enum(["1"]).optional(), // only products with a member price
  sort: z.enum(["popular", "new", "rating", "price_asc", "price_desc"]).default("popular"),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

storeRouter.get("/products", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { q, section, merchantId, deals, sort, limit, offset } = parsed.data;
  if (section && !isStoreSection(section)) return sendError(res, 400, "BAD_REQUEST", "Unknown store section");

  const country = await viewerCountry(req);
  const where: Prisma.ProductWhereInput = {
    ...(await visibleFor(req.query, country)),
    ...(section ? { storeSection: section } : {}),
    ...(merchantId ? { merchantId } : {}),
    ...(deals ? { memberDiscountEnabled: true, memberPriceCents: { not: null } } : {}),
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { merchant: { businessName: { contains: q, mode: "insensitive" } } }] }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, include, orderBy: sorts[sort], take: limit, skip: offset }),
  ]);
  res.json({ total, currency: await currencyOf(country), items: items.map(view) });
});

storeRouter.get("/sections", async (req, res) => {
  // ?all=1: every section, sold in yet or not (a shop choosing where to list a product)
  if (req.query.all === "1") return res.json(STORE_SECTIONS.map((s) => ({ ...s, count: 0 })));
  res.json(await sectionsWithCounts(await visibleFor(req.query, await viewerCountry(req))));
});

storeRouter.get("/products/:id", async (req, res) => {
  const country = await viewerCountry(req);
  const visible = await visibleFor({}, country);
  // a product of another country's shop does not exist for this shopper
  const product = await prisma.product.findFirst({ where: { id: req.params.id, isActive: true, merchant: visible.merchant }, include });
  if (!product) return sendError(res, 404, "NOT_FOUND", "Product not found");
  const related = await prisma.product.findMany({
    where: { ...visible, id: { not: product.id }, ...(product.storeSection ? { storeSection: product.storeSection } : { merchantId: product.merchantId }) },
    include,
    orderBy: sorts.popular,
    take: 8,
  });
  res.json({ ...view(product), currency: await currencyOf(country), related: related.map(view) });
});

/* ---------------- the big rotating banners of the front page ---------------- */

const bannerIdSchema = z.object({ id: z.string().uuid() });

storeRouter.get("/banners", async (req, res) => {
  const country = await viewerCountry(req);
  const now = new Date();
  const [settings, rows] = await Promise.all([
    getSettings(),
    prisma.storeBanner.findMany({
      where: {
        isActive: true,
        OR: [{ countryCode: null }, { countryCode: country }],
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { id: true, title: true, subtitle: true, buttonText: true, bg: true, targetType: true, targetValue: true, imageUpdatedAt: true, imageMime: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (rows.length) void prisma.storeBanner.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { views: { increment: 1 } } }).catch(() => {});
  res.json({
    intervalSeconds: settings.ads.bannerSeconds,
    banners: rows.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      buttonText: b.buttonText,
      bg: b.bg,
      imageUrl: b.imageMime ? `/store/banners/${b.id}/image?v=${b.imageUpdatedAt?.getTime() ?? 0}` : null,
      target: { type: b.targetType, value: b.targetValue },
    })),
  });
});

storeRouter.get("/banners/:id/image", async (req, res) => {
  const parsed = bannerIdSchema.safeParse(req.params);
  if (!parsed.success) return sendError(res, 404, "NOT_FOUND", "No picture");
  const banner = await prisma.storeBanner.findUnique({ where: { id: parsed.data.id }, select: { imageMime: true, imageData: true } });
  if (!banner?.imageData || !banner.imageMime) return sendError(res, 404, "NOT_FOUND", "No picture");
  res.set({ "Content-Type": banner.imageMime, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400", "Content-Disposition": "inline" });
  res.send(Buffer.from(banner.imageData));
});

storeRouter.post("/banners/:id/click", async (req, res) => {
  const parsed = bannerIdSchema.safeParse(req.params);
  if (parsed.success) await prisma.storeBanner.updateMany({ where: { id: parsed.data.id }, data: { clicks: { increment: 1 } } });
  res.json({ ok: true });
});

/* ---------------- photos and searching by photo ---------------- */

// A shop's product photos are public (the ids are random), like profile photos.
storeRouter.get("/photos/:id", async (req, res) => {
  const parsed = bannerIdSchema.safeParse(req.params);
  if (!parsed.success) return sendError(res, 404, "NOT_FOUND", "No picture");
  const photo = await prisma.productPhoto.findUnique({ where: { id: parsed.data.id }, select: { mime: true, data: true } });
  if (!photo) return sendError(res, 404, "NOT_FOUND", "No picture");
  res.set({ "Content-Type": photo.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=604800, immutable", "Content-Disposition": "inline" });
  res.send(Buffer.from(photo.data));
});

const searches = new Map<string, number[]>();
const SEARCHES_PER_HOUR = 30;

/**
 * Search with a photo: the AI says what the picture shows, and the store's own products (of the shopper's country) are
 * ranked by how many of those words they contain. Without an AI that can see, it says so instead of guessing.
 */
storeRouter.post("/search-by-image", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: 1_500_000 }), route(async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل الصورة بصيغة JPEG أو PNG أو WebP");
  const mime = sniffImageMime(body);
  if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف ليس صورة صالحة (JPEG أو PNG أو WebP)");
  if (!visionAvailable()) return sendError(res, 503, "UNAVAILABLE", "البحث بالصورة غير متاح حاليًا");

  const now = Date.now();
  const recent = (searches.get(req.ip ?? "") ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= SEARCHES_PER_HOUR) return sendError(res, 429, "RATE_LIMITED", "عدد محاولات البحث بالصورة كبير، جرّب بعد قليل");
  searches.set(req.ip ?? "", [...recent, now]);

  const seen = await describePhotoForSearch({ mime, data: body }, STORE_SECTIONS.map((s) => s.id));
  if (!seen) return sendError(res, 502, "UNAVAILABLE", "ما قدرنا نتعرف على الصورة، جرّب صورة أوضح");

  const country = await viewerCountry(req);
  const visible = await visibleFor({}, country);
  const words = [...new Set(seen.keywords.map((k) => normalizeText(k)).filter((k) => k.length >= 2))].slice(0, 10);
  const candidates = await prisma.product.findMany({
    where: {
      ...visible,
      OR: [
        ...words.flatMap((w) => [{ name: { contains: w, mode: "insensitive" as const } }, { description: { contains: w, mode: "insensitive" as const } }]),
        ...(seen.section ? [{ storeSection: seen.section }] : []),
      ],
    },
    include,
    take: 120,
  });
  const scored = candidates
    .map((p) => {
      const name = normalizeText(p.name);
      const description = normalizeText(p.description ?? "");
      let score = seen.section && p.storeSection === seen.section ? 2 : 0;
      for (const w of words) score += name.includes(w) ? 3 : description.includes(w) ? 1 : 0;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || b.p.soldCount - a.p.soldCount);
  res.json({
    title: seen.title,
    keywords: words,
    section: seen.section,
    currency: await currencyOf(country),
    total: scored.length,
    items: scored.slice(0, 24).map((x) => view(x.p)),
  });
}));

import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { STORE_SECTIONS, isStoreSection } from "../lib/storeSections";
import { DEFAULT_COUNTRY, currencyOf, viewerCountry } from "../services/viewerCountry.service";

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
    imageUrl: p.imageUrl,
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
  const merchant: Prisma.MerchantProfileWhereInput = { approvalStatus: "APPROVED", user: countryOwner(country) };

  if (scope === "city" && cityId) {
    const children = await prisma.geoUnit.findMany({ where: { parentId: cityId }, select: { id: true } });
    merchant.user = { AND: [countryOwner(country), { cityId: { in: [cityId, ...children.map((c) => c.id)] } }] };
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
  res.json({ country, currency: await currencyOf(country), sections, bestSellers: best.map(view), deals: deals.map(view), newest: newest.map(view) });
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

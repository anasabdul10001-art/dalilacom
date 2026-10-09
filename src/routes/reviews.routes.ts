import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { route } from "../lib/asyncRoute";
import { optionalUserId } from "../services/viewerCountry.service";
import { notify } from "../services/notification.service";

/**
 * Ratings and comments, the way the big marketplaces do them:
 *  - anyone, even without an account, can read the stars, the average, the comments and the number of followers;
 *  - only a person whose order from the shop was DELIVERED can rate that shop or a product from it (one review each, editable);
 *  - the shop can in turn rate a customer it delivered to (shops see that rating; the customer sees their own average).
 * Following a shop is the existing "save" (/favorites), which needs an account.
 */
export const reviewsRouter = Router();

const reviewBody = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** "أنس عبد العزيز" -> "أنس ع." — a first name and an initial, enough to trust a review without exposing a person. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${[...parts[1]][0]}.`;
}

export interface Summary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function summarize(stars: number[]): Summary {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Summary["distribution"];
  for (const s of stars) distribution[s as 1 | 2 | 3 | 4 | 5] += 1;
  const count = stars.length;
  return { average: count ? Math.round((stars.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0, count, distribution };
}

/** A shop's rating and followers, as shown on its page. */
export async function shopStanding(merchantId: string): Promise<{ rating: number; ratingCount: number; followersCount: number }> {
  const [agg, followers] = await Promise.all([
    prisma.merchantReview.aggregate({ where: { merchantId }, _avg: { stars: true }, _count: { _all: true } }),
    prisma.favoriteMerchant.count({ where: { merchantId } }),
  ]);
  return { rating: agg._avg.stars ? Math.round(agg._avg.stars * 10) / 10 : 0, ratingCount: agg._count._all, followersCount: followers };
}

/** What a customer's shops think of them. */
export async function customerStanding(customerId: string): Promise<{ rating: number; ratingCount: number }> {
  const agg = await prisma.customerReview.aggregate({ where: { customerId }, _avg: { stars: true }, _count: { _all: true } });
  return { rating: agg._avg.stars ? Math.round(agg._avg.stars * 10) / 10 : 0, ratingCount: agg._count._all };
}

const deliveredFrom = (userId: string) => ({ userId, status: "DELIVERED" as const });

async function boughtProduct(userId: string, productId: string): Promise<boolean> {
  return (await prisma.orderItem.count({ where: { productId, order: deliveredFrom(userId) } })) > 0;
}

async function boughtFromShop(userId: string, merchantId: string): Promise<boolean> {
  return (await prisma.order.count({ where: { ...deliveredFrom(userId), merchantId } })) > 0;
}

const NOT_BOUGHT_PRODUCT = "التقييم متاح فقط لمن استلم هذا المنتج";
const NOT_BOUGHT_SHOP = "التقييم متاح فقط لمن استلم طلبًا من هذا المتجر";

async function pageOf<T extends { userId: string }>(rows: T[]) {
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, fullName: true } });
  const names = new Map(users.map((u) => [u.id, shortName(u.fullName)]));
  return (userId: string) => names.get(userId) ?? "—";
}

const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10), offset: z.coerce.number().int().min(0).default(0) });

/* ---------------- product reviews ---------------- */

reviewsRouter.get("/products/:id", route(async (req, res) => {
  const q = listSchema.parse(req.query);
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, merchant: { select: { userId: true } } } });
  if (!product) return sendError(res, 404, "NOT_FOUND", "Product not found");
  const me = await optionalUserId(req);
  const [all, page, mine, canReview] = await Promise.all([
    prisma.productReview.findMany({ where: { productId: product.id }, select: { stars: true } }),
    prisma.productReview.findMany({ where: { productId: product.id }, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset }),
    me ? prisma.productReview.findUnique({ where: { productId_userId: { productId: product.id, userId: me } } }) : null,
    me && me !== product.merchant.userId ? boughtProduct(me, product.id) : false,
  ]);
  const nameOf = await pageOf(page);
  res.json({
    summary: summarize(all.map((r) => r.stars)),
    items: page.map((r) => ({ id: r.id, stars: r.stars, comment: r.comment, name: nameOf(r.userId), verified: true, createdAt: r.createdAt, mine: r.userId === me })),
    canReview,
    mine: mine ? { stars: mine.stars, comment: mine.comment } : null,
  });
}));

reviewsRouter.put("/products/:id", requireAuth, route(async (req, res) => {
  const parsed = reviewBody.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, merchant: { select: { userId: true } } } });
  if (!product) return sendError(res, 404, "NOT_FOUND", "Product not found");
  const userId = req.user!.id;
  if (product.merchant.userId === userId || !(await boughtProduct(userId, product.id))) return sendError(res, 403, "NOT_A_BUYER", NOT_BOUGHT_PRODUCT);
  const data = { stars: parsed.data.stars, comment: parsed.data.comment || null };
  const existing = await prisma.productReview.findUnique({ where: { productId_userId: { productId: product.id, userId } } });
  await prisma.productReview.upsert({ where: { productId_userId: { productId: product.id, userId } }, update: data, create: { productId: product.id, userId, ...data } });
  await recomputeProduct(product.id);
  if (!existing) await notify({ userId: product.merchant.userId, type: "SYSTEM", title: "تقييم جديد لمنتجك", body: `${product.name}: ${"★".repeat(data.stars)}`, data: { kind: "PRODUCT_REVIEW", productId: product.id }, email: false });
  res.json({ ok: true });
}));

reviewsRouter.delete("/products/:id", requireAuth, route(async (req, res) => {
  await prisma.productReview.deleteMany({ where: { productId: req.params.id, userId: req.user!.id } });
  await recomputeProduct(req.params.id);
  res.json({ ok: true });
}));

/** The product's own figures (shown on every card) follow its real reviews. */
async function recomputeProduct(productId: string) {
  const agg = await prisma.productReview.aggregate({ where: { productId }, _avg: { stars: true }, _count: { _all: true } });
  await prisma.product.updateMany({ where: { id: productId }, data: { rating: agg._avg.stars ? Math.round(agg._avg.stars * 10) / 10 : 0, ratingCount: agg._count._all } });
}

/* ---------------- shop reviews ---------------- */

reviewsRouter.get("/shops/:id", route(async (req, res) => {
  const q = listSchema.parse(req.query);
  const shop = await prisma.merchantProfile.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } });
  if (!shop) return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  const me = await optionalUserId(req);
  const [all, page, mine, canReview, followers] = await Promise.all([
    prisma.merchantReview.findMany({ where: { merchantId: shop.id }, select: { stars: true } }),
    prisma.merchantReview.findMany({ where: { merchantId: shop.id }, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset }),
    me ? prisma.merchantReview.findUnique({ where: { merchantId_userId: { merchantId: shop.id, userId: me } } }) : null,
    me && me !== shop.userId ? boughtFromShop(me, shop.id) : false,
    prisma.favoriteMerchant.count({ where: { merchantId: shop.id } }),
  ]);
  const nameOf = await pageOf(page);
  res.json({
    summary: summarize(all.map((r) => r.stars)),
    followersCount: followers,
    items: page.map((r) => ({ id: r.id, stars: r.stars, comment: r.comment, name: nameOf(r.userId), verified: true, createdAt: r.createdAt, mine: r.userId === me })),
    canReview,
    mine: mine ? { stars: mine.stars, comment: mine.comment } : null,
  });
}));

reviewsRouter.put("/shops/:id", requireAuth, route(async (req, res) => {
  const parsed = reviewBody.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const shop = await prisma.merchantProfile.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, businessName: true } });
  if (!shop) return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  const userId = req.user!.id;
  if (shop.userId === userId || !(await boughtFromShop(userId, shop.id))) return sendError(res, 403, "NOT_A_BUYER", NOT_BOUGHT_SHOP);
  const data = { stars: parsed.data.stars, comment: parsed.data.comment || null };
  const existing = await prisma.merchantReview.findUnique({ where: { merchantId_userId: { merchantId: shop.id, userId } } });
  await prisma.merchantReview.upsert({ where: { merchantId_userId: { merchantId: shop.id, userId } }, update: data, create: { merchantId: shop.id, userId, ...data } });
  if (!existing) await notify({ userId: shop.userId, type: "SYSTEM", title: "تقييم جديد لمتجرك", body: "★".repeat(data.stars), data: { kind: "SHOP_REVIEW", merchantId: shop.id }, email: false });
  res.json({ ok: true });
}));

reviewsRouter.delete("/shops/:id", requireAuth, route(async (req, res) => {
  await prisma.merchantReview.deleteMany({ where: { merchantId: req.params.id, userId: req.user!.id } });
  res.json({ ok: true });
}));

/* ---------------- a shop rates its customer ---------------- */

async function ownShop(userId: string) {
  return prisma.merchantProfile.findUnique({ where: { userId }, select: { id: true, businessName: true } });
}

// My own rating as a customer: what the shops that delivered to me think (a number, not who said what).
reviewsRouter.get("/customers/me", requireAuth, route(async (req, res) => {
  res.json(await customerStanding(req.user!.id));
}));

// Shops see how a customer behaved with other shops before deciding on an order.
reviewsRouter.get("/customers/:customerId", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const shop = await ownShop(req.user!.id);
  if (!shop) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  const rows = await prisma.customerReview.findMany({ where: { customerId: req.params.customerId }, orderBy: { createdAt: "desc" }, take: 30 });
  const shops = await prisma.merchantProfile.findMany({ where: { id: { in: rows.map((r) => r.merchantId) } }, select: { id: true, businessName: true } });
  const names = new Map(shops.map((s) => [s.id, s.businessName]));
  const mine = rows.find((r) => r.merchantId === shop.id);
  res.json({
    summary: summarize(rows.map((r) => r.stars)),
    items: rows.map((r) => ({ id: r.id, stars: r.stars, comment: r.comment, shop: names.get(r.merchantId) ?? "—", createdAt: r.createdAt, mine: r.merchantId === shop.id })),
    canReview: await prisma.order.count({ where: { merchantId: shop.id, userId: req.params.customerId, status: "DELIVERED" } }).then((n) => n > 0),
    mine: mine ? { stars: mine.stars, comment: mine.comment } : null,
  });
}));

reviewsRouter.put("/customers/:customerId", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = reviewBody.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const shop = await ownShop(req.user!.id);
  if (!shop) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  const delivered = await prisma.order.count({ where: { merchantId: shop.id, userId: req.params.customerId, status: "DELIVERED" } });
  if (delivered === 0) return sendError(res, 403, "NOT_A_CUSTOMER", "التقييم متاح فقط لزبون استلم طلبًا من متجرك");
  const data = { stars: parsed.data.stars, comment: parsed.data.comment || null };
  const existing = await prisma.customerReview.findUnique({ where: { merchantId_customerId: { merchantId: shop.id, customerId: req.params.customerId } } });
  await prisma.customerReview.upsert({
    where: { merchantId_customerId: { merchantId: shop.id, customerId: req.params.customerId } },
    update: data,
    create: { merchantId: shop.id, customerId: req.params.customerId, ...data },
  });
  if (!existing) await notify({ userId: req.params.customerId, type: "SYSTEM", title: "تقييم جديد من أحد المتاجر", body: `${shop.businessName}: ${"★".repeat(data.stars)}`, data: { kind: "CUSTOMER_REVIEW", merchantId: shop.id }, email: false });
  res.json({ ok: true });
}));

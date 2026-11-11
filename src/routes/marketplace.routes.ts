import express, { Router } from "express";
import { MarketplaceListingStatus, Prisma, ProductCondition, ServiceKind, WalletTxType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { route } from "../lib/asyncRoute";
import { ApiError, sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { getSettings } from "../services/settings.service";
import { adjustBalance, InsufficientBalanceError } from "../services/wallet.service";
import { creditsChargeFor } from "../services/plan.service";
import { sniffImageMime } from "../lib/image";
import { viewerCountry } from "../services/viewerCountry.service";
import { moderateMarketplaceListing } from "../services/marketplaceModeration.service";
import { subscribeStorePlan } from "../services/storePlan.service";
import { countSellerListings, hasPaidSellerPlan, sellerListingQuota } from "../services/sellerListingsQuota.service";

export const marketplaceRouter = Router();
const MAX_PHOTO_BYTES = 1_500_000;
async function usage(userId: string) {
  const [quota, subscription, merchant] = await Promise.all([
    sellerListingQuota(userId),
    prisma.marketplaceSubscription.findUnique({ where: { userId }, include: { plan: true } }),
    prisma.merchantProfile.findUnique({ where: { userId }, include: { plan: true } }),
  ]);
  const activeMarketplacePlan = !!subscription && subscription.endsAt > new Date();
  const activeMerchantPlan = !!merchant?.plan && (!merchant.planEndsAt || merchant.planEndsAt > new Date()) && merchant.plan.priceCents > 0 && merchant.plan.priceCredits !== 0;
  const activePlan = activeMarketplacePlan ? subscription!.plan : activeMerchantPlan ? merchant!.plan : null;
  const endsAt = activeMarketplacePlan ? subscription!.endsAt : activeMerchantPlan ? merchant!.planEndsAt : null;
  return { ...quota, subscription: activePlan ? { planName: activePlan.name, endsAt } : null };
}

marketplaceRouter.get("/settings", route(async (_req, res) => {
  const { marketplace } = await getSettings();
  res.json({ ...marketplace, enabled: true });
}));

marketplaceRouter.get("/my-store", requireAuth, route(async (req, res) => {
  res.json({ store: await prisma.marketplaceStore.findUnique({ where: { userId: req.user!.id } }) });
}));

const storeSchema = z.object({ name: z.string().trim().min(2).max(70), description: z.string().trim().max(500).optional() });
marketplaceRouter.put("/my-store", requireAuth, route(async (req, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const store = await prisma.marketplaceStore.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...parsed.data }, update: parsed.data });
  res.json({ store });
}));

marketplaceRouter.get("/stores/:id", route(async (req, res) => {
  const store = await prisma.marketplaceStore.findUnique({ where: { id: req.params.id }, include: { listings: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 100 } } });
  if (!store) return sendError(res, 404, "NOT_FOUND", "المتجر غير موجود");
  const { listings, ...details } = store;
  res.json({ store: details, listings });
}));

marketplaceRouter.get("/listings", route(async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  const condition = req.query.condition === "NEW" || req.query.condition === "USED" ? req.query.condition : undefined;
  const where: Prisma.MarketplaceListingWhereInput = { status: "ACTIVE", ...(condition ? { condition } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}) };
  const listings = await prisma.marketplaceListing.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { store: { select: { id: true, name: true } } } });
  res.json({ listings: listings.map(({ store, ...item }) => ({ ...item, storeId: store.id, sellerName: store.name })) });
}));

marketplaceRouter.get("/listings/:id", route(async (req, res) => {
  const listing = await prisma.marketplaceListing.findFirst({ where: { id: req.params.id, status: "ACTIVE" }, include: { store: { select: { id: true, name: true } } } });
  if (!listing) return sendError(res, 404, "NOT_FOUND", "الإعلان غير موجود");
  const { store, ...item } = listing;
  res.json({ ...item, storeId: store.id, sellerName: store.name });
}));

marketplaceRouter.get("/mine", requireAuth, route(async (req, res) => {
  const [listings, quota, plans, countryCode, store] = await Promise.all([
    prisma.marketplaceListing.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    usage(req.user!.id),
    prisma.servicePlan.findMany({ where: { service: ServiceKind.MERCHANT_ACCOUNT, isActive: true, priceCents: { gt: 0 } }, orderBy: [{ sortOrder: "asc" }, { priceCredits: "asc" }] }),
    viewerCountry(req),
    prisma.marketplaceStore.findUnique({ where: { userId: req.user!.id } }),
  ]);
  const priced = await Promise.all(plans.map(async p => ({ id: p.id, name: p.name, durationDays: p.durationDays, priceCredits: await creditsChargeFor(p, countryCode) })));
  res.json({ store, listings, quota, plans: priced });
}));

marketplaceRouter.get("/photos/:id", route(async (req, res) => {
  const photo = await prisma.marketplacePhoto.findUnique({ where: { id: req.params.id }, select: { mime: true, data: true } });
  if (!photo) return sendError(res, 404, "NOT_FOUND", "الصورة غير موجودة");
  res.type(photo.mime).set("Cache-Control", "public, max-age=86400").send(Buffer.from(photo.data));
}));

marketplaceRouter.post("/photos", requireAuth, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_PHOTO_BYTES }), route(async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل صورة JPEG أو PNG أو WebP");
  const mime = sniffImageMime(body);
  if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف ليس صورة صالحة");
  const photo = await prisma.marketplacePhoto.create({ data: { userId: req.user!.id, mime, data: body }, select: { id: true } });
  res.status(201).json({ id: photo.id, url: `/marketplace/photos/${photo.id}` });
}));

const createSchema = z.object({ title: z.string().trim().min(2).max(80), description: z.string().trim().max(1000).optional(), priceCents: z.number().int().positive().max(2_000_000_000), currency: z.string().trim().regex(/^[A-Za-z]{3}$/).default("SYP"), category: z.string().trim().max(60).optional(), condition: z.nativeEnum(ProductCondition).default(ProductCondition.USED), imageUrl: z.string().regex(/^\/marketplace\/photos\/[0-9a-f-]{36}$/).optional(), cityId: z.string().uuid().optional(), contactPhone: z.string().trim().max(30).optional() });
marketplaceRouter.post("/listings", requireAuth, route(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const settings = await getSettings();
  const currentUsage = await usage(req.user!.id);
  const store = await prisma.marketplaceStore.findUnique({ where: { userId: req.user!.id } });
  if (!store) return sendError(res, 409, "STORE_REQUIRED", "أنشئ متجرك أولاً حتى تضيف منتجات");
  if (parsed.data.condition === ProductCondition.NEW && !settings.marketplace.allowNewProducts && !currentUsage.paid) return sendError(res, 403, "NEW_PRODUCTS_CLOSED", "الباقة المجانية الحالية تسمح بالمنتجات المستعملة فقط");
  if (currentUsage.remaining <= 0 && !currentUsage.paid) return sendError(res, 402, "MARKETPLACE_PLAN_REQUIRED", "وصلت للعدد المجاني لهذا الشهر. اختر باقة للمتابعة.");
  if (parsed.data.imageUrl) {
    const photoId = parsed.data.imageUrl.slice("/marketplace/photos/".length);
    if (!await prisma.marketplacePhoto.findFirst({ where: { id: photoId, userId: req.user!.id }, select: { id: true } })) return sendError(res, 400, "BAD_REQUEST", "الصورة غير صالحة");
  }
  if (parsed.data.cityId && !await prisma.geoUnit.findUnique({ where: { id: parsed.data.cityId }, select: { id: true } })) return sendError(res, 400, "BAD_REQUEST", "المدينة غير صالحة");
  // Lock each user while counting and creating, so two simultaneous requests cannot exceed the free monthly amount.
  const listing = await prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${req.user!.id}))`);
    const count = await countSellerListings(tx, req.user!.id);
    const hasPaid = await hasPaidSellerPlan(req.user!.id);
    if (count >= settings.marketplace.freeListingsPerMonth && !hasPaid) throw new Error("MARKETPLACE_QUOTA");
    return tx.marketplaceListing.create({ data: { ...parsed.data, currency: parsed.data.currency.toUpperCase(), userId: req.user!.id, storeId: store.id, status: MarketplaceListingStatus.PENDING_REVIEW } });
  }).catch(err => { if ((err as Error).message === "MARKETPLACE_QUOTA") return null; throw err; });
  if (!listing) return sendError(res, 402, "MARKETPLACE_PLAN_REQUIRED", "وصلت للعدد المجاني لهذا الشهر. اختر باقة للمتابعة.");
  const reviewed = await moderateMarketplaceListing(listing.id);
  res.status(201).json({ listing: reviewed ?? listing, quota: await usage(req.user!.id) });
}));

marketplaceRouter.patch("/listings/:id", requireAuth, route(async (req, res) => {
  const parsed = z.object({ status: z.enum(["SOLD", "HIDDEN"] as const) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const result = await prisma.marketplaceListing.updateMany({ where: { id: req.params.id, userId: req.user!.id, status: { in: ["ACTIVE", "PENDING_REVIEW"] } }, data: { status: parsed.data.status } });
  if (!result.count) return sendError(res, 404, "NOT_FOUND", "الإعلان غير موجود");
  res.json({ updated: true });
}));

marketplaceRouter.post("/subscribe", requireAuth, route(async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const plan = await prisma.servicePlan.findFirst({ where: { id: parsed.data.planId, isActive: true, service: ServiceKind.MERCHANT_ACCOUNT } });
  if (!plan) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة");
  const country = await viewerCountry(req);
  const charge = await creditsChargeFor(plan, country);
  if (charge === null) return sendError(res, 409, "PLAN_PRICE_MISSING", "سعر هذه الباقة غير محدد بعد");
  try {
    const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, approvalStatus: true, planId: true, planEndsAt: true } });
    if (merchant?.approvalStatus === "APPROVED") {
      await subscribeStorePlan(req.user!.id, merchant.id, plan.id, country);
    } else {
      await prisma.$transaction(async tx => {
        if (charge > 0) await adjustBalance(tx, req.user!.id, -charge, WalletTxType.SUBSCRIPTION, `marketplace:${plan.name}`);
        const prior = await tx.marketplaceSubscription.findUnique({ where: { userId: req.user!.id } });
        const starts = prior && prior.planId === plan.id && prior.endsAt > new Date() ? prior.endsAt : new Date();
        await tx.marketplaceSubscription.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, planId: plan.id, endsAt: new Date(starts.getTime() + plan.durationDays * 86400000) }, update: { planId: plan.id, endsAt: new Date(starts.getTime() + plan.durationDays * 86400000) } });
      });
    }
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    if (err instanceof InsufficientBalanceError) return sendError(res, 402, "INSUFFICIENT_BALANCE", "رصيدك لا يكفي لشراء هذه الباقة");
    throw err;
  }
  res.status(201).json({ quota: await usage(req.user!.id) });
}));

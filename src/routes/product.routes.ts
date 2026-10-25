import express, { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError, sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { sniffImageMime } from "../lib/image";
import { enhanceProductPhoto, recolorLocal, removeBackgroundLocal } from "../lib/photoEnhance";
import sharp from "sharp";
import { PHOTO_COLORS, editPhotoWithAi, imageEditAvailable, instructionFor } from "../services/aiImage.service";
import { aiQuotaFor, buyAiPackage, ensureCanUseAi, recordAiUse, setAiAutoRenew } from "../services/aiQuota.service";
import { getSettings } from "../services/settings.service";
import { route } from "../lib/asyncRoute";
import { resolveLanguage } from "../lib/languages";
import { sectionOfProductCategory } from "../services/productCategory.service";
import { REVIEWED_FIELDS, moderateProduct } from "../services/productModeration.service";
import { hasActiveStorePlan, storePlanRequired } from "../services/storePlan.service";
import { optionalUserId } from "../services/viewerCountry.service";
import { translateProducts } from "../services/contentTranslation.service";
import { draftProductFromPhoto, visionAvailable } from "../services/ai.service";
import { STORE_SECTIONS, isStoreSection } from "../lib/storeSections";
import { priceColumns } from "../lib/pricing";
import { marketOfUser } from "../services/viewerCountry.service";

export const productRouter = Router();

async function getOwnApprovedMerchant(userId: string) {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId } });
  if (!merchant) return { error: "Merchant profile not found" as const };
  if (merchant.approvalStatus !== "APPROVED") return { error: "Merchant is not approved yet" as const };
  return { merchant };
}

const productFieldsSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  priceCents: z.number().int().positive(),
  categoryId: z.string().uuid().optional(),
  productCategoryId: z.string().uuid().optional(), // where the product is filed (ProductCategory)
  stock: z.number().int().nonnegative().default(0),
  sku: z.string().optional(),
  memberDiscountEnabled: z.boolean().default(false),
  memberPriceCents: z.number().int().positive().optional(),
  // the online store: where it is listed, how it looks and what it is
  storeSection: z.string().refine(isStoreSection, "Unknown store section").optional(),
  images: z.array(z.string().regex(/^\/store\/photos\/[0-9a-f-]{36}$/)).max(6).optional(),
  specs: z.array(z.object({ label: z.string().trim().min(1).max(30), value: z.string().trim().min(1).max(60) })).max(10).optional(),
  condition: z.enum(["NEW", "USED"]).optional(),
});

/** Photos are the shop's own: each one has to be among the pictures this shop uploaded. */
async function ownPhotos(merchantId: string, urls: string[] | undefined): Promise<boolean> {
  if (!urls?.length) return true;
  const ids = urls.map((u) => u.slice("/store/photos/".length));
  return (await prisma.productPhoto.count({ where: { id: { in: ids }, merchantId } })) === ids.length;
}

// section 5 rule: a member price only makes sense once the discount is switched on, and it
// must actually be a discount (not equal to or above the regular price).
const createProductSchema = productFieldsSchema
  .refine((d) => !d.memberDiscountEnabled || d.memberPriceCents !== undefined, {
    message: "memberPriceCents is required when memberDiscountEnabled is true",
  })
  .refine((d) => d.memberPriceCents === undefined || d.memberPriceCents < d.priceCents, {
    message: "memberPriceCents must be lower than priceCents",
  });

// Merchant: add a product to their store (section 5)
productRouter.post("/", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const result = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in result) {
    return sendError(res, 403, "FORBIDDEN", result.error ?? "Forbidden");
  }

  // the store opens when the shop has chosen a plan (the free one or a paid one); until then no product can be added
  if ((await storePlanRequired()) && !hasActiveStorePlan(result.merchant)) return sendError(res, 402, "PLAN_REQUIRED", "Choose a store plan first");

  if (parsed.data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) {
      return sendError(res, 404, "NOT_FOUND", "Category not found");
    }
  }

  if (!(await ownPhotos(result.merchant.id, parsed.data.images))) return sendError(res, 400, "BAD_REQUEST", "الصورة غير صالحة");
  const { images, ...rest } = parsed.data;
  // the department of the chosen category decides which store section the product appears in
  let filedSection: string | null = null;
  if (rest.productCategoryId) {
    filedSection = await sectionOfProductCategory(rest.productCategoryId);
    if (!(await prisma.productCategory.findUnique({ where: { id: rest.productCategoryId }, select: { id: true } }))) return sendError(res, 404, "NOT_FOUND", "Category not found");
  }
  const columns = priceColumns({ priceCents: rest.priceCents, memberPriceCents: rest.memberPriceCents }, result.merchant, await marketOfUser(result.merchant.userId)); // in the shop's own money (one setting for the whole shop)
  if (!columns) return sendError(res, 400, "USD_RATE_REQUIRED", "حدّد سعر صرف الدولار أولًا من إعدادات الأسعار");
  const product = await prisma.product.create({
    data: { merchantId: result.merchant.id, ...rest, ...columns, ...(!rest.storeSection && filedSection ? { storeSection: filedSection } : {}), ...(images?.length ? { images, imageUrl: images[0] } : {}) },
  });
  const outcome = await moderateProduct(product.id); // looked at before anyone sees it
  res.status(201).json({ ...product, moderation: outcome.moderation, moderationNote: outcome.note });
}));

/* ---------------- a product from a photo: upload, then let the AI suggest the words ---------------- */

const MAX_PHOTO_BYTES = 1_500_000; // the apps shrink to ~1280px before sending, so this is generous

productRouter.post("/photos", requireAuth, requireRole(Role.MERCHANT), express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_PHOTO_BYTES }), route(async (req, res) => {
  const found = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in found) return sendError(res, 403, "FORBIDDEN", found.error ?? "Forbidden");
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل الصورة بصيغة JPEG أو PNG أو WebP");
  const mime = sniffImageMime(body);
  if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف ليس صورة صالحة (JPEG أو PNG أو WebP)");
  const photo = await prisma.productPhoto.create({ data: { merchantId: found.merchant.id, mime, data: body }, select: { id: true } });
  res.status(201).json({ id: photo.id, url: `/store/photos/${photo.id}` });
}));

// "Improve the photo": a new, cleaned-up copy (white square, centred, even light) that suits Google and the image-reading algorithms.
productRouter.post("/photos/:id/enhance", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const found = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in found) return sendError(res, 403, "FORBIDDEN", found.error ?? "Forbidden");
  const photo = await prisma.productPhoto.findFirst({ where: { id: req.params.id, merchantId: found.merchant.id } });
  if (!photo) return sendError(res, 404, "NOT_FOUND", "الصورة غير موجودة");
  let improved: Buffer;
  try {
    improved = await enhanceProductPhoto(Buffer.from(photo.data));
  } catch {
    return sendError(res, 422, "UNPROCESSABLE", "تعذّر تحسين هالصورة، جرّب صورة ثانية");
  }
  const created = await prisma.productPhoto.create({ data: { merchantId: found.merchant.id, mime: "image/jpeg", data: improved }, select: { id: true } });
  res.status(201).json({ id: created.id, url: `/store/photos/${created.id}`, from: photo.id });
}));

/** What the shop has left of its free AI uses this month, and what a use costs after that. */
productRouter.get("/ai-quota", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  res.json({ ...(await aiQuotaFor(req.user!.id)), photoEdit: imageEditAvailable(), describe: visionAvailable() });
}));

/** The monthly packages a shop can buy, and the one it has now. */
productRouter.get("/ai-packages", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const [settings, quota] = await Promise.all([getSettings(), aiQuotaFor(req.user!.id)]);
  res.json({ packages: settings.ai.packages, quota });
}));

productRouter.post("/ai-subscribe", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = z.object({ packageId: z.string().min(2).max(30) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const found = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in found) return sendError(res, 403, "FORBIDDEN", found.error ?? "Forbidden");
  try {
    await buyAiPackage(req.user!.id, parsed.data.packageId);
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
  res.status(201).json({ quota: await aiQuotaFor(req.user!.id) });
}));

productRouter.patch("/ai-subscription", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = z.object({ autoRenew: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    await setAiAutoRenew(req.user!.id, parsed.data.autoRenew);
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
  res.json({ quota: await aiQuotaFor(req.user!.id) });
}));

const editSchema = z.object({ action: z.enum(["clean", "white_bg", "studio", "recolor"]), color: z.enum(PHOTO_COLORS).optional() }).refine((d) => d.action !== "recolor" || !!d.color, { message: "color is required" });

/**
 * Edit one of the shop's photos into a new copy (the old one stays, so the shop can go back):
 *  clean = tidy it up here (square, white, even light), free;  white_bg / studio / recolor = the AI, counted against the
 *  free uses of the month and charged to the wallet after them.
 */
productRouter.post("/photos/:id/edit", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const found = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in found) return sendError(res, 403, "FORBIDDEN", found.error ?? "Forbidden");
  const photo = await prisma.productPhoto.findFirst({ where: { id: req.params.id, merchantId: found.merchant.id } });
  if (!photo) return sendError(res, 404, "NOT_FOUND", "الصورة غير موجودة");
  const { action, color } = parsed.data;

  let improved: Buffer;
  let engine: "ai" | "local" = "local";
  try {
    if (action === "clean") {
      improved = await enhanceProductPhoto(Buffer.from(photo.data));
    } else {
      // the AI first (counted against the free uses, then the wallet); when it cannot do it, the picture is edited here
      // for free, which works on a plain backdrop
      let edited: Buffer | null = null;
      if (imageEditAvailable()) {
        await ensureCanUseAi(req.user!.id);
        edited = await editPhotoWithAi({ mime: photo.mime, data: Buffer.from(photo.data) }, instructionFor(action, color));
      }
      if (edited) {
        engine = "ai";
        improved = action === "recolor" ? await sharp(edited).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer() : await enhanceProductPhoto(edited);
      } else if (action === "recolor") {
        const local = await recolorLocal(Buffer.from(photo.data), color ?? "red");
        if (!local) return sendError(res, 422, "UNPROCESSABLE", "The background is too busy to change the colour: try a photo with a plain background");
        improved = local;
      } else {
        const cut = await removeBackgroundLocal(Buffer.from(photo.data));
        if (!cut) return sendError(res, 422, "UNPROCESSABLE", "The background is too busy to remove: try a photo with a plain background");
        improved = await enhanceProductPhoto(cut);
      }
    }
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    return sendError(res, 422, "UNPROCESSABLE", "تعذّر تحسين هالصورة، جرّب صورة ثانية");
  }
  const created = await prisma.productPhoto.create({ data: { merchantId: found.merchant.id, mime: "image/jpeg", data: improved }, select: { id: true } });
  if (engine === "ai") await recordAiUse(req.user!.id, `photo:${action}`); // only a real AI edit is counted
  res.status(201).json({ id: created.id, url: `/store/photos/${created.id}`, from: photo.id, engine, quota: await aiQuotaFor(req.user!.id) });
}));

const drafts = new Map<string, { day: string; n: number }>();
const DAILY_DRAFTS = 60;

/** Looks at an uploaded photo and suggests the name, description, section and details (and what similar products cost). */
productRouter.post("/ai-draft", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = z.object({ photoId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const found = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in found) return sendError(res, 403, "FORBIDDEN", found.error ?? "Forbidden");
  const photo = await prisma.productPhoto.findFirst({ where: { id: parsed.data.photoId, merchantId: found.merchant.id } });
  if (!photo) return sendError(res, 404, "NOT_FOUND", "الصورة غير موجودة");
  if (!visionAvailable()) return res.json({ available: false, draft: null, priceHint: null });

  const day = new Date().toISOString().slice(0, 10);
  const used = drafts.get(req.user!.id);
  const count = used && used.day === day ? used.n : 0;
  if (count >= DAILY_DRAFTS) return sendError(res, 429, "RATE_LIMITED", "وصلت للحد اليومي لاقتراحات الصور، كمّل كتابة المنتج بنفسك");
  try {
    await ensureCanUseAi(req.user!.id);
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
  drafts.set(req.user!.id, { day, n: count + 1 });

  const draft = await draftProductFromPhoto({ mime: photo.mime as "image/jpeg" | "image/png" | "image/webp", data: Buffer.from(photo.data) }, STORE_SECTIONS.map((s) => s.id));

  // what others in the same section ask, to help the shop price it
  let priceHint: { min: number; median: number; max: number; count: number } | null = null;
  if (draft?.section) {
    const owner = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { countryCode: true } });
    const similar = await prisma.product.findMany({
      where: { isActive: true, storeSection: draft.section, merchant: { approvalStatus: "APPROVED", user: { countryCode: owner?.countryCode ?? undefined } } },
      select: { priceCents: true },
      take: 200,
    });
    const prices = similar.map((p) => p.priceCents).sort((a, b) => a - b);
    if (prices.length >= 3) priceHint = { min: prices[0], median: prices[Math.floor(prices.length / 2)], max: prices[prices.length - 1], count: prices.length };
  }
  if (draft) await recordAiUse(req.user!.id, "describe");
  // the department that matches the section the AI picked: the category the shop starts from (it can refine it)
  const department = draft?.section ? await prisma.productCategory.findUnique({ where: { slug: `p-${draft.section}` }, select: { id: true } }) : null;
  res.json({ available: true, draft, priceHint, productCategoryId: department?.id ?? null, quota: await aiQuotaFor(req.user!.id) });
}));

// Merchant: manage their own catalog, including inactive/out-of-stock items (section 59.1)
productRouter.get("/mine", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  }
  const products = await prisma.product.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
}));

// Creation defaults must not overwrite stock or member-price settings during partial updates.
const updateProductSchema = productFieldsSchema.partial().extend({
  stock: z.number().int().nonnegative().optional(),
  memberDiscountEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

productRouter.patch("/:id", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!merchant || !existing || existing.merchantId !== merchant.id) {
    return sendError(res, 404, "NOT_FOUND", "Product not found");
  }

  // the photos: each must be one this shop uploaded; the first is the main one
  const { images, ...rest } = parsed.data;
  if (images !== undefined && !(await ownPhotos(merchant.id, images))) return sendError(res, 400, "BAD_REQUEST", "الصورة غير صالحة");
  let filedSection: string | null = null;
  if (rest.productCategoryId) {
    if (!(await prisma.productCategory.findUnique({ where: { id: rest.productCategoryId }, select: { id: true } }))) return sendError(res, 404, "NOT_FOUND", "Category not found");
    filedSection = await sectionOfProductCategory(rest.productCategoryId);
  }
  // a price edit is written in the shop's own money again: converted with the shop's rate when that is not the market currency
  let priceData: Record<string, unknown> = {};
  if (rest.priceCents !== undefined || rest.memberPriceCents !== undefined) {
    const typedPrice = existing.enteredPriceCents ?? existing.priceCents;
    const typedMember = existing.enteredPriceCents != null ? existing.enteredMemberPriceCents : existing.memberPriceCents;
    const columns = priceColumns({ priceCents: rest.priceCents ?? typedPrice, memberPriceCents: rest.memberPriceCents !== undefined ? rest.memberPriceCents : typedMember }, merchant, await marketOfUser(merchant.userId));
    if (!columns) return sendError(res, 400, "USD_RATE_REQUIRED", "حدّد سعر صرف الدولار أولًا من إعدادات الأسعار");
    priceData = columns;
  }
  const product = await prisma.product.update({
    where: { id: existing.id },
    data: { ...rest, ...priceData, ...(!rest.storeSection && filedSection ? { storeSection: filedSection } : {}), ...(images !== undefined ? { images, imageUrl: images[0] ?? null } : {}) },
  });
  // a change to what shoppers read or see has to be looked at again; a price or a stock change does not
  const changed = REVIEWED_FIELDS.some((f) => (f === "images" ? images !== undefined : (rest as Record<string, unknown>)[f] !== undefined));
  const outcome = changed ? await moderateProduct(product.id) : { moderation: product.moderation, note: product.moderationNote };
  res.json({ ...product, moderation: outcome.moderation, moderationNote: outcome.note });
}));

const listProductsSchema = z.object({
  merchantId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  q: z.string().optional(),
});

// Public: browse a merchant's storefront catalog (section 6)
productRouter.get("/", route(async (req, res) => {
  const parsed = listProductsSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }
  const { merchantId, categoryId, q } = parsed.data;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      moderation: "APPROVED",
      ...(merchantId ? { merchantId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const shown = products.map((p) => ({ ...p })); // copies: what is translated here is never saved
  await translateProducts(resolveLanguage(req), shown);
  res.json(shown);
}));

productRouter.get("/:id", route(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { merchant: { select: { userId: true } } } });
  if (!product || !product.isActive) {
    return sendError(res, 404, "NOT_FOUND", "Product not found");
  }
  // one that is waiting or refused is seen only by its own shop
  if (product.moderation !== "APPROVED" && (await optionalUserId(req)) !== product.merchant.userId) return sendError(res, 404, "NOT_FOUND", "Product not found");
  const { merchant: _owner, ...shown } = product;
  void _owner;
  res.json(shown);
}));

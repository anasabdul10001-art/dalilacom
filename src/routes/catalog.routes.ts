import { Router } from "express";
import { z } from "zod";
import { OfferStatus, ProductCondition } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { NotBusinessMemberError, requireBusinessMember } from "../services/business.service";

export const catalogRouter = Router();

function handleMembershipError(res: any, err: unknown) {
  if (err instanceof NotBusinessMemberError) return sendError(res, 403, "FORBIDDEN", err.message);
  throw err;
}

/* ---------------- product master ---------------- */

const productMasterSchema = z.object({
  name: z.string().min(2),
  brand: z.string().optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  specifications: z.record(z.any()).optional(),
});

// The product itself, never a price/stock/condition (section: Product Master) — several
// MerchantOffers from different Businesses can point at the same ProductMaster.
catalogRouter.post("/products", requireAuth, async (req, res) => {
  const parsed = productMasterSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (parsed.data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) return sendError(res, 404, "NOT_FOUND", "Category not found");
  }
  const master = await prisma.productMaster.create({ data: parsed.data });
  res.status(201).json(master);
});

const listMastersSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
});

catalogRouter.get("/products", async (req, res) => {
  const parsed = listMastersSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { q, categoryId } = parsed.data;
  const masters = await prisma.productMaster.findMany({
    where: {
      status: "ACTIVE",
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(masters);
});

// Public: a product with every active offer across every business — the actual point of
// splitting Product Master from Merchant Offer (comparison shopping).
catalogRouter.get("/products/:id", async (req, res) => {
  const master = await prisma.productMaster.findUnique({
    where: { id: req.params.id },
    include: {
      category: true,
      offers: {
        where: { status: "ACTIVE" },
        include: { business: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
        orderBy: { priceCents: "asc" },
      },
    },
  });
  if (!master || master.status !== "ACTIVE") return sendError(res, 404, "NOT_FOUND", "Product not found");
  res.json(master);
});

/* ---------------- merchant offer ---------------- */

const newMasterInlineSchema = productMasterSchema;

const createOfferSchema = z
  .object({
    businessId: z.string().uuid(),
    branchId: z.string().uuid().optional(),
    productMasterId: z.string().uuid().optional(),
    productMaster: newMasterInlineSchema.optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    sku: z.string().optional(),
    priceCents: z.number().int().positive(),
    currency: z.string().length(3).optional(),
    stock: z.number().int().nonnegative().default(0),
    condition: z.nativeEnum(ProductCondition).default("NEW"),
    memberDiscountEnabled: z.boolean().default(false),
    memberPriceCents: z.number().int().positive().optional(),
  })
  .refine((d) => !!d.productMasterId || !!d.productMaster, {
    message: "Provide either productMasterId (attach to an existing product) or productMaster (create a new one)",
  })
  .refine((d) => !d.memberDiscountEnabled || d.memberPriceCents !== undefined, {
    message: "memberPriceCents is required when memberDiscountEnabled is true",
  })
  .refine((d) => d.memberPriceCents === undefined || d.memberPriceCents < d.priceCents, {
    message: "memberPriceCents must be lower than priceCents",
  });

// A Business's offer of a product — either an existing ProductMaster (productMasterId) or a
// brand-new one created in the same call (productMaster). Price/stock/condition live here, never
// on ProductMaster (section: Merchant Offer / Product Condition).
catalogRouter.post("/offers", requireAuth, async (req, res) => {
  const parsed = createOfferSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { businessId, branchId, productMasterId, productMaster, ...offerFields } = parsed.data;

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return sendError(res, 404, "NOT_FOUND", "Business not found");
  try {
    await requireBusinessMember(businessId, req.user!.id, ["OWNER", "MANAGER", "STAFF"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.businessId !== businessId) {
      return sendError(res, 400, "INVALID_BRANCH", "Branch does not belong to this business");
    }
  }

  let masterId = productMasterId;
  if (!masterId) {
    const master = await prisma.productMaster.create({ data: productMaster! });
    masterId = master.id;
  } else {
    const master = await prisma.productMaster.findUnique({ where: { id: masterId } });
    if (!master || master.status !== "ACTIVE") return sendError(res, 404, "NOT_FOUND", "Product master not found");
  }

  const currency = offerFields.currency ?? (await prisma.country.findUnique({ where: { id: business.countryId } }))!.currencyCode;

  const offer = await prisma.merchantOffer.create({
    data: { ...offerFields, currency, businessId, branchId, productMasterId: masterId },
  });
  res.status(201).json(offer);
});

catalogRouter.get("/offers/mine", requireAuth, async (req, res) => {
  const parsed = z.object({ businessId: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    await requireBusinessMember(parsed.data.businessId, req.user!.id);
  } catch (err) {
    return handleMembershipError(res, err);
  }
  const offers = await prisma.merchantOffer.findMany({
    where: { businessId: parsed.data.businessId },
    include: { productMaster: true, branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(offers);
});

const updateOfferSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    sku: z.string().optional(),
    priceCents: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    stock: z.number().int().nonnegative().optional(),
    condition: z.nativeEnum(ProductCondition).optional(),
    status: z.nativeEnum(OfferStatus).optional(),
    memberDiscountEnabled: z.boolean().optional(),
    memberPriceCents: z.number().int().positive().optional(),
    branchId: z.string().uuid().nullable().optional(),
  });

catalogRouter.patch("/offers/:id", requireAuth, async (req, res) => {
  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const existing = await prisma.merchantOffer.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Offer not found");
  try {
    await requireBusinessMember(existing.businessId, req.user!.id, ["OWNER", "MANAGER", "STAFF"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  if (parsed.data.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
    if (!branch || branch.businessId !== existing.businessId) {
      return sendError(res, 400, "INVALID_BRANCH", "Branch does not belong to this business");
    }
  }

  const offer = await prisma.merchantOffer.update({ where: { id: existing.id }, data: parsed.data });
  res.json(offer);
});

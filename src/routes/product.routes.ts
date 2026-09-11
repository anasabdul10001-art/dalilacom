import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

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
  stock: z.number().int().nonnegative().default(0),
  sku: z.string().optional(),
  memberDiscountEnabled: z.boolean().default(false),
  memberPriceCents: z.number().int().positive().optional(),
});

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
productRouter.post("/", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in result) {
    return res.status(403).json({ error: result.error });
  }

  if (parsed.data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
  }

  const product = await prisma.product.create({
    data: { merchantId: result.merchant.id, ...parsed.data },
  });
  res.status(201).json(product);
});

// Merchant: manage their own catalog, including inactive/out-of-stock items (section 59.1)
productRouter.get("/mine", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return res.status(404).json({ error: "Merchant profile not found" });
  }
  const products = await prisma.product.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

const updateProductSchema = productFieldsSchema.partial().extend({ isActive: z.boolean().optional() });

productRouter.patch("/:id", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!merchant || !existing || existing.merchantId !== merchant.id) {
    return res.status(404).json({ error: "Product not found" });
  }

  const product = await prisma.product.update({ where: { id: existing.id }, data: parsed.data });
  res.json(product);
});

const listProductsSchema = z.object({
  merchantId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  q: z.string().optional(),
});

// Public: browse a merchant's storefront catalog (section 6)
productRouter.get("/", async (req, res) => {
  const parsed = listProductsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { merchantId, categoryId, q } = parsed.data;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(merchantId ? { merchantId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

productRouter.get("/:id", async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product || !product.isActive) {
    return res.status(404).json({ error: "Product not found" });
  }
  res.json(product);
});

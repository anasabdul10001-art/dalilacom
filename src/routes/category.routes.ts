import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";

export const categoryRouter = Router();

// Public: full hierarchy (top-level categories with their children), section 10
categoryRouter.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: { children: true },
    orderBy: { name: "asc" },
  });
  res.json(categories);
});

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const createCategorySchema = z.object({
  name: z.string().min(2),
  parentId: z.string().uuid().optional(),
});

// Admin-managed, not hardcoded (section 10)
categoryRouter.post("/", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }
  const { name, parentId } = parsed.data;

  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) {
      return sendError(res, 404, "NOT_FOUND", "Parent category not found");
    }
  }

  let slug = slugify(name);
  if (await prisma.category.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const category = await prisma.category.create({
    data: { name, slug, parentId },
  });
  res.status(201).json(category);
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// Admin-managed edits (section 10) — slug is left untouched on rename since nothing else
// in the app routes by slug yet.
categoryRouter.patch("/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return sendError(res, 404, "NOT_FOUND", "Category not found");
  }

  if (parsed.data.parentId) {
    if (parsed.data.parentId === existing.id) {
      return sendError(res, 400, "BAD_REQUEST", "A category can't be its own parent");
    }
    const parent = await prisma.category.findUnique({ where: { id: parsed.data.parentId } });
    if (!parent) {
      return sendError(res, 404, "NOT_FOUND", "Parent category not found");
    }
  }

  const category = await prisma.category.update({ where: { id: existing.id }, data: parsed.data });
  res.json(category);
});

// Admin: refuse to delete a category still in use anywhere, rather than silently orphaning
// the merchants/products/subcategories that reference it.
categoryRouter.delete("/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return sendError(res, 404, "NOT_FOUND", "Category not found");
  }

  const [childCount, merchantCount, productCount] = await Promise.all([
    prisma.category.count({ where: { parentId: existing.id } }),
    prisma.merchantProfile.count({ where: { categoryId: existing.id } }),
    prisma.product.count({ where: { categoryId: existing.id } }),
  ]);
  if (childCount > 0 || merchantCount > 0 || productCount > 0) {
    return sendError(res, 409, "CATEGORY_IN_USE", "Category is still in use and can't be deleted", {
      childCount,
      merchantCount,
      productCount,
    });
  }

  await prisma.category.delete({ where: { id: existing.id } });
  res.json({ id: existing.id });
});

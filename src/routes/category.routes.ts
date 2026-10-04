import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { resolveLanguage } from "../lib/languages";
import { categoryTreeFor, invalidateCategoryCache, searchCategories } from "../services/category.service";

export const categoryRouter = Router();

// Public: the full section > profession > specialty tree, named in the requested language
// (?lang=en or Accept-Language; Arabic when unknown), with how many approved places sit under each node.
categoryRouter.get("/", async (req, res) => {
  res.json(await categoryTreeFor(resolveLanguage(req)));
});

// Public: ranked categories for what the person typed — spelling-tolerant, any language, synonym-aware.
categoryRouter.get("/search", async (req, res) => {
  const parsed = z.object({ q: z.string().trim().min(1).max(60) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await searchCategories(parsed.data.q, resolveLanguage(req), 10));
});

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const translationsSchema = z
  .array(z.object({ lang: z.string().min(2).max(5), name: z.string().min(1).max(80).nullable().optional(), synonyms: z.array(z.string().min(1).max(60)).max(60).optional() }))
  .optional();

const createCategorySchema = z.object({
  name: z.string().min(2),
  parentId: z.string().uuid().optional(),
  icon: z.string().max(8).nullable().optional(),
  sortOrder: z.number().int().optional(),
  translations: translationsSchema,
});

async function applyTranslations(categoryId: string, translations: z.infer<typeof translationsSchema>) {
  for (const t of translations ?? []) {
    const lang = t.lang.toLowerCase();
    await prisma.categoryTranslation.upsert({
      where: { categoryId_lang: { categoryId, lang } },
      update: { ...(t.name !== undefined ? { name: t.name } : {}), ...(t.synonyms ? { synonyms: t.synonyms } : {}) },
      create: { categoryId, lang, name: t.name ?? null, synonyms: t.synonyms ?? [] },
    });
  }
}

// Admin-managed, not hardcoded (section 10)
categoryRouter.post("/", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }
  const { name, parentId, icon, sortOrder, translations } = parsed.data;

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
    data: { name, slug, parentId, ...(icon !== undefined ? { icon } : {}), sortOrder: sortOrder ?? 1000 }, // admin-created sections list after the built-in ones unless told otherwise
  });
  await applyTranslations(category.id, translations);
  invalidateCategoryCache();
  res.status(201).json(category);
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(8).nullable().optional(),
  sortOrder: z.number().int().optional(),
  translations: translationsSchema,
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

  const { translations, ...fields } = parsed.data;
  const category = await prisma.category.update({ where: { id: existing.id }, data: fields });
  await applyTranslations(existing.id, translations);
  invalidateCategoryCache();
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

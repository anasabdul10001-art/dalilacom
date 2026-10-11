import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { route } from "../lib/asyncRoute";
import { resolveLanguage } from "../lib/languages";
import { addProductCategory, loadProductCategories, productCategoryTree, searchProductCategories } from "../services/productCategory.service";

export const productCategoryRouter = Router();

const MAX_OWN = 20; // categories one shop may add
const MAX_DEPTH = 3; // department > category > kind

// Public: the departments > categories > kinds a product is filed under, named in the reader's language.
productCategoryRouter.get("/", route(async (req, res) => {
  res.json(await productCategoryTree(resolveLanguage(req)));
}));

// Public: ranked categories for what was typed, with where each one sits.
productCategoryRouter.get("/search", route(async (req, res) => {
  const parsed = z.object({ q: z.string().trim().min(1).max(60) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await searchProductCategories(parsed.data.q, resolveLanguage(req), 10));
}));

// A shop adds a category of its own under one that exists; it can be used at once. The same name under the same place is the same category.
productCategoryRouter.post("/", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(40), parentId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, approvalStatus: true } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  if (merchant.approvalStatus !== "APPROVED") return sendError(res, 403, "FORBIDDEN", "Merchant is not approved yet");
  const { byId } = await loadProductCategories();
  const parent = byId.get(parsed.data.parentId);
  if (!parent) return sendError(res, 404, "NOT_FOUND", "Category not found");
  let depth = 1;
  for (let cur = parent; cur.parentId; cur = byId.get(cur.parentId)!) depth++;
  if (depth >= MAX_DEPTH) return sendError(res, 400, "BAD_REQUEST", "Choose a wider category to add this under");
  if ((await prisma.productCategory.count({ where: { createdById: merchant.id } })) >= MAX_OWN) return sendError(res, 400, "BAD_REQUEST", "You have added the most categories allowed");
  const result = await addProductCategory(merchant.id, parsed.data.name, parent.id);
  const lang = resolveLanguage(req);
  const node = (await loadProductCategories()).byId.get(result.id);
  res.status(result.created ? 201 : 200).json({ id: result.id, created: result.created, name: node ? (node.names[lang] ?? node.names.ar) : parsed.data.name });
}));

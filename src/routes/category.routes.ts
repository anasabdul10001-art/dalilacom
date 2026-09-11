import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
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
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, parentId } = parsed.data;

  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) {
      return res.status(404).json({ error: "Parent category not found" });
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

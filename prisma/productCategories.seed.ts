import { PrismaClient } from "@prisma/client";
import { PRODUCT_CATEGORIES, ProductCategorySeed } from "./productCategories.data";

/**
 * Creates / refreshes the product category tree (see productCategories.data.ts). Idempotent: safe on every deploy. Rows are
 * matched by slug, so products keep their category, and the categories shops added themselves are left alone.
 */
export async function seedProductCategories(prisma: PrismaClient): Promise<number> {
  let count = 0;
  const walk = async (nodes: ProductCategorySeed[], parentId: string | null) => {
    for (const [index, node] of nodes.entries()) {
      const data = {
        name: node.ar,
        nameEn: node.en,
        synonyms: (node.syn ?? "").split("|").map((w) => w.trim()).filter(Boolean),
        icon: node.icon ?? null,
        section: node.section ?? null,
        parentId,
        sortOrder: (index + 1) * 10,
        isCustom: false,
      };
      const row = await prisma.productCategory.upsert({ where: { slug: node.slug }, update: data, create: { slug: node.slug, ...data } });
      count++;
      if (node.children) await walk(node.children, row.id);
    }
  };
  await walk(PRODUCT_CATEGORIES, null);
  return count;
}

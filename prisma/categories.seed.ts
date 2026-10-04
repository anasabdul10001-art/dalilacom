import { PrismaClient } from "@prisma/client";
import { CATEGORY_TREE, CategorySeed } from "./categories.data";

const words = (list?: string) => (list ? list.split("|").map((w) => w.trim()).filter(Boolean) : []);

/**
 * Creates / refreshes the section > profession > specialty tree (see categories.data.ts).
 * Idempotent: safe to run on every deploy. Rows are matched by slug, so existing merchants and
 * products that point at a category keep pointing at it.
 */
export async function seedCategories(prisma: PrismaClient): Promise<number> {
  let count = 0;
  const walk = async (nodes: CategorySeed[], parentId: string | null) => {
    for (const [index, node] of nodes.entries()) {
      const data = { name: node.ar, parentId, icon: node.icon ?? null, sortOrder: (index + 1) * 10 };
      const category = await prisma.category.upsert({ where: { slug: node.slug }, update: data, create: { slug: node.slug, ...data } });
      // Arabic is the base language (Category.name); its row only carries the words people type.
      await prisma.categoryTranslation.upsert({
        where: { categoryId_lang: { categoryId: category.id, lang: "ar" } },
        update: { name: null, synonyms: words(node.synAr) },
        create: { categoryId: category.id, lang: "ar", name: null, synonyms: words(node.synAr) },
      });
      await prisma.categoryTranslation.upsert({
        where: { categoryId_lang: { categoryId: category.id, lang: "en" } },
        update: { name: node.en, synonyms: words(node.synEn) },
        create: { categoryId: category.id, lang: "en", name: node.en, synonyms: words(node.synEn) },
      });
      count++;
      if (node.children) await walk(node.children, category.id);
    }
  };
  await walk(CATEGORY_TREE, null);
  return count;
}

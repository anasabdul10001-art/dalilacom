import { prisma } from "../prisma";

/** A coach or sports club can sit several levels below these category roots. */
export async function isFitnessProviderCategory(categoryId: string): Promise<boolean> {
  let category = await prisma.category.findUnique({ where: { id: categoryId }, select: { slug: true, parentId: true } });
  while (category) {
    if (category.slug === "coach" || category.slug.startsWith("coach-") || category.slug === "gym" || category.slug.startsWith("gym-")) return true;
    category = category.parentId ? await prisma.category.findUnique({ where: { id: category.parentId }, select: { slug: true, parentId: true } }) : null;
  }
  return false;
}

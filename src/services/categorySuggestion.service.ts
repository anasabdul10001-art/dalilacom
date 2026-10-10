import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";
import { invalidateCategoryCache, normalizeText } from "./category.service";

/** Puts a shop (and its mirrored business row) under another profession. */
async function moveMerchant(merchantId: string, categoryId: string) {
  await prisma.$transaction([
    prisma.merchantProfile.update({ where: { id: merchantId }, data: { categoryId } }),
    prisma.business.updateMany({ where: { legacyMerchantProfileId: merchantId }, data: { categoryId } }),
  ]);
}

async function tellAdmins(shopName: string, name: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ userId: a.id, type: "SYSTEM", title: "اقتراح مهنة جديدة للمراجعة", body: `${shopName}: ${name}`, data: { kind: "CATEGORY_SUGGESTION" }, email: false })));
}

/** A shop proposes a profession. One open proposal per shop: a new one replaces the old. */
export async function createSuggestion(merchantId: string, userId: string, name: string, nearestId: string | null) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  const shop = await prisma.merchantProfile.findUnique({ where: { id: merchantId }, select: { businessName: true } });
  const open = await prisma.categorySuggestion.findFirst({ where: { merchantId, status: "PENDING" } });
  const row = open
    ? await prisma.categorySuggestion.update({ where: { id: open.id }, data: { name: clean, nearestId } })
    : await prisma.categorySuggestion.create({ data: { merchantId, userId, name: clean, nearestId } });
  if (!open) await tellAdmins(shop?.businessName ?? "", clean);
  return row;
}

async function pathOf(categoryId: string | null): Promise<string> {
  const names: string[] = [];
  let id = categoryId;
  for (let guard = 0; id && guard < 6; guard++) {
    const c = await prisma.category.findUnique({ where: { id }, select: { name: true, parentId: true } });
    if (!c) break;
    names.unshift(c.name);
    id = c.parentId;
  }
  return names.join(" › ");
}

/** The admin's list: who proposed what, and where the shop sits meanwhile. */
export async function listSuggestions(status: "PENDING" | "APPROVED" | "MERGED" | "REJECTED") {
  const rows = await prisma.categorySuggestion.findMany({ where: { status }, orderBy: { createdAt: "asc" }, take: 200 });
  const shops = await prisma.merchantProfile.findMany({ where: { id: { in: rows.map((r) => r.merchantId) } }, select: { id: true, businessName: true, phone: true, address: true } });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt,
      nearestId: r.nearestId,
      nearestPath: await pathOf(r.nearestId),
      categoryId: r.categoryId,
      categoryPath: await pathOf(r.categoryId),
      merchant: shops.find((s) => s.id === r.merchantId) ?? null,
    })),
  );
}

async function pending(id: string) {
  const row = await prisma.categorySuggestion.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "الاقتراح غير موجود");
  if (row.status !== "PENDING") throw new ApiError(409, "CONFLICT", "هذا الاقتراح انعالج من قبل");
  return row;
}

const words = (list: string[]) => [...new Set(list.map((w) => w.trim()).filter(Boolean))];

/** Accepts it as a new profession (the admin may rename it, translate it and choose where it goes); the shop moves into it. */
export async function approveSuggestion(id: string, input: { nameAr: string; nameEn?: string; parentId?: string | null; icon?: string | null; synonyms?: string[] }) {
  const row = await pending(id);
  if (input.parentId && !(await prisma.category.findUnique({ where: { id: input.parentId } }))) throw new ApiError(404, "NOT_FOUND", "Parent category not found");
  const parentId = input.parentId === undefined ? row.nearestId : input.parentId;
  const slug = `p-${Math.random().toString(36).slice(2, 8)}`;
  const category = await prisma.category.create({ data: { slug, name: input.nameAr.trim(), parentId: parentId ?? null, icon: input.icon ?? null, sortOrder: 1000 } });
  await prisma.categoryTranslation.create({ data: { categoryId: category.id, lang: "ar", name: null, synonyms: words([row.name, ...(input.synonyms ?? [])]) } });
  if (input.nameEn?.trim()) await prisma.categoryTranslation.create({ data: { categoryId: category.id, lang: "en", name: input.nameEn.trim(), synonyms: [] } });
  invalidateCategoryCache();
  await moveMerchant(row.merchantId, category.id);
  await prisma.categorySuggestion.update({ where: { id }, data: { status: "APPROVED", categoryId: category.id, resolvedAt: new Date() } });
  await notify({ userId: row.userId, type: "SYSTEM", title: "انضافت مهنتك ✅", body: `انضافت المهنة «${category.name}» ومحلك صار تحتها.`, data: { kind: "CATEGORY_APPROVED", categoryId: category.id }, email: false });
  return category;
}

/** The proposal is a name for a profession that already exists: the shop moves there and the words join its search words. */
export async function mergeSuggestion(id: string, categoryId: string) {
  const row = await pending(id);
  const target = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!target) throw new ApiError(404, "NOT_FOUND", "Category not found");
  const ar = await prisma.categoryTranslation.findUnique({ where: { categoryId_lang: { categoryId, lang: "ar" } } });
  const have = (ar?.synonyms ?? []).map(normalizeText);
  if (!have.includes(normalizeText(row.name))) {
    await prisma.categoryTranslation.upsert({
      where: { categoryId_lang: { categoryId, lang: "ar" } },
      update: { synonyms: [...(ar?.synonyms ?? []), row.name] },
      create: { categoryId, lang: "ar", name: null, synonyms: [row.name] },
    });
  }
  invalidateCategoryCache();
  await moveMerchant(row.merchantId, categoryId);
  await prisma.categorySuggestion.update({ where: { id }, data: { status: "MERGED", categoryId, resolvedAt: new Date() } });
  await notify({ userId: row.userId, type: "SYSTEM", title: "تم ترتيب مهنتك ✅", body: `محلك صار تحت «${target.name}» وصار بيطلع لما الناس تبحث عن «${row.name}».`, data: { kind: "CATEGORY_MERGED", categoryId }, email: false });
  return target;
}

export async function rejectSuggestion(id: string, reason: string) {
  const row = await pending(id);
  await prisma.categorySuggestion.update({ where: { id }, data: { status: "REJECTED", note: reason.trim() || null, resolvedAt: new Date() } });
  await notify({ userId: row.userId, type: "SYSTEM", title: "ما انقبل اقتراح المهنة", body: reason.trim() ? `السبب: ${reason.trim()}` : "اختر أقرب مهنة من القائمة.", data: { kind: "CATEGORY_REJECTED" }, email: false });
}

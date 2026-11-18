import { AccountingLocationKind, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";

/**
 * Goods outside the main store: a shop branch, or a distributor carrying stock.
 * The main store is the product's own quantity; giving goods to a location takes them from it, returning puts them back,
 * and a sale made from a location takes them from that location only. So at any moment:
 *   in the main store + at the locations (not sold yet) + sold = everything the business handled.
 */

const notFound = (msg: string) => new ApiError(404, "NOT_FOUND", msg);

export async function listLocations(userId: string, onlyStaffId?: string) {
  const rows = await prisma.accountingLocation.findMany({
    where: { userId, ...(onlyStaffId ? { staffId: onlyStaffId } : {}) },
    include: { stock: { include: { product: { select: { id: true, name: true, unit: true, costCents: true, currency: true } } }, orderBy: { updatedAt: "desc" } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  const staff = await prisma.businessStaff.findMany({ where: { id: { in: rows.map((r) => r.staffId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, staffId: r.staffId, staffName: staff.find((s) => s.id === r.staffId)?.name ?? null, isActive: r.isActive,
    onHandUnits: r.stock.reduce((a, s) => a + s.onHand, 0), soldUnits: r.stock.reduce((a, s) => a + s.sold, 0),
    onHandValueCents: r.stock.reduce((a, s) => a + s.onHand * s.product.costCents, 0),
    items: r.stock.filter((s) => s.given > 0 || s.onHand > 0).map((s) => ({ productId: s.productId, name: s.product.name, unit: s.product.unit, onHand: s.onHand, given: s.given, sold: s.sold, returned: s.returned })),
  }));
}

async function assertStaff(userId: string, staffId?: string | null) {
  if (!staffId) return;
  const staff = await prisma.businessStaff.findFirst({ where: { id: staffId, ownerId: userId, status: { not: "REMOVED" } }, select: { id: true } });
  if (!staff) throw notFound("الموظف غير موجود");
}

export async function createLocation(userId: string, d: { name: string; kind: AccountingLocationKind; staffId?: string | null }) {
  await assertStaff(userId, d.staffId);
  return prisma.accountingLocation.create({ data: { userId, name: d.name, kind: d.kind, staffId: d.staffId ?? null } });
}

export async function updateLocation(userId: string, id: string, d: { name?: string; staffId?: string | null; isActive?: boolean }) {
  const found = await prisma.accountingLocation.findFirst({ where: { id, userId } });
  if (!found) throw notFound("الموقع غير موجود");
  await assertStaff(userId, d.staffId);
  if (d.isActive === false) {
    const left = await prisma.accountingLocationStock.aggregate({ where: { locationId: id }, _sum: { onHand: true } });
    if ((left._sum.onHand ?? 0) > 0) throw new ApiError(409, "CONFLICT", "رجّع البضاعة الموجودة بهالموقع للمستودع قبل ما توقفو");
  }
  return prisma.accountingLocation.update({ where: { id }, data: d });
}

/** Main store -> a location. Only what the main store really has can be given. */
export async function giveStock(userId: string, actorId: string, locationId: string, productId: string, quantity: number, note?: string) {
  const loc = await prisma.accountingLocation.findFirst({ where: { id: locationId, userId, isActive: true } });
  if (!loc) throw notFound("الموقع غير موجود");
  const product = await prisma.accountingProduct.findFirst({ where: { id: productId, userId }, select: { id: true, name: true, costCents: true } });
  if (!product) throw notFound("المنتج غير موجود");
  await prisma.$transaction(async (tx) => {
    const took = await tx.accountingProduct.updateMany({ where: { id: productId, userId, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
    if (!took.count) throw new ApiError(409, "INSUFFICIENT_STOCK", "الكمية الموجودة بالمستودع ما بتكفي", { productId, name: product.name });
    await tx.accountingLocationStock.upsert({
      where: { locationId_productId: { locationId, productId } },
      create: { locationId, productId, onHand: quantity, given: quantity },
      update: { onHand: { increment: quantity }, given: { increment: quantity } },
    });
    await tx.accountingLocationMove.create({ data: { locationId, productId, kind: "GIVE", quantity, recordedById: actorId, note: note || null } });
    await tx.accountingStockMovement.create({ data: { userId, productId, action: "STOCK_OUT", quantity, unitCostCents: product.costCents, note: `توزيع على ${loc.name}` } });
  });
}

/** A location -> the main store, whatever it did not sell. */
export async function returnStock(userId: string, actorId: string, locationId: string, productId: string, quantity: number, note?: string) {
  const loc = await prisma.accountingLocation.findFirst({ where: { id: locationId, userId } });
  if (!loc) throw notFound("الموقع غير موجود");
  const product = await prisma.accountingProduct.findFirst({ where: { id: productId, userId }, select: { id: true, costCents: true } });
  if (!product) throw notFound("المنتج غير موجود");
  await prisma.$transaction(async (tx) => {
    const took = await tx.accountingLocationStock.updateMany({ where: { locationId, productId, onHand: { gte: quantity } }, data: { onHand: { decrement: quantity }, returned: { increment: quantity } } });
    if (!took.count) throw new ApiError(409, "INSUFFICIENT_STOCK", "الكمية الموجودة بهالموقع ما بتكفي");
    await tx.accountingProduct.update({ where: { id: productId }, data: { quantity: { increment: quantity } } });
    await tx.accountingLocationMove.create({ data: { locationId, productId, kind: "RETURN", quantity, recordedById: actorId, note: note || null } });
    await tx.accountingStockMovement.create({ data: { userId, productId, action: "STOCK_IN", quantity, unitCostCents: product.costCents, note: `رجوع من ${loc.name}` } });
  });
}

/** The location a staff member sells from (a distributor has one of his own). */
export const locationOfStaff = (userId: string, staffId: string) => prisma.accountingLocation.findFirst({ where: { userId, staffId, isActive: true }, orderBy: { createdAt: "asc" } });

/** For each product: in the main store, at the locations (not sold yet), and sold in all channels (minus what came back). */
export async function stockOverview(userId: string) {
  const [products, atLocations, soldRows, backRows] = await Promise.all([
    prisma.accountingProduct.findMany({ where: { userId }, select: { id: true, name: true, unit: true, quantity: true, costCents: true, currency: true }, orderBy: { name: "asc" } }),
    prisma.accountingLocationStock.groupBy({ by: ["productId"], where: { location: { userId } }, _sum: { onHand: true } }),
    prisma.$queryRaw<{ productId: string; qty: bigint }[]>(Prisma.sql`SELECT l."productId", COALESCE(SUM(l."quantity"), 0) AS qty FROM "AccountingSaleLine" l JOIN "AccountingSale" s ON s."id" = l."saleId" WHERE s."userId" = ${userId} AND l."productId" IS NOT NULL GROUP BY l."productId"`),
    prisma.$queryRaw<{ productId: string; qty: bigint }[]>(Prisma.sql`SELECT l."productId", COALESCE(SUM(l."quantity"), 0) AS qty FROM "AccountingSaleReturnLine" l JOIN "AccountingSaleReturn" r ON r."id" = l."returnId" WHERE r."userId" = ${userId} AND l."productId" IS NOT NULL GROUP BY l."productId"`),
  ]);
  const num = (rows: { productId: string; qty: bigint }[], id: string) => Number(rows.find((r) => r.productId === id)?.qty ?? 0);
  return products.map((p) => {
    const distributed = atLocations.find((a) => a.productId === p.id)?._sum.onHand ?? 0;
    return { productId: p.id, name: p.name, unit: p.unit, currency: p.currency, inMainStore: p.quantity, distributed, sold: num(soldRows, p.id) - num(backRows, p.id), costCents: p.costCents };
  });
}

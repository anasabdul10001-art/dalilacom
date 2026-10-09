import { Discount, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { STORE_SECTIONS } from "./storeSections";

/** A discount customers may use right now: approved by the admin, switched on, and inside its dates. */
export const liveDiscountWhere = (now = new Date()): Prisma.DiscountWhereInput => ({
  isActive: true,
  status: "APPROVED",
  AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }, { OR: [{ endDate: null }, { endDate: { gte: now } }] }],
});

export type DiscountState = "PENDING" | "REJECTED" | "PAUSED" | "SCHEDULED" | "LIVE" | "ENDED";

/** Where a discount is in its life, for the shop's list. */
export function discountState(d: Pick<Discount, "status" | "isActive" | "startDate" | "endDate">, now = new Date()): DiscountState {
  if (d.status === "PENDING") return "PENDING";
  if (d.status === "REJECTED") return "REJECTED";
  if (d.endDate && d.endDate.getTime() < now.getTime()) return "ENDED";
  if (!d.isActive) return "PAUSED";
  if (d.startDate && d.startDate.getTime() > now.getTime()) return "SCHEDULED";
  return "LIVE";
}

/** What a discount covers, in words the apps can show (names of the products, or the section). */
export async function discountScopeInfo(discounts: Pick<Discount, "scope" | "scopeSection" | "productIds">[]) {
  const ids = [...new Set(discounts.flatMap((d) => d.productIds))];
  const products = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(products.map((p) => [p.id, p.name]));
  return (d: Pick<Discount, "scope" | "scopeSection" | "productIds">) => {
    const section = d.scope === "SECTION" ? STORE_SECTIONS.find((s) => s.id === d.scopeSection) : undefined;
    return {
      scope: d.scope,
      section: section ? { id: section.id, name: section.name, nameEn: section.nameEn } : null,
      productNames: d.scope === "PRODUCTS" ? d.productIds.map((id) => names.get(id)).filter((n): n is string => !!n) : [],
    };
  };
}

/** How much of a discount a member has used, and whether the shop's limits still let them have it. */
export async function memberUse(discount: Pick<Discount, "id" | "maxCustomers" | "perCustomerLimit">, membershipId: string) {
  const [mine, distinct] = await Promise.all([
    prisma.discountTransaction.count({ where: { discountId: discount.id, membershipId } }),
    discount.maxCustomers === null ? Promise.resolve(0) : prisma.discountTransaction.groupBy({ by: ["membershipId"], where: { discountId: discount.id } }).then((g) => g.length),
  ]);
  const perPersonOk = discount.perCustomerLimit === null || mine < discount.perCustomerLimit;
  const peopleOk = discount.maxCustomers === null || mine > 0 || distinct < discount.maxCustomers;
  return { used: mine, eligible: perPersonOk && peopleOk, remaining: discount.perCustomerLimit === null ? null : Math.max(0, discount.perCustomerLimit - mine), peopleLeft: discount.maxCustomers === null ? null : Math.max(0, discount.maxCustomers - distinct) };
}

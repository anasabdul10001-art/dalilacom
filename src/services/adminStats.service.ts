import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * The numbers on the admin panel's home page: how big the platform is, how it moved in the last 30 days, and what is
 * waiting for the admin. One call, read-only; the day-by-day series come from one grouped query each.
 */
const DAY = 24 * 60 * 60 * 1000;

export interface DayPoint { day: string; count: number }

/** The last [days] days (today included) as a gap-free list: days with nothing are 0. */
function fill(rows: { d: Date; n: bigint | number }[], days: number): DayPoint[] {
  const byDay = new Map(rows.map((r) => [new Date(r.d).toISOString().slice(0, 10), Number(r.n)]));
  const out: DayPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY).toISOString().slice(0, 10);
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

/** Change against the 30 days before, in percent; null when there was nothing before to compare with. */
const trend = (now: number, before: number): number | null => (before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / before) * 100));

export async function adminOverview() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const since = new Date(now.getTime() - 29 * DAY);
  since.setUTCHours(0, 0, 0, 0);

  const series = (table: string, extra: Prisma.Sql = Prisma.empty) =>
    prisma.$queryRaw<{ d: Date; n: bigint }[]>(
      Prisma.sql`SELECT date_trunc('day', "createdAt") AS d, count(*) AS n FROM ${Prisma.raw(`"${table}"`)} WHERE "createdAt" >= ${since} ${extra} GROUP BY 1`,
    );

  const [
    usersTotal, usersByRole, users7, users30, usersPrev30, verified,
    merchantsByStatus, merchants30, merchantsPrev30,
    membersActive, members30,
    txTotal, tx30, txPrev30, txSum30, txSumAll,
    ordersTotal, orders30, ordersPrev30, ordersByStatus, ordersSum30,
    productsApproved, productsPending,
    devices,
    pendMerchants, pendDiscounts, pendSuggestions, pendAds, pendBanners, pendTopups, pendMarketers, pendBroadcasts, pendLandmarks,
    topCategoriesRaw, topShopsRaw,
    sUsers, sMerchants, sTx, sOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.user.count({ where: { createdAt: { gte: d60, lt: d30 } } }),
    prisma.user.count({ where: { isEmailVerified: true } }),
    prisma.merchantProfile.groupBy({ by: ["approvalStatus"], _count: { _all: true } }),
    prisma.merchantProfile.count({ where: { createdAt: { gte: d30 } } }),
    prisma.merchantProfile.count({ where: { createdAt: { gte: d60, lt: d30 } } }),
    prisma.membership.count({ where: { status: "ACTIVE", endDate: { gt: now } } }),
    prisma.membership.count({ where: { createdAt: { gte: d30 } } }),
    prisma.discountTransaction.count({ where: { status: "CONFIRMED" } }),
    prisma.discountTransaction.count({ where: { status: "CONFIRMED", createdAt: { gte: d30 } } }),
    prisma.discountTransaction.count({ where: { status: "CONFIRMED", createdAt: { gte: d60, lt: d30 } } }),
    prisma.discountTransaction.aggregate({ where: { status: "CONFIRMED", createdAt: { gte: d30 } }, _sum: { discountAmountCents: true, billAmountCents: true } }),
    prisma.discountTransaction.aggregate({ where: { status: "CONFIRMED" }, _sum: { discountAmountCents: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { createdAt: { gte: d60, lt: d30 } } }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: d30 }, status: { not: "CANCELLED" } }, _sum: { totalCents: true } }),
    prisma.product.count({ where: { moderation: "APPROVED" } }),
    prisma.product.count({ where: { moderation: "PENDING" } }),
    prisma.deviceToken.count(),
    prisma.merchantProfile.count({ where: { approvalStatus: "PENDING" } }),
    prisma.discount.count({ where: { status: "PENDING" } }),
    prisma.categorySuggestion.count({ where: { status: "PENDING" } }),
    prisma.adBooking.count({ where: { status: "PENDING" } }),
    prisma.bannerBooking.count({ where: { status: "PENDING" } }),
    prisma.topUpRequest.count({ where: { status: "PENDING" } }),
    prisma.marketerRequest.count({ where: { status: "PENDING" } }),
    prisma.broadcast.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.landmark.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.merchantProfile.groupBy({ by: ["categoryId"], where: { approvalStatus: "APPROVED" }, _count: { _all: true }, orderBy: { _count: { categoryId: "desc" } }, take: 6 }),
    prisma.discountTransaction.groupBy({ by: ["merchantId"], where: { status: "CONFIRMED", createdAt: { gte: d30 } }, _count: { _all: true }, _sum: { discountAmountCents: true }, orderBy: { _count: { merchantId: "desc" } }, take: 5 }),
    series("User"),
    series("MerchantProfile"),
    series("DiscountTransaction", Prisma.sql`AND "status" = 'CONFIRMED'`),
    series("Order"),
  ]);

  const [categories, shops] = await Promise.all([
    prisma.category.findMany({ where: { id: { in: topCategoriesRaw.map((c) => c.categoryId) } }, select: { id: true, name: true, icon: true } }),
    prisma.merchantProfile.findMany({ where: { id: { in: topShopsRaw.map((s) => s.merchantId) } }, select: { id: true, businessName: true } }),
  ]);
  const catName = new Map(categories.map((c) => [c.id, `${c.icon ? c.icon + " " : ""}${c.name}`]));
  const shopName = new Map(shops.map((s) => [s.id, s.businessName]));

  const roleCount = (r: string) => usersByRole.find((x) => x.role === r)?._count._all ?? 0;
  const merchantCount = (s: string) => merchantsByStatus.find((x) => x.approvalStatus === s)?._count._all ?? 0;

  return {
    generatedAt: now.toISOString(),
    users: { total: usersTotal, customers: roleCount("CUSTOMER"), merchants: roleCount("MERCHANT"), admins: roleCount("ADMIN"), last7: users7, last30: users30, trend: trend(users30, usersPrev30), verified, devices },
    merchants: { approved: merchantCount("APPROVED"), pending: merchantCount("PENDING"), rejected: merchantCount("REJECTED"), last30: merchants30, trend: trend(merchants30, merchantsPrev30) },
    memberships: { active: membersActive, last30: members30 },
    discounts: { redemptions: txTotal, last30: tx30, trend: trend(tx30, txPrev30), savedCents30: txSum30._sum.discountAmountCents ?? 0, billCents30: txSum30._sum.billAmountCents ?? 0, savedCentsAll: txSumAll._sum.discountAmountCents ?? 0 },
    orders: {
      total: ordersTotal, last30: orders30, trend: trend(orders30, ordersPrev30), salesCents30: ordersSum30._sum.totalCents ?? 0,
      byStatus: Object.fromEntries(ordersByStatus.map((o) => [o.status, o._count._all])),
    },
    products: { approved: productsApproved, pending: productsPending },
    waiting: {
      merchants: pendMerchants, discounts: pendDiscounts, products: productsPending, suggestions: pendSuggestions,
      ads: pendAds + pendBanners, topups: pendTopups, marketers: pendMarketers, broadcasts: pendBroadcasts, landmarks: pendLandmarks,
    },
    series: { users: fill(sUsers, 30), merchants: fill(sMerchants, 30), discounts: fill(sTx, 30), orders: fill(sOrders, 30) },
    topCategories: topCategoriesRaw.map((c) => ({ name: catName.get(c.categoryId) ?? "—", count: c._count._all })),
    topShops: topShopsRaw.map((s) => ({ name: shopName.get(s.merchantId) ?? "—", count: s._count._all, savedCents: s._sum.discountAmountCents ?? 0 })),
  };
}

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { creditsChargeFor } from "./plan.service";
import { getSettings } from "./settings.service";

export const sellerMonthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/** Counts accepted, waiting, hidden and sold offers across both kinds of shop; rejected offers do not use the free quota. */
export async function countSellerListings(db: Prisma.TransactionClient | typeof prisma, userId: string) {
  const since = sellerMonthStart();
  const [personal, merchant] = await Promise.all([
    db.marketplaceListing.count({ where: { userId, createdAt: { gte: since }, status: { not: "REJECTED" } } }),
    db.product.count({ where: { merchant: { userId }, createdAt: { gte: since }, moderation: { not: "REJECTED" } } }),
  ]);
  return personal + merchant;
}

/**
 * Once the free monthly allowance is used up, an account needs an active plan to keep adding products. This works the same for
 * ordinary accounts and merchant shops. A plan priced at 0 counts: the owner makes one when an account should stay free for longer.
 */
export async function hasPaidSellerPlan(userId: string) {
  const [personal, merchant] = await Promise.all([
    prisma.marketplaceSubscription.findUnique({ where: { userId } }),
    prisma.merchantProfile.findUnique({ where: { userId }, include: { plan: true, user: { select: { countryCode: true } } } }),
  ]);
  if (personal && personal.endsAt > new Date()) return true;
  if (!merchant?.plan || (merchant.planEndsAt && merchant.planEndsAt <= new Date())) return false;
  const charge = await creditsChargeFor(merchant.plan, merchant.user.countryCode);
  return charge !== null; // priced (even at 0) = a real plan the owner set up; an unpriced one cannot be chosen at all
}

export async function sellerListingQuota(userId: string) {
  const [settings, used, paid] = await Promise.all([getSettings(), countSellerListings(prisma, userId), hasPaidSellerPlan(userId)]);
  const freeLimit = settings.marketplace.freeListingsPerMonth;
  return { used, freeLimit, remaining: Math.max(0, freeLimit - used), paid, allowNewProducts: settings.marketplace.allowNewProducts };
}

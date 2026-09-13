import { AffiliateSourceType, Prisma } from "@prisma/client";

/**
 * If this customer was referred to this merchant by an affiliate (and that referral hasn't
 * expired), record the commission for this order/redemption. Called from inside the
 * transaction that creates the order or discount transaction — never trusted from the client,
 * always derived from stored referral state.
 */
export async function recordAffiliateCommissionIfReferred(
  tx: Prisma.TransactionClient,
  merchantId: string,
  customerId: string,
  sourceType: AffiliateSourceType,
  sourceId: string,
  baseAmountCents: number,
) {
  const referral = await tx.affiliateReferral.findUnique({
    where: { merchantId_customerId: { merchantId, customerId } },
    include: { merchantAffiliate: true },
  });
  if (!referral || referral.expiresAt.getTime() < Date.now() || !referral.merchantAffiliate.isActive) {
    return;
  }

  const { commissionType, commissionValue } = referral.merchantAffiliate;
  const commissionCents =
    commissionType === "PERCENT" ? Math.round((baseAmountCents * commissionValue) / 100) : commissionValue;

  await tx.affiliateCommission.create({
    data: {
      merchantAffiliateId: referral.merchantAffiliateId,
      referralId: referral.id,
      sourceType,
      sourceId,
      baseAmountCents,
      commissionCents,
    },
  });
}

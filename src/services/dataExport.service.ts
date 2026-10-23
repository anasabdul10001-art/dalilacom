import { prisma } from "../prisma";

/**
 * "Download my data" (GDPR right of access, section 65): everything the platform holds about one person, as plain JSON.
 * Secrets are left out on purpose: password hash, QR secrets, session tokens and the keys of connected channels.
 */
export async function exportPersonalData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, phone: true, fullName: true, role: true, bio: true, language: true, countryCode: true, cityId: true, vatNumber: true,
      isEmailVerified: true, lastLatitude: true, lastLongitude: true, locationUpdatedAt: true, termsAcceptedAt: true, termsVersion: true, locationConsentAt: true, createdAt: true,
    },
  });
  const [addresses, memberships, orders, walletTransactions, topUps, productReviews, merchantReviews, notifications, favorites, securityEvents, merchant] = await Promise.all([
    prisma.address.findMany({ where: { userId } }),
    prisma.membership.findMany({
      where: { userId },
      select: {
        memberNumber: true, status: true, startDate: true, endDate: true, isTrial: true, createdAt: true,
        discountTransactions: { select: { transactionRef: true, billAmountCents: true, discountPercent: true, discountAmountCents: true, finalAmountCents: true, status: true, createdAt: true, merchant: { select: { businessName: true } } } },
      },
    }),
    prisma.order.findMany({ where: { userId }, include: { items: true, payment: true } }),
    prisma.walletTransaction.findMany({ where: { userId } }),
    prisma.topUpRequest.findMany({ where: { userId }, select: { method: true, reference: true, amountClaimed: true, amountCredits: true, status: true, createdAt: true } }),
    prisma.productReview.findMany({ where: { userId } }),
    prisma.merchantReview.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId }, select: { type: true, title: true, body: true, readAt: true, createdAt: true } }),
    prisma.favoriteMerchant.findMany({ where: { userId } }),
    prisma.securityEvent.findMany({ where: { userId }, select: { type: true, ip: true, userAgent: true, createdAt: true } }),
    prisma.merchantProfile.findUnique({ where: { userId }, select: { businessName: true, address: true, phone: true, whatsapp: true, latitude: true, longitude: true, approvalStatus: true, createdAt: true } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    merchantProfile: merchant,
    addresses,
    memberships,
    orders,
    walletTransactions,
    topUpRequests: topUps,
    productReviews,
    merchantReviews,
    favorites,
    notifications,
    securityEvents,
  };
}

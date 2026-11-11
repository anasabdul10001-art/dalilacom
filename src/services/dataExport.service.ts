import { prisma } from "../prisma";
import { decryptJson } from "./crypto.service";

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
  const [addresses, memberships, orders, walletTransactions, topUps, productReviews, merchantReviews, notifications, favorites, securityEvents, merchant, sellerPaymentMethods, careConnections, bookedAppointments, clinicAppointments, fitnessPlans, coachFitnessPlans] = await Promise.all([
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
    prisma.merchantProfile.findUnique({ where: { userId }, select: { businessName: true, address: true, phone: true, whatsapp: true, latitude: true, longitude: true, approvalStatus: true, createdAt: true, fitnessProfile: true, fitnessOffers: true } }),
    prisma.sellerPaymentMethod.findMany({ where: { userId }, select: { provider: true, recipientName: true, accountNumber: true, isEnabled: true, createdAt: true, updatedAt: true } }),
    prisma.doctorPatientConnection.findMany({ where: { patientUserId: userId }, select: { status: true, requestedAt: true, consentedAt: true, revokedAt: true, doctor: { select: { businessName: true } }, records: { select: { kind: true, contentEnc: true, createdAt: true }, orderBy: { createdAt: "asc" } } }, orderBy: { requestedAt: "asc" } }),
    prisma.doctorAppointment.findMany({ where: { patientUserId: userId }, select: { startsAt: true, endsAt: true, kind: true, complaintEnc: true, status: true, createdAt: true, doctor: { select: { businessName: true, address: true, phone: true } } }, orderBy: { startsAt: "asc" } }),
    prisma.doctorAppointment.findMany({ where: { doctor: { userId } }, select: { startsAt: true, endsAt: true, status: true, createdAt: true, patient: { select: { fullName: true, email: true, phone: true } } }, orderBy: { startsAt: "asc" } }),
    prisma.fitnessPlan.findMany({ where: { traineeUserId: userId }, include: { coach: { select: { businessName: true } }, progress: { where: { userId } } }, orderBy: { createdAt: "asc" } }),
    prisma.fitnessPlan.findMany({ where: { coach: { userId } }, include: { trainee: { select: { fullName: true, email: true } }, progress: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    merchantProfile: merchant,
    sellerPaymentMethods,
    medicalRecords: careConnections.map((connection) => ({ status: connection.status, requestedAt: connection.requestedAt, consentedAt: connection.consentedAt, revokedAt: connection.revokedAt, doctor: connection.doctor.businessName, records: connection.records.map((record) => ({ kind: record.kind, ...decryptJson<{ title: string; body: string }>(record.contentEnc), createdAt: record.createdAt })) })),
    appointments: bookedAppointments.map(({ complaintEnc, ...appointment }) => ({ ...appointment, visitReason: complaintEnc ? decryptJson<{ text?: string }>(complaintEnc).text ?? null : null })),
    clinicAppointments,
    fitnessPlans,
    coachFitnessPlans,
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

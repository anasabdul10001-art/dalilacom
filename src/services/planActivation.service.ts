import { randomBytes, randomInt } from "crypto";
import { Prisma, ServiceKind } from "@prisma/client";

/** Gives the account the access that goes with a plan until [endsAt] (membership card, responder, shop plan). */
export async function activatePlan(tx: Prisma.TransactionClient, userId: string, planId: string, service: ServiceKind, endsAt: Date) {
  const existing = await tx.membership.findFirst({ where: { userId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" } });
  if (service === "MEMBERSHIP") {
    if (existing) await tx.membership.update({ where: { id: existing.id }, data: { planId, status: "ACTIVE", endDate: endsAt, isTrial: false } });
    else await tx.membership.create({ data: { userId, planId, memberNumber: `DLK-${randomInt(1_000_000_000, 9_999_999_999)}`, qrSecret: randomBytes(32).toString("hex"), startDate: new Date(), endDate: endsAt } });
    return;
  }
  if (service === "RESPONDER_CUSTOMER" || service === "RESPONDER_MERCHANT") {
    await tx.responderSubscription.upsert({ where: { userId }, create: { userId, status: "ACTIVE", periodEnd: endsAt, aiPeriodStart: new Date(), aiRepliesUsed: 0 }, update: { status: "ACTIVE", periodEnd: endsAt, aiPeriodStart: new Date(), aiRepliesUsed: 0 } });
    return;
  }
  if (service === "MERCHANT_ACCOUNT") {
    const merchant = await tx.merchantProfile.findUnique({ where: { userId }, select: { id: true } });
    if (merchant) await tx.merchantProfile.update({ where: { userId }, data: { planId, planEndsAt: endsAt } });
    else await tx.marketplaceSubscription.upsert({ where: { userId }, create: { userId, planId, endsAt }, update: { planId, endsAt } });
  }
}

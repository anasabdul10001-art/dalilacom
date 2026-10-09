import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateCurrentCode, findMatchingTimeStep } from "../services/qr.service";
import { isMembershipActive } from "../services/membership.service";
import { recordAffiliateCommissionIfReferred } from "../services/affiliate.service";
import { notify } from "../services/notification.service";
import { qrRedeemRateLimiter, qrVerifyRateLimiter } from "../middleware/rateLimit";
import { discountScopeInfo, liveDiscountWhere, memberUse } from "../lib/discounts";

export const qrRouter = Router();

// Customer: fetch the current rotating code for their own digital card (section 19/62)
qrRouter.get("/mine", requireAuth, async (req, res) => {
  const membership = await prisma.membership.findFirst({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  if (!membership || !isMembershipActive(membership)) {
    return sendError(res, 404, "NOT_FOUND", "No active membership");
  }

  const { code, expiresInSeconds } = generateCurrentCode(membership.qrSecret);
  res.json({ memberNumber: membership.memberNumber, code, expiresInSeconds });
});

const scanSchema = z.object({
  memberNumber: z.string(),
  code: z.string().length(6),
});

async function resolveVerifiedMembership(memberNumber: string, code: string) {
  const membership = await prisma.membership.findUnique({
    where: { memberNumber },
    include: { user: true },
  });
  if (!membership || !isMembershipActive(membership)) {
    return { error: "Membership not found or inactive" as const };
  }
  const matchedStep = findMatchingTimeStep(membership.qrSecret, code, membership.lastRedeemedTimeStep);
  if (matchedStep === null) {
    return { error: "Invalid or expired code" as const };
  }
  return { membership, matchedStep };
}

// Merchant: step 1 — scan & verify (read-only, section 20 "MEMBER VERIFIED")
qrRouter.post("/verify", qrVerifyRateLimiter, requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant || merchant.approvalStatus !== "APPROVED") {
    return sendError(res, 403, "FORBIDDEN", "Merchant not approved");
  }

  const result = await resolveVerifiedMembership(parsed.data.memberNumber, parsed.data.code);
  if ("error" in result) {
    return sendError(res, 400, "BAD_REQUEST", result.error ?? "Bad request");
  }

  // every discount the shop has running, with what this member may still take of each (the shop picks one to apply)
  const live = await prisma.discount.findMany({ where: { merchantId: merchant.id, ...liveDiscountWhere() }, orderBy: { percent: "desc" } });
  const scopeOf = await discountScopeInfo(live);
  const discounts = await Promise.all(live.map(async (d) => {
    const use = await memberUse(d, result.membership.id);
    return { id: d.id, title: d.title, percent: d.percent, description: d.description, endDate: d.endDate, eligible: use.eligible, usedByMember: use.used, remainingForMember: use.remaining, ...scopeOf(d) };
  }));
  const best = discounts.find((d) => d.eligible) ?? null;

  res.json({
    verified: true,
    member: { fullName: result.membership.user.fullName, memberNumber: result.membership.memberNumber },
    discount: best ? { id: best.id, title: best.title, percent: best.percent } : null, // what older apps show
    discounts,
  });
});

const redeemSchema = z.object({
  memberNumber: z.string(),
  code: z.string().length(6),
  billAmountCents: z.number().int().positive(),
  discountId: z.string().uuid().optional(), // which of the shop's running discounts to apply (the best one for the member when omitted)
});

// Merchant: step 2 — enter bill amount & confirm (section 20 "Confirm Discount")
qrRouter.post("/redeem", qrRedeemRateLimiter, requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant || merchant.approvalStatus !== "APPROVED") {
    return sendError(res, 403, "FORBIDDEN", "Merchant not approved");
  }

  const result = await resolveVerifiedMembership(parsed.data.memberNumber, parsed.data.code);
  if ("error" in result) {
    return sendError(res, 400, "BAD_REQUEST", result.error ?? "Bad request");
  }
  const { membership, matchedStep } = result;

  const live = await prisma.discount.findMany({ where: { merchantId: merchant.id, ...liveDiscountWhere() }, orderBy: { percent: "desc" } });
  let discount: (typeof live)[number] | null = live[0] ?? null;
  if (parsed.data.discountId) {
    discount = live.find((d) => d.id === parsed.data.discountId) ?? null;
    if (!discount) return sendError(res, 400, "BAD_REQUEST", "هذا الحسم غير متاح حاليًا");
  } else if (live.length) {
    // the best discount this member may still take
    discount = null;
    for (const d of live) if ((await memberUse(d, membership.id)).eligible) { discount = d; break; }
  }
  if (live.length && (!discount || !(await memberUse(discount, membership.id)).eligible)) {
    return sendError(res, 409, "LIMIT_REACHED", "هذا الزبون استنفد حد هذا الحسم");
  }

  const percent = discount?.percent ?? 0;
  const { billAmountCents } = parsed.data;
  const discountAmountCents = Math.round((billAmountCents * percent) / 100);
  const finalAmountCents = billAmountCents - discountAmountCents;

  const transaction = await prisma.$transaction(async (tx) => {
    // Re-check under transaction to close the race between two concurrent redeem calls
    // for the same still-valid code.
    const fresh = await tx.membership.findUnique({ where: { id: membership.id } });
    if (!fresh || fresh.lastRedeemedTimeStep !== null && matchedStep <= fresh.lastRedeemedTimeStep) {
      throw new Error("CODE_ALREADY_REDEEMED");
    }
    // the limits are checked again inside the transaction, so two scans at the same moment cannot both pass
    if (discount && (discount.perCustomerLimit !== null || discount.maxCustomers !== null)) {
      const mine = await tx.discountTransaction.count({ where: { discountId: discount.id, membershipId: membership.id } });
      if (discount.perCustomerLimit !== null && mine >= discount.perCustomerLimit) throw new Error("LIMIT_REACHED");
      if (discount.maxCustomers !== null && mine === 0) {
        const people = await tx.discountTransaction.groupBy({ by: ["membershipId"], where: { discountId: discount.id } });
        if (people.length >= discount.maxCustomers) throw new Error("LIMIT_REACHED");
      }
    }
    await tx.membership.update({
      where: { id: membership.id },
      data: { lastRedeemedTimeStep: matchedStep },
    });
    const created = await tx.discountTransaction.create({
      data: {
        membershipId: membership.id,
        merchantId: merchant.id,
        discountId: discount?.id,
        billAmountCents,
        discountPercent: percent,
        discountAmountCents,
        finalAmountCents,
      },
    });
    await recordAffiliateCommissionIfReferred(
      tx,
      merchant.id,
      membership.userId,
      "DISCOUNT_TRANSACTION",
      created.id,
      created.finalAmountCents,
    );
    return created;
  }).catch((err) => {
    if (err instanceof Error && err.message === "CODE_ALREADY_REDEEMED") return null;
    if (err instanceof Error && err.message === "LIMIT_REACHED") return "LIMIT" as const;
    throw err;
  });

  if (transaction === "LIMIT") return sendError(res, 409, "LIMIT_REACHED", "هذا الزبون استنفد حد هذا الحسم");
  if (!transaction) {
    return sendError(res, 409, "CONFLICT", "This code was already redeemed");
  }

  // The member is told their discount went through (section 13). After the transaction, so a
  // notification problem can never undo a completed discount.
  await notify({
    userId: membership.userId,
    type: "DISCOUNT_RECEIVED",
    title: `تم تطبيق الحسم عند ${merchant.businessName} 🎉`,
    body: `نسبة الحسم ${transaction.discountPercent}% — المبلغ النهائي بعد الحسم صار جاهز على الفاتورة.`,
    data: {
      transactionRef: transaction.transactionRef,
      merchantId: merchant.id,
      discountPercent: transaction.discountPercent,
      finalAmountCents: transaction.finalAmountCents,
    },
  });

  res.status(201).json({
    transactionRef: transaction.transactionRef,
    billAmountCents: transaction.billAmountCents,
    discountPercent: transaction.discountPercent,
    discountAmountCents: transaction.discountAmountCents,
    finalAmountCents: transaction.finalAmountCents,
    createdAt: transaction.createdAt,
  });
});

// Customer: discount history (section 34 "عند الزبون: سجل حسوماته الخاص")
qrRouter.get("/transactions/mine", requireAuth, async (req, res) => {
  const memberships = await prisma.membership.findMany({ where: { userId: req.user!.id }, select: { id: true } });
  const transactions = await prisma.discountTransaction.findMany({
    where: { membershipId: { in: memberships.map((m) => m.id) } },
    include: { merchant: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(transactions);
});

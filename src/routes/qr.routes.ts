import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateCurrentCode, findMatchingTimeStep } from "../services/qr.service";
import { isMembershipActive } from "../services/membership.service";
import { recordAffiliateCommissionIfReferred } from "../services/affiliate.service";
import { qrRedeemRateLimiter, qrVerifyRateLimiter } from "../middleware/rateLimit";

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

  const discount = await prisma.discount.findFirst({
    where: { merchantId: merchant.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    verified: true,
    member: { fullName: result.membership.user.fullName, memberNumber: result.membership.memberNumber },
    discount: discount ? { id: discount.id, title: discount.title, percent: discount.percent } : null,
  });
});

const redeemSchema = z.object({
  memberNumber: z.string(),
  code: z.string().length(6),
  billAmountCents: z.number().int().positive(),
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

  const discount = await prisma.discount.findFirst({
    where: { merchantId: merchant.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

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
    throw err;
  });

  if (!transaction) {
    return sendError(res, 409, "CONFLICT", "This code was already redeemed");
  }

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

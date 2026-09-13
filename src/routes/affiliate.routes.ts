import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { CommissionType, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const affiliateRouter = Router();

const REFERRAL_ATTRIBUTION_DAYS = 30;

async function getOwnApprovedMerchant(userId: string) {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId } });
  if (!merchant) return { error: "Merchant profile not found" as const };
  if (merchant.approvalStatus !== "APPROVED") return { error: "Merchant is not approved yet" as const };
  return { merchant };
}

function generateReferralCode(): string {
  return `AFF-${crypto.randomBytes(4).toString("hex")}`;
}

const addAffiliateSchema = z.object({
  userEmail: z.string().email(),
  commissionType: z.nativeEnum(CommissionType),
  commissionValue: z.number().int().positive(),
});

// Merchant: add an existing app user to their own affiliate/marketer team (section: merchant-run
// affiliate program — distinct from any platform-wide affiliate system).
affiliateRouter.post("/", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = addAffiliateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await getOwnApprovedMerchant(req.user!.id);
  if ("error" in result) {
    return res.status(403).json({ error: result.error });
  }

  if (parsed.data.commissionType === "PERCENT" && parsed.data.commissionValue > 100) {
    return res.status(400).json({ error: "Percent commission can't exceed 100" });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.userEmail } });
  if (!user) {
    return res.status(404).json({ error: "No user with that email" });
  }

  const existing = await prisma.merchantAffiliate.findUnique({
    where: { merchantId_userId: { merchantId: result.merchant.id, userId: user.id } },
  });
  if (existing) {
    return res.status(409).json({ error: "This user is already one of your affiliates" });
  }

  const affiliate = await prisma.merchantAffiliate.create({
    data: {
      merchantId: result.merchant.id,
      userId: user.id,
      commissionType: parsed.data.commissionType,
      commissionValue: parsed.data.commissionValue,
      referralCode: generateReferralCode(),
    },
  });
  res.status(201).json(affiliate);
});

// Merchant: their own affiliate roster with performance stats.
affiliateRouter.get("/", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return res.status(404).json({ error: "Merchant profile not found" });
  }

  const affiliates = await prisma.merchantAffiliate.findMany({
    where: { merchantId: merchant.id },
    include: { user: { select: { fullName: true, email: true } }, _count: { select: { referrals: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totals = await prisma.affiliateCommission.groupBy({
    by: ["merchantAffiliateId"],
    where: { merchantAffiliateId: { in: affiliates.map((a) => a.id) } },
    _sum: { commissionCents: true },
  });
  const totalByAffiliate = new Map(totals.map((t) => [t.merchantAffiliateId, t._sum.commissionCents ?? 0]));

  res.json(
    affiliates.map((a) => ({
      id: a.id,
      user: a.user,
      commissionType: a.commissionType,
      commissionValue: a.commissionValue,
      referralCode: a.referralCode,
      isActive: a.isActive,
      referredCount: a._count.referrals,
      totalCommissionCents: totalByAffiliate.get(a.id) ?? 0,
    })),
  );
});

const updateAffiliateSchema = z.object({
  commissionType: z.nativeEnum(CommissionType).optional(),
  commissionValue: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

// Merchant: adjust a commission rate or deactivate an affiliate (kept, not deleted — their
// history of referrals/commissions must stay intact).
affiliateRouter.patch("/:id", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = updateAffiliateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (parsed.data.commissionType === "PERCENT" && (parsed.data.commissionValue ?? 0) > 100) {
    return res.status(400).json({ error: "Percent commission can't exceed 100" });
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const existing = await prisma.merchantAffiliate.findUnique({ where: { id: req.params.id } });
  if (!merchant || !existing || existing.merchantId !== merchant.id) {
    return res.status(404).json({ error: "Affiliate not found" });
  }

  const updated = await prisma.merchantAffiliate.update({ where: { id: existing.id }, data: parsed.data });
  res.json(updated);
});

const clickSchema = z.object({
  productId: z.string().uuid(),
  code: z.string(),
});

// Any signed-in user: opening a product through an affiliate's referral link. Records the
// referral only if this customer doesn't already have a live (non-expired) one for this
// merchant — first click wins, no overriding an active referral.
affiliateRouter.post("/click", requireAuth, async (req, res) => {
  const parsed = clickSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { productId, code } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const affiliate = await prisma.merchantAffiliate.findUnique({ where: { referralCode: code } });
  if (!affiliate || !affiliate.isActive || affiliate.merchantId !== product.merchantId) {
    return res.status(404).json({ error: "Invalid referral code" });
  }

  const existing = await prisma.affiliateReferral.findUnique({
    where: { merchantId_customerId: { merchantId: product.merchantId, customerId: req.user!.id } },
  });
  if (existing && existing.expiresAt.getTime() >= Date.now()) {
    return res.json({ tracked: false, reason: "Already referred to this merchant" });
  }

  const expiresAt = new Date(Date.now() + REFERRAL_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000);
  if (existing) {
    await prisma.affiliateReferral.update({
      where: { id: existing.id },
      data: { merchantAffiliateId: affiliate.id, productId, expiresAt },
    });
  } else {
    await prisma.affiliateReferral.create({
      data: { merchantAffiliateId: affiliate.id, merchantId: product.merchantId, customerId: req.user!.id, productId, expiresAt },
    });
  }
  res.status(201).json({ tracked: true, expiresAt });
});

// Customer: every merchant I'm an affiliate for, with my own code/link and performance.
affiliateRouter.get("/mine", requireAuth, async (req, res) => {
  const affiliates = await prisma.merchantAffiliate.findMany({
    where: { userId: req.user!.id },
    include: { merchant: { select: { id: true, businessName: true } }, _count: { select: { referrals: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totals = await prisma.affiliateCommission.groupBy({
    by: ["merchantAffiliateId"],
    where: { merchantAffiliateId: { in: affiliates.map((a) => a.id) } },
    _sum: { commissionCents: true },
  });
  const totalByAffiliate = new Map(totals.map((t) => [t.merchantAffiliateId, t._sum.commissionCents ?? 0]));

  res.json(
    affiliates.map((a) => ({
      id: a.id,
      merchant: a.merchant,
      commissionType: a.commissionType,
      commissionValue: a.commissionValue,
      referralCode: a.referralCode,
      isActive: a.isActive,
      referredCount: a._count.referrals,
      totalCommissionCents: totalByAffiliate.get(a.id) ?? 0,
    })),
  );
});

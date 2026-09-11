import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const merchantRouter = Router();

const registerMerchantSchema = z.object({
  businessName: z.string().min(2),
  category: z.string().min(2),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
});

// A regular user turns their account into a merchant account (pending admin approval — section 63)
merchantRouter.post("/register", requireAuth, async (req, res) => {
  const parsed = registerMerchantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (existing) {
    return res.status(409).json({ error: "Merchant profile already exists" });
  }

  const merchant = await prisma.$transaction(async (tx) => {
    const profile = await tx.merchantProfile.create({
      data: { userId: req.user!.id, ...parsed.data },
    });
    await tx.user.update({ where: { id: req.user!.id }, data: { role: Role.MERCHANT } });
    return profile;
  });

  res.status(201).json({
    id: merchant.id,
    businessName: merchant.businessName,
    approvalStatus: merchant.approvalStatus,
  });
});

merchantRouter.get("/me", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { userId: req.user!.id },
    include: { discounts: true },
  });
  if (!merchant) {
    return res.status(404).json({ error: "Merchant profile not found" });
  }
  res.json(merchant);
});

// Admin: list merchants awaiting manual review (section 14/63)
merchantRouter.get("/pending", requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  const pending = await prisma.merchantProfile.findMany({
    where: { approvalStatus: "PENDING" },
    include: { user: { select: { email: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(pending);
});

merchantRouter.post("/:id/approve", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const merchant = await prisma.merchantProfile.update({
    where: { id: req.params.id },
    data: { approvalStatus: "APPROVED", rejectionReason: null },
  });
  res.json({ id: merchant.id, approvalStatus: merchant.approvalStatus });
});

const rejectSchema = z.object({ reason: z.string().min(3) });

merchantRouter.post("/:id/reject", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const merchant = await prisma.merchantProfile.update({
    where: { id: req.params.id },
    data: { approvalStatus: "REJECTED", rejectionReason: parsed.data.reason },
  });
  res.json({ id: merchant.id, approvalStatus: merchant.approvalStatus, rejectionReason: merchant.rejectionReason });
});

const createDiscountSchema = z.object({
  title: z.string().min(2),
  percent: z.number().int().min(1).max(100),
});

merchantRouter.post("/discounts", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = createDiscountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return res.status(404).json({ error: "Merchant profile not found" });
  }
  if (merchant.approvalStatus !== "APPROVED") {
    return res.status(403).json({ error: "Merchant is not approved yet" });
  }

  const discount = await prisma.discount.create({
    data: { merchantId: merchant.id, title: parsed.data.title, percent: parsed.data.percent },
  });
  res.status(201).json(discount);
});

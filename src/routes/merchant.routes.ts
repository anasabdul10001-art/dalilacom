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
    isApproved: merchant.isApproved,
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

// Admin-only approval — placeholder until the real admin dashboard exists (section 14/63)
merchantRouter.post("/:id/approve", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const merchant = await prisma.merchantProfile.update({
    where: { id: req.params.id },
    data: { isApproved: true },
  });
  res.json({ id: merchant.id, isApproved: merchant.isApproved });
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
  if (!merchant.isApproved) {
    return res.status(403).json({ error: "Merchant is not approved yet" });
  }

  const discount = await prisma.discount.create({
    data: { merchantId: merchant.id, title: parsed.data.title, percent: parsed.data.percent },
  });
  res.status(201).json(discount);
});

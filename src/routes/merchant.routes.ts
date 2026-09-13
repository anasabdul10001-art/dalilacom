import { Router } from "express";
import { z } from "zod";
import { MerchantApprovalStatus, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const merchantRouter = Router();

const registerMerchantSchema = z.object({
  businessName: z.string().min(2),
  categoryId: z.string().uuid(),
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

  const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) {
    return res.status(404).json({ error: "Category not found" });
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

const listMerchantsAdminSchema = z.object({
  status: z.nativeEnum(MerchantApprovalStatus).optional(),
});

// Admin: every merchant regardless of status, for the admin dashboard (section 14)
merchantRouter.get("/list", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = listMerchantsAdminSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const merchants = await prisma.merchantProfile.findMany({
    where: parsed.data.status ? { approvalStatus: parsed.data.status } : {},
    include: { user: { select: { email: true, fullName: true } }, category: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(merchants);
});

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const searchMerchantsSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().optional(),
});

// Public: browse/search approved merchants (section 9/10/11 — discovery by category, name, and location)
merchantRouter.get("/", async (req, res) => {
  const parsed = searchMerchantsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { q, categoryId, lat, lng, radiusKm } = parsed.data;

  const merchants = await prisma.merchantProfile.findMany({
    where: {
      approvalStatus: "APPROVED",
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { businessName: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { category: true, discounts: { where: { isActive: true } } },
  });

  // Nearest-first sorting when the customer's location is known (section 31 "Radius Selector").
  // Done in the app layer rather than PostGIS for now — fine at this data volume, revisit later.
  if (lat !== undefined && lng !== undefined) {
    const withDistance = merchants
      .filter((m) => m.latitude !== null && m.longitude !== null)
      .map((m) => ({ ...m, distanceKm: haversineDistanceKm(lat, lng, m.latitude!, m.longitude!) }))
      .filter((m) => radiusKm === undefined || m.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return res.json(withDistance);
  }

  res.json(merchants);
});

// Public: a merchant's storefront profile (section 8)
merchantRouter.get("/:id", async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: req.params.id },
    include: { category: true, discounts: { where: { isActive: true } } },
  });
  if (!merchant || merchant.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Merchant not found" });
  }
  res.json(merchant);
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

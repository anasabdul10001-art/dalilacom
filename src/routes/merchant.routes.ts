import { Router } from "express";
import { z } from "zod";
import { MerchantApprovalStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { ownerProfileSelect, withOwnerProfile } from "../lib/profile";
import { resolveLanguage } from "../lib/languages";
import { categoryAndDescendantIds, categoryNameLocalizer, searchCategories } from "../services/category.service";
import { requireAuth, requireRole } from "../middleware/auth";
import { createBusinessFromMerchantProfile } from "../services/business.service";
import { getDefaultCountry } from "../services/geo.service";
import { computeOpenStatus, openingHoursSchema } from "../services/hours.service";

export const merchantRouter = Router();

const coordinates = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};
const bothOrNeitherCoordinate = (d: { latitude?: number | null; longitude?: number | null }) =>
  (d.latitude === undefined || d.latitude === null) === (d.longitude === undefined || d.longitude === null);

const registerMerchantSchema = z
  .object({
    businessName: z.string().min(2),
    categoryId: z.string().uuid(),
    address: z.string().optional(),
    ...coordinates,
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
  })
  .refine(bothOrNeitherCoordinate, { message: "latitude and longitude must be provided together" });

// A regular user turns their account into a merchant account (pending admin approval — section 63)
merchantRouter.post("/register", requireAuth, async (req, res) => {
  const parsed = registerMerchantSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const existing = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (existing) {
    return sendError(res, 409, "CONFLICT", "Merchant profile already exists");
  }

  const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) {
    return sendError(res, 404, "NOT_FOUND", "Category not found");
  }

  // Read outside the transaction (just a lookup) — the write itself, including the new
  // Business/Branch dual-write, stays atomic with the legacy MerchantProfile creation below
  // (section: Backfill / Compatibility Layer — every new registration builds both structures
  // from day one, so there's nothing left to backfill once this ships).
  const defaultCountry = await getDefaultCountry();

  const merchant = await prisma.$transaction(async (tx) => {
    const profile = await tx.merchantProfile.create({
      data: { userId: req.user!.id, ...parsed.data },
    });
    await tx.user.update({ where: { id: req.user!.id }, data: { role: Role.MERCHANT } });
    await createBusinessFromMerchantProfile(tx, profile, defaultCountry.id);
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
    include: { discounts: true, _count: { select: { products: true } }, user: ownerProfileSelect },
  });
  if (!merchant) {
    return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  }
  const { _count, ...profile } = withOwnerProfile(merchant);
  // What still stands between this merchant and being found on the map — drives the setup checklist.
  res.json({
    ...profile,
    onboarding: {
      approved: merchant.approvalStatus === "APPROVED",
      location: merchant.latitude !== null && merchant.longitude !== null,
      hours: computeOpenStatus(merchant.openingHours, "UTC").hasHours,
      discount: merchant.discounts.some((d) => d.isActive),
      product: _count.products > 0,
    },
  });
});

const updateMerchantSchema = z
  .object({
    businessName: z.string().min(2).optional(),
    categoryId: z.string().uuid().optional(),
    address: z.string().max(200).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    whatsapp: z.string().max(40).nullable().optional(),
  })
  .refine(bothOrNeitherCoordinate, { message: "latitude and longitude must be provided together" });

// Merchant: edit the public listing (name, category, address, pin on the map, contacts). The mirrored
// Business/main Branch rows from the Phase 1B dual-write are kept in step in the same transaction.
merchantRouter.patch("/me", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = updateMerchantSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  if (parsed.data.categoryId && !(await prisma.category.findUnique({ where: { id: parsed.data.categoryId } }))) {
    return sendError(res, 404, "NOT_FOUND", "Category not found");
  }
  const data = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.merchantProfile.update({ where: { id: existing.id }, data });
    await tx.business.updateMany({
      where: { legacyMerchantProfileId: existing.id },
      data: {
        ...(data.businessName ? { name: data.businessName } : {}),
        ...(data.categoryId ? { categoryId: data.categoryId } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude, longitude: data.longitude } : {}),
      },
    });
    if (data.latitude !== undefined || data.phone !== undefined || data.whatsapp !== undefined || data.businessName) {
      await tx.branch.updateMany({
        where: { isMain: true, business: { legacyMerchantProfileId: existing.id } },
        data: {
          ...(data.businessName ? { name: data.businessName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp } : {}),
          ...(data.latitude !== undefined ? { latitude: data.latitude, longitude: data.longitude } : {}),
        },
      });
    }
    return profile;
  });
  res.json(updated);
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
    return sendValidationError(res, parsed.error);
  }
  const merchants = await prisma.merchantProfile.findMany({
    where: parsed.data.status ? { approvalStatus: parsed.data.status } : {},
    include: { user: { select: { email: true, fullName: true } }, category: true, plan: { select: { id: true, name: true, monthlyBroadcastLimit: true } } },
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
  openNow: z.enum(["true", "false"]).optional(),
  // "Search this area": only merchants inside the map's visible rectangle.
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
});

/** Opening hours are evaluated in the platform's (default country's) timezone. */
async function platformTimeZone() {
  return (await getDefaultCountry()).timezone ?? "UTC";
}

// Public: browse/search approved merchants (section 9/10/11 — discovery by category, name, and location)
merchantRouter.get("/", async (req, res) => {
  const parsed = searchMerchantsSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }
  const { q, categoryId, lat, lng, radiusKm, openNow, minLat, maxLat, minLng, maxLng } = parsed.data;
  const hasBox = minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined;

  // Picking "doctors" must show every specialty under it; typing "dentist" / "اسنان" must reach the
  // specialty (and everything beneath it) even when no shop has that word in its own name.
  const categoryIds = categoryId ? await categoryAndDescendantIds(categoryId) : undefined;
  const matchedCategoryIds = q
    ? (await Promise.all((await searchCategories(q, resolveLanguage(req), 4)).filter((c) => c.score >= 60).map((c) => categoryAndDescendantIds(c.id)))).flat()
    : [];

  const found = await prisma.merchantProfile.findMany({
    where: {
      approvalStatus: "APPROVED",
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: "insensitive" } },
              { category: { name: { contains: q, mode: "insensitive" } } },
              { address: { contains: q, mode: "insensitive" } },
              ...(matchedCategoryIds.length ? [{ categoryId: { in: matchedCategoryIds } }] : []),
            ],
          }
        : {}),
      ...(hasBox ? { latitude: { gte: minLat, lte: maxLat }, longitude: { gte: minLng, lte: maxLng } } : {}),
    },
    include: { category: true, discounts: { where: { isActive: true } }, user: ownerProfileSelect },
  });

  const tz = await platformTimeZone();
  const now = new Date();
  const localize = await categoryNameLocalizer(resolveLanguage(req));
  let merchants = found.map((m) => localize({ ...withOwnerProfile(m), openStatus: computeOpenStatus(m.openingHours, tz, now) }));
  if (openNow === "true") merchants = merchants.filter((m) => m.openStatus.isOpen);

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

// Public: type-ahead for the search box — a few matching merchants and categories.
merchantRouter.get("/suggest", async (req, res) => {
  const parsed = z.object({ q: z.string().trim().min(1).max(60) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { q } = parsed.data;
  const [merchants, categories] = await Promise.all([
    prisma.merchantProfile.findMany({
      where: { approvalStatus: "APPROVED", businessName: { contains: q, mode: "insensitive" } },
      select: { id: true, businessName: true, category: { select: { id: true, name: true } } },
      orderBy: { businessName: "asc" },
      take: 5,
    }),
    // Sections / professions / specialties, spelling-tolerant and in any language, with their breadcrumb path.
    searchCategories(q, resolveLanguage(req), 6),
  ]);
  const localize = await categoryNameLocalizer(resolveLanguage(req));
  res.json({ merchants: merchants.map(localize), categories });
});

const hoursBodySchema = z.object({ openingHours: openingHoursSchema.nullable() });

// Merchant: set (or clear, with null) their weekly opening hours.
merchantRouter.put("/me/hours", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = hoursBodySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  const updated = await prisma.merchantProfile.update({
    where: { id: merchant.id },
    data: { openingHours: parsed.data.openingHours === null ? Prisma.JsonNull : parsed.data.openingHours },
  });
  res.json({ openingHours: updated.openingHours, openStatus: computeOpenStatus(updated.openingHours, await platformTimeZone()) });
});

// Public: a merchant's storefront profile (section 8)
merchantRouter.get("/:id", async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: req.params.id },
    include: { category: true, discounts: { where: { isActive: true } }, user: ownerProfileSelect },
  });
  if (!merchant || merchant.approvalStatus !== "APPROVED") {
    return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  }
  const localize = await categoryNameLocalizer(resolveLanguage(req));
  res.json(localize({ ...withOwnerProfile(merchant), openStatus: computeOpenStatus(merchant.openingHours, await platformTimeZone()) }));
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
    return sendValidationError(res, parsed.error);
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
    return sendValidationError(res, parsed.error);
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  }
  if (merchant.approvalStatus !== "APPROVED") {
    return sendError(res, 403, "FORBIDDEN", "Merchant is not approved yet");
  }

  const discount = await prisma.discount.create({
    data: { merchantId: merchant.id, title: parsed.data.title, percent: parsed.data.percent },
  });
  res.status(201).json(discount);
});

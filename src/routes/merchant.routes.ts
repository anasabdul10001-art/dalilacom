import { Router } from "express";
import { shopStanding } from "./reviews.routes";
import { discountScopeInfo, discountState, liveDiscountWhere, peopleLeftMap, timesLeftMap } from "../lib/discounts";
import { optionalUserId } from "../services/viewerCountry.service";
import { notify } from "../services/notification.service";
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
      discount: merchant.discounts.some((d) => d.isActive && d.status !== "REJECTED"),
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
    include: { category: true, discounts: { where: liveDiscountWhere() }, user: ownerProfileSelect },
  });

  const tz = await platformTimeZone();
  const now = new Date();
  const localize = await categoryNameLocalizer(resolveLanguage(req));
  const placesLeft = await peopleLeftMap(found.flatMap((m) => m.discounts));
  let merchants = found.map((m) =>
    localize({ ...withOwnerProfile({ ...m, discounts: m.discounts.map((d) => ({ ...d, peopleLeft: placesLeft.get(d.id) ?? null })) }), openStatus: computeOpenStatus(m.openingHours, tz, now) }),
  );
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
/* ---------------- the shop's discount system ---------------- */

const discountSchema = z.object({
  title: z.string().trim().min(2).max(80),
  percent: z.number().int().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  scope: z.enum(["ALL", "SECTION", "PRODUCTS"]).default("ALL"),
  scopeSection: z.string().nullable().optional(),
  productIds: z.array(z.string().uuid()).max(30).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  maxCustomers: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(1000).nullable().optional(),
});

/** The shop that owns the request, once the admin has approved it: until then merchant mode is closed. */
async function ownApprovedShop(userId: string) {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId } });
  if (!merchant) return { merchant: null, error: [404, "NOT_FOUND", "Merchant profile not found"] as [number, string, string] };
  if (merchant.approvalStatus !== "APPROVED") return { merchant: null, error: [403, "FORBIDDEN", "محلك لسا ما انوافق عليه من الإدارة، بتقدر تستخدم وضع التاجر بعد الموافقة"] as [number, string, string] };
  return { merchant, error: null };
}

/* ---------------- shipping methods: how the shop sends orders, and what it costs ---------------- */

const shippingSchema = z.object({
  methods: z
    .array(z.object({ name: z.string().trim().min(2).max(40), costCents: z.number().int().min(0).max(100_000_00) }))
    .min(1)
    .max(8),
});

merchantRouter.get("/shipping-methods", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  const rows = await prisma.shippingMethod.findMany({ where: { merchantId: merchant.id, isActive: true }, orderBy: { createdAt: "asc" } });
  res.json(rows.map((m) => ({ id: m.id, name: m.name, costCents: m.costCents })));
});

// The whole list at once (the form sends what it shows): the shop needs at least one method.
merchantRouter.put("/shipping-methods", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = shippingSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const own = await ownApprovedShop(req.user!.id);
  if (own.error || !own.merchant) return sendError(res, own.error?.[0] ?? 404, own.error?.[1] ?? "NOT_FOUND", own.error?.[2] ?? "Not found");
  const merchantId = own.merchant.id;
  const rows = await prisma.$transaction(async (tx) => {
    await tx.shippingMethod.deleteMany({ where: { merchantId } }); // orders keep their own copy of the name and cost
    let at = Date.now();
    const created = [];
    for (const m of parsed.data.methods) created.push(await tx.shippingMethod.create({ data: { merchantId, name: m.name, costCents: m.costCents, createdAt: new Date(at++) } }));
    return created;
  });
  res.json(rows.map((m) => ({ id: m.id, name: m.name, costCents: m.costCents })));
});

/** Checks what the form chose against the shop's own data; returns the values to save or the reason it is wrong. */
async function discountTerms(merchantId: string, input: z.infer<typeof discountSchema>) {
  const start = input.startDate ? new Date(input.startDate) : null;
  const end = input.endDate ? new Date(input.endDate) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return { error: "تاريخ غير صالح" };
  if (end && end.getTime() < Date.now()) return { error: "تاريخ النهاية لازم يكون بالمستقبل" };
  if (start && end && end.getTime() <= start.getTime()) return { error: "تاريخ النهاية لازم يكون بعد البداية" };
  let productIds: string[] = [];
  const sectionName = (input.scopeSection ?? "").trim();
  if (input.scope === "SECTION" && (sectionName.length < 2 || sectionName.length > 60)) return { error: "اكتب اسم القسم (من حرفين إلى 60 حرفًا)" };
  if (input.scope === "PRODUCTS") {
    productIds = [...new Set(input.productIds ?? [])];
    const own = productIds.length ? await prisma.product.count({ where: { id: { in: productIds }, merchantId } }) : 0;
    if (productIds.length === 0 || own !== productIds.length) return { error: "اختر منتجًا واحدًا على الأقل من منتجاتك" };
  }
  return {
    data: {
      title: input.title,
      percent: input.percent,
      description: input.description || null,
      scope: input.scope,
      scopeSection: input.scope === "SECTION" ? sectionName : null,
      productIds,
      startDate: start,
      endDate: end,
      maxCustomers: input.maxCustomers ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
    },
  };
}

async function tellAdminsAboutDiscount(shopName: string, title: string, edited: boolean) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ userId: a.id, type: "SYSTEM", title: edited ? "حسم معدّل للمراجعة" : "طلب حسم جديد للمراجعة", body: `${shopName}: ${title}`, data: { kind: "DISCOUNT_REVIEW" }, email: false })));
}

merchantRouter.get("/discounts", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  const rows = await prisma.discount.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" } });
  const [usage, people] = await Promise.all([
    prisma.discountTransaction.groupBy({ by: ["discountId"], where: { merchantId: merchant.id, discountId: { not: null } }, _count: { _all: true }, _sum: { discountAmountCents: true } }),
    prisma.discountTransaction.groupBy({ by: ["discountId", "membershipId"], where: { merchantId: merchant.id, discountId: { not: null } } }),
  ]);
  const scopeOf = await discountScopeInfo(rows);
  res.json(rows.map((d) => {
    const u = usage.find((x) => x.discountId === d.id);
    return {
      id: d.id, title: d.title, percent: d.percent, description: d.description, startDate: d.startDate, endDate: d.endDate,
      maxCustomers: d.maxCustomers, perCustomerLimit: d.perCustomerLimit, isActive: d.isActive, status: d.status, rejectionReason: d.rejectionReason,
      state: discountState(d), productIds: d.productIds, scopeSection: d.scopeSection, ...scopeOf(d),
      uses: u?._count._all ?? 0, customers: people.filter((p) => p.discountId === d.id).length, savedCents: u?._sum.discountAmountCents ?? 0,
    };
  }));
});

merchantRouter.get("/:id", async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: req.params.id },
    include: { category: true, discounts: { where: liveDiscountWhere(), orderBy: { percent: "desc" } }, user: ownerProfileSelect, shippingMethods: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!merchant || merchant.approvalStatus !== "APPROVED") {
    return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  }
  const localize = await categoryNameLocalizer(resolveLanguage(req));
  const standing = await shopStanding(merchant.id); // the stars and the followers are public
  // each live discount comes with what it covers, its dates and its limits (the customer reads them on the shop page)
  const scopeOf = await discountScopeInfo(merchant.discounts);
  // and how many places are left on a discount that limits people, and how many times this person still has
  const [placesLeft, timesLeft] = await Promise.all([peopleLeftMap(merchant.discounts), timesLeftMap(await optionalUserId(req), merchant.discounts)]);
  const discounts = merchant.discounts.map((d) => ({
    id: d.id, title: d.title, percent: d.percent, description: d.description, endDate: d.endDate, perCustomerLimit: d.perCustomerLimit, maxCustomers: d.maxCustomers,
    peopleLeft: placesLeft.get(d.id) ?? null, myTimesLeft: timesLeft.get(d.id) ?? null, ...scopeOf(d),
  }));
  const shippingMethods = merchant.shippingMethods.map((m) => ({ id: m.id, name: m.name, costCents: m.costCents }));
  res.json(localize({ ...withOwnerProfile({ ...merchant, discounts, shippingMethods }), ...standing, openStatus: computeOpenStatus(merchant.openingHours, await platformTimeZone()) }));
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

merchantRouter.post("/discounts", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const own = await ownApprovedShop(req.user!.id);
  if (own.error || !own.merchant) return sendError(res, own.error?.[0] ?? 404, own.error?.[1] ?? "NOT_FOUND", own.error?.[2] ?? "Not found");
  const terms = await discountTerms(own.merchant.id, parsed.data);
  if ("error" in terms) return sendError(res, 400, "BAD_REQUEST", terms.error!);
  const discount = await prisma.discount.create({ data: { merchantId: own.merchant.id, ...terms.data } }); // waits for the admin
  await tellAdminsAboutDiscount(own.merchant.businessName, discount.title, false);
  res.status(201).json(discount);
});

const discountPatchSchema = z.object({ isActive: z.boolean().optional(), endNow: z.literal(true).optional() }).and(discountSchema.partial());

// Pause, resume or end a discount at once; changing its terms sends it to the admin again.
merchantRouter.patch("/discounts/:id", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = discountPatchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const own = await ownApprovedShop(req.user!.id);
  if (own.error || !own.merchant) return sendError(res, own.error?.[0] ?? 404, own.error?.[1] ?? "NOT_FOUND", own.error?.[2] ?? "Not found");
  const existing = await prisma.discount.findFirst({ where: { id: req.params.id, merchantId: own.merchant.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "الحسم غير موجود");
  const { isActive, endNow, ...terms } = parsed.data;
  const changesTerms = Object.keys(terms).length > 0;
  if (!changesTerms) {
    const updated = await prisma.discount.update({ where: { id: existing.id }, data: { ...(isActive !== undefined ? { isActive } : {}), ...(endNow ? { endDate: new Date(), isActive: false } : {}) } });
    return res.json(updated);
  }
  const merged = discountSchema.safeParse({
    title: existing.title, percent: existing.percent, description: existing.description, scope: existing.scope, scopeSection: existing.scopeSection, productIds: existing.productIds,
    startDate: existing.startDate?.toISOString() ?? null, endDate: existing.endDate?.toISOString() ?? null, maxCustomers: existing.maxCustomers, perCustomerLimit: existing.perCustomerLimit, ...terms,
  });
  if (!merged.success) return sendValidationError(res, merged.error);
  const checked = await discountTerms(own.merchant.id, merged.data);
  if ("error" in checked) return sendError(res, 400, "BAD_REQUEST", checked.error!);
  const updated = await prisma.discount.update({ where: { id: existing.id }, data: { ...checked.data, status: "PENDING", rejectionReason: null, ...(isActive !== undefined ? { isActive } : {}) } });
  await tellAdminsAboutDiscount(own.merchant.businessName, updated.title, true);
  res.json(updated);
});

merchantRouter.delete("/discounts/:id", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const own = await ownApprovedShop(req.user!.id);
  if (own.error || !own.merchant) return sendError(res, own.error?.[0] ?? 404, own.error?.[1] ?? "NOT_FOUND", own.error?.[2] ?? "Not found");
  const existing = await prisma.discount.findFirst({ where: { id: req.params.id, merchantId: own.merchant.id }, include: { _count: { select: { discountTransactions: true } } } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "الحسم غير موجود");
  // one that was already used stays in the history (switched off); one that never was is simply removed
  if (existing._count.discountTransactions > 0) await prisma.discount.update({ where: { id: existing.id }, data: { isActive: false } });
  else await prisma.discount.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

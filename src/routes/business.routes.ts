import { Router } from "express";
import { z } from "zod";
import { BranchStatus, BusinessMemberRole, BusinessStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { InvalidGeoSelectionError, validateGeoSelection } from "../services/geo.service";
import { NotBusinessMemberError, requireBusinessMember } from "../services/business.service";

export const businessRouter = Router();

function handleMembershipError(res: any, err: unknown) {
  if (err instanceof NotBusinessMemberError) return sendError(res, 403, "FORBIDDEN", err.message);
  throw err;
}

/* ---------------- business ---------------- */

const geoFieldsSchema = z.object({
  countryId: z.string().uuid(),
  regionId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const businessSchema = geoFieldsSchema.extend({
  name: z.string().min(2),
  legalName: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
});

// A user can own/work at more than one Business (section: Business Ownership) — this is the
// go-forward creation path alongside the legacy /merchant/register, which keeps working as-is.
businessRouter.post("/", requireAuth, async (req, res) => {
  const parsed = businessSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  try {
    await validateGeoSelection(parsed.data);
  } catch (err) {
    if (err instanceof InvalidGeoSelectionError) return sendError(res, 400, "INVALID_GEO_SELECTION", err.message);
    throw err;
  }
  if (parsed.data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) return sendError(res, 404, "NOT_FOUND", "Category not found");
  }

  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.business.create({ data: { ...parsed.data, status: BusinessStatus.DRAFT } });
    await tx.businessMember.create({ data: { businessId: created.id, userId: req.user!.id, role: BusinessMemberRole.OWNER } });
    return created;
  });
  res.status(201).json(business);
});

// Every business the caller is an active member of, across any businesses (section: multiple
// Businesses for same User).
businessRouter.get("/mine", requireAuth, async (req, res) => {
  const memberships = await prisma.businessMember.findMany({
    where: { userId: req.user!.id, status: "ACTIVE" },
    include: { business: { include: { category: true, _count: { select: { branches: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(memberships.map((m) => ({ role: m.role, business: m.business })));
});

businessRouter.get("/:id", async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { id: req.params.id },
    include: { category: true, branches: { where: { status: "ACTIVE" } } },
  });
  if (!business) return sendError(res, 404, "NOT_FOUND", "Business not found");
  if (business.status !== "ACTIVE") {
    // Non-public statuses (DRAFT/SUSPENDED/CLOSED/ARCHIVED) are only visible to members.
    const auth = req.headers.authorization;
    if (!auth) return sendError(res, 404, "NOT_FOUND", "Business not found");
  }
  res.json(business);
});

const updateBusinessSchema = businessSchema.partial();

businessRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateBusinessSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const existing = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Business not found");
  try {
    await requireBusinessMember(existing.id, req.user!.id, ["OWNER", "MANAGER"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  const merged = {
    countryId: parsed.data.countryId ?? existing.countryId,
    regionId: parsed.data.regionId !== undefined ? parsed.data.regionId : existing.regionId,
    cityId: parsed.data.cityId !== undefined ? parsed.data.cityId : existing.cityId,
    areaId: parsed.data.areaId !== undefined ? parsed.data.areaId : existing.areaId,
  };
  try {
    await validateGeoSelection(merged);
  } catch (err) {
    if (err instanceof InvalidGeoSelectionError) return sendError(res, 400, "INVALID_GEO_SELECTION", err.message);
    throw err;
  }

  const business = await prisma.business.update({ where: { id: existing.id }, data: parsed.data });
  res.json(business);
});

const ALLOWED_BUSINESS_TRANSITIONS: Record<BusinessStatus, BusinessStatus[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

const statusSchema = z.object({ status: z.nativeEnum(BusinessStatus) });

businessRouter.patch("/:id/status", requireAuth, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const existing = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Business not found");
  try {
    await requireBusinessMember(existing.id, req.user!.id, ["OWNER"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  if (!ALLOWED_BUSINESS_TRANSITIONS[existing.status].includes(parsed.data.status)) {
    return sendError(res, 409, "CONFLICT", `Cannot move a business from ${existing.status} to ${parsed.data.status}`);
  }
  const business = await prisma.business.update({ where: { id: existing.id }, data: { status: parsed.data.status } });
  res.json(business);
});

/* ---------------- members ---------------- */

businessRouter.get("/:id/members", requireAuth, async (req, res) => {
  try {
    await requireBusinessMember(req.params.id, req.user!.id);
  } catch (err) {
    return handleMembershipError(res, err);
  }
  const members = await prisma.businessMember.findMany({
    where: { businessId: req.params.id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(members);
});

const addMemberSchema = z.object({
  userEmail: z.string().email(),
  role: z.nativeEnum(BusinessMemberRole).default("STAFF"),
});

businessRouter.post("/:id/members", requireAuth, async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const business = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!business) return sendError(res, 404, "NOT_FOUND", "Business not found");
  try {
    await requireBusinessMember(business.id, req.user!.id, ["OWNER"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.userEmail } });
  if (!user) return sendError(res, 404, "NOT_FOUND", "No user with that email");

  try {
    const member = await prisma.businessMember.create({
      data: { businessId: business.id, userId: user.id, role: parsed.data.role },
    });
    res.status(201).json(member);
  } catch (err: any) {
    if (err?.code === "P2002") return sendError(res, 409, "CONFLICT", "This user is already a member of this business");
    throw err;
  }
});

/* ---------------- branches ---------------- */

const branchSchema = geoFieldsSchema.extend({
  name: z.string().min(1),
  code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().optional(),
});

// A Business can have 0..N branches — nothing here makes a branch mandatory (section: Business
// Without Physical Branch).
businessRouter.post("/:id/branches", requireAuth, async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const business = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!business) return sendError(res, 404, "NOT_FOUND", "Business not found");
  try {
    await requireBusinessMember(business.id, req.user!.id, ["OWNER", "MANAGER"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  try {
    await validateGeoSelection(parsed.data);
  } catch (err) {
    if (err instanceof InvalidGeoSelectionError) return sendError(res, 400, "INVALID_GEO_SELECTION", err.message);
    throw err;
  }

  const branch = await prisma.branch.create({ data: { ...parsed.data, businessId: business.id } });
  res.status(201).json(branch);
});

businessRouter.get("/:id/branches", async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { businessId: req.params.id, status: "ACTIVE" },
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
  });
  res.json(branches);
});

export const branchRouter = Router();

const updateBranchSchema = branchSchema.partial().extend({ status: z.nativeEnum(BranchStatus).optional() });

branchRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateBranchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const existing = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Branch not found");
  try {
    await requireBusinessMember(existing.businessId, req.user!.id, ["OWNER", "MANAGER"]);
  } catch (err) {
    return handleMembershipError(res, err);
  }

  const merged = {
    countryId: parsed.data.countryId ?? existing.countryId,
    regionId: parsed.data.regionId !== undefined ? parsed.data.regionId : existing.regionId,
    cityId: parsed.data.cityId !== undefined ? parsed.data.cityId : existing.cityId,
    areaId: parsed.data.areaId !== undefined ? parsed.data.areaId : existing.areaId,
  };
  try {
    await validateGeoSelection(merged);
  } catch (err) {
    if (err instanceof InvalidGeoSelectionError) return sendError(res, 400, "INVALID_GEO_SELECTION", err.message);
    throw err;
  }

  const branch = await prisma.branch.update({ where: { id: existing.id }, data: parsed.data });
  res.json(branch);
});

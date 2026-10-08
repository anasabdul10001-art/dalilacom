import { Router } from "express";
import { z } from "zod";
import { GeoLevel, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { currencyOf, viewerCountry } from "../services/viewerCountry.service";

export const geoRouter = Router();

/* ---------------- countries ---------------- */

// The shopper's market: their country (account, else where they connect from) and its currency, so every price is shown in it.
geoRouter.get("/market", async (req, res) => {
  const country = await viewerCountry(req);
  res.json({ country, currencyCode: await currencyOf(country) });
});

geoRouter.get("/countries", async (_req, res) => {
  res.json(await prisma.country.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
});

const countrySchema = z.object({
  name: z.string().min(1),
  nameArabic: z.string().optional(),
  nameEnglish: z.string().optional(),
  isoCode2: z.string().length(2),
  isoCode3: z.string().length(3).optional(),
  currencyCode: z.string().length(3),
  phoneCode: z.string().optional(),
  defaultLanguage: z.string().min(2).max(5).optional(),
  timezone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

// Admin-managed, never hardcoded in application logic (section: Country).
geoRouter.post("/countries", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = countrySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    const country = await prisma.country.create({
      data: { ...parsed.data, isoCode2: parsed.data.isoCode2.toUpperCase(), isoCode3: parsed.data.isoCode3?.toUpperCase() },
    });
    res.status(201).json(country);
  } catch (err: any) {
    if (err?.code === "P2002") return sendError(res, 409, "CONFLICT", "Country with this ISO code already exists");
    throw err;
  }
});

/* ---------------- geo units (Region / City / Area) ---------------- */

const listUnitsSchema = z.object({
  countryId: z.string().uuid().optional(),
  level: z.nativeEnum(GeoLevel).optional(),
  parentId: z.string().uuid().optional(),
  q: z.string().optional(),
});

// Public browse — e.g. "cities in Syria" (countryId + level=CITY) or "children of this region"
// (parentId). Powers city-selection onboarding and any future location picker.
geoRouter.get("/units", async (req, res) => {
  const parsed = listUnitsSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { countryId, level, parentId, q } = parsed.data;
  const units = await prisma.geoUnit.findMany({
    where: {
      isActive: true,
      ...(countryId ? { countryId } : {}),
      ...(level ? { level } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
  });
  res.json(units);
});

geoRouter.get("/units/:id", async (req, res) => {
  const unit = await prisma.geoUnit.findUnique({
    where: { id: req.params.id },
    include: { children: { where: { isActive: true }, orderBy: { name: "asc" } }, country: true },
  });
  if (!unit || !unit.isActive) return sendError(res, 404, "NOT_FOUND", "Geo unit not found");
  res.json(unit);
});

const createUnitSchema = z.object({
  countryId: z.string().uuid(),
  level: z.nativeEnum(GeoLevel),
  parentId: z.string().uuid().optional(),
  name: z.string().min(1),
  nameArabic: z.string().optional(),
  nameEnglish: z.string().optional(),
  code: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

// Admin-managed hierarchy creation, with structural validation that mirrors the real-world shape
// (section: Geographic Level) — a REGION has no parent, a CITY's parent (if any) must be a
// REGION in the same country, and an AREA's parent must be a CITY in the same country.
geoRouter.post("/units", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = createUnitSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { countryId, level, parentId, ...rest } = parsed.data;

  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country) return sendError(res, 404, "NOT_FOUND", "Country not found");

  if (level === "REGION" && parentId) {
    return sendError(res, 400, "INVALID_GEO_HIERARCHY", "A region cannot have a parent");
  }
  if (level !== "REGION" && parentId) {
    const parent = await prisma.geoUnit.findUnique({ where: { id: parentId } });
    const expectedParentLevel = level === "CITY" ? "REGION" : "CITY";
    if (!parent || parent.countryId !== countryId) {
      return sendError(res, 400, "INVALID_GEO_HIERARCHY", "Parent not found in the same country");
    }
    if (parent.level !== expectedParentLevel) {
      return sendError(res, 400, "INVALID_GEO_HIERARCHY", `A ${level} must have a ${expectedParentLevel} parent`);
    }
  }
  if (level === "AREA" && !parentId) {
    return sendError(res, 400, "INVALID_GEO_HIERARCHY", "An area must have a city parent");
  }

  const unit = await prisma.geoUnit.create({ data: { countryId, level, parentId, ...rest } });
  res.status(201).json(unit);
});

const updateUnitSchema = z.object({
  name: z.string().min(1).optional(),
  nameArabic: z.string().optional(),
  nameEnglish: z.string().optional(),
  code: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isActive: z.boolean().optional(),
});

// Renaming/toggling only — re-parenting or changing level/country is out of scope for this
// phase (it would ripple into every Address/Business/Branch already pointing at it).
geoRouter.patch("/units/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const parsed = updateUnitSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.geoUnit.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Geo unit not found");
  const unit = await prisma.geoUnit.update({ where: { id: existing.id }, data: parsed.data });
  res.json(unit);
});

import { Router } from "express";
import { z } from "zod";
import { AddressLabel } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { InvalidGeoSelectionError, validateGeoSelection } from "../services/geo.service";

export const addressRouter = Router();

addressRouter.get("/", requireAuth, async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user!.id },
    include: { country: true, region: true, city: true, area: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  res.json(addresses);
});

const addressSchema = z.object({
  countryId: z.string().uuid(),
  regionId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  street: z.string().optional(),
  buildingNumber: z.string().optional(),
  postalCode: z.string().optional(),
  additionalInfo: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  label: z.nativeEnum(AddressLabel).optional(),
  labelCustom: z.string().optional(),
  isDefault: z.boolean().default(false),
});

// Saved addresses (Home/Work/Other) — foundation for delivery/booking/home-services to reuse
// later (section: Saved Addresses). Not a full address-book UI, just the correct data shape.
addressRouter.post("/", requireAuth, async (req, res) => {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  try {
    await validateGeoSelection(parsed.data);
  } catch (err) {
    if (err instanceof InvalidGeoSelectionError) return sendError(res, 400, "INVALID_GEO_SELECTION", err.message);
    throw err;
  }

  const userId = req.user!.id;
  const address = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.address.create({ data: { ...parsed.data, userId } });
  });
  res.status(201).json(address);
});

const updateAddressSchema = addressSchema.partial();

addressRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateAddressSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Address not found");

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

  const userId = req.user!.id;
  const address = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true, id: { not: existing.id } }, data: { isDefault: false } });
    }
    return tx.address.update({ where: { id: existing.id }, data: parsed.data });
  });
  res.json(address);
});

addressRouter.delete("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Address not found");
  await prisma.address.delete({ where: { id: existing.id } });
  res.json({ id: existing.id });
});

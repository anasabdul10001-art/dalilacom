import { Router } from "express";
import { prisma } from "../prisma";
import { sendError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { getDefaultCountry } from "../services/geo.service";
import { computeOpenStatus } from "../services/hours.service";
import { ownerProfileSelect, withOwnerProfile } from "../lib/profile";
import { resolveLanguage } from "../lib/languages";
import { categoryNameLocalizer } from "../services/category.service";

export const favoritesRouter = Router();
favoritesRouter.use(requireAuth);

// The user's saved places, newest first, shaped like the map's merchant results.
favoritesRouter.get("/", async (req, res) => {
  const localize = await categoryNameLocalizer(resolveLanguage(req));
  const favorites = await prisma.favoriteMerchant.findMany({
    where: { userId: req.user!.id, merchant: { approvalStatus: "APPROVED" } },
    include: { merchant: { include: { category: true, discounts: { where: { isActive: true } }, user: ownerProfileSelect } } },
    orderBy: { createdAt: "desc" },
  });
  const tz = (await getDefaultCountry()).timezone ?? "UTC";
  const now = new Date();
  res.json(favorites.map((f) => localize({ ...withOwnerProfile(f.merchant), openStatus: computeOpenStatus(f.merchant.openingHours, tz, now), savedAt: f.createdAt })));
});

// Just the ids, so any screen can show a filled heart without loading full places.
favoritesRouter.get("/ids", async (req, res) => {
  const rows = await prisma.favoriteMerchant.findMany({ where: { userId: req.user!.id }, select: { merchantId: true } });
  res.json(rows.map((r) => r.merchantId));
});

// Idempotent: saving an already-saved place is a no-op, not an error.
favoritesRouter.put("/:merchantId", async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { id: req.params.merchantId } });
  if (!merchant || merchant.approvalStatus !== "APPROVED") return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  await prisma.favoriteMerchant.upsert({
    where: { userId_merchantId: { userId: req.user!.id, merchantId: merchant.id } },
    update: {},
    create: { userId: req.user!.id, merchantId: merchant.id },
  });
  res.json({ merchantId: merchant.id, saved: true });
});

favoritesRouter.delete("/:merchantId", async (req, res) => {
  await prisma.favoriteMerchant.deleteMany({ where: { userId: req.user!.id, merchantId: req.params.merchantId } });
  res.json({ merchantId: req.params.merchantId, saved: false });
});

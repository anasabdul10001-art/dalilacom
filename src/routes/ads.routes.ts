import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSettings } from "../services/settings.service";
import { AD_SLOTS, adState, bookAd, cancelAd, ownMerchant } from "../services/ads.service";
import { optionalUserId } from "../services/viewerCountry.service";
import { route } from "../lib/asyncRoute";

/**
 * Advertising space in the online store: what it costs (the admin sets the days and the prices), booking it from a shop's
 * wallet, and following how it did. The spaces themselves are shown by /store/home.
 */
export const adsRouter = Router();

adsRouter.get("/packages", route(async (req, res) => {
  const settings = await getSettings();
  const userId = await optionalUserId(req);
  const wallet = userId ? await prisma.wallet.findUnique({ where: { userId } }) : null;
  res.json({
    packages: [...settings.ads.packages].sort((a, b) => a.days - b.days),
    creditName: settings.creditName,
    creditsPerUsd: settings.creditsPerUsd,
    slots: AD_SLOTS,
    autoApprove: settings.ads.autoApprove,
    balance: wallet?.balance ?? (userId ? 0 : null),
  });
}));

const bookSchema = z.object({
  productId: z.string().uuid(),
  days: z.number().int().positive(),
  start: z.string().optional(), // a date ("2026-10-20") or a full ISO time; omitted = now
});

adsRouter.post("/", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const start = parsed.data.start ? new Date(parsed.data.start) : undefined;
  if (start && Number.isNaN(start.getTime())) return sendValidationError(res, new z.ZodError([{ code: "custom", path: ["start"], message: "bad date" }]));
  const ad = await bookAd({ userId: req.user!.id, productId: parsed.data.productId, days: parsed.data.days, start });
  res.status(201).json(ad);
}));

adsRouter.get("/mine", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await ownMerchant(req.user!.id);
  const rows = await prisma.adBooking.findMany({
    where: { merchantId: merchant.id },
    include: { product: { select: { id: true, name: true, icon: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows.map((a) => ({
    id: a.id,
    product: a.product,
    days: a.days,
    credits: a.credits,
    state: adState(a),
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    impressions: a.impressions,
    clicks: a.clicks,
    rejectionReason: a.rejectionReason,
  })));
}));

adsRouter.post("/:id/cancel", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  await cancelAd(req.user!.id, req.params.id);
  res.json({ ok: true });
}));

// Counted when a shopper taps the advertised product on the front page.
adsRouter.post("/:id/click", route(async (req, res) => {
  await prisma.adBooking.updateMany({ where: { id: req.params.id, status: "ACTIVE" }, data: { clicks: { increment: 1 } } });
  res.json({ ok: true });
}));

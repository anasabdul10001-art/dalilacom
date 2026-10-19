import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSettings } from "../services/settings.service";
import express from "express";
import { AD_SLOTS, AdError, adAvailability, adState, bookAd, bookBanner, cancelAd, cancelBannerBooking, ownMerchant } from "../services/ads.service";
import { CREATIVE_SIZES, MAX_CREATIVE_BYTES, creativeIds, getCreative, saveCreative } from "../services/adCreative.service";
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
    bannerPackages: [...settings.ads.bannerPackages].sort((a, b) => a.days - b.days),
    sizes: { banner: CREATIVE_SIZES.BANNER, space: CREATIVE_SIZES.SPACE }, // the exact size of the picture each kind needs
    creditName: settings.creditName,
    creditsPerUsd: settings.creditsPerUsd,
    slots: AD_SLOTS,
    autoApprove: settings.ads.autoApprove,
    balance: wallet?.balance ?? (userId ? 0 : null),
  });
}));

// The calendar of the advertising spaces: which days are free for an ad of `days` days, for the shop picking when to start.
adsRouter.get("/availability", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = z.object({ days: z.coerce.number().int().min(1).max(366).default(7) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await adAvailability(req.user!.id, parsed.data.days));
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

const bannerBookSchema = z.object({
  days: z.number().int().positive(),
  start: z.string().optional(),
  phone: z.string().trim().min(6).max(30),
  whatsapp: z.string().trim().max(30).optional(),
  note: z.string().trim().max(600).optional(),
});

// A big banner: the shop picks the length, pays, and leaves a number the admin will call to agree what the banner says.
adsRouter.post("/banners", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = bannerBookSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const start = parsed.data.start ? new Date(parsed.data.start) : undefined;
  if (start && Number.isNaN(start.getTime())) return sendValidationError(res, new z.ZodError([{ code: "custom", path: ["start"], message: "bad date" }]));
  const b = await bookBanner({ userId: req.user!.id, days: parsed.data.days, start, phone: parsed.data.phone, whatsapp: parsed.data.whatsapp, note: parsed.data.note });
  res.status(201).json(b);
}));

adsRouter.get("/banners/mine", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await ownMerchant(req.user!.id);
  const rows = await prisma.bannerBooking.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const withPicture = await creativeIds("BANNER", rows.map((b) => b.id));
  res.json(rows.map((b) => ({ id: b.id, days: b.days, credits: b.credits, requestedStart: b.requestedStart, status: b.status, phone: b.phone, rejectionReason: b.rejectionReason, hasImage: withPicture.has(b.id) })));
}));

const creativeBody = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_CREATIVE_BYTES });

// The picture for a booking: raw image bytes (the screen cuts it to the exact size first; the server makes sure of it)
async function receiveCreative(kind: "BANNER" | "SPACE", req: import("express").Request, res: import("express").Response) {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) throw new AdError(415, "UNSUPPORTED_MEDIA", "أرسل الصورة بصيغة JPEG أو PNG أو WebP");
  res.json(await saveCreative(req.user!.id, kind, req.params.id, body));
}
adsRouter.put("/banners/:id/image", requireAuth, requireRole(Role.MERCHANT), creativeBody, route((req, res) => receiveCreative("BANNER", req, res)));
adsRouter.put("/:id/image", requireAuth, requireRole(Role.MERCHANT), creativeBody, route((req, res) => receiveCreative("SPACE", req, res)));

// the shop looks at the picture it sent
adsRouter.get("/banners/:id/image", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await ownMerchant(req.user!.id);
  const b = await prisma.bannerBooking.findFirst({ where: { id: req.params.id, merchantId: merchant.id }, select: { id: true } });
  const c = b ? await getCreative("BANNER", b.id) : null;
  if (!c) throw new AdError(404, "NOT_FOUND", "ما في صورة");
  res.set({ "Content-Type": c.mime, "Cache-Control": "private, no-store" }).end(Buffer.from(c.data));
}));
adsRouter.get("/:id/image", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await ownMerchant(req.user!.id);
  const a = await prisma.adBooking.findFirst({ where: { id: req.params.id, merchantId: merchant.id }, select: { id: true } });
  const c = a ? await getCreative("SPACE", a.id) : null;
  if (!c) throw new AdError(404, "NOT_FOUND", "ما في صورة");
  res.set({ "Content-Type": c.mime, "Cache-Control": "private, no-store" }).end(Buffer.from(c.data));
}));

adsRouter.post("/banners/:id/cancel", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  await cancelBannerBooking(req.user!.id, req.params.id);
  res.json({ ok: true });
}));

adsRouter.get("/mine", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await ownMerchant(req.user!.id);
  const rows = await prisma.adBooking.findMany({
    where: { merchantId: merchant.id },
    include: { product: { select: { id: true, name: true, icon: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const withPicture = await creativeIds("SPACE", rows.map((a) => a.id));
  res.json(rows.map((a) => ({
    id: a.id,
    hasImage: withPicture.has(a.id),
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

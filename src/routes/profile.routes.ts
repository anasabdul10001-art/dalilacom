import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { avatarUrl } from "../lib/profile";
import { isSupportedLanguage } from "../lib/languages";
import bcrypt from "bcryptjs";
import { anonymizeAccount } from "../services/accountDeletion.service";

export const profileRouter = Router();

const MAX_AVATAR_BYTES = 300 * 1024; // the apps downscale to ~512px before upload, so this is generous

// Never trust the Content-Type header alone — sniff the bytes, and only ever serve what we recognise.
function sniffImageMime(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

async function profileOf(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, role: true, bio: true, language: true, avatarUpdatedAt: true },
  });
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, bio: user.bio, language: user.language, avatarUrl: avatarUrl(user.id, user.avatarUpdatedAt) };
}

profileRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await profileOf(req.user!.id));
});

const deleteAccountSchema = z.object({ confirm: z.literal(true), password: z.string().optional() });

/**
 * "Delete my account": everything personal is removed at once (see accountDeletion.service) and every session ends. A
 * password account must repeat its password; an account that signs in through Google/Facebook has none to repeat.
 */
profileRouter.delete("/me", requireAuth, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { passwordHash: true, socialIdentities: { select: { id: true } } } });
  if (user.socialIdentities.length === 0) {
    if (!parsed.data.password || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return sendError(res, 401, "AUTH_INVALID_CREDENTIALS", "كلمة السر غير صحيحة");
    }
  }
  await anonymizeAccount(req.user!.id);
  res.json({ ok: true });
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  // The language push notifications and emails are written in (set by the app when the user switches).
  language: z.string().refine(isSupportedLanguage, "unsupported language").optional(),
  // Drives per-country pricing and the VAT rate on invoices (sections 64/58). ISO-2, e.g. "DE".
  countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
  cityId: z.string().uuid().nullable().optional(),
  vatNumber: z.string().trim().max(30).nullable().optional(),
});

profileRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { fullName, bio, language, countryCode, cityId, vatNumber } = parsed.data;
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(fullName !== undefined ? { fullName } : {}),
      ...(bio !== undefined ? { bio: bio || null } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(countryCode !== undefined ? { countryCode: countryCode || null } : {}),
      ...(cityId !== undefined ? { cityId: cityId || null } : {}),
      ...(vatNumber !== undefined ? { vatNumber: vatNumber || null } : {}),
    },
  });
  res.json(await profileOf(req.user!.id));
});

// The photo is sent as the raw image bytes (not JSON/base64) — smaller and no parser limits to raise.
profileRouter.put(
  "/avatar",
  requireAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_AVATAR_BYTES }),
  async (req, res) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل الصورة بصيغة JPEG أو PNG أو WebP");
    }
    const mime = sniffImageMime(body);
    if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف ليس صورة صالحة (JPEG أو PNG أو WebP)");
    const now = new Date();
    await prisma.$transaction([
      prisma.userAvatar.upsert({
        where: { userId: req.user!.id },
        update: { mime, data: body },
        create: { userId: req.user!.id, mime, data: body },
      }),
      prisma.user.update({ where: { id: req.user!.id }, data: { avatarUpdatedAt: now } }),
    ]);
    res.json(await profileOf(req.user!.id));
  },
);

// The app reports where the person is while they use the map (location allowed). Stored rounded to ~1 km — enough for a
// shop's "within 5 km" announcement, not enough to follow anyone. DELETE forgets it.
const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const roundCoarse = (n: number) => Math.round(n * 100) / 100;

profileRouter.put("/location", requireAuth, async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { lastLatitude: roundCoarse(parsed.data.latitude), lastLongitude: roundCoarse(parsed.data.longitude), locationUpdatedAt: new Date() },
  });
  res.json({ ok: true });
});

profileRouter.delete("/location", requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { lastLatitude: null, lastLongitude: null, locationUpdatedAt: null } });
  res.json({ ok: true });
});

profileRouter.delete("/avatar", requireAuth, async (req, res) => {
  await prisma.$transaction([
    prisma.userAvatar.deleteMany({ where: { userId: req.user!.id } }),
    prisma.user.update({ where: { id: req.user!.id }, data: { avatarUpdatedAt: null } }),
  ]);
  res.json(await profileOf(req.user!.id));
});

// Public by account id (ids are random UUIDs, and a profile photo is meant to be seen by other people).
profileRouter.get("/avatar/:userId", async (req, res) => {
  const avatar = await prisma.userAvatar.findUnique({ where: { userId: req.params.userId } });
  if (!avatar) return sendError(res, 404, "NOT_FOUND", "No photo");
  res.set({
    "Content-Type": avatar.mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=86400", // the ?v= in avatarUrl changes with every new photo
    "Content-Disposition": "inline",
  });
  res.send(Buffer.from(avatar.data));
});

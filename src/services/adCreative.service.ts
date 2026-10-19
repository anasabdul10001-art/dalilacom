import sharp from "sharp";
import { prisma } from "../prisma";
import { sniffImageMime } from "../lib/image";
import { AdError, ownMerchant } from "./ads.service";

/**
 * The picture a shop sends with its booking of a big banner or of a small space. The size is fixed (written on the booking screen and
 * cut to it there), and the server brings whatever arrives to exactly that size too, so the store never shows a stretched or odd picture.
 * The admin looks at it and approves; for a banner he can use the shop's picture as the banner.
 */
export const CREATIVE_SIZES = { BANNER: { width: 1600, height: 600 }, SPACE: { width: 800, height: 500 } } as const;
export type CreativeKind = keyof typeof CREATIVE_SIZES;
export const MAX_CREATIVE_BYTES = 10 * 1024 * 1024;
const FRESH_MS = 15 * 60 * 1000;

/** Brings the picture to the kind's exact size: already the right shape it is only shrunk, otherwise the most interesting part is kept. */
export async function fitCreative(buf: Buffer, kind: CreativeKind): Promise<{ data: Buffer; width: number; height: number }> {
  if (!sniffImageMime(buf)) throw new AdError(415, "UNSUPPORTED_MEDIA", "أرسل الصورة بصيغة JPEG أو PNG أو WebP");
  const { width, height } = CREATIVE_SIZES[kind];
  const data = await sharp(buf).rotate().resize({ width, height, fit: "cover", position: "attention" }).jpeg({ quality: 84, progressive: true }).toBuffer();
  return { data, width, height };
}

/** The shop's picture for one of its own bookings, while the booking can still be looked at (a picture is never swapped under a running ad). */
export async function saveCreative(userId: string, kind: CreativeKind, bookingId: string, buf: Buffer) {
  const merchant = await ownMerchant(userId);
  if (kind === "BANNER") {
    const b = await prisma.bannerBooking.findFirst({ where: { id: bookingId, merchantId: merchant.id } });
    if (!b) throw new AdError(404, "NOT_FOUND", "الحجز غير موجود");
    if (b.status !== "PENDING" && b.status !== "CONTACTED") throw new AdError(409, "CONFLICT", "هذا الحجز انتهى، ما بتقدر تغيّر صورته");
  } else {
    const a = await prisma.adBooking.findFirst({ where: { id: bookingId, merchantId: merchant.id } });
    if (!a) throw new AdError(404, "NOT_FOUND", "الحجز غير موجود");
    const fresh = Date.now() - a.createdAt.getTime() < FRESH_MS;
    if (a.status === "ACTIVE" && fresh) {
      // approved by itself a moment ago: the new picture still has to be looked at, so it waits (its place stays kept)
      await prisma.adBooking.update({ where: { id: a.id }, data: { status: "PENDING" } });
    } else if (a.status !== "PENDING") {
      throw new AdError(409, "CONFLICT", "هذا الحجز انتهى، ما بتقدر تغيّر صورته");
    }
  }
  const fitted = await fitCreative(buf, kind);
  await prisma.adCreative.upsert({
    where: { kind_bookingId: { kind, bookingId } },
    update: { mime: "image/jpeg", data: fitted.data, width: fitted.width, height: fitted.height },
    create: { kind, bookingId, mime: "image/jpeg", data: fitted.data, width: fitted.width, height: fitted.height },
  });
  return { ok: true, width: fitted.width, height: fitted.height };
}

export async function getCreative(kind: CreativeKind, bookingId: string) {
  return prisma.adCreative.findUnique({ where: { kind_bookingId: { kind, bookingId } }, select: { mime: true, data: true } });
}

/** Which of these bookings have a picture (no bytes read). */
export async function creativeIds(kind: CreativeKind, bookingIds: string[]): Promise<Set<string>> {
  if (!bookingIds.length) return new Set();
  const rows = await prisma.adCreative.findMany({ where: { kind, bookingId: { in: bookingIds } }, select: { bookingId: true } });
  return new Set(rows.map((r) => r.bookingId));
}

/** The admin makes the banner from the shop's picture. Returns false when the shop sent none. */
export async function copyCreativeToBanner(bookingId: string, bannerId: string): Promise<boolean> {
  const c = await getCreative("BANNER", bookingId);
  if (!c) return false;
  await prisma.storeBanner.update({ where: { id: bannerId }, data: { imageMime: c.mime, imageData: c.data, imageUpdatedAt: new Date() } });
  return true;
}

import { AdBooking, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { getSettings } from "./settings.service";
import { adjustBalance, InsufficientBalanceError } from "./wallet.service";
import { notify } from "./notification.service";
import { onlyCountry } from "./viewerCountry.service";

/** How many advertising spaces the store's front page has in each country (the picks beside the big banner). */
export const AD_SLOTS = 6;
const DAY_MS = 86_400_000;
const MAX_ADVANCE_DAYS = 60;

export class AdError extends ApiError {
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(status, code, message, details);
  }
}

/** A booking holds its space from the moment it is made (pending or approved) until it ends. */
const holdsSlot: Prisma.AdBookingWhereInput = { status: { in: ["PENDING", "ACTIVE"] } };

async function freeSlot(tx: Prisma.TransactionClient, country: string, start: Date, end: Date, excludeId?: string): Promise<number | null> {
  const busy = await tx.adBooking.findMany({
    where: { countryCode: country, ...holdsSlot, startsAt: { lt: end }, endsAt: { gt: start }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { slot: true },
  });
  const taken = new Set(busy.map((b) => b.slot));
  for (let slot = 1; slot <= AD_SLOTS; slot++) if (!taken.has(slot)) return slot;
  return null;
}

/** The first moment from `from` on at which a space is free for `days` days: right when some booking ends. */
async function nextAvailable(country: string, from: Date, days: number): Promise<Date | null> {
  const booked = await prisma.adBooking.findMany({
    where: { countryCode: country, ...holdsSlot, endsAt: { gt: from } },
    select: { slot: true, startsAt: true, endsAt: true },
  });
  const candidates = [...new Set(booked.map((b) => b.endsAt.getTime()))].sort((x, y) => x - y);
  for (const c of candidates) {
    const start = c;
    const end = c + days * DAY_MS;
    const taken = new Set(booked.filter((b) => b.startsAt.getTime() < end && b.endsAt.getTime() > start).map((b) => b.slot));
    if (taken.size < AD_SLOTS && c - from.getTime() <= MAX_ADVANCE_DAYS * DAY_MS) return new Date(c);
  }
  return null;
}

export async function ownMerchant(userId: string) {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId }, include: { user: { select: { countryCode: true } } } });
  if (!merchant) throw new AdError(404, "NOT_FOUND", "ما عندك متجر");
  if (merchant.approvalStatus !== "APPROVED") throw new AdError(403, "FORBIDDEN", "متجرك لم يُعتمد بعد");
  return merchant;
}

export interface BookInput {
  userId: string;
  productId: string;
  days: number;
  /** When it should start; omitted or in the past = now. */
  start?: Date;
}

export async function bookAd(input: BookInput): Promise<AdBooking> {
  const settings = await getSettings();
  const merchant = await ownMerchant(input.userId);
  const pack = settings.ads.packages.find((p) => p.days === input.days);
  if (!pack) throw new AdError(400, "BAD_REQUEST", "هذه المدة غير متاحة");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || product.merchantId !== merchant.id) throw new AdError(404, "NOT_FOUND", "المنتج غير موجود في متجرك");
  if (!product.isActive || product.stock <= 0) throw new AdError(400, "BAD_REQUEST", "المنتج لازم يكون ظاهر ومتوفر بالمخزون ليتم الإعلان عنه");

  const now = new Date();
  const requested = input.start && input.start.getTime() > now.getTime() ? input.start : now;
  if (requested.getTime() > now.getTime() + MAX_ADVANCE_DAYS * DAY_MS) throw new AdError(400, "BAD_REQUEST", "الحجز المسبق أقصاه 60 يومًا");
  const startsAt = requested;
  const endsAt = new Date(startsAt.getTime() + pack.days * DAY_MS);
  // with a single country on the platform every shop advertises in it
  const country = (await onlyCountry()) ?? merchant.user.countryCode ?? "SY";

  try {
    return await prisma.$transaction(async (tx) => {
      const slot = await freeSlot(tx, country, startsAt, endsAt);
      if (slot === null) {
        const next = await nextAvailable(country, startsAt, pack.days);
        throw new AdError(409, "NO_SPACE", "كل المساحات الإعلانية محجوزة بهذا الوقت", { nextAvailable: next?.toISOString() ?? null });
      }
      if (pack.credits > 0) await adjustBalance(tx, input.userId, -pack.credits, "AD", `ad:${product.id}`);
      return tx.adBooking.create({
        data: {
          merchantId: merchant.id,
          productId: product.id,
          countryCode: country,
          days: pack.days,
          credits: pack.credits,
          status: settings.ads.autoApprove ? "ACTIVE" : "PENDING",
          requestedStart: requested,
          startsAt,
          endsAt,
          slot,
        },
      });
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw new AdError(402, "INSUFFICIENT_BALANCE", "رصيد محفظتك غير كافٍ، اشحنها أولًا", { balance: err.balance, needed: err.needed });
    throw err;
  }
}

async function refund(tx: Prisma.TransactionClient, ad: AdBooking, why: string) {
  if (ad.credits > 0) await adjustBalance(tx, (await tx.merchantProfile.findUniqueOrThrow({ where: { id: ad.merchantId } })).userId, ad.credits, "AD", `${why}:${ad.id}`);
}

async function ownerOf(ad: AdBooking): Promise<string> {
  return (await prisma.merchantProfile.findUniqueOrThrow({ where: { id: ad.merchantId }, select: { userId: true } })).userId;
}

export async function approveAd(id: string): Promise<AdBooking> {
  const ad = await prisma.adBooking.findUnique({ where: { id } });
  if (!ad) throw new AdError(404, "NOT_FOUND", "الحجز غير موجود");
  if (ad.status !== "PENDING") throw new AdError(409, "CONFLICT", "هذا الحجز تمت معالجته من قبل");

  // the booking may have waited longer than its start: it then starts now and keeps its full number of days
  const now = new Date();
  const startsAt = ad.startsAt.getTime() < now.getTime() ? now : ad.startsAt;
  const endsAt = new Date(startsAt.getTime() + ad.days * DAY_MS);
  const updated = await prisma.$transaction(async (tx) => {
    const slot = await freeSlot(tx, ad.countryCode, startsAt, endsAt, ad.id);
    if (slot === null) throw new AdError(409, "NO_SPACE", "ما عاد في مساحة فاضية بهذا الوقت، ارفضه ليرجع الرصيد لصاحبه");
    return tx.adBooking.update({ where: { id }, data: { status: "ACTIVE", startsAt, endsAt, slot } });
  });
  await notify({ userId: await ownerOf(ad), type: "SYSTEM", title: "تمت الموافقة على إعلانك في المتجر", body: "إعلانك ظاهر الآن في المتجر.", data: { kind: "AD_APPROVED", adId: id }, email: false });
  return updated;
}

export async function rejectAd(id: string, reason?: string): Promise<AdBooking> {
  const updated = await prisma.$transaction(async (tx) => {
    const marked = await tx.adBooking.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", rejectionReason: reason ?? null } });
    if (marked.count === 0) throw new AdError(409, "CONFLICT", "هذا الحجز تمت معالجته من قبل");
    const ad = await tx.adBooking.findUniqueOrThrow({ where: { id } });
    await refund(tx, ad, "refund");
    return ad;
  });
  await notify({ userId: await ownerOf(updated), type: "SYSTEM", title: "لم تتم الموافقة على إعلانك في المتجر", body: reason ? `السبب: ${reason}. تم إرجاع المبلغ لمحفظتك.` : "تم إرجاع المبلغ لمحفظتك.", data: { kind: "AD_REJECTED", adId: id }, email: false });
  return updated;
}

/** The shop takes back a booking that has not been approved yet and gets the money back. */
export async function cancelAd(userId: string, id: string): Promise<AdBooking> {
  const merchant = await ownMerchant(userId);
  return prisma.$transaction(async (tx) => {
    const marked = await tx.adBooking.updateMany({ where: { id, merchantId: merchant.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (marked.count === 0) throw new AdError(409, "CONFLICT", "تقدر تلغي الحجز فقط قبل الموافقة عليه");
    const ad = await tx.adBooking.findUniqueOrThrow({ where: { id } });
    await refund(tx, ad, "cancel");
    return ad;
  });
}

/** The ads running right now in a country, by space (1..6). */
export async function liveAds(country: string, now = new Date()) {
  return prisma.adBooking.findMany({
    where: { countryCode: country, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    include: { product: { include: { merchant: { select: { id: true, businessName: true } } } } },
    orderBy: { slot: "asc" },
  });
}

/** What the shop sees of its booking: where it is in its life, and how it did. */
export function adState(ad: Pick<AdBooking, "status" | "startsAt" | "endsAt">, now = new Date()): "PENDING" | "SCHEDULED" | "LIVE" | "ENDED" | "REJECTED" | "CANCELLED" {
  if (ad.status === "PENDING" || ad.status === "REJECTED" || ad.status === "CANCELLED") return ad.status;
  if (ad.endsAt.getTime() <= now.getTime()) return "ENDED";
  return ad.startsAt.getTime() > now.getTime() ? "SCHEDULED" : "LIVE";
}

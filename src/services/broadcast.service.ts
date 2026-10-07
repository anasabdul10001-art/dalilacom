import { NotificationType, Prisma, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { notify } from "./notification.service";
import { screenAnnouncement } from "./ai.service";
import { getSettings } from "./settings.service";

/**
 * One announcement may not fan out to more people than this: narrow the area instead of paging a whole platform.
 * A shop's own limits (audience, distance, announcements per month) are the super admin's to set: the shop's plan says how
 * many announcements, the platform settings say what applies when there is no plan (see settings.broadcasts).
 */
export const MAX_ADMIN_RECIPIENTS = 5000;
/** The rolling month a shop's quota is counted over. */
const QUOTA_WINDOW_MS = 30 * 24 * 3600 * 1000;

export interface BroadcastTarget {
  /** Everyone in a country (its ISO code on the account, or an address in it). */
  countryId?: string;
  /** Everyone in a region, a city or an area — and in everything beneath it. */
  geoUnitId?: string;
  /** Everyone within radiusKm of a point (a merchant's own shop when no point is given). */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** The people who saved this shop (its followers). A merchant only. */
  followers?: boolean;
  /** Only customers, or only merchants. */
  role?: Role;
}

export interface BroadcastMessage {
  title: string;
  body: string;
  /** A merchant may attach one of their own products or offers (discounts). */
  productId?: string;
  discountId?: string;
}

export interface Sender {
  id: string;
  role: Role;
}

export class BroadcastError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Scope = "COUNTRY" | "PLACE" | "RADIUS" | "FOLLOWERS";

function scopeOf(target: BroadcastTarget): Scope {
  const radius = target.radiusKm !== undefined;
  const chosen = [!!target.countryId, !!target.geoUnitId, radius, !!target.followers].filter(Boolean).length;
  if (chosen !== 1) throw new BroadcastError(400, "BAD_TARGET", "Choose exactly one of: a country, a place inside a country, a distance, or your followers");
  return target.countryId ? "COUNTRY" : target.geoUnitId ? "PLACE" : target.followers ? "FOLLOWERS" : "RADIUS";
}

/** The unit itself plus every unit below it. Units of one country are loaded once and walked in memory. */
async function subtreeIds(geoUnitId: string): Promise<string[]> {
  const unit = await prisma.geoUnit.findUnique({ where: { id: geoUnitId }, select: { id: true, countryId: true } });
  if (!unit) throw new BroadcastError(404, "NOT_FOUND", "Geographic unit not found");
  const all = await prisma.geoUnit.findMany({ where: { countryId: unit.countryId }, select: { id: true, parentId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const u of all) if (u.parentId) childrenOf.set(u.parentId, [...(childrenOf.get(u.parentId) ?? []), u.id]);
  const ids: string[] = [];
  const queue = [unit.id];
  while (queue.length) {
    const id = queue.pop()!;
    ids.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function withinRadius(lat: number, lng: number, radiusKm: number, base: Prisma.UserWhereInput): Promise<string[]> {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const box = (latField: "lastLatitude" | "latitude", lngField: "lastLongitude" | "longitude") => ({
    [latField]: { gte: lat - dLat, lte: lat + dLat },
    [lngField]: { gte: lng - dLng, lte: lng + dLng },
  });
  const candidates = await prisma.user.findMany({
    where: { ...base, OR: [box("lastLatitude", "lastLongitude"), { addresses: { some: box("latitude", "longitude") } }] },
    select: { id: true, lastLatitude: true, lastLongitude: true, addresses: { select: { latitude: true, longitude: true } } },
  });
  const near = (a: number | null, b: number | null) => a != null && b != null && distanceKm(lat, lng, a, b) <= radiusKm;
  return candidates
    .filter((u) => near(u.lastLatitude, u.lastLongitude) || u.addresses.some((a) => near(a.latitude, a.longitude)))
    .map((u) => u.id);
}

/** Ids of the enabled accounts in the chosen place (profile location, saved address or last known position). */
export async function audienceUserIds(target: BroadcastTarget, opts: { exclude?: string; followersOf?: string } = {}): Promise<string[]> {
  const scope = scopeOf(target);
  const base: Prisma.UserWhereInput = { isDisabled: false, ...(target.role ? { role: target.role } : {}), ...(opts.exclude ? { id: { not: opts.exclude } } : {}) };

  if (scope === "FOLLOWERS") {
    if (!opts.followersOf) throw new BroadcastError(400, "BAD_TARGET", "Only a shop has followers");
    const users = await prisma.user.findMany({ where: { ...base, favoriteMerchants: { some: { merchantId: opts.followersOf } } }, select: { id: true } });
    return users.map((u) => u.id);
  }

  if (scope === "RADIUS") {
    const { latitude, longitude, radiusKm } = target;
    if (latitude === undefined || longitude === undefined) throw new BroadcastError(400, "BAD_TARGET", "A distance needs a centre point");
    return withinRadius(latitude, longitude, radiusKm!, base);
  }

  let place: Prisma.UserWhereInput;
  if (scope === "COUNTRY") {
    const country = await prisma.country.findUnique({ where: { id: target.countryId! }, select: { id: true, isoCode2: true } });
    if (!country) throw new BroadcastError(404, "NOT_FOUND", "Country not found");
    place = { OR: [{ countryCode: country.isoCode2 }, { addresses: { some: { countryId: country.id } } }] };
  } else {
    const ids = await subtreeIds(target.geoUnitId!);
    place = {
      OR: [
        { cityId: { in: ids } },
        { addresses: { some: { OR: [{ regionId: { in: ids } }, { cityId: { in: ids } }, { areaId: { in: ids } }] } } },
      ],
    };
  }
  const users = await prisma.user.findMany({ where: { ...base, ...place }, select: { id: true } });
  return users.map((u) => u.id);
}

interface Resolved {
  target: BroadcastTarget;
  scope: Scope;
  cap: number;
  /** Announcements this shop may send per month (null for the admin: no quota). */
  quota: number | null;
  merchant: { id: string; businessName: string } | null;
  product: { id: string; name: string } | null;
  discount: { id: string; title: string } | null;
}

/** Applies who-may-do-what: admins reach anywhere; a merchant reaches a bounded area, and may only attach what is theirs. */
async function resolve(sender: Sender, target: BroadcastTarget, message?: BroadcastMessage): Promise<Resolved> {
  if (sender.role === Role.ADMIN) {
    if (message?.productId || message?.discountId) throw new BroadcastError(400, "BAD_ATTACHMENT", "Only a merchant can attach a product or an offer");
    return { target, scope: scopeOf(target), cap: MAX_ADMIN_RECIPIENTS, quota: null, merchant: null, product: null, discount: null };
  }
  if (sender.role !== Role.MERCHANT) throw new BroadcastError(403, "FORBIDDEN", "Forbidden");

  const merchant = await prisma.merchantProfile.findUnique({
    where: { userId: sender.id },
    select: { id: true, businessName: true, approvalStatus: true, latitude: true, longitude: true, plan: { select: { monthlyBroadcastLimit: true } } },
  });
  if (!merchant || merchant.approvalStatus !== "APPROVED") throw new BroadcastError(403, "MERCHANT_NOT_APPROVED", "Your shop must be approved before you can send announcements");

  const { broadcasts } = await getSettings();
  let resolved = target;
  // A distance with no centre means "around my shop".
  if (target.radiusKm !== undefined && target.latitude === undefined && target.longitude === undefined) {
    if (merchant.latitude == null || merchant.longitude == null) {
      throw new BroadcastError(400, "SHOP_HAS_NO_LOCATION", "Set your shop's location first, or pick a point");
    }
    resolved = { ...target, latitude: merchant.latitude, longitude: merchant.longitude };
  }
  if (resolved.radiusKm !== undefined && resolved.radiusKm > broadcasts.maxRadiusKm) {
    throw new BroadcastError(400, "RADIUS_TOO_LARGE", `The largest distance a shop can reach is ${broadcasts.maxRadiusKm} km`);
  }

  const product = message?.productId
    ? await prisma.product.findFirst({ where: { id: message.productId, merchantId: merchant.id, isActive: true }, select: { id: true, name: true } })
    : null;
  if (message?.productId && !product) throw new BroadcastError(404, "NOT_FOUND", "Product not found in your shop");
  const discount = message?.discountId
    ? await prisma.discount.findFirst({ where: { id: message.discountId, merchantId: merchant.id, isActive: true }, select: { id: true, title: true } })
    : null;
  if (message?.discountId && !discount) throw new BroadcastError(404, "NOT_FOUND", "Offer not found in your shop");

  // the plan the super admin gave this shop decides the quota; with no plan, the platform default applies
  const quota = merchant.plan?.monthlyBroadcastLimit ?? broadcasts.merchantDefaultMonthly;
  return { target: resolved, scope: scopeOf(resolved), cap: broadcasts.merchantMaxAudience, quota, merchant, product, discount };
}

/** Announcements this account has used in the last 30 days (refused ones never reached anyone, so they are free). */
async function usedThisMonth(senderId: string): Promise<number> {
  return prisma.broadcast.count({
    where: { senderId, status: { in: ["PENDING_REVIEW", "SENT"] }, createdAt: { gte: new Date(Date.now() - QUOTA_WINDOW_MS) } },
  });
}

/** Who a merchant's audience query is about: their own followers are the people who saved the shop. */
const audienceOptions = (r: Resolved, sender: Sender) => ({ exclude: r.merchant ? sender.id : undefined, followersOf: r.merchant?.id });

export interface BroadcastPreview {
  count: number;
  cap: number;
  /** Merchants only: the monthly quota and what is left of it (null for the admin). */
  limit: number | null;
  remainingThisMonth: number | null;
}

/** How many people an announcement would reach, before anything is sent. */
export async function previewBroadcast(sender: Sender, target: BroadcastTarget): Promise<BroadcastPreview> {
  const r = await resolve(sender, target);
  const count = (await audienceUserIds(r.target, audienceOptions(r, sender))).length;
  const remainingThisMonth = r.quota === null ? null : Math.max(0, r.quota - (await usedThisMonth(sender.id)));
  return { count, cap: r.cap, limit: r.quota, remainingThisMonth };
}

export interface BroadcastResult {
  id: string;
  status: "SENT" | "PENDING_REVIEW" | "REJECTED";
  /** Sent: people reached. Pending: the estimate at submission. */
  targeted: number;
  /** Got an inbox row (people who switched this kind off are skipped). 0 until it is sent. */
  delivered: number;
  /** Why a screened-out announcement was refused. */
  reasons?: string[];
}

type Row = Awaited<ReturnType<typeof prisma.broadcast.create>>;

function targetOfRow(row: Row): BroadcastTarget {
  return {
    countryId: row.countryId ?? undefined,
    geoUnitId: row.geoUnitId ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    radiusKm: row.radiusKm ?? undefined,
    role: row.audienceRole ?? undefined,
    followers: row.scope === "FOLLOWERS" ? true : undefined,
  };
}

/**
 * Hands the announcement to everyone in the place: each person's inbox and a push (in their own language when a
 * translation exists). Never an email — an announcement to a whole city must not become a mass mailing.
 */
async function deliver(r: Resolved, sender: Sender, message: BroadcastMessage): Promise<{ targeted: number; delivered: number }> {
  const ids = await audienceUserIds(r.target, audienceOptions(r, sender));
  if (ids.length > r.cap) throw new BroadcastError(413, "AUDIENCE_TOO_LARGE", `This reaches ${ids.length} people; the limit is ${r.cap}. Narrow the area.`);

  const type: NotificationType = !r.merchant ? "SYSTEM" : r.product && !r.discount ? "NEW_PRODUCT" : "NEW_OFFER";
  const data: Prisma.InputJsonObject = r.merchant
    ? {
        kind: "MERCHANT_PROMO",
        merchantId: r.merchant.id,
        businessName: r.merchant.businessName,
        ...(r.product ? { productId: r.product.id } : {}),
        ...(r.discount ? { discountId: r.discount.id } : {}),
      }
    : { kind: "BROADCAST" };

  let delivered = 0;
  const batch = 20;
  for (let i = 0; i < ids.length; i += batch) {
    const results = await Promise.all(
      ids.slice(i, i + batch).map((userId) => notify({ userId, type, title: message.title, body: message.body, data, email: false })),
    );
    delivered += results.filter((x) => x.created).length;
  }
  return { targeted: ids.length, delivered };
}

function rowData(sender: Sender, r: Resolved, message: BroadcastMessage) {
  return {
    senderId: sender.id,
    senderRole: sender.role,
    scope: r.scope,
    countryId: r.target.countryId,
    geoUnitId: r.target.geoUnitId,
    latitude: r.target.latitude,
    longitude: r.target.longitude,
    radiusKm: r.target.radiusKm,
    audienceRole: r.target.role,
    title: message.title,
    body: message.body,
    productId: r.product?.id,
    discountId: r.discount?.id,
  };
}

async function tellAdmins(title: string, body: string) {
  const admins = await prisma.user.findMany({ where: { role: Role.ADMIN, isDisabled: false }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ userId: a.id, type: "SYSTEM", title, body, data: { kind: "BROADCAST_REVIEW" }, email: false })));
}

/**
 * An admin's announcement goes out at once. A merchant's is first screened by AI (clear violations are refused on the
 * spot) and then always waits for an admin to approve it — nobody receives it before it has been reviewed.
 */
export async function submitBroadcast(sender: Sender, target: BroadcastTarget, message: BroadcastMessage): Promise<BroadcastResult> {
  const r = await resolve(sender, target, message);

  if (!r.merchant) {
    const sent = await deliver(r, sender, message);
    const row = await prisma.broadcast.create({ data: { ...rowData(sender, r, message), ...sent, status: "SENT", reviewedById: sender.id, reviewedAt: new Date() } });
    return { id: row.id, status: "SENT", ...sent };
  }

  if (r.quota !== null && (await usedThisMonth(sender.id)) >= r.quota) {
    throw new BroadcastError(429, "BROADCAST_LIMIT", `Your plan allows ${r.quota} announcements per month`);
  }
  const estimate = (await audienceUserIds(r.target, audienceOptions(r, sender))).length;
  if (estimate > r.cap) throw new BroadcastError(413, "AUDIENCE_TOO_LARGE", `This reaches ${estimate} people; the limit is ${r.cap}. Narrow the area.`);

  const screening = await screenAnnouncement(message.title, message.body);
  if (screening?.verdict === "BLOCK") {
    const reasons = screening.reasons.length ? screening.reasons : ["مخالف لمعايير النشر"];
    const row = await prisma.broadcast.create({
      data: { ...rowData(sender, r, message), targeted: estimate, delivered: 0, status: "REJECTED", aiVerdict: "BLOCK", aiReasons: reasons, reviewNote: reasons.join(" — "), reviewedAt: new Date() },
    });
    return { id: row.id, status: "REJECTED", targeted: estimate, delivered: 0, reasons };
  }

  const row = await prisma.broadcast.create({
    data: {
      ...rowData(sender, r, message),
      targeted: estimate,
      delivered: 0,
      status: "PENDING_REVIEW",
      aiVerdict: screening?.verdict ?? null,
      aiReasons: screening?.reasons ?? undefined,
    },
  });
  await tellAdmins("إعلان جديد بانتظار المراجعة", `${r.merchant.businessName}: ${message.title}`);
  return { id: row.id, status: "PENDING_REVIEW", targeted: estimate, delivered: 0 };
}

async function pendingRow(id: string): Promise<Row> {
  const row = await prisma.broadcast.findUnique({ where: { id } });
  if (!row) throw new BroadcastError(404, "NOT_FOUND", "Announcement not found");
  if (row.status !== "PENDING_REVIEW") throw new BroadcastError(409, "ALREADY_REVIEWED", "This announcement was already reviewed");
  return row;
}

/** An admin accepts a merchant's announcement: it is sent now, to whoever the area contains today. */
export async function approveBroadcast(id: string, admin: Sender): Promise<BroadcastResult> {
  const row = await pendingRow(id);
  const sender = { id: row.senderId, role: row.senderRole };
  const message = { title: row.title, body: row.body, productId: row.productId ?? undefined, discountId: row.discountId ?? undefined };
  const r = await resolve(sender, targetOfRow(row), message);
  const sent = await deliver(r, sender, message);
  // claimed with the status so two admins pressing the button cannot send it twice
  const claimed = await prisma.broadcast.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "SENT", ...sent, reviewedById: admin.id, reviewedAt: new Date() },
  });
  if (claimed.count === 0) throw new BroadcastError(409, "ALREADY_REVIEWED", "This announcement was already reviewed");
  await notify({ userId: row.senderId, type: "SYSTEM", title: "تمت الموافقة على إعلانك", body: "تم نشر إعلانك للمستهدَفين.", data: { kind: "BROADCAST_REVIEW", broadcastId: id }, email: false });
  return { id, status: "SENT", ...sent };
}

/** An admin refuses it, with the reason the merchant will read. */
export async function rejectBroadcast(id: string, admin: Sender, reason: string): Promise<BroadcastResult> {
  const row = await pendingRow(id);
  const claimed = await prisma.broadcast.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", reviewNote: reason, reviewedById: admin.id, reviewedAt: new Date() },
  });
  if (claimed.count === 0) throw new BroadcastError(409, "ALREADY_REVIEWED", "This announcement was already reviewed");
  await notify({ userId: row.senderId, type: "SYSTEM", title: "تم رفض إعلانك", body: `السبب: ${reason}`, data: { kind: "BROADCAST_REVIEW", broadcastId: id }, email: false });
  return { id, status: "REJECTED", targeted: row.targeted, delivered: 0, reasons: [reason] };
}

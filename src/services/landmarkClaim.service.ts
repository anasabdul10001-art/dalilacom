import { LandmarkClaimStatus, NotificationType, Prisma, Role } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "../prisma";
import { sniffImageMime } from "../lib/image";
import { notify } from "./notification.service";
import { getDefaultCountry } from "./geo.service";
import { createBusinessFromMerchantProfile } from "./business.service";
import { findSimilar, LandmarkError, distanceKm, nameKey, sameName } from "./landmark.service";
import { normalizeText } from "./category.service";
import { foldedColumn } from "../lib/arabicFold";

/**
 * "This place is mine": the manager or owner of a private place that is on the map as a landmark (a private hospital) asks to take it
 * over. They send their role, a phone number and photos of the proof; the admin approves, asks for more, or refuses. On approval the
 * landmark becomes an ordinary shop (same name, address and place, no duplicate pin), or a branch when the person already has a shop.
 */
export const MAX_CLAIM_FILES = 5;
export const MAX_CLAIM_FILE_BYTES = 8 * 1024 * 1024;
const MAX_OPEN_CLAIMS = 3;
export const CLAIM_PAGE = 50;
export const CLAIM_ROLES = ["OWNER", "MANAGER", "AUTHORIZED"] as const;
const OPEN: LandmarkClaimStatus[] = ["PENDING", "NEEDS_INFO"];

async function claimableLandmark(id: string) {
  const l = await prisma.landmark.findFirst({ where: { id, status: "ACTIVE", kind: { isActive: true } }, include: { kind: true } });
  if (!l) throw new LandmarkError("Place not found", 404);
  if (!l.kind.claimable || l.sector === "PUBLIC") throw new LandmarkError("This place cannot be claimed", 403);
  return l;
}

export async function submitClaim(userId: string, landmarkId: string, input: { role: string; phone: string; note?: string | null }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isEmailVerified: true, isDisabled: true } });
  if (!user || user.isDisabled) throw new LandmarkError("Sign in first", 401);
  if (!user.isEmailVerified) throw new LandmarkError("Verify your email first", 403);
  await claimableLandmark(landmarkId);
  const mine = await prisma.landmarkClaim.findMany({ where: { userId, status: { in: OPEN } }, select: { landmarkId: true } });
  if (mine.some((c) => c.landmarkId === landmarkId)) throw new LandmarkError("You already sent a request for this place", 409);
  if (mine.length >= MAX_OPEN_CLAIMS) throw new LandmarkError("You have too many open requests, wait for a decision", 429);
  return prisma.landmarkClaim.create({
    data: { landmarkId, userId, claimantRole: input.role, contactPhone: input.phone.trim(), note: input.note?.trim() || null },
    include: { files: { select: { id: true, name: true } } },
  });
}

/** A proof photo: checked to be a real picture, shrunk, and kept. */
export async function addClaimFile(userId: string, claimId: string, buf: Buffer, name: string) {
  const claim = await prisma.landmarkClaim.findFirst({ where: { id: claimId, userId }, include: { _count: { select: { files: true } } } });
  if (!claim) throw new LandmarkError("Request not found", 404);
  if (!OPEN.includes(claim.status)) throw new LandmarkError("This request is closed", 409);
  if (claim._count.files >= MAX_CLAIM_FILES) throw new LandmarkError("You can send up to 5 photos", 400);
  if (!buf.length || buf.length > MAX_CLAIM_FILE_BYTES) throw new LandmarkError("The photo is empty or too big", 400);
  if (!sniffImageMime(buf)) throw new LandmarkError("Send the photo as JPEG, PNG or WebP", 415);
  const data = await sharp(buf).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const file = await prisma.landmarkClaimFile.create({ data: { claimId, name: name.trim().slice(0, 80) || "proof.jpg", mime: "image/jpeg", sizeBytes: data.length, data }, select: { id: true, name: true, sizeBytes: true } });
  return file;
}

export async function myClaims(userId: string) {
  const rows = await prisma.landmarkClaim.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { landmark: { select: { id: true, name: true, kind: { select: { icon: true, nameAr: true, nameEn: true } } } }, _count: { select: { files: true } } },
    take: 50,
  });
  return rows.map((c) => ({
    id: c.id, status: c.status, role: c.claimantRole, phone: c.contactPhone, note: c.note, message: c.adminMessage, files: c._count.files, createdAt: c.createdAt,
    landmark: { id: c.landmark.id, name: c.landmark.name, icon: c.landmark.kind.icon, kind: c.landmark.kind.nameAr, kindEn: c.landmark.kind.nameEn },
  }));
}

export async function withdrawClaim(userId: string, claimId: string) {
  const claim = await prisma.landmarkClaim.findFirst({ where: { id: claimId, userId } });
  if (!claim) throw new LandmarkError("Request not found", 404);
  if (!OPEN.includes(claim.status)) throw new LandmarkError("This request is closed", 409);
  return prisma.landmarkClaim.update({ where: { id: claimId }, data: { status: "WITHDRAWN" } });
}

/** After the admin asked for more proof: the person adds it (and maybe a note) and sends it back. */
export async function resubmitClaim(userId: string, claimId: string, note?: string | null) {
  const claim = await prisma.landmarkClaim.findFirst({ where: { id: claimId, userId } });
  if (!claim) throw new LandmarkError("Request not found", 404);
  if (claim.status !== "NEEDS_INFO") throw new LandmarkError("This request is not waiting for more information", 409);
  return prisma.landmarkClaim.update({ where: { id: claimId }, data: { status: "PENDING", ...(note?.trim() ? { note: note.trim() } : {}) } });
}

/** The claim this person has (open or decided) for a place, so the card can say where it stands. */
export async function myClaimFor(userId: string, landmarkId: string) {
  const c = await prisma.landmarkClaim.findFirst({ where: { userId, landmarkId }, orderBy: { createdAt: "desc" } });
  return c ? { id: c.id, status: c.status, message: c.adminMessage } : null;
}

/** Claimable places that look like what a shop owner is about to register: offered "claim it" instead of a duplicate. */
export async function similarClaimable(input: { name: string; latitude: number; longitude: number }) {
  const found = await findSimilar({ name: input.name, latitude: input.latitude, longitude: input.longitude, maxKm: 0.3 });
  return found
    .filter((l) => l.status === "ACTIVE" && l.kind.claimable && l.sector !== "PUBLIC")
    .map((l) => ({ id: l.id, name: l.name, kind: { slug: l.kind.slug, name: l.kind.nameAr, nameEn: l.kind.nameEn, icon: l.kind.icon }, address: l.address, latitude: l.latitude, longitude: l.longitude }));
}


/** The longest word of a name that says which place it is (not "mosque" or "hospital"), normalised the way the database copy is. */
function distinctiveWord(name: string): string | null {
  const key = nameKey(name);
  return key.split(" ").filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Claimable places that look like the shop being registered when the person did not put a pin: the same name, and an address that does not
 * contradict (when both have one they share a word). The place is offered "claim it" instead of making a duplicate.
 */
export async function similarClaimableByName(input: { name: string; address?: string | null }) {
  const word = distinctiveWord(input.name);
  if (!word) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT l."id" FROM "Landmark" l JOIN "LandmarkKind" k ON k."id" = l."kindId"
    WHERE l."status" = 'ACTIVE' AND k."claimable" = true AND k."isActive" = true AND l."sector" IS DISTINCT FROM 'PUBLIC'
      AND ${foldedColumn(Prisma.raw('l."name"'))} LIKE ${"%" + word + "%"}
    LIMIT 80`);
  if (!rows.length) return [];
  const found = await prisma.landmark.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: { kind: true } });
  const typed = normalizeText(input.address ?? "").split(" ").filter((w) => w.length >= 3);
  return found
    .filter((l) => sameName(l.name, input.name))
    .filter((l) => {
      const theirs = normalizeText(l.address ?? "").split(" ").filter((w) => w.length >= 3);
      return !typed.length || !theirs.length || typed.some((w) => theirs.includes(w));
    })
    .slice(0, 5)
    .map((l) => ({ id: l.id, name: l.name, kind: { slug: l.kind.slug, name: l.kind.nameAr, nameEn: l.kind.nameEn, icon: l.kind.icon }, address: l.address, latitude: l.latitude, longitude: l.longitude }));
}

/**
 * Public places (of the kinds an owner can claim) that have a shop with the same name right next to them: the shop was probably registered
 * on its own, so the place is now shown twice. The admin hides the place, or says it is a different one.
 */
export async function landmarkDuplicates() {
  const [shops, branches] = await Promise.all([
    prisma.merchantProfile.findMany({ where: { approvalStatus: "APPROVED", latitude: { not: null }, longitude: { not: null } }, select: { id: true, businessName: true, address: true, latitude: true, longitude: true }, orderBy: { createdAt: "desc" }, take: 3000 }),
    prisma.shopBranch.findMany({ where: { isActive: true, merchant: { approvalStatus: "APPROVED" } }, select: { merchantId: true, name: true, address: true, latitude: true, longitude: true, merchant: { select: { businessName: true } } }, take: 3000 }),
  ]);
  const points = [
    ...shops.map((s) => ({ shopId: s.id, name: s.businessName, address: s.address, lat: s.latitude!, lng: s.longitude! })),
    ...branches.map((b) => ({ shopId: b.merchantId, name: b.merchant.businessName, address: b.address, lat: b.latitude, lng: b.longitude })),
  ];
  const maxKm = 0.15;
  const pairs = new Map<string, { landmark: { id: string; name: string; address: string | null; latitude: number; longitude: number; kind: { icon: string; nameAr: string } }; shop: { id: string; name: string; address: string | null }; km: number }>();
  for (let i = 0; i < points.length; i += 25) {
    await Promise.all(points.slice(i, i + 25).map(async (p) => {
      const dLat = maxKm / 111.32;
      const dLng = maxKm / (111.32 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
      const near = await prisma.landmark.findMany({
        where: { status: "ACTIVE", duplicateDismissed: false, kind: { claimable: true, isActive: true }, latitude: { gte: p.lat - dLat, lte: p.lat + dLat }, longitude: { gte: p.lng - dLng, lte: p.lng + dLng } },
        include: { kind: true },
        take: 20,
      });
      for (const l of near) {
        const km = distanceKm(l.latitude, l.longitude, p.lat, p.lng);
        if (km > maxKm || !sameName(l.name, p.name)) continue;
        const old = pairs.get(l.id);
        if (!old || km < old.km) pairs.set(l.id, { landmark: { id: l.id, name: l.name, address: l.address, latitude: l.latitude, longitude: l.longitude, kind: { icon: l.kind.icon, nameAr: l.kind.nameAr } }, shop: { id: p.shopId, name: p.name, address: p.address }, km });
      }
    }));
  }
  return [...pairs.values()].sort((a, b) => a.km - b.km);
}

/** "Not the same place": the pair is not offered again. */
export async function dismissDuplicate(landmarkId: string) {
  const l = await prisma.landmark.findUnique({ where: { id: landmarkId }, select: { id: true } });
  if (!l) throw new LandmarkError("Place not found", 404);
  await prisma.landmark.update({ where: { id: landmarkId }, data: { duplicateDismissed: true } });
}

/* ---------------- the admin's side ---------------- */

export async function adminClaims(query: { status?: LandmarkClaimStatus; page: number }) {
  const where: Prisma.LandmarkClaimWhereInput = query.status ? { status: query.status } : {};
  const [total, rows, counts] = await Promise.all([
    prisma.landmarkClaim.count({ where }),
    prisma.landmarkClaim.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * CLAIM_PAGE,
      take: CLAIM_PAGE,
      include: {
        landmark: { select: { id: true, name: true, address: true, latitude: true, longitude: true, sector: true, kind: { select: { icon: true, nameAr: true } } } },
        user: { select: { id: true, fullName: true, email: true, phone: true, merchantProfile: { select: { id: true, businessName: true } } } },
        files: { select: { id: true, name: true, sizeBytes: true } },
      },
    }),
    prisma.landmarkClaim.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { total, pageSize: CLAIM_PAGE, items: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
}

export async function claimFile(fileId: string) {
  return prisma.landmarkClaimFile.findUnique({ where: { id: fileId }, select: { mime: true, data: true, name: true } });
}

async function loadOpenClaim(id: string) {
  const claim = await prisma.landmarkClaim.findUnique({ where: { id }, include: { landmark: true, user: { select: { id: true, fullName: true, language: true } } } });
  if (!claim) throw new LandmarkError("Request not found", 404);
  if (!OPEN.includes(claim.status)) throw new LandmarkError("This request was already decided", 409);
  return claim;
}

export async function askForInfo(id: string, adminId: string, message: string) {
  const claim = await loadOpenClaim(id);
  await prisma.landmarkClaim.update({ where: { id }, data: { status: "NEEDS_INFO", adminMessage: message.trim(), decidedById: adminId } });
  await notify({ userId: claim.userId, type: NotificationType.SYSTEM, title: "نحتاج معلومات إضافية لطلبك", body: `بخصوص طلبك للمطالبة بـ «${claim.landmark.name}»: ${message.trim()}`, data: { type: "landmark_claim", claimId: id } });
}

export async function rejectClaim(id: string, adminId: string, reason: string) {
  const claim = await loadOpenClaim(id);
  await prisma.landmarkClaim.update({ where: { id }, data: { status: "REJECTED", adminMessage: reason.trim(), decidedById: adminId, decidedAt: new Date() } });
  await notify({ userId: claim.userId, type: NotificationType.SYSTEM, title: "ما قدرنا نقبل طلبك", body: `طلبك للمطالبة بـ «${claim.landmark.name}» انرفض. السبب: ${reason.trim()}`, data: { type: "landmark_claim", claimId: id } });
}

/**
 * Approve: the place becomes the claimant's shop. A person who already has a shop gets it as one more branch of that shop;
 * anyone else gets a new approved shop (the admin chooses its profession). The landmark leaves the map as a landmark (the shop's
 * pin takes its place), and every other open request for it is refused.
 */
export async function approveClaim(id: string, adminId: string, input: { categoryId?: string | null }) {
  const claim = await loadOpenClaim(id);
  const place = claim.landmark;
  if (place.status !== "ACTIVE") throw new LandmarkError("This place is not on the map anymore", 409);
  const existing = await prisma.merchantProfile.findUnique({ where: { userId: claim.userId }, select: { id: true } });
  if (!existing && !input.categoryId) throw new LandmarkError("Pick the profession of the new shop", 400);
  if (!existing) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId! }, select: { id: true } });
    if (!category) throw new LandmarkError("Category not found", 404);
  }
  const defaultCountry = existing ? null : await getDefaultCountry();

  const merchantId = await prisma.$transaction(async (tx) => {
    let shopId: string;
    if (existing) {
      await tx.shopBranch.create({ data: { merchantId: existing.id, name: place.name, address: place.address, phone: place.phone ?? claim.contactPhone, latitude: place.latitude, longitude: place.longitude } });
      shopId = existing.id;
    } else {
      const profile = await tx.merchantProfile.create({
        data: {
          userId: claim.userId, businessName: place.name, categoryId: input.categoryId!, address: place.address, latitude: place.latitude, longitude: place.longitude,
          phone: claim.contactPhone || place.phone, approvalStatus: "APPROVED",
        },
      });
      await tx.user.update({ where: { id: claim.userId }, data: { role: Role.MERCHANT } });
      await createBusinessFromMerchantProfile(tx, profile, defaultCountry!.id);
      shopId = profile.id;
    }
    await tx.landmark.update({ where: { id: place.id }, data: { status: "CLAIMED", claimedMerchantId: shopId } });
    await tx.landmarkClaim.update({ where: { id }, data: { status: "APPROVED", decidedById: adminId, decidedAt: new Date(), resultMerchantId: shopId } });
    await tx.landmarkClaim.updateMany({
      where: { landmarkId: place.id, id: { not: id }, status: { in: OPEN } },
      data: { status: "REJECTED", adminMessage: "تم قبول طلب ثاني لنفس المكان", decidedById: adminId, decidedAt: new Date() },
    });
    return shopId;
  });

  await notify({
    userId: claim.userId, type: NotificationType.SYSTEM, title: "تمت الموافقة على طلبك ✅",
    body: `صار «${place.name}» محلّك على دليلكم. تقدر تعدّل معلوماته من وضع النشاط.`, data: { type: "landmark_claim", claimId: id },
  });
  const others = await prisma.landmarkClaim.findMany({ where: { landmarkId: place.id, id: { not: id }, status: "REJECTED", decidedById: adminId, adminMessage: "تم قبول طلب ثاني لنفس المكان" }, select: { userId: true } });
  for (const o of others) {
    await notify({ userId: o.userId, type: NotificationType.SYSTEM, title: "ما قدرنا نقبل طلبك", body: `طلبك للمطالبة بـ «${place.name}» انرفض: تم قبول طلب ثاني لنفس المكان.` });
  }
  return { merchantId, asBranch: !!existing };
}

import { prisma } from "../prisma";
import { notify } from "./notification.service";
import { screenListing } from "./ai.service";

/**
 * First review pass for user-to-user marketplace ads. A clear ordinary item goes live automatically;
 * uncertain or unavailable AI results stay in the admin queue; a clear policy violation is rejected.
 */
export async function moderateMarketplaceListing(id: string) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id } });
  if (!listing) return null;

  let status: "ACTIVE" | "PENDING_REVIEW" | "REJECTED" = "PENDING_REVIEW";
  let reviewNote: string | null = null;
  let photo: { mime: "image/jpeg" | "image/png" | "image/webp"; data: Buffer } | null = null;
  if (listing.imageUrl?.startsWith("/marketplace/photos/")) {
    const photoId = listing.imageUrl.slice("/marketplace/photos/".length);
    const stored = await prisma.marketplacePhoto.findUnique({ where: { id: photoId }, select: { mime: true, data: true } });
    if (stored && ["image/jpeg", "image/png", "image/webp"].includes(stored.mime)) {
      photo = { mime: stored.mime as "image/jpeg" | "image/png" | "image/webp", data: Buffer.from(stored.data) };
    }
  }

  const result = await screenListing({ name: listing.title, description: listing.description }, photo);
  if (result?.verdict === "OK") status = "ACTIVE";
  else if (result?.verdict === "BLOCK") {
    status = "REJECTED";
    reviewNote = result.reasons.join("، ") || "الإعلان لا يناسب قواعد النشر";
  } else if (result?.verdict === "REVIEW") reviewNote = result.reasons.join("، ") || null;

  const updated = await prisma.marketplaceListing.update({ where: { id }, data: { status, reviewNote } });
  if (status === "PENDING_REVIEW") {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    await Promise.all(admins.map(admin => notify({ userId: admin.id, type: "SYSTEM", title: "إعلان مستخدم بانتظار المراجعة", body: listing.title, data: { kind: "MARKETPLACE_REVIEW", listingId: id }, email: false })));
  } else if (status === "ACTIVE") {
    await notify({ userId: listing.userId, type: "SYSTEM", title: "تمت الموافقة على إعلانك ✅", body: `«${listing.title}» صار ظاهراً في سوق المستخدمين.`, data: { kind: "MARKETPLACE_APPROVED", listingId: id }, email: false });
  } else {
    await notify({ userId: listing.userId, type: "SYSTEM", title: "لم تتم الموافقة على إعلانك", body: `«${listing.title}»: ${reviewNote}`, data: { kind: "MARKETPLACE_REJECTED", listingId: id }, email: false });
  }
  return updated;
}

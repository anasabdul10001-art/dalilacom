import { prisma } from "../prisma";
import { screenListing, visionAvailable } from "./ai.service";
import { notify } from "./notification.service";

/**
 * Nothing a shop publishes is shown before it is looked at. The AI reads the words and, when a provider can see, the first
 * picture: a clear violation is refused at once (the shop is told why and can fix it), an ordinary product goes live, and
 * anything the AI is unsure about — or when no AI answers — waits for an admin. PRODUCT_REVIEW=off turns it off (tests).
 */
export const reviewEnabled = () => process.env.PRODUCT_REVIEW !== "off";

/** Changing one of these means the product has to be looked at again; the price and the stock do not. */
export const REVIEWED_FIELDS = ["name", "description", "images", "specs", "condition"] as const;

type Outcome = { moderation: "APPROVED" | "PENDING" | "REJECTED"; note: string | null };

/** Up to three of the product's own pictures, when a provider can see (every picture counts: an improper one must not hide behind a good first one). */
async function pictures(images: string[], max = 3) {
  if (!visionAvailable()) return [];
  const ids = images.filter((i) => i.startsWith("/store/photos/")).slice(0, max).map((i) => i.slice("/store/photos/".length));
  const out: { mime: "image/jpeg" | "image/png" | "image/webp"; data: Buffer }[] = [];
  for (const id of ids) {
    const photo = await prisma.productPhoto.findUnique({ where: { id } });
    if (photo) out.push({ mime: photo.mime as "image/jpeg" | "image/png" | "image/webp", data: Buffer.from(photo.data) });
  }
  return out;
}

async function tellAdmins(shopName: string, productName: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ userId: a.id, type: "SYSTEM", title: "منتج بانتظار المراجعة", body: `${shopName}: ${productName}`, data: { kind: "PRODUCT_REVIEW" }, email: false })));
}

/** Looks at one product, saves the outcome on it and returns it. */
export async function moderateProduct(productId: string): Promise<Outcome> {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { merchant: { select: { userId: true, businessName: true } } } });
  if (!product) return { moderation: "APPROVED", note: null };
  let outcome: Outcome = { moderation: "APPROVED", note: null };
  if (reviewEnabled()) {
    const specs = Array.isArray(product.specs) ? (product.specs as { label: string; value: string }[]) : [];
    const listing = { name: product.name, description: product.description, specs };
    const photos = await pictures(product.images.length ? product.images : product.imageUrl ? [product.imageUrl] : []);
    // the words with the first picture, then each other picture on its own: the worst answer decides, and a picture nobody could read means an admin looks
    let screening = await screenListing(listing, photos[0] ?? null);
    const rank = { OK: 0, REVIEW: 1, BLOCK: 2 } as const;
    for (const extra of photos.slice(1)) {
      if (!screening) break;
      if (screening.verdict === "BLOCK") continue;
      const more = await screenListing(listing, extra);
      if (!more) { screening = null; break; }
      if (rank[more.verdict] > rank[screening.verdict]) screening = { verdict: more.verdict, reasons: [...screening.reasons, ...more.reasons] };
    }
    if (!screening) outcome = { moderation: "PENDING", note: null };
    else if (screening.verdict === "OK") outcome = { moderation: "APPROVED", note: null };
    else if (screening.verdict === "BLOCK") outcome = { moderation: "REJECTED", note: screening.reasons.join("، ") || null };
    else outcome = { moderation: "PENDING", note: screening.reasons.join("، ") || null };
  }
  await prisma.product.update({ where: { id: product.id }, data: { moderation: outcome.moderation, moderationNote: outcome.note, moderatedAt: outcome.moderation === "PENDING" ? null : new Date() } });
  if (outcome.moderation === "PENDING") await tellAdmins(product.merchant.businessName, product.name);
  if (outcome.moderation === "REJECTED") {
    await notify({ userId: product.merchant.userId, type: "SYSTEM", title: "ما انقبل منتجك", body: `«${product.name}»: ${outcome.note ?? "غير مناسب للنشر"}`, data: { kind: "PRODUCT_REJECTED", productId: product.id }, email: false });
  }
  return outcome;
}

/** An admin's decision on a product that was waiting. */
export async function decideProduct(productId: string, approve: boolean, reason: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { merchant: { select: { userId: true } } } });
  if (!product) return null;
  await prisma.product.update({ where: { id: productId }, data: { moderation: approve ? "APPROVED" : "REJECTED", moderationNote: approve ? null : reason || null, moderatedAt: new Date() } });
  await notify({
    userId: product.merchant.userId,
    type: "SYSTEM",
    title: approve ? "منتجك صار بالمتجر ✅" : "ما انقبل منتجك",
    body: approve ? `«${product.name}» انقبل وصار الزبائن بيشوفوه.` : `«${product.name}»: ${reason || "غير مناسب للنشر"}`,
    data: { kind: approve ? "PRODUCT_APPROVED" : "PRODUCT_REJECTED", productId },
    email: false,
  });
  return product;
}

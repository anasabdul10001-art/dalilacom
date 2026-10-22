import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { audienceUserIds, MAX_ADMIN_RECIPIENTS } from "./broadcast.service";
import { distanceKm } from "./landmark.service";
import { notify } from "./notification.service";
import { getSettings } from "./settings.service";

/**
 * When the team approves a shop's new discount, the people the platform settings choose are told about it (once).
 * The super admin picks who in the admin panel: everyone, the people of the shop's city, only card holders, the shop's followers,
 * or whoever is near the shop. Cards holders are people with an active membership.
 */

/** The city of a shop: its owner's own city, else the nearest city to its pin (within 60 km). */
export async function cityOfShop(merchant: { id: string; userId: string; latitude: number | null; longitude: number | null }): Promise<string | null> {
  const owner = await prisma.user.findUnique({ where: { id: merchant.userId }, select: { cityId: true } });
  if (owner?.cityId) return owner.cityId;
  if (merchant.latitude == null || merchant.longitude == null) return null;
  const cities = await prisma.geoUnit.findMany({ where: { level: "CITY", isActive: true, latitude: { not: null }, longitude: { not: null } }, select: { id: true, latitude: true, longitude: true } });
  let best: { id: string; km: number } | null = null;
  for (const c of cities) {
    const km = distanceKm(merchant.latitude, merchant.longitude, c.latitude!, c.longitude!);
    if (km <= 60 && (!best || km < best.km)) best = { id: c.id, km };
  }
  return best?.id ?? null;
}

async function activeMemberIds(): Promise<Set<string>> {
  const rows = await prisma.membership.findMany({ where: { status: "ACTIVE", endDate: { gt: new Date() } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/** Who would be told about a discount of this shop under the current settings (no one is notified here). */
export async function discountAudience(merchant: { id: string; userId: string; latitude: number | null; longitude: number | null }): Promise<{ ids: string[]; mode: string }> {
  const { discountNotify: cfg } = await getSettings();
  if (cfg.mode === "OFF") return { ids: [], mode: cfg.mode };
  const exclude = merchant.userId;
  const picked = new Set<string>();
  const add = (list: string[]) => list.forEach((id) => picked.add(id));
  const city = cfg.mode === "CITY" || cfg.mode === "CITY_MEMBERS" ? await cityOfShop(merchant) : null;

  if (cfg.mode === "CITY" && city) add(await audienceUserIds({ geoUnitId: city }, { exclude }));
  if (cfg.mode === "CITY_MEMBERS" && city) {
    const members = await activeMemberIds();
    add((await audienceUserIds({ geoUnitId: city }, { exclude })).filter((id) => members.has(id)));
  }
  if (cfg.mode === "MEMBERS") add([...(await activeMemberIds())].filter((id) => id !== exclude));
  if (cfg.mode === "RADIUS" && merchant.latitude != null && merchant.longitude != null) {
    add(await audienceUserIds({ latitude: merchant.latitude, longitude: merchant.longitude, radiusKm: cfg.radiusKm }, { exclude }));
  }
  if (cfg.mode === "COUNTRY") {
    const owner = await prisma.user.findUnique({ where: { id: merchant.userId }, select: { countryCode: true } });
    const country = owner?.countryCode ? await prisma.country.findUnique({ where: { isoCode2: owner.countryCode }, select: { id: true } }) : null;
    if (country) add(await audienceUserIds({ countryId: country.id }, { exclude }));
    else add(await audienceUserIds({ everyone: true }, { exclude })); // one country on the platform: its people are everyone
  }
  if (cfg.mode === "EVERYONE") add(await audienceUserIds({ everyone: true }, { exclude }));
  if (cfg.mode === "FOLLOWERS" || cfg.alsoFollowers) add(await audienceUserIds({ followers: true }, { exclude, followersOf: merchant.id }));
  return { ids: [...picked].slice(0, MAX_ADMIN_RECIPIENTS), mode: cfg.mode };
}

/** Tells the audience about a just-approved discount, once. Returns how many were reached. */
export async function announceDiscount(discountId: string): Promise<{ targeted: number; delivered: number }> {
  const claimed = await prisma.discount.updateMany({ where: { id: discountId, announcedAt: null, status: "APPROVED", isActive: true }, data: { announcedAt: new Date() } });
  if (claimed.count === 0) return { targeted: 0, delivered: 0 }; // already announced (an edit sent to review again is not announced twice), or not live
  const d = await prisma.discount.findUnique({ where: { id: discountId }, include: { merchant: { select: { id: true, userId: true, businessName: true, latitude: true, longitude: true } } } });
  if (!d) return { targeted: 0, delivered: 0 };
  const { ids } = await discountAudience(d.merchant);
  const data: Prisma.InputJsonObject = { kind: "MERCHANT_PROMO", merchantId: d.merchant.id, businessName: d.merchant.businessName, discountId: d.id };
  const title = `🏷️ حسم ${d.percent}% عند ${d.merchant.businessName}`;
  const body = d.title;
  let delivered = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const results = await Promise.all(ids.slice(i, i + 20).map((userId) => notify({ userId, type: "NEW_OFFER", title, body, data, email: false })));
    delivered += results.filter((x) => x.created).length;
  }
  return { targeted: ids.length, delivered };
}

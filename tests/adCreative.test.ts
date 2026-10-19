import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import sharp from "sharp";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { reservedIsoCode2, uniqueEmail } from "./helpers";
import { adjustBalance } from "../src/services/wallet.service";

afterAll(async () => {
  await request(app).put("/admin/settings").set((await admin()).auth).send({ ads: { autoApprove: false } });
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Cr ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const admin = () => account("cradmin", { role: "ADMIN" });

async function freshCountry(): Promise<string> {
  for (let i = 0; i < 700; i++) {
    const iso = await reservedIsoCode2(prisma);
    if ((await prisma.adBooking.count({ where: { countryCode: iso } })) === 0) return iso;
  }
  throw new Error("no free country code");
}

async function shop(country: string) {
  const cat = await prisma.category.upsert({ where: { slug: "cr-test-cat" }, update: {}, create: { name: "Cr Test", slug: "cr-test-cat" } });
  const owner = await account("crshop", { countryCode: country });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Cr Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Cr product", priceCents: 1000, stock: 5, categoryId: cat.id });
  expect(product.status).toBe(201);
  await prisma.$transaction((tx) => adjustBalance(tx, owner.id, 100000, "TOPUP", "test"));
  return { owner, productId: product.body.id as string, merchantId: reg.body.id as string };
}

const picture = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 60, b: 70 } } }).png().toBuffer();
const put = (path: string, auth: object, body: Buffer) => request(app).put(path).set(auth).set("Content-Type", "image/png").send(body);

describe("the picture of a booking", () => {
  it("tells the exact sizes, and cuts any picture to the right one", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 100 }], bannerPackages: [{ days: 1, credits: 200 }], autoApprove: false } });
    const s = await shop(await freshCountry());
    const packs = await request(app).get("/ads/packages").set(s.owner.auth);
    expect(packs.body.sizes).toEqual({ banner: { width: 1600, height: 600 }, space: { width: 800, height: 500 } });

    const banner = await request(app).post("/ads/banners").set(s.owner.auth).send({ days: 1, phone: "+963944111222" });
    expect(banner.status).toBe(201);
    const up = await put(`/ads/banners/${banner.body.id}/image`, s.owner.auth, await picture(900, 900)); // a square photo
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ width: 1600, height: 600 });
    const stored = await prisma.adCreative.findUniqueOrThrow({ where: { kind_bookingId: { kind: "BANNER", bookingId: banner.body.id } } });
    const meta = await sharp(Buffer.from(stored.data)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1600, 600, "jpeg"]);

    // a text file is refused; somebody else's booking is not found
    expect((await put(`/ads/banners/${banner.body.id}/image`, s.owner.auth, Buffer.from("not a picture at all, sorry"))).status).toBe(415);
    const other = await shop(await freshCountry());
    expect((await put(`/ads/banners/${banner.body.id}/image`, other.owner.auth, await picture(1600, 600))).status).toBe(404);

    // the shop sees that it sent one; the admin sees it too and opens it
    const mine = (await request(app).get("/ads/banners/mine").set(s.owner.auth)).body;
    expect(mine.find((b: { id: string }) => b.id === banner.body.id).hasImage).toBe(true);
    expect((await request(app).get(`/ads/banners/${banner.body.id}/image`).set(s.owner.auth)).headers["content-type"]).toBe("image/jpeg");
    const list = (await request(app).get("/admin/banner-bookings").set(a.auth)).body;
    expect(list.find((b: { id: string }) => b.id === banner.body.id).hasImage).toBe(true);
    expect((await request(app).get(`/admin/ad-creatives/banner/${banner.body.id}`).set(a.auth)).status).toBe(200);
    expect((await request(app).get(`/admin/ad-creatives/banner/${banner.body.id}`).set(s.owner.auth)).status).toBe(403);

    // the banner the admin makes for the booking takes the shop's picture
    const made = await request(app).post("/admin/banners").set(a.auth).send({ title: "Cr banner", bookingId: banner.body.id, targetType: "shop", targetValue: s.merchantId });
    expect(made.status).toBe(201);
    const row = await prisma.storeBanner.findUniqueOrThrow({ where: { id: made.body.id }, select: { imageMime: true, imageData: true } });
    expect(row.imageMime).toBe("image/jpeg");
    expect(row.imageData).not.toBeNull();
    // and once it is scheduled the shop can no longer swap the picture under it
    expect((await put(`/ads/banners/${banner.body.id}/image`, s.owner.auth, await picture(1600, 600))).status).toBe(409);
    await prisma.storeBanner.delete({ where: { id: made.body.id } });
  });

  it("a small space shows the shop's picture instead of the product's only while the ad runs", async () => {
    const a = await admin();
    const iso = await freshCountry();
    const s = await shop(iso);
    const ad = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1 });
    expect(ad.status).toBe(201);
    expect(ad.body.status).toBe("PENDING");
    expect((await put(`/ads/${ad.body.id}/image`, s.owner.auth, await picture(1000, 400))).body).toMatchObject({ width: 800, height: 500 });
    expect((await request(app).get("/ads/mine").set(s.owner.auth)).body.find((x: { id: string }) => x.id === ad.body.id).hasImage).toBe(true);
    expect((await request(app).get("/admin/ads").set(a.auth)).body.find((x: { id: string }) => x.id === ad.body.id).hasImage).toBe(true);
    expect((await request(app).get(`/store/ad-images/${ad.body.id}`)).status).toBe(404); // not approved yet: not public

    await request(app).post(`/admin/ads/${ad.body.id}/approve`).set(a.auth).expect(200);
    const home = await request(app).get("/store/home").set("CF-IPCountry", iso);
    const slot = home.body.slots.find((x: { adId: string | null }) => x.adId === ad.body.id);
    expect(slot.creativeUrl).toBe(`/store/ad-images/${ad.body.id}`);
    const pic = await request(app).get(slot.creativeUrl);
    expect(pic.status).toBe(200);
    expect(pic.headers["content-type"]).toBe("image/jpeg");
    // a new picture a moment after approval sends the ad back to be looked at; an ad that has been running a while keeps its picture
    expect((await put(`/ads/${ad.body.id}/image`, s.owner.auth, await picture(800, 500))).status).toBe(200);
    expect((await prisma.adBooking.findUniqueOrThrow({ where: { id: ad.body.id } })).status).toBe("PENDING");
    expect((await request(app).get(`/store/ad-images/${ad.body.id}`)).status).toBe(404);
    await request(app).post(`/admin/ads/${ad.body.id}/approve`).set(a.auth).expect(200);
    await prisma.adBooking.update({ where: { id: ad.body.id }, data: { createdAt: new Date(Date.now() - 3 * 3600 * 1000) } });
    expect((await put(`/ads/${ad.body.id}/image`, s.owner.auth, await picture(800, 500))).status).toBe(409);
  });
});

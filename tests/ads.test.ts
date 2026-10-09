import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { reservedIsoCode2, uniqueEmail } from "./helpers";
import { adjustBalance } from "../src/services/wallet.service";
import { AD_SLOTS } from "../src/services/ads.service";

afterAll(async () => {
  await request(app).put("/admin/settings").set((await admin()).auth).send({ ads: { autoApprove: false } });
  await prisma.$disconnect();
});

// A country code nobody has booked space in before (the test database keeps what earlier runs left behind).
async function freshCountry(): Promise<string> {
  for (let i = 0; i < 700; i++) {
    const iso = await reservedIsoCode2(prisma);
    if ((await prisma.adBooking.count({ where: { countryCode: iso } })) === 0) return iso;
  }
  throw new Error("no free country code");
}

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Ads ${prefix}` });
  expect(registered.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const admin = () => account("adsadmin", { role: "ADMIN" });

async function shop(country: string, credits: number) {
  const cat = await prisma.category.upsert({ where: { slug: "ads-test-cat" }, update: {}, create: { name: "Ads Test", slug: "ads-test-cat" } });
  const owner = await account("adsshop", { countryCode: country });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Ads Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Ads product", priceCents: 1000, stock: 5, categoryId: cat.id });
  expect(product.status).toBe(201);
  if (credits > 0) await prisma.$transaction((tx) => adjustBalance(tx, owner.id, credits, "TOPUP", "test"));
  return { owner, productId: product.body.id as string, merchantId: reg.body.id as string };
}

const balance = async (userId: string) => (await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? 0;
const home = (iso: string) => request(app).get("/store/home").set("CF-IPCountry", iso);

describe("advertising space: what it costs", () => {
  it("shows the packages the admin set, and the shop's balance", async () => {
    const a = await admin();
    const set = await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 100 }, { days: 3, credits: 250 }, { days: 5, credits: 400 }], autoApprove: false, bannerSeconds: 7 } });
    expect(set.status).toBe(200);
    const iso = await freshCountry();
    const s = await shop(iso, 123);
    const res = await request(app).get("/ads/packages").set(s.owner.auth);
    expect(res.body.packages).toEqual([{ days: 1, credits: 100 }, { days: 3, credits: 250 }, { days: 5, credits: 400 }]);
    expect(res.body.balance).toBe(123);
    expect(res.body.slots).toBe(AD_SLOTS);
    expect((await request(app).get("/ads/packages")).body.balance).toBeNull(); // a visitor
  });
});

describe("booking and approving", () => {
  it("pays from the wallet, waits for approval, then runs in the first free space of the shop's country", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 100 }, { days: 3, credits: 250 }], autoApprove: false } });
    const iso = await freshCountry();
    const s = await shop(iso, 1000);

    const booked = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 3 });
    expect(booked.status).toBe(201);
    expect(booked.body.status).toBe("PENDING");
    expect(booked.body.slot).toBe(1);
    expect(await balance(s.owner.id)).toBe(750);

    // not shown until approved
    expect((await home(iso)).body.slots.some((x: { ad: boolean }) => x.ad)).toBe(false);
    const pending = await request(app).get("/admin/ads").query({ status: "PENDING" }).set(a.auth);
    expect(pending.body.some((x: { id: string }) => x.id === booked.body.id)).toBe(true);

    expect((await request(app).post(`/admin/ads/${booked.body.id}/approve`).set(a.auth)).status).toBe(200);
    const shown = await home(iso);
    const ad = shown.body.slots.find((x: { ad: boolean }) => x.ad);
    expect(ad.slot).toBe(1);
    expect(ad.product.id).toBe(s.productId);

    // another country does not see it
    const other = await freshCountry();
    expect((await home(other)).body.slots.some((x: { ad: boolean }) => x.ad)).toBe(false);

    // it was counted, and so is a tap on it
    const again = await home(iso);
    expect(again.status).toBe(200);
    await request(app).post(`/ads/${booked.body.id}/click`);
    await new Promise((r) => setTimeout(r, 200));
    const mine = await request(app).get("/ads/mine").set(s.owner.auth);
    expect(mine.body[0]).toMatchObject({ state: "LIVE", clicks: 1 });
    expect(mine.body[0].impressions).toBeGreaterThanOrEqual(1);
  });

  it("refuses a day count that is not for sale, a product that is not the shop's, and an empty wallet", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 100 }] } });
    const iso = await freshCountry();
    const s = await shop(iso, 50);
    expect((await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 2 })).status).toBe(400);
    const stranger = await shop(iso, 0);
    expect((await request(app).post("/ads").set(s.owner.auth).send({ productId: stranger.productId, days: 1 })).status).toBe(404);
    const poor = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1 });
    expect(poor.status).toBe(402);
    expect(await balance(s.owner.id)).toBe(50);
    expect((await request(app).get("/ads/mine").set(s.owner.auth)).body).toEqual([]);
  });

  it("gives the money back when the admin refuses, or when the shop cancels before approval", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 100 }], autoApprove: false } });
    const iso = await freshCountry();
    const s = await shop(iso, 300);
    const one = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1 });
    const two = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1, start: new Date(Date.now() + 3 * 86400000).toISOString() });
    expect(await balance(s.owner.id)).toBe(100);
    expect((await request(app).post(`/admin/ads/${one.body.id}/reject`).set(a.auth).send({ reason: "no" })).status).toBe(200);
    expect(await balance(s.owner.id)).toBe(200);
    expect((await request(app).post(`/ads/${two.body.id}/cancel`).set(s.owner.auth)).status).toBe(200);
    expect(await balance(s.owner.id)).toBe(300);
    // already handled: nothing more to refund
    expect((await request(app).post(`/admin/ads/${one.body.id}/reject`).set(a.auth).send({})).status).toBe(409);
    expect(await balance(s.owner.id)).toBe(300);
  });

  it("runs at once when the admin turned automatic approval on", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 10 }], autoApprove: true } });
    const iso = await freshCountry();
    const s = await shop(iso, 10);
    const booked = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1 });
    expect(booked.body.status).toBe("ACTIVE");
    expect((await home(iso)).body.slots.some((x: { ad: boolean; product: { id: string } }) => x.ad && x.product.id === s.productId)).toBe(true);
  });

  it("has a fixed number of spaces: once all are taken the next booking is refused with the next free time", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { packages: [{ days: 1, credits: 1 }], autoApprove: true } });
    const iso = await freshCountry();
    const s = await shop(iso, 100);
    for (let i = 0; i < AD_SLOTS; i++) {
      const ok = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1 });
      expect(ok.status).toBe(201);
      expect(ok.body.slot).toBe(i + 1);
    }
    const full = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1 });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("NO_SPACE");
    expect(full.body.error.details.nextAvailable).toBeTruthy();
    // a later day is free
    const later = await request(app).post("/ads").set(s.owner.auth).send({ productId: s.productId, days: 1, start: full.body.error.details.nextAvailable });
    expect(later.status).toBe(201);
  });

  it("is only for approved shops", async () => {
    const customer = await account("adscustomer");
    expect((await request(app).post("/ads").set(customer.auth).send({ productId: crypto.randomUUID(), days: 1 })).status).toBe(403);
    expect((await request(app).post("/ads").send({})).status).toBe(401);
  });
});

describe("the big banners of the front page", () => {
  it("shows only the active, current, own-country ones, in the admin's order, with their picture", async () => {
    const a = await admin();
    await request(app).put("/admin/settings").set(a.auth).send({ ads: { bannerSeconds: 9 } });
    const iso = await freshCountry();
    const other = await freshCountry();
    const tag = crypto.randomUUID().slice(0, 6);
    const make = async (body: object) => (await request(app).post("/admin/banners").set(a.auth).send({ title: `B ${tag}`, ...body })).body;
    const first = await make({ title: `first ${tag}`, countryCode: iso, bg: "black" });
    const second = await make({ title: `second ${tag}`, countryCode: iso, targetType: "section", targetValue: "fashion" });
    await make({ title: `inactive ${tag}`, countryCode: iso, isActive: false });
    await make({ title: `expired ${tag}`, countryCode: iso, endsAt: new Date(Date.now() - 86400000).toISOString() });
    await make({ title: `later ${tag}`, countryCode: iso, startsAt: new Date(Date.now() + 86400000).toISOString() });
    await make({ title: `abroad ${tag}`, countryCode: other });

    // (banners for every country that other people made are not ours to judge: look at this test's own)
    const mine = (res: { body: { banners: { title: string }[] } }) => res.body.banners.filter((b) => b.title.includes(tag)).map((b) => b.title);
    const res = await request(app).get("/store/banners").set("CF-IPCountry", iso);
    expect(res.body.intervalSeconds).toBe(9);
    expect(mine(res)).toEqual([`first ${tag}`, `second ${tag}`]);
    expect(res.body.banners.find((b: { title: string }) => b.title === `second ${tag}`).target).toEqual({ type: "section", value: "fashion" });

    // reorder, then a picture
    expect((await request(app).put("/admin/banners-order").set(a.auth).send({ ids: [second.id, first.id] })).status).toBe(200);
    expect(mine(await request(app).get("/store/banners").set("CF-IPCountry", iso))).toEqual([`second ${tag}`, `first ${tag}`]);

    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
    expect((await request(app).put(`/admin/banners/${first.id}/image`).set(a.auth).set("Content-Type", "image/png").send(png)).status).toBe(200);
    const withImage = (await request(app).get("/store/banners").set("CF-IPCountry", iso)).body.banners.find((b: { id: string }) => b.id === first.id);
    expect(withImage.imageUrl).toContain(`/store/banners/${first.id}/image`);
    const picture = await request(app).get(withImage.imageUrl);
    expect(picture.status).toBe(200);
    expect(picture.headers["content-type"]).toBe("image/png");
    expect((await request(app).put(`/admin/banners/${first.id}/image`).set(a.auth).set("Content-Type", "image/png").send(Buffer.from("not an image at all"))).status).toBe(415);

    // taps are counted
    await request(app).post(`/store/banners/${first.id}/click`);
    const listed = (await request(app).get("/admin/banners").set(a.auth)).body.find((b: { id: string }) => b.id === first.id);
    expect(listed.clicks).toBe(1);
    expect(listed.views).toBeGreaterThanOrEqual(1);

    // a customer cannot manage them
    const customer = await account("adscust2");
    expect((await request(app).post("/admin/banners").set(customer.auth).send({ title: "x" })).status).toBe(403);
  });
});

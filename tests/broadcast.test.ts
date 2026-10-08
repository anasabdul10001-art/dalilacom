import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { emailService } from "../src/services/email.service";
import { freeIsoCode2, uniqueEmail } from "./helpers";
import { resetAiProviderState } from "../src/services/ai.service";
import { adjustBalance } from "../src/services/wallet.service";

const sendSpy = vi.spyOn(emailService, "send").mockResolvedValue();
beforeEach(() => {
  resetAiProviderState();
  sendSpy.mockClear();
  // no AI provider unless a test provides one: the admin review is what is always there
  delete process.env.GROQ_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});
afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Broadcast ${prefix}` });
  expect(registered.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const admin = () => account("bcadmin", { role: "ADMIN" });

const received = (userId: string, type?: string) => prisma.notification.findMany({ where: { userId, ...(type ? { type: type as never } : {}) } });

/** A throwaway country with Region > City > Area, so no other test's users can fall inside it. */
async function place() {
  const iso = await freeIsoCode2(prisma);
  const country = await prisma.country.create({ data: { name: `Bc-${iso}-${Date.now()}`, isoCode2: iso, currencyCode: "TST" } });
  const region = await prisma.geoUnit.create({ data: { countryId: country.id, level: "REGION", name: "Region" } });
  const city = await prisma.geoUnit.create({ data: { countryId: country.id, level: "CITY", name: "City", parentId: region.id } });
  const otherCity = await prisma.geoUnit.create({ data: { countryId: country.id, level: "CITY", name: "Other city", parentId: region.id } });
  const area = await prisma.geoUnit.create({ data: { countryId: country.id, level: "AREA", name: "Area", parentId: city.id } });
  return { iso, country, region, city, otherCity, area };
}

async function approvedShop(lat: number | null, lng: number | null) {
  const cat = await prisma.category.upsert({ where: { slug: "bc-test-cat" }, update: {}, create: { name: "Broadcast Test", slug: "bc-test-cat" } });
  const owner = await account("bcshop");
  const reg = await request(app)
    .post("/merchant/register")
    .set(owner.auth)
    .send({ businessName: `Bc Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED", latitude: lat, longitude: lng } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Bc product", priceCents: 1000, stock: 5, categoryId: cat.id });
  const discount = await request(app).post("/merchant/discounts").set(owner.auth).send({ title: "20% off", percent: 20 });
  return { owner, merchantId: reg.body.id as string, productId: product.body.id as string, discountId: discount.body.id as string };
}

describe("Who may broadcast", () => {
  it("is for admins and merchants only", async () => {
    const customer = await account("bccustomer");
    expect((await request(app).post("/broadcasts").send({ title: "x", body: "y" })).status).toBe(401);
    expect((await request(app).post("/broadcasts/preview").set(customer.auth).send({})).status).toBe(403);
    expect((await request(app).get("/broadcasts").set(customer.auth)).status).toBe(403);
  });
});

describe("Admin announcements by country, region, city and area", () => {
  it("reaches exactly the people in the chosen place (profile city or saved address), and nobody else", async () => {
    const p = await place();
    const inCity = await account("bcincity", { countryCode: p.iso, cityId: p.city.id });
    const inOtherCity = await account("bcothercity", { countryCode: p.iso, cityId: p.otherCity.id });
    const inArea = await account("bcinarea");
    await prisma.address.create({ data: { userId: inArea.id, countryId: p.country.id, regionId: p.region.id, cityId: p.city.id, areaId: p.area.id } });
    const elsewhere = await account("bcelsewhere", { countryCode: "ZZ" });
    const disabled = await account("bcdisabled", { countryCode: p.iso, isDisabled: true });
    const boss = await admin();
    const preview = async (body: object) => (await request(app).post("/broadcasts/preview").set(boss.auth).send(body)).body.count as number;

    expect(await preview({ countryId: p.country.id })).toBe(3); // city + other city (countryCode) + area (address), not the disabled one
    expect(await preview({ geoUnitId: p.region.id })).toBe(3); // everything beneath the region
    expect(await preview({ geoUnitId: p.city.id })).toBe(2); // the city's own people + the area's
    expect(await preview({ geoUnitId: p.otherCity.id })).toBe(1);
    expect(await preview({ geoUnitId: p.area.id })).toBe(1);
    expect(await preview({ countryId: p.country.id, role: "MERCHANT" })).toBe(0);

    sendSpy.mockClear();
    const sent = await request(app).post("/broadcasts").set(boss.auth).send({ geoUnitId: p.city.id, title: "تنبيه للمدينة", body: "انقطاع مياه غدًا" });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ targeted: 2, delivered: 2 });
    for (const who of [inCity, inArea]) {
      const [n] = await received(who.id, "SYSTEM");
      expect(n).toMatchObject({ title: "تنبيه للمدينة", body: "انقطاع مياه غدًا" });
      expect(n.data).toMatchObject({ kind: "BROADCAST" });
    }
    for (const who of [inOtherCity, elsewhere, disabled]) expect(await received(who.id)).toHaveLength(0);
    // an announcement to a city is never turned into a mass email
    expect(sendSpy).not.toHaveBeenCalledWith(expect.objectContaining({ to: inCity.email }));

    const history = await request(app).get("/broadcasts").set(boss.auth);
    expect(history.body[0]).toMatchObject({ id: sent.body.id, scope: "PLACE", geoUnitId: p.city.id, targeted: 2, senderRole: "ADMIN" });
  });

  it("skips people who switched that kind off, and refuses unclear or unknown targets", async () => {
    const p = await place();
    const keeps = await account("bckeeps", { countryCode: p.iso });
    const mutes = await account("bcmutes", { countryCode: p.iso });
    await prisma.notificationPreference.create({ data: { userId: mutes.id, type: "SYSTEM", mode: "OFF" } });
    const boss = await admin();

    const sent = await request(app).post("/broadcasts").set(boss.auth).send({ countryId: p.country.id, title: "t", body: "b" });
    expect(sent.body).toMatchObject({ targeted: 2, delivered: 1 });
    expect(await received(keeps.id)).toHaveLength(1);
    expect(await received(mutes.id)).toHaveLength(0);

    const both = await request(app).post("/broadcasts").set(boss.auth).send({ countryId: p.country.id, geoUnitId: p.city.id, title: "t", body: "b" });
    expect(both.status).toBe(400);
    expect(both.body.error.code).toBe("BAD_TARGET");
    expect((await request(app).post("/broadcasts").set(boss.auth).send({ title: "t", body: "b" })).status).toBe(400);
    expect((await request(app).post("/broadcasts").set(boss.auth).send({ geoUnitId: crypto.randomUUID(), title: "t", body: "b" })).status).toBe(404);
    expect((await request(app).post("/broadcasts").set(boss.auth).send({ countryId: p.country.id, title: "", body: "b" })).status).toBe(400);
    expect((await request(app).post("/broadcasts").set(boss.auth).send({ countryId: p.country.id, title: "t", body: "b", productId: crypto.randomUUID() })).status).toBe(400);
  });
});

describe("A person's own position", () => {
  it("is stored rounded to ~1 km and can be forgotten", async () => {
    const user = await account("bcposition");
    expect((await request(app).put("/profile/location").set(user.auth).send({ latitude: 91, longitude: 0 })).status).toBe(400);
    expect((await request(app).put("/profile/location").set(user.auth).send({ latitude: 33.51234, longitude: 36.29876 })).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { lastLatitude: true, lastLongitude: true } })).toEqual({ lastLatitude: 33.51, lastLongitude: 36.3 });
    expect((await request(app).delete("/profile/location").set(user.auth)).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { lastLatitude: true } })).toEqual({ lastLatitude: null });
  });
});

describe("A merchant's announcement around their shop — reviewed before anyone receives it", () => {
  // open sea, so leftover rows from other runs cannot be "nearby"
  const lat = -55 + Math.random() * 5;
  const lng = -140 + Math.random() * 10;

  it("waits for an admin; once approved it reaches people within the distance, with the product/offer attached, never the shop itself", async () => {
    const shop = await approvedShop(lat, lng);
    const near = await account("bcnear", { lastLatitude: lat + 0.02, lastLongitude: lng }); // ~2 km
    const nearAddress = await account("bcnearaddr");
    const country = (await place()).country;
    await prisma.address.create({ data: { userId: nearAddress.id, countryId: country.id, latitude: lat, longitude: lng + 0.03 } });
    const far = await account("bcfar", { lastLatitude: lat + 0.5, lastLongitude: lng }); // ~55 km
    const noLocation = await account("bcnoloc");
    const boss = await admin();

    const preview = await request(app).post("/broadcasts/preview").set(shop.owner.auth).send({ radiusKm: 5 });
    expect(preview.body).toEqual({ count: 2, cap: 2000, limit: 10, remainingThisMonth: 10, price: 0, balance: 0 }); // the platform default, no plan assigned

    const submitted = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 5, title: "وصل جديد", body: "تعال شوف", productId: shop.productId });
    expect(submitted.status).toBe(201);
    expect(submitted.body).toMatchObject({ status: "PENDING_REVIEW", targeted: 2, delivered: 0 });
    // nobody has received it yet — and the admin was told there is something to review
    for (const who of [near, nearAddress, far, noLocation]) expect(await received(who.id)).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: boss.id, type: "SYSTEM" } })).toBeGreaterThan(0);
    // the alert says it is for admins and which announcement, so the app can open the review queue
    const alert = (await prisma.notification.findMany({ where: { userId: boss.id, type: "SYSTEM" }, orderBy: { createdAt: "desc" } }))[0];
    expect(alert.data).toMatchObject({ kind: "BROADCAST_REVIEW", audience: "ADMIN", broadcastId: submitted.body.id });

    // only an admin decides
    expect((await request(app).post(`/broadcasts/${submitted.body.id}/approve`).set(shop.owner.auth)).status).toBe(403);
    const queue = await request(app).get("/broadcasts?status=PENDING_REVIEW").set(boss.auth);
    expect(queue.body.find((b: { id: string }) => b.id === submitted.body.id)).toMatchObject({ title: "وصل جديد", sender: { merchantProfile: { businessName: expect.any(String) } } });

    const approved = await request(app).post(`/broadcasts/${submitted.body.id}/approve`).set(boss.auth);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "SENT", targeted: 2, delivered: 2 });
    for (const who of [near, nearAddress]) {
      const [n] = await received(who.id, "NEW_PRODUCT");
      expect(n.data).toMatchObject({ kind: "MERCHANT_PROMO", merchantId: shop.merchantId, productId: shop.productId });
    }
    for (const who of [far, noLocation]) expect(await received(who.id)).toHaveLength(0);
    expect((await received(shop.owner.id, "SYSTEM")).some((n) => n.title.includes("الموافقة"))).toBe(true); // the shop is told it went out

    // a decision is final, and cannot be taken twice
    expect((await request(app).post(`/broadcasts/${submitted.body.id}/approve`).set(boss.auth)).status).toBe(409);
    expect((await request(app).post(`/broadcasts/${submitted.body.id}/reject`).set(boss.auth).send({ reason: "too late" })).status).toBe(409);

    const withOffer = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 5, title: "خصم", body: "20%", discountId: shop.discountId });
    await request(app).post(`/broadcasts/${withOffer.body.id}/approve`).set(boss.auth);
    expect((await received(near.id, "NEW_OFFER"))[0].data).toMatchObject({ discountId: shop.discountId });
    const mine = await request(app).get("/broadcasts").set(shop.owner.auth);
    expect(mine.body).toHaveLength(2);
    expect(mine.body.every((b: { status: string }) => b.status === "SENT")).toBe(true);
  });

  it("an admin can refuse it with a reason the merchant is told, and nobody receives it", async () => {
    const shop = await approvedShop(lat, lng);
    const near = await account("bcrefused", { lastLatitude: lat, lastLongitude: lng });
    const boss = await admin();
    const submitted = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 5, title: "عرض", body: "نص" });
    expect((await request(app).post(`/broadcasts/${submitted.body.id}/reject`).set(boss.auth).send({ reason: "" })).status).toBe(400);
    const refused = await request(app).post(`/broadcasts/${submitted.body.id}/reject`).set(boss.auth).send({ reason: "ادعاء غير صحيح" });
    expect(refused.body).toMatchObject({ status: "REJECTED", reasons: ["ادعاء غير صحيح"] });
    expect(await received(near.id)).toHaveLength(0);
    const note = (await received(shop.owner.id, "SYSTEM")).find((n) => n.title.includes("رفض"));
    expect(note?.body).toContain("ادعاء غير صحيح");
    expect((await request(app).get("/broadcasts").set(shop.owner.auth)).body[0]).toMatchObject({ status: "REJECTED", reviewNote: "ادعاء غير صحيح" });
  });

  it("is screened by AI first: a clear violation is refused at once, a borderline one is flagged for the admin, and a failing AI changes nothing", async () => {
    const shop = await approvedShop(lat, lng);
    const boss = await admin();
    const answer = (text: string) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 }));
    process.env.GROQ_API_KEY = "test-groq-key";
    try {
      answer('{"verdict":"BLOCK","reasons":["عرض مضلل"]}');
      const blocked = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 5, title: "اربح مليون", body: "ادفع الآن" });
      expect(blocked.body).toMatchObject({ status: "REJECTED", reasons: ["عرض مضلل"], delivered: 0 });
      expect((await request(app).post(`/broadcasts/${blocked.body.id}/approve`).set(boss.auth)).status).toBe(409); // no appeal through approve

      answer('Sure! {"verdict":"REVIEW","reasons":["مبالغ فيه"]}');
      const flagged = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 5, title: "أفضل عرض", body: "لا يتكرر" });
      expect(flagged.body.status).toBe("PENDING_REVIEW");
      expect((await request(app).get("/broadcasts?status=PENDING_REVIEW").set(boss.auth)).body.find((b: { id: string }) => b.id === flagged.body.id)).toMatchObject({ aiVerdict: "REVIEW", aiReasons: ["مبالغ فيه"] });

      vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
      const unscreened = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 5, title: "عادي", body: "نص" });
      expect(unscreened.body.status).toBe("PENDING_REVIEW"); // still goes to a person
    } finally {
      vi.unstubAllGlobals();
      delete process.env.GROQ_API_KEY;
    }
  });

  it("keeps merchants inside their limits: own items, 50 km, shop location, the monthly quota of their plan, approved shops", async () => {
    const shop = await approvedShop(lat, lng);
    const other = await approvedShop(lat, lng);
    const send = (body: object) => request(app).post("/broadcasts").set(shop.owner.auth).send({ title: "t", body: "b", ...body });

    expect((await send({ radiusKm: 5, productId: other.productId })).status).toBe(404); // someone else's product
    expect((await send({ radiusKm: 5, discountId: other.discountId })).status).toBe(404);
    const huge = await send({ radiusKm: 51 });
    expect(huge.status).toBe(400);
    expect(huge.body.error.code).toBe("RADIUS_TOO_LARGE");

    const unlocated = await approvedShop(null, null);
    const noCentre = await request(app).post("/broadcasts").set(unlocated.owner.auth).send({ radiusKm: 5, title: "t", body: "b" });
    expect(noCentre.body.error.code).toBe("SHOP_HAS_NO_LOCATION");
    expect((await request(app).post("/broadcasts").set(unlocated.owner.auth).send({ radiusKm: 5, latitude: lat, longitude: lng, title: "t", body: "b" })).status).toBe(201); // a chosen point works

    // the super admin gives this shop a plan that allows 3 announcements a month
    const boss = await admin();
    const plan = await prisma.servicePlan.create({ data: { name: `Quota plan ${Date.now()}`, service: "MERCHANT_ACCOUNT", durationDays: 30, priceCents: 0, monthlyBroadcastLimit: 3 } });
    expect((await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(shop.owner.auth).send({ planId: plan.id })).status).toBe(403); // not the shop's call
    expect((await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: plan.id })).status).toBe(200);
    expect((await request(app).post("/broadcasts/preview").set(shop.owner.auth).send({ radiusKm: 5 })).body).toMatchObject({ limit: 3, remainingThisMonth: 3 });

    for (let i = 0; i < 3; i++) expect((await send({ radiusKm: 5 })).status).toBe(201);
    const fourth = await send({ radiusKm: 5 });
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe("BROADCAST_LIMIT");
    expect((await request(app).post("/broadcasts/preview").set(shop.owner.auth).send({ radiusKm: 5 })).body).toMatchObject({ limit: 3, remainingThisMonth: 0 });

    const pending = await approvedShop(lat, lng);
    await prisma.merchantProfile.update({ where: { id: pending.merchantId }, data: { approvalStatus: "PENDING" } });
    const blocked = await request(app).post("/broadcasts").set(pending.owner.auth).send({ radiusKm: 5, title: "t", body: "b" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("MERCHANT_NOT_APPROVED");
  });

  it("can also announce to a city or area, with the same review", async () => {
    const p = await place();
    const shop = await approvedShop(lat, lng);
    const boss = await admin();
    const resident = await account("bcresident", { cityId: p.city.id });
    const submitted = await request(app).post("/broadcasts").set(shop.owner.auth).send({ geoUnitId: p.city.id, title: "افتتاح", body: "فرع جديد", productId: shop.productId });
    expect(submitted.body).toMatchObject({ status: "PENDING_REVIEW", targeted: 1 });
    expect(await received(resident.id)).toHaveLength(0);
    await request(app).post(`/broadcasts/${submitted.body.id}/approve`).set(boss.auth);
    expect((await received(resident.id, "NEW_PRODUCT"))[0].title).toBe("افتتاح");
  });
});

describe("What the super admin decides: quotas, distance and followers", () => {
  const lat = -50 + Math.random() * 5;
  const lng = -130 + Math.random() * 10;

  it("the plan sets the shop's quota, the platform settings set the default, and a refused announcement costs nothing", async () => {
    const boss = await admin();
    const shop = await approvedShop(lat, lng);
    const send = () => request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 1, title: "t", body: "b" });

    // no plan: the default from the settings (changed here from 10 to 2)
    const before = (await request(app).get("/admin/settings").set(boss.auth)).body.broadcasts;
    expect(before).toMatchObject({ merchantDefaultMonthly: 10, maxRadiusKm: 50, merchantMaxAudience: 2000 });
    try {
      expect((await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: { merchantDefaultMonthly: 2 } })).status).toBe(200);
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(429);

      // a plan with a bigger quota lifts it; a plan with none (0) stops the shop altogether
      const big = await prisma.servicePlan.create({ data: { name: `Big ${Date.now()}`, service: "MERCHANT_ACCOUNT", durationDays: 30, priceCents: 0, monthlyBroadcastLimit: 5 } });
      await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: big.id });
      expect((await send()).status).toBe(201);
      const none = await prisma.servicePlan.create({ data: { name: `None ${Date.now()}`, service: "MERCHANT_ACCOUNT", durationDays: 30, priceCents: 0, monthlyBroadcastLimit: 0 } });
      await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: none.id });
      expect((await send()).status).toBe(429);
      await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: null });
      expect((await send()).status).toBe(429); // back on the default (2), already used

      // the distance limit comes from the settings too
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: { merchantDefaultMonthly: 50, maxRadiusKm: 5 } });
      expect((await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 6, title: "t", body: "b" })).body.error.code).toBe("RADIUS_TOO_LARGE");
    } finally {
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: before });
    }
  });

  it("only merchant plans can be assigned, and only to a shop that exists", async () => {
    const boss = await admin();
    const shop = await approvedShop(lat, lng);
    const membership = await prisma.servicePlan.create({ data: { name: `Card ${Date.now()}`, service: "MEMBERSHIP", durationDays: 30, priceCents: 0 } });
    expect((await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: membership.id })).status).toBe(400);
    expect((await request(app).put(`/admin/merchants/${crypto.randomUUID()}/plan`).set(boss.auth).send({ planId: null })).status).toBe(404);
    const list = await request(app).get("/merchant/list").set(boss.auth);
    expect(list.body.find((m: { id: string }) => m.id === shop.merchantId)).toHaveProperty("plan", null);
  });

  it("a shop can announce to its followers — the people who saved it — after the same review", async () => {
    const boss = await admin();
    const shop = await approvedShop(lat, lng);
    const fan = await account("bcfan");
    const other = await account("bcnotfan");
    await prisma.favoriteMerchant.create({ data: { userId: fan.id, merchantId: shop.merchantId } });

    const preview = await request(app).post("/broadcasts/preview").set(shop.owner.auth).send({ followers: true });
    expect(preview.body.count).toBe(1);
    const submitted = await request(app).post("/broadcasts").set(shop.owner.auth).send({ followers: true, title: "وصلنا الجديد", body: "تعالوا", productId: shop.productId });
    expect(submitted.body).toMatchObject({ status: "PENDING_REVIEW", targeted: 1 });
    expect(await received(fan.id)).toHaveLength(0);

    await request(app).post(`/broadcasts/${submitted.body.id}/approve`).set(boss.auth);
    expect((await received(fan.id, "NEW_PRODUCT"))[0].title).toBe("وصلنا الجديد");
    expect(await received(other.id)).toHaveLength(0);

    // followers are a shop's thing, and cannot be combined with another target
    expect((await request(app).post("/broadcasts/preview").set(boss.auth).send({ followers: true })).body.error.code).toBe("BAD_TARGET");
    expect((await request(app).post("/broadcasts/preview").set(shop.owner.auth).send({ followers: true, radiusKm: 5 })).body.error.code).toBe("BAD_TARGET");
  });
});

describe("Announcements beyond the plan are paid, at the price the super admin sets", () => {
  const lat = -45 + Math.random() * 5;
  const lng = -120 + Math.random() * 10;
  const balanceOf = (userId: string) => prisma.wallet.findUnique({ where: { userId } }).then((w) => w?.balance ?? 0);
  const credit = (userId: string, amount: number) => prisma.$transaction((tx) => adjustBalance(tx, userId, amount, "TOPUP", "test-credit"));

  it("the plan's included announcements are free, then each one is charged — refused for lack of balance, refunded when refused", async () => {
    const boss = await admin();
    const shop = await approvedShop(lat, lng);
    const plan = await prisma.servicePlan.create({ data: { name: `Paid ${Date.now()}`, service: "MERCHANT_ACCOUNT", durationDays: 30, priceCents: 0, monthlyBroadcastLimit: 1 } });
    await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: plan.id });
    const before = (await request(app).get("/admin/settings").set(boss.auth)).body.broadcasts;
    expect(before.pricePerAnnouncement).toBe(0); // not for sale until the admin says so
    const send = (extra: object = {}) => request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 1, title: "عرض", body: "نص", ...extra });
    const row = (id: string) => prisma.broadcast.findUniqueOrThrow({ where: { id } });

    try {
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: { pricePerAnnouncement: 4 } });

      const included = await send();
      expect(included.status).toBe(201);
      expect((await row(included.body.id)).creditsCharged).toBe(0);
      expect(await balanceOf(shop.owner.id)).toBe(0);

      // the plan's one is used up: the next costs 4 — and the screen can say so before anything is sent
      const preview = await request(app).post("/broadcasts/preview").set(shop.owner.auth).send({ radiusKm: 1 });
      expect(preview.body).toMatchObject({ limit: 1, remainingThisMonth: 0, price: 4, balance: 0 });
      const poor = await send();
      expect(poor.status).toBe(409);
      expect(poor.body.error.code).toBe("INSUFFICIENT_BALANCE");
      expect(await prisma.broadcast.count({ where: { senderId: shop.owner.id } })).toBe(1); // nothing was created, nothing charged

      await credit(shop.owner.id, 10);
      const paid = await send();
      expect(paid.status).toBe(201);
      expect((await row(paid.body.id)).creditsCharged).toBe(4);
      expect(await balanceOf(shop.owner.id)).toBe(6);
      expect(await prisma.walletTransaction.count({ where: { userId: shop.owner.id, type: "BROADCAST", amount: -4 } })).toBe(1);

      // the admin refuses it: the money comes back, once
      const refused = await request(app).post(`/broadcasts/${paid.body.id}/reject`).set(boss.auth).send({ reason: "غير مناسب" });
      expect(refused.status).toBe(200);
      expect(await balanceOf(shop.owner.id)).toBe(10);
      expect((await request(app).post(`/broadcasts/${paid.body.id}/reject`).set(boss.auth).send({ reason: "again" })).status).toBe(409);
      expect(await balanceOf(shop.owner.id)).toBe(10);
      expect(await prisma.walletTransaction.count({ where: { userId: shop.owner.id, type: "BROADCAST", amount: 4 } })).toBe(1);
      expect((await request(app).get("/broadcasts").set(shop.owner.auth)).body.find((b: { id: string }) => b.id === paid.body.id)).toMatchObject({ status: "REJECTED", creditsCharged: 4 });

      // approved ones keep what was paid
      const again = await send();
      await request(app).post(`/broadcasts/${again.body.id}/approve`).set(boss.auth);
      expect(await balanceOf(shop.owner.id)).toBe(6);

      // with no price, going beyond the plan is simply refused (as before)
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: { pricePerAnnouncement: 0 } });
      expect((await send()).body.error.code).toBe("BROADCAST_LIMIT");
    } finally {
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: before });
    }
  });

  it("a text the AI refuses costs nothing, and with no included announcements every one is paid", async () => {
    const boss = await admin();
    const shop = await approvedShop(lat, lng);
    const plan = await prisma.servicePlan.create({ data: { name: `AllPaid ${Date.now()}`, service: "MERCHANT_ACCOUNT", durationDays: 30, priceCents: 0, monthlyBroadcastLimit: 0 } });
    await request(app).put(`/admin/merchants/${shop.merchantId}/plan`).set(boss.auth).send({ planId: plan.id });
    const before = (await request(app).get("/admin/settings").set(boss.auth)).body.broadcasts;
    await credit(shop.owner.id, 10);
    process.env.GROQ_API_KEY = "test-groq-key";
    try {
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: { pricePerAnnouncement: 3 } });
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"BLOCK","reasons":["مضلل"]}' } }] }), { status: 200 }));
      const blocked = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 1, title: "x", body: "y" });
      expect(blocked.body.status).toBe("REJECTED");
      expect(await balanceOf(shop.owner.id)).toBe(10);

      vi.unstubAllGlobals();
      delete process.env.GROQ_API_KEY;
      const ok = await request(app).post("/broadcasts").set(shop.owner.auth).send({ radiusKm: 1, title: "x", body: "y" });
      expect(ok.status).toBe(201);
      expect(await balanceOf(shop.owner.id)).toBe(7); // no included announcements: paid from the first one
    } finally {
      vi.unstubAllGlobals();
      delete process.env.GROQ_API_KEY;
      await request(app).put("/admin/settings").set(boss.auth).send({ broadcasts: before });
    }
  });
});

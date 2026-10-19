import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";
const BASE = { lat: -53.5, lng: -65.5 }; // far from any other test data
const tag = Math.random().toString(36).slice(2, 7);
const created: { landmarks: string[]; users: string[] } = { landmarks: [], users: [] };

async function person(label: string, verified = true) {
  const email = uniqueEmail(label);
  await request(app).post("/auth/register").send({ email, password, fullName: `Claim ${label}` });
  if (verified) await prisma.user.update({ where: { email }, data: { isEmailVerified: true } });
  const login = await request(app).post("/auth/login").send({ email, password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  created.users.push(user.id);
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function boss() {
  const p = await person("lcb");
  await prisma.user.update({ where: { id: p.id }, data: { role: "ADMIN" } });
  return p;
}

async function hospital(name: string, sector: "PRIVATE" | "PUBLIC", dLat = 0) {
  const kind = await prisma.landmarkKind.findUniqueOrThrow({ where: { slug: "hospital" } });
  const l = await prisma.landmark.create({ data: { kindId: kind.id, name: `${name} ${tag}`, sector, status: "ACTIVE", latitude: BASE.lat + dLat, longitude: BASE.lng, address: "شارع تجريبي", phone: "+963111111" } });
  created.landmarks.push(l.id);
  return l;
}

async function proof(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 120, channels: 3, background: "#cccccc" } }).png().toBuffer();
}

afterAll(async () => {
  await prisma.landmarkClaim.deleteMany({ where: { landmarkId: { in: created.landmarks } } });
  const shops = await prisma.merchantProfile.findMany({ where: { userId: { in: created.users } }, select: { id: true } });
  await prisma.landmark.deleteMany({ where: { id: { in: created.landmarks } } });
  await prisma.shopBranch.deleteMany({ where: { merchantId: { in: shops.map((s) => s.id) } } });
  await prisma.$disconnect();
});

describe("claiming a private place", () => {
  it("only a private place of a claimable kind can be claimed, by a signed-in person with a verified e-mail", async () => {
    const priv = await hospital("مشفى الأمل", "PRIVATE");
    const pub = await hospital("مشفى الوطن", "PUBLIC", 0.05);
    const body = { role: "MANAGER", phone: "+963 944 000 111", note: "أنا المدير" };
    await request(app).post(`/landmarks/${priv.id}/claims`).send(body).expect(401);

    const raw = await person("lcr", false);
    expect((await request(app).post(`/landmarks/${priv.id}/claims`).set(raw.auth).send(body)).status).toBe(403); // e-mail not verified

    const ok = await person("lco");
    expect((await request(app).post(`/landmarks/${pub.id}/claims`).set(ok.auth).send(body)).status).toBe(403); // public place
    const first = await request(app).post(`/landmarks/${priv.id}/claims`).set(ok.auth).send(body);
    expect(first.status).toBe(201);
    expect((await request(app).post(`/landmarks/${priv.id}/claims`).set(ok.auth).send(body)).status).toBe(409); // already sent
    const mine = (await request(app).get("/landmarks/claims/mine").set(ok.auth)).body.items;
    expect(mine[0]).toMatchObject({ status: "PENDING", landmark: { id: priv.id } });
    expect((await request(app).get(`/landmarks/${priv.id}/my-claim`).set(ok.auth)).body.claim.status).toBe("PENDING");
  });

  it("the proof photos are checked and kept; the admin approves and the place becomes a shop (no duplicate pin)", async () => {
    const place = await hospital("مشفى الشفاء", "PRIVATE", 0.1);
    const a = await person("lca");
    const b = await person("lcb2");
    const admin = await boss();
    const claimA = await request(app).post(`/landmarks/${place.id}/claims`).set(a.auth).send({ role: "OWNER", phone: "+963 944 222 333" });
    const claimB = await request(app).post(`/landmarks/${place.id}/claims`).set(b.auth).send({ role: "AUTHORIZED", phone: "+963 944 444 555" });

    // a text file is refused, a real picture is kept
    const bad = await request(app).put(`/landmarks/claims/${claimA.body.id}/files`).set(a.auth).set("Content-Type", "image/png").send(Buffer.from("not a picture at all, sorry"));
    expect(bad.status).toBe(415);
    const pic = await request(app).put(`/landmarks/claims/${claimA.body.id}/files?name=licence.png`).set(a.auth).set("Content-Type", "image/png").send(await proof());
    expect(pic.status).toBe(201);
    // somebody else cannot add to it
    expect((await request(app).put(`/landmarks/claims/${claimA.body.id}/files`).set(b.auth).set("Content-Type", "image/png").send(await proof())).status).toBe(404);

    const list = await request(app).get("/admin/landmark-claims").set(admin.auth).query({ status: "PENDING" });
    const row = list.body.items.find((c: { id: string }) => c.id === claimA.body.id);
    expect(row.files).toHaveLength(1);
    expect(row.user.email).toBe(a.email);
    const img = await request(app).get(`/admin/landmark-claims/files/${row.files[0].id}`).set(admin.auth);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    await request(app).get(`/admin/landmark-claims/files/${row.files[0].id}`).set(a.auth).expect(403);

    // the new shop needs its profession
    expect((await request(app).post(`/admin/landmark-claims/${claimA.body.id}/approve`).set(admin.auth).send({})).status).toBe(400);
    const category = await prisma.category.findFirstOrThrow();
    const approved = await request(app).post(`/admin/landmark-claims/${claimA.body.id}/approve`).set(admin.auth).send({ categoryId: category.id });
    expect(approved.status).toBe(200);
    expect(approved.body.asBranch).toBe(false);

    const shop = await prisma.merchantProfile.findUniqueOrThrow({ where: { userId: a.id } });
    expect(shop).toMatchObject({ businessName: place.name, approvalStatus: "APPROVED", latitude: place.latitude, longitude: place.longitude, address: "شارع تجريبي" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).role).toBe("MERCHANT");
    expect(await prisma.business.count({ where: { legacyMerchantProfileId: shop.id } })).toBe(1);
    expect(await prisma.landmark.findUniqueOrThrow({ where: { id: place.id } })).toMatchObject({ status: "CLAIMED", claimedMerchantId: shop.id });

    // off the map as a landmark; the other request was refused
    const box = { minLat: BASE.lat - 1, maxLat: BASE.lat + 1, minLng: BASE.lng - 1, maxLng: BASE.lng + 1 };
    expect((await request(app).get("/landmarks").query(box)).body.items.some((l: { id: string }) => l.id === place.id)).toBe(false);
    expect((await prisma.landmarkClaim.findUniqueOrThrow({ where: { id: claimB.body.id } })).status).toBe("REJECTED");
    expect(await prisma.notification.count({ where: { userId: a.id, title: "تمت الموافقة على طلبك ✅" } })).toBe(1);
    // decided once
    expect((await request(app).post(`/admin/landmark-claims/${claimA.body.id}/approve`).set(admin.auth).send({ categoryId: category.id })).status).toBe(409);
  });

  it("a person who already has a shop gets the place as a branch", async () => {
    const place = await hospital("مشفى النور", "PRIVATE", 0.15);
    const owner = await person("lcs");
    const admin = await boss();
    const category = await prisma.category.findFirstOrThrow();
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: `محل قائم ${tag}`, categoryId: category.id, approvalStatus: "APPROVED" } });
    await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
    const claim = await request(app).post(`/landmarks/${place.id}/claims`).set(owner.auth).send({ role: "MANAGER", phone: "+963 944 666 777" });
    const done = await request(app).post(`/admin/landmark-claims/${claim.body.id}/approve`).set(admin.auth).send({});
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ asBranch: true, merchantId: shop.id });
    const branch = await prisma.shopBranch.findFirstOrThrow({ where: { merchantId: shop.id } });
    expect(branch).toMatchObject({ name: place.name, latitude: place.latitude, longitude: place.longitude });
  });

  it("the admin can ask for more proof, the person sends it back, or the admin refuses with a reason", async () => {
    const place = await hospital("مشفى الرحمة", "PRIVATE", 0.2);
    const p = await person("lcm");
    const admin = await boss();
    const claim = await request(app).post(`/landmarks/${place.id}/claims`).set(p.auth).send({ role: "MANAGER", phone: "+963 944 888 999" });
    await request(app).post(`/admin/landmark-claims/${claim.body.id}/needs-info`).set(admin.auth).send({ message: "ارفع صورة الترخيص" }).expect(200);
    expect((await prisma.landmarkClaim.findUniqueOrThrow({ where: { id: claim.body.id } })).status).toBe("NEEDS_INFO");
    expect(await prisma.notification.count({ where: { userId: p.id, title: "نحتاج معلومات إضافية لطلبك" } })).toBe(1);
    await request(app).post(`/landmarks/claims/${claim.body.id}/resubmit`).set(p.auth).send({ note: "هي الصورة" }).expect(200);
    expect((await prisma.landmarkClaim.findUniqueOrThrow({ where: { id: claim.body.id } })).status).toBe("PENDING");
    await request(app).post(`/admin/landmark-claims/${claim.body.id}/reject`).set(admin.auth).send({ reason: "الإثبات غير كافٍ" }).expect(200);
    const mine = (await request(app).get("/landmarks/claims/mine").set(p.auth)).body.items;
    expect(mine[0]).toMatchObject({ status: "REJECTED", message: "الإثبات غير كافٍ" });
    // the place stays on the map for others
    expect((await prisma.landmark.findUniqueOrThrow({ where: { id: place.id } })).status).toBe("ACTIVE");
  });

  it("registering a shop where a claimable place of the same name stands offers to claim it", async () => {
    const place = await hospital("مشفى الحياة", "PRIVATE", 0.25);
    const near = await request(app).get("/landmarks/similar").query({ name: `مستشفى الحياة ${tag}`, lat: place.latitude + 0.0005, lng: place.longitude });
    expect(near.body.items.map((l: { id: string }) => l.id)).toContain(place.id);
    const far = await request(app).get("/landmarks/similar").query({ name: `مستشفى الحياة ${tag}`, lat: place.latitude + 0.5, lng: place.longitude });
    expect(far.body.items).toHaveLength(0);
    const publicOne = await hospital("مشفى الأمان الحكومي", "PUBLIC", 0.3);
    const none = await request(app).get("/landmarks/similar").query({ name: `مشفى الأمان الحكومي ${tag}`, lat: publicOne.latitude, lng: publicOne.longitude });
    expect(none.body.items).toHaveLength(0);
  });
});

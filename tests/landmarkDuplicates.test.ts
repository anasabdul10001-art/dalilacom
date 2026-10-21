import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";
const BASE = { lat: -52.5, lng: -64.5 }; // far from any other test data
const tag = Math.random().toString(36).slice(2, 7);
const created: { landmarks: string[]; users: string[] } = { landmarks: [], users: [] };

async function person(label: string) {
  const email = uniqueEmail(label);
  await request(app).post("/auth/register").send({ email, password, fullName: `Dup ${label}` });
  await prisma.user.update({ where: { email }, data: { isEmailVerified: true } });
  const login = await request(app).post("/auth/login").send({ email, password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  created.users.push(user.id);
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}

afterAll(async () => {
  await prisma.landmark.deleteMany({ where: { id: { in: created.landmarks } } });
  await prisma.merchantProfile.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.$disconnect();
});

describe("a shop registered without a pin next to a claimable place of the same name", () => {
  it("is offered the place when the name (any spelling) and the address agree", async () => {
    const kind = await prisma.landmarkKind.findUniqueOrThrow({ where: { slug: "hospital" } });
    const place = await prisma.landmark.create({ data: { kindId: kind.id, name: `مشفى الأسد الخاص ${tag}`, sector: "PRIVATE", status: "ACTIVE", latitude: BASE.lat, longitude: BASE.lng, address: "شارع الكورنيش" } });
    created.landmarks.push(place.id);
    const publicOne = await prisma.landmark.create({ data: { kindId: kind.id, name: `مشفى الأسد العام ${tag}`, sector: "PUBLIC", status: "ACTIVE", latitude: BASE.lat + 0.3, longitude: BASE.lng } });
    created.landmarks.push(publicOne.id);

    const ids = async (query: Record<string, string>) => (await request(app).get("/landmarks/similar").query(query)).body.items.map((i: { id: string }) => i.id);
    // the spelling differs (hamza, teh marbuta) and there is no pin
    expect(await ids({ name: `مستشفى الاسد الخاص ${tag}` })).toContain(place.id);
    expect(await ids({ name: `مشفى الاسد الخاص ${tag}`, address: "الكورنيش" })).toContain(place.id);
    // an address that shares nothing: another place
    expect(await ids({ name: `مشفى الاسد الخاص ${tag}`, address: "حي الجامعة" })).not.toContain(place.id);
    // a public place is never offered
    expect(await ids({ name: `مشفى الاسد العام ${tag}` })).not.toContain(publicOne.id);
    // a different name
    expect(await ids({ name: `مشفى الشفاء ${tag}` })).not.toContain(place.id);
  });
});

describe("a place that now has a shop of the same name right next to it", () => {
  it("is listed for the admin, who can say it is another place", async () => {
    const kind = await prisma.landmarkKind.findUniqueOrThrow({ where: { slug: "school" } });
    const place = await prisma.landmark.create({ data: { kindId: kind.id, name: `مدرسة النور ${tag}`, sector: "PRIVATE", status: "ACTIVE", latitude: BASE.lat - 0.2, longitude: BASE.lng } });
    created.landmarks.push(place.id);
    const owner = await person("dup-owner");
    const category = await prisma.category.findFirstOrThrow();
    await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: `مدرسة النور ${tag}`, categoryId: category.id, latitude: BASE.lat - 0.2 + 0.0004, longitude: BASE.lng, approvalStatus: "APPROVED" } });

    const admin = await person("dup-admin");
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    await request(app).get("/admin/landmark-duplicates").expect(401);
    const listed = await request(app).get("/admin/landmark-duplicates").set(admin.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((i: { landmark: { id: string } }) => i.landmark.id === place.id)).toBe(true);

    expect((await request(app).post(`/admin/landmarks/${place.id}/duplicate-dismiss`).set(admin.auth)).status).toBe(200);
    const after = await request(app).get("/admin/landmark-duplicates").set(admin.auth);
    expect(after.body.items.some((i: { landmark: { id: string } }) => i.landmark.id === place.id)).toBe(false);
  });
});

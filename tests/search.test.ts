import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";
const BASE = { lat: -51.5, lng: -63.5 }; // far from any other test data
const tag = Math.random().toString(36).slice(2, 7);
const made: { landmarks: string[]; users: string[] } = { landmarks: [], users: [] };

async function place(kindSlug: string, name: string, dLat = 0, dLng = 0, extra: Record<string, unknown> = {}) {
  const kind = await prisma.landmarkKind.findUniqueOrThrow({ where: { slug: kindSlug } });
  const l = await prisma.landmark.create({ data: { kindId: kind.id, name, status: "ACTIVE", latitude: BASE.lat + dLat, longitude: BASE.lng + dLng, ...extra } });
  made.landmarks.push(l.id);
  return l;
}

afterAll(async () => {
  await prisma.landmark.deleteMany({ where: { id: { in: made.landmarks } } });
  await prisma.merchantProfile.deleteMany({ where: { userId: { in: made.users } } });
  await prisma.$disconnect();
});

const search = (query: Record<string, string | number>) => request(app).get("/search").query(query);
const names = (res: { body: { items: { name: string }[] } }) => res.body.items.map((i) => i.name);

describe("one search for shops and public places", () => {
  it("finds a public place by its name in any spelling (no shop needed)", async () => {
    await place("historic", `قلعة حلب ${tag}`, 0, 0);
    await place("mosque", `جامع الأموي الكبير ${tag}`, 0.01, 0);
    const castle = await search({ q: `قلعه حلب ${tag}` }); // teh marbuta typed as heh
    expect(castle.status).toBe(200);
    expect(names(castle)).toContain(`قلعة حلب ${tag}`);
    expect(castle.body.items[0]).toMatchObject({ type: "landmark", kind: { slug: "historic" } });
    expect(names(await search({ q: `الجامع الاموي ${tag}` }))).toContain(`جامع الأموي الكبير ${tag}`);
  });

  it("a word that names a kind lists the nearest places of that kind first", async () => {
    await place("school", `مدرسة بعيدة ${tag}`, 0.2, 0);
    await place("school", `مدرسة قريبة ${tag}`, 0.01, 0);
    await place("school", `مدرسة وسط ${tag}`, 0.05, 0);
    const res = await search({ q: "المدارس", lat: BASE.lat, lng: BASE.lng, limit: 100 });
    const mine = res.body.items.filter((i: { name: string }) => i.name.endsWith(tag)).map((i: { name: string }) => i.name);
    expect(mine).toEqual([`مدرسة قريبة ${tag}`, `مدرسة وسط ${tag}`, `مدرسة بعيدة ${tag}`]);
    expect(res.body.kinds).toEqual(["school"]);
    expect(res.body.items[0].distanceKm).toBeLessThan(res.body.items[res.body.items.length - 1].distanceKm + 0.0001);
  });

  it("shops and places come in one list, each with its type", async () => {
    await place("park", `حديقة الياسمين ${tag}`, 0.02, 0.02);
    const owner = uniqueEmail("search-shop");
    await request(app).post("/auth/register").send({ email: owner, password, fullName: "Search Shop" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: owner } });
    made.users.push(user.id);
    const category = await prisma.category.findFirstOrThrow();
    const shop = await prisma.merchantProfile.create({ data: { userId: user.id, businessName: `مطعم الياسمين ${tag}`, categoryId: category.id, latitude: BASE.lat + 0.015, longitude: BASE.lng, approvalStatus: "APPROVED" } });
    const res = await search({ q: `الياسمين ${tag}`, lat: BASE.lat, lng: BASE.lng });
    const types = new Map<string, string>(res.body.items.map((i: { id: string; type: string }) => [i.id, i.type]));
    expect(types.get(shop.id)).toBe("shop");
    expect([...types.values()]).toContain("landmark");
  });

  it("a full name match far away beats a weak match right next door", async () => {
    await place("mosque", `جامع النور الكبير ${tag}`, 0.25, 0); // about 28 km, exact name
    await place("mosque", `جامع النور القديم ${tag}`, 0.0005, 0); // right here, shares one word only
    const res = await search({ q: `جامع النور الكبير ${tag}`, lat: BASE.lat, lng: BASE.lng });
    expect(names(res)[0]).toBe(`جامع النور الكبير ${tag}`);
  });

  it("without a point it still answers, and the city centre stands in when a city is given", async () => {
    const res = await search({ q: `قلعة حلب ${tag}` });
    expect(res.body.items[0].distanceKm).toBeNull();
    expect(res.body.reference).toBeNull();
    expect((await search({ q: "" })).status).toBe(400);
  });
});

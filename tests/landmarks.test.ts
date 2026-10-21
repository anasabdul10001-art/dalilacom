import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { importFromOsm, nameKey, sameName } from "../src/services/landmark.service";

const password = "correct-horse-battery-staple";
// a spot in the middle of nowhere so the other tests' data never interferes
const BASE = { lat: -54.5, lng: -66.5 };
const tag = Math.random().toString(36).slice(2, 7);

async function admin() {
  const email = uniqueEmail("lmk");
  await request(app).post("/auth/register").send({ email, password, fullName: "Landmark Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

afterAll(async () => {
  await prisma.landmark.deleteMany({ where: { OR: [{ name: { contains: tag } }, { source: "OSM", latitude: { lt: -50 } }] } });
  await prisma.landmarkKind.deleteMany({ where: { slug: `school_${tag}` } });
  await prisma.$disconnect();
});

describe("name matching", () => {
  it("ignores the word that only says what kind of place it is", () => {
    expect(nameKey("جامع الأموي")).toBe(nameKey("الأموي"));
    expect(sameName("جامع الأموي الكبير", "الأموي")).toBe(true);
    expect(sameName("جامع الأموي", "جامع السنانية")).toBe(false);
  });
});

describe("public places", () => {
  it("has the four kinds the owner asked for", async () => {
    const res = await request(app).get("/landmarks/kinds");
    expect(res.status).toBe(200);
    expect(res.body.map((k: { slug: string }) => k.slug)).toEqual(expect.arrayContaining(["mosque", "hospital", "park", "main_street"]));
    const en = await request(app).get("/landmarks/kinds").set("Accept-Language", "en");
    expect(en.body.find((k: { slug: string }) => k.slug === "mosque").name).toBe("Mosque");
  });

  it("only the admin adds places; a place waiting for review is not on the map until approved", async () => {
    const kinds = (await request(app).get("/landmarks/kinds")).body;
    const kind = await prisma.landmarkKind.findUnique({ where: { slug: "mosque" } });
    const body = { kindId: kind!.id, name: `جامع تجريبي ${tag}`, nameEn: `Test mosque ${tag}`, latitude: BASE.lat, longitude: BASE.lng, status: "PENDING_REVIEW" };
    await request(app).post("/admin/landmarks").send(body).expect(401);
    expect(kinds.length).toBeGreaterThan(0);

    const auth = await admin();
    const created = await request(app).post("/admin/landmarks").set(auth).send(body);
    expect(created.status).toBe(201);
    const id = created.body.id;

    const box = { minLat: BASE.lat - 0.05, maxLat: BASE.lat + 0.05, minLng: BASE.lng - 0.05, maxLng: BASE.lng + 0.05 };
    expect((await request(app).get("/landmarks").query(box)).body.items.some((l: { id: string }) => l.id === id)).toBe(false);

    // the same place again is refused with the similar one named, unless forced
    const again = await request(app).post("/admin/landmarks").set(auth).send({ ...body, name: `الجامع التجريبي ${tag}`, latitude: BASE.lat + 0.0003 });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain(id);

    await request(app).post("/admin/landmarks/review").set(auth).send({ action: "approve", ids: [id] }).expect(200);
    const shown = (await request(app).get("/landmarks").query(box)).body.items;
    expect(shown.find((l: { id: string }) => l.id === id)).toMatchObject({ kind: { slug: "mosque", icon: "🕌" }, claimable: false });
    const en = (await request(app).get("/landmarks").query(box).set("Accept-Language", "en")).body.items.find((l: { id: string }) => l.id === id);
    expect(en.name).toBe(`Test mosque ${tag}`);
    expect((await request(app).get(`/landmarks/${id}`)).status).toBe(200);

    await request(app).post("/admin/landmarks/review").set(auth).send({ action: "hide", ids: [id] }).expect(200);
    expect((await request(app).get(`/landmarks/${id}`)).status).toBe(404);
  });

  it("a street needs its line; a private hospital can be claimed later but a public one cannot", async () => {
    const auth = await admin();
    const street = await prisma.landmarkKind.findUnique({ where: { slug: "main_street" } });
    const hospital = await prisma.landmarkKind.findUnique({ where: { slug: "hospital" } });
    const noLine = await request(app).post("/admin/landmarks").set(auth).send({ kindId: street!.id, name: `شارع ${tag}`, latitude: BASE.lat, longitude: BASE.lng });
    expect(noLine.status).toBe(400);
    const withLine = await request(app).post("/admin/landmarks").set(auth).send({
      kindId: street!.id, name: `شارع ${tag}`, latitude: BASE.lat, longitude: BASE.lng, path: [[[BASE.lat, BASE.lng], [BASE.lat + 0.01, BASE.lng + 0.01]]],
    });
    expect(withLine.status).toBe(201);
    expect(withLine.body.path).toHaveLength(1);

    const priv = await request(app).post("/admin/landmarks").set(auth).send({ kindId: hospital!.id, name: `مشفى خاص ${tag}`, sector: "PRIVATE", latitude: BASE.lat + 0.1, longitude: BASE.lng });
    const pub = await request(app).post("/admin/landmarks").set(auth).send({ kindId: hospital!.id, name: `مشفى حكومي ${tag}`, sector: "PUBLIC", latitude: BASE.lat + 0.2, longitude: BASE.lng });
    const items = (await request(app).get("/landmarks").query({ minLat: BASE.lat - 1, maxLat: BASE.lat + 1, minLng: BASE.lng - 1, maxLng: BASE.lng + 1 })).body.items;
    expect(items.find((l: { id: string }) => l.id === priv.body.id).claimable).toBe(true);
    expect(items.find((l: { id: string }) => l.id === pub.body.id).claimable).toBe(false);
  });

  it("the owner can add a kind of his own without code", async () => {
    const auth = await admin();
    const res = await request(app).post("/admin/landmark-kinds").set(auth).send({ slug: `school_${tag}`, nameAr: "مدرسة", nameEn: "School", icon: "🏫", color: "#c58a00", geometry: "POINT", claimable: false, isActive: true });
    expect(res.status).toBe(201);
    expect((await request(app).get("/landmarks/kinds")).body.some((k: { slug: string }) => k.slug === `school_${tag}`)).toBe(true);
    const off = await request(app).patch(`/admin/landmark-kinds/${res.body.id}`).set(auth).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await request(app).get("/landmarks/kinds")).body.some((k: { slug: string }) => k.slug === `school_${tag}`)).toBe(false);
  });
});

describe("more kinds of places", () => {
  it("ships churches, schools, bus stations, neighbourhoods and more", async () => {
    const slugs = (await request(app).get("/landmarks/kinds")).body.map((k: { slug: string }) => k.slug);
    expect(slugs).toEqual(expect.arrayContaining(["church", "school", "kindergarten", "university", "government", "police", "fire_station", "post_office", "bus_station", "train_station", "airport", "stadium", "museum", "historic", "market", "square", "neighborhood"]));
  });

  it("imports them from OpenStreetMap, each into its own kind, with the public/private sector of a school", async () => {
    const at = { lat: BASE.lat - 0.4, lon: BASE.lng };
    const fake = async () => [
      { type: "node" as const, id: 9101, ...at, tags: { amenity: "place_of_worship", religion: "christian", "name:ar": `كنيسة الاستيراد ${tag}` } },
      { type: "way" as const, id: 9102, center: { lat: at.lat, lon: at.lon + 0.1 }, tags: { amenity: "school", "name:ar": `مدرسة الاستيراد ${tag}`, "operator:type": "private" } },
      { type: "node" as const, id: 9103, lat: at.lat, lon: at.lon + 0.2, tags: { amenity: "bus_station", "name:ar": `كراج الاستيراد ${tag}` } },
      { type: "node" as const, id: 9104, lat: at.lat, lon: at.lon + 0.3, tags: { place: "suburb", "name:ar": `حي الاستيراد ${tag}` } },
      { type: "node" as const, id: 9105, lat: at.lat, lon: at.lon + 0.4, tags: { amenity: "place_of_worship", religion: "muslim", "name:ar": `جامع آخر ${tag}` } }, // a mosque: not asked for here
    ];
    const done = await importFromOsm({ latitude: at.lat, longitude: at.lon, radiusKm: 60, kinds: ["church", "school", "bus_station", "neighborhood"], fetcher: fake });
    expect(done.created).toEqual({ church: 1, school: 1, bus_station: 1, neighborhood: 1 });
    const school = await prisma.landmark.findFirst({ where: { sourceRef: "osm:way/9102" } });
    expect(school!.sector).toBe("PRIVATE");
    const church = await prisma.landmark.findFirst({ where: { sourceRef: "osm:node/9101" }, include: { kind: true } });
    expect(church!.kind.slug).toBe("church");
  });

  it("leaves out the kinds that are drawn only closer up when the map is zoomed out", async () => {
    const kind = await prisma.landmarkKind.findUnique({ where: { slug: "school" } });
    const hospital = await prisma.landmarkKind.findUnique({ where: { slug: "hospital" } });
    const place = (kindId: string, name: string) => prisma.landmark.create({ data: { kindId, name: `${name} ${tag}`, latitude: BASE.lat - 0.6, longitude: BASE.lng, status: "ACTIVE" } });
    const school = await place(kind!.id, "مدرسة الزوم");
    const hosp = await place(hospital!.id, "مشفى الزوم");
    const box = { minLat: BASE.lat - 0.65, maxLat: BASE.lat - 0.55, minLng: BASE.lng - 0.05, maxLng: BASE.lng + 0.05 };
    const far = (await request(app).get("/landmarks").query({ ...box, zoom: 12 })).body.items.map((l: { id: string }) => l.id);
    expect(far).toContain(hosp.id);
    expect(far).not.toContain(school.id);
    const near = (await request(app).get("/landmarks").query({ ...box, zoom: 15 })).body.items.map((l: { id: string }) => l.id);
    expect(near).toEqual(expect.arrayContaining([hosp.id, school.id]));
    // an old app that sends no zoom still gets everything
    const all = (await request(app).get("/landmarks").query(box)).body.items.map((l: { id: string }) => l.id);
    expect(all).toEqual(expect.arrayContaining([hosp.id, school.id]));
  });
});

describe("import from OpenStreetMap into the review list", () => {
  it("puts places in the review list, joins street pieces, skips what is already there", async () => {
    const fake = async () => [
      { type: "node" as const, id: 9001, lat: BASE.lat - 0.2, lon: BASE.lng, tags: { amenity: "place_of_worship", religion: "muslim", "name:ar": `جامع الاستيراد ${tag}` } },
      { type: "way" as const, id: 9002, center: { lat: BASE.lat - 0.2, lon: BASE.lng + 0.1 }, tags: { amenity: "hospital", "name:ar": `مشفى الاستيراد ${tag}`, "operator:type": "private" } },
      { type: "node" as const, id: 9003, lat: BASE.lat - 0.2, lon: BASE.lng + 0.2, tags: { amenity: "place_of_worship", religion: "muslim" } }, // no name: skipped
      { type: "way" as const, id: 9004, geometry: [{ lat: BASE.lat - 0.3, lon: BASE.lng }, { lat: BASE.lat - 0.3, lon: BASE.lng + 0.01 }], tags: { highway: "primary", "name:ar": `شارع الاستيراد ${tag}` } },
      { type: "way" as const, id: 9005, geometry: [{ lat: BASE.lat - 0.3, lon: BASE.lng + 0.01 }, { lat: BASE.lat - 0.3, lon: BASE.lng + 0.02 }], tags: { highway: "primary", "name:ar": `شارع الاستيراد ${tag}` } },
    ];
    const first = await importFromOsm({ latitude: BASE.lat - 0.2, longitude: BASE.lng, radiusKm: 25, kinds: ["mosque", "hospital", "main_street"], fetcher: fake });
    expect(first.created).toEqual({ mosque: 1, hospital: 1, main_street: 1 });
    expect(first.unnamed).toBe(1);
    const street = await prisma.landmark.findFirst({ where: { name: { contains: `شارع الاستيراد ${tag}` } } });
    expect(street!.status).toBe("PENDING_REVIEW");
    expect((street!.path as unknown[]).length).toBe(2); // the two pieces became one street
    const hospital = await prisma.landmark.findFirst({ where: { sourceRef: "osm:way/9002" } });
    expect(hospital!.sector).toBe("PRIVATE");

    const second = await importFromOsm({ latitude: BASE.lat - 0.2, longitude: BASE.lng, radiusKm: 25, kinds: ["mosque", "hospital", "main_street"], fetcher: fake });
    expect(second.total).toBe(0);
    expect(second.skipped).toBe(3);
  });
});

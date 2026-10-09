import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { freeIsoCode2, uniqueEmail } from "./helpers";
import { resetAiProviderState } from "../src/services/ai.service";

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  await prisma.$disconnect();
});

beforeEach(() => {
  fetchStub.mockReset();
  resetAiProviderState();
  delete process.env.MISTRAL_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Photo ${prefix}` });
  expect(registered.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function shop(country: string) {
  const cat = await prisma.category.upsert({ where: { slug: "photo-test-cat" }, update: {}, create: { name: "Photo Test", slug: "photo-test-cat" } });
  const owner = await account("photoshop", { countryCode: country });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Photo Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  return { owner, merchantId: reg.body.id as string, categoryId: cat.id };
}

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(60)]);
const upload = (auth: object, body: Buffer = png(), type = "image/png") => request(app).post("/products/photos").set(auth).set("Content-Type", type).send(body);
const aiSays = (json: object) => fetchStub.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(json) + "\n```" } }] })));

describe("a shop's product photos", () => {
  it("are uploaded, served to everyone, and only usable by the shop that took them", async () => {
    const a = await shop(await freeIsoCode2(prisma));
    const b = await shop(await freeIsoCode2(prisma));
    const up = await upload(a.owner.auth);
    expect(up.status).toBe(201);
    expect(up.body.url).toBe(`/store/photos/${up.body.id}`);

    const served = await request(app).get(up.body.url);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");

    expect((await upload(a.owner.auth, Buffer.from("this is not a picture at all"))).status).toBe(415);
    const customer = await account("photocustomer");
    expect((await upload(customer.auth)).status).toBe(403);

    // another shop cannot put it on its product
    const stolen = await request(app).post("/products").set(b.owner.auth).send({ name: "Stolen photo product", priceCents: 500, stock: 1, categoryId: b.categoryId, images: [up.body.url] });
    expect(stolen.status).toBe(400);
    expect((await request(app).post("/products/ai-draft").set(b.owner.auth).send({ photoId: up.body.id })).status).toBe(404);
  });

  it("make a product with its pictures, details and section, shown in the store", async () => {
    const iso = await freeIsoCode2(prisma);
    const s = await shop(iso);
    const one = (await upload(s.owner.auth)).body;
    const two = (await upload(s.owner.auth)).body;
    const made = await request(app).post("/products").set(s.owner.auth).send({
      name: "سماعات لاسلكية", description: "سماعات بلوتوث", priceCents: 2500, stock: 4, categoryId: s.categoryId,
      storeSection: "electronics", images: [one.url, two.url], condition: "NEW", specs: [{ label: "اللون", value: "أسود" }],
    });
    expect(made.status).toBe(201);
    expect(made.body.imageUrl).toBe(one.url);

    const shown = await request(app).get(`/store/products/${made.body.id}`).set("CF-IPCountry", iso);
    expect(shown.status).toBe(200);
    expect(shown.body.images).toEqual([one.url, two.url]);
    expect(shown.body.specs).toEqual([{ label: "اللون", value: "أسود" }]);
    expect(shown.body.condition).toBe("NEW");
    expect(shown.body.section.id).toBe("electronics");

    expect((await request(app).post("/products").set(s.owner.auth).send({ name: "Bad section", priceCents: 500, stock: 1, categoryId: s.categoryId, storeSection: "nope" })).status).toBe(400);
  });
});

describe("a product from a photo", () => {
  it("gets a name, a description, a section and details from the AI, and a price range from similar products", async () => {
    const iso = await freeIsoCode2(prisma);
    const s = await shop(iso);
    for (const price of [1000, 2000, 3000]) {
      await request(app).post("/products").set(s.owner.auth).send({ name: `similar ${price}`, priceCents: price, stock: 2, categoryId: s.categoryId, storeSection: "electronics" });
    }
    const photo = (await upload(s.owner.auth)).body;
    aiSays({ name: "سماعات رأس", alternatives: ["سماعات", "هيدفون", "سماعات رأس"], section: "electronics", description: "سماعات سوداء مريحة للاستخدام اليومي.", specs: [{ label: "اللون", value: "أسود" }, { label: "", value: "x" }], condition: "new", keywords: ["سماعات", "headphones"] });

    const res = await request(app).post("/products/ai-draft").set(s.owner.auth).send({ photoId: photo.id });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.draft).toMatchObject({ name: "سماعات رأس", section: "electronics", condition: "NEW", specs: [{ label: "اللون", value: "أسود" }] });
    expect(res.body.draft.alternatives).toEqual(["سماعات", "هيدفون"]); // not the name itself
    expect(res.body.priceHint).toMatchObject({ min: 1000, median: 2000, max: 3000, count: 3 });

    // the picture went to the provider as a data URL, and the key stayed on the server
    const sent = JSON.parse(fetchStub.mock.calls[0][1].body);
    expect(sent.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("never trusts a section the AI made up, and says so when no AI can see", async () => {
    const s = await shop(await freeIsoCode2(prisma));
    const photo = (await upload(s.owner.auth)).body;
    aiSays({ name: "شيء", section: "not-a-section", description: "وصف" });
    expect((await request(app).post("/products/ai-draft").set(s.owner.auth).send({ photoId: photo.id })).body.draft.section).toBeNull();

    delete process.env.GEMINI_API_KEY;
    const none = await request(app).post("/products/ai-draft").set(s.owner.auth).send({ photoId: photo.id });
    expect(none.body).toEqual({ available: false, draft: null, priceHint: null });
  });
});

describe("searching the store with a photo", () => {
  it("finds the shopper's own country's products that match what the picture shows", async () => {
    const iso = await freeIsoCode2(prisma);
    const other = await freeIsoCode2(prisma);
    const mine = await shop(iso);
    const abroad = await shop(other);
    const tag = crypto.randomUUID().slice(0, 6);
    const make = async (s: Awaited<ReturnType<typeof shop>>, name: string, section?: string) =>
      (await request(app).post("/products").set(s.owner.auth).send({ name, priceCents: 900, stock: 3, categoryId: s.categoryId, ...(section ? { storeSection: section } : {}) })).body.id as string;
    const headphones = await make(mine, `سماعات ${tag}`, "electronics");
    const shoes = await make(mine, `حذاء ${tag}`, "fashion");
    const foreign = await make(abroad, `سماعات ${tag}`, "electronics");

    aiSays({ title: "سماعات", keywords: ["سماعات", "headphones"], section: "electronics" });
    const res = await request(app).post("/store/search-by-image").set("CF-IPCountry", iso).set("Content-Type", "image/png").send(png());
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("سماعات");
    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids[0]).toBe(headphones);
    expect(ids).not.toContain(foreign);
    expect(ids).not.toContain(shoes);
  });

  it("refuses what is not a picture, and is honest when no AI can see", async () => {
    expect((await request(app).post("/store/search-by-image").set("Content-Type", "image/png").send(Buffer.from("not a picture at all"))).status).toBe(415);
    delete process.env.GEMINI_API_KEY;
    const res = await request(app).post("/store/search-by-image").set("Content-Type", "image/png").send(png());
    expect(res.status).toBe(503);
  });
});

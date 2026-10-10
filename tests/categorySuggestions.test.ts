import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Sug ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const admin = () => account("sugadmin", { role: "ADMIN" });

async function parent(name: string) {
  return prisma.category.create({ data: { name, slug: `sug-${crypto.randomUUID().slice(0, 8)}` } });
}

async function shopWithSuggestion(nearestId: string, name: string) {
  const owner = await account("sugshop");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Sug Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: nearestId, suggestedCategory: name });
  expect(reg.status).toBe(201);
  return { owner, id: reg.body.id as string };
}

describe("a shop that cannot find its profession", () => {
  it("proposes one while registering; it sits under the closest profession and the admin sees it", async () => {
    const near = await parent("قريبة");
    const s = await shopWithSuggestion(near.id, "  مدرب   بوكسينغ نسائي ");
    const row = await prisma.categorySuggestion.findFirst({ where: { merchantId: s.id } });
    expect(row).toMatchObject({ name: "مدرب بوكسينغ نسائي", status: "PENDING", nearestId: near.id });
    expect((await prisma.merchantProfile.findUnique({ where: { id: s.id } }))!.categoryId).toBe(near.id);

    const me = (await request(app).get("/merchant/me").set(s.owner.auth)).body;
    expect(me.categorySuggestion).toMatchObject({ name: "مدرب بوكسينغ نسائي", status: "PENDING" });

    const a = await admin();
    const list = (await request(app).get("/admin/category-suggestions").set(a.auth)).body;
    const mine = list.find((x: { id: string }) => x.id === row!.id);
    expect(mine).toMatchObject({ name: "مدرب بوكسينغ نسائي", nearestPath: "قريبة" });
    expect(mine.merchant.businessName).toContain("Sug Shop");
    expect((await request(app).get("/admin/category-suggestions").set((await account("sugcust")).auth)).status).toBe(403);
  });

  it("a shop already registered can propose too, and a new proposal replaces its open one", async () => {
    const near = await parent("قريبة2");
    const s = await shopWithSuggestion(near.id, "الأولى");
    const second = await request(app).post("/merchant/category-suggestions").set(s.owner.auth).send({ name: "الثانية" });
    expect(second.status).toBe(201);
    expect(await prisma.categorySuggestion.count({ where: { merchantId: s.id } })).toBe(1);
    expect((await prisma.categorySuggestion.findFirst({ where: { merchantId: s.id } }))!.name).toBe("الثانية");
    expect((await request(app).post("/merchant/category-suggestions").set(s.owner.auth).send({ name: "x" })).status).toBe(400);
  });

  it("the admin accepts it as a new profession (renamed, translated, placed) and the shop moves into it", async () => {
    const section = await parent("قسم رئيسي");
    const s = await shopWithSuggestion(section.id, "كوتش ملاكمة");
    const row = (await prisma.categorySuggestion.findFirst({ where: { merchantId: s.id } }))!;
    const a = await admin();
    const res = await request(app).post(`/admin/category-suggestions/${row.id}/approve`).set(a.auth).send({ nameAr: "مدرب ملاكمة", nameEn: "Boxing coach", parentId: section.id, icon: "🥊", synonyms: ["كابتن ملاكمة"] });
    expect(res.status).toBe(200);
    const created = await prisma.category.findUnique({ where: { id: res.body.id }, include: { translations: true } });
    expect(created).toMatchObject({ name: "مدرب ملاكمة", parentId: section.id });
    expect(created!.translations.find((t) => t.lang === "en")!.name).toBe("Boxing coach");
    expect(created!.translations.find((t) => t.lang === "ar")!.synonyms).toEqual(expect.arrayContaining(["كوتش ملاكمة", "كابتن ملاكمة"]));
    expect((await prisma.merchantProfile.findUnique({ where: { id: s.id } }))!.categoryId).toBe(created!.id);
    expect(await prisma.categorySuggestion.findUnique({ where: { id: row.id } })).toMatchObject({ status: "APPROVED", categoryId: created!.id });
    expect(await prisma.notification.count({ where: { userId: s.owner.id, title: "انضافت مهنتك ✅" } })).toBe(1);
    // it can be found by what the shop wrote and by the new name
    const found = (await request(app).get("/categories/search").query({ q: "كابتن ملاكمة" })).body;
    expect(JSON.stringify(found)).toContain(created!.id);
    // handled once
    expect((await request(app).post(`/admin/category-suggestions/${row.id}/approve`).set(a.auth).send({ nameAr: "مرة تانية" })).status).toBe(409);
  });

  it("the admin can instead add it to a profession that already exists, and its words join that profession's search words", async () => {
    const section = await parent("قسم للدمج");
    const target = await prisma.category.create({ data: { name: "حلاق", slug: `sug-${crypto.randomUUID().slice(0, 8)}`, parentId: section.id } });
    const s = await shopWithSuggestion(section.id, "مزيّن رجالي");
    const row = (await prisma.categorySuggestion.findFirst({ where: { merchantId: s.id } }))!;
    const a = await admin();
    const res = await request(app).post(`/admin/category-suggestions/${row.id}/merge`).set(a.auth).send({ categoryId: target.id });
    expect(res.status).toBe(200);
    expect((await prisma.merchantProfile.findUnique({ where: { id: s.id } }))!.categoryId).toBe(target.id);
    const tr = await prisma.categoryTranslation.findUnique({ where: { categoryId_lang: { categoryId: target.id, lang: "ar" } } });
    expect(tr!.synonyms).toContain("مزيّن رجالي");
    expect(await prisma.categorySuggestion.findUnique({ where: { id: row.id } })).toMatchObject({ status: "MERGED", categoryId: target.id });
    expect((await request(app).post(`/admin/category-suggestions/${crypto.randomUUID()}/merge`).set(a.auth).send({ categoryId: target.id })).status).toBe(404);
  });

  it("the admin can refuse with a reason and the shop is told", async () => {
    const section = await parent("قسم للرفض");
    const s = await shopWithSuggestion(section.id, "اقتراح غريب");
    const row = (await prisma.categorySuggestion.findFirst({ where: { merchantId: s.id } }))!;
    const a = await admin();
    expect((await request(app).post(`/admin/category-suggestions/${row.id}/reject`).set(a.auth).send({ reason: "موجودة تحت مهنة ثانية" })).status).toBe(200);
    expect(await prisma.categorySuggestion.findUnique({ where: { id: row.id } })).toMatchObject({ status: "REJECTED", note: "موجودة تحت مهنة ثانية" });
    expect((await request(app).get("/merchant/me").set(s.owner.auth)).body.categorySuggestion).toMatchObject({ status: "REJECTED", note: "موجودة تحت مهنة ثانية" });
    expect(await prisma.notification.count({ where: { userId: s.owner.id, title: "ما انقبل اقتراح المهنة" } })).toBe(1);
    const rejected = (await request(app).get("/admin/category-suggestions").query({ status: "REJECTED" }).set(a.auth)).body;
    expect(rejected.some((x: { id: string }) => x.id === row.id)).toBe(true);
  });
});

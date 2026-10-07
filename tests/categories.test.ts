import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { seedCategories } from "../prisma/categories.seed";
import { CATEGORY_TREE } from "../prisma/categories.data";
import { normalizeText, invalidateCategoryCache } from "../src/services/category.service";
import { resolveLanguage } from "../src/lib/languages";
import { uniqueEmail } from "./helpers";

const PASSWORD = "correct-horse-battery-staple";

afterAll(async () => {
  await prisma.$disconnect();
});

async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  const res = await request(app).post("/auth/register").send({ email, password: PASSWORD, fullName: "Cat Tester" });
  return { token: res.body.token as string, auth: { Authorization: `Bearer ${res.body.token}` }, email };
}

async function approvedShop(name: string, categorySlug: string) {
  const owner = await account("shop");
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: categorySlug } });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: name, categoryId: category.id, latitude: 33.5, longitude: 36.3 });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  return reg.body.id as string;
}

function find(tree: any[], slug: string): any {
  for (const node of tree) {
    if (node.slug === slug) return node;
    const inner = find(node.children ?? [], slug);
    if (inner) return inner;
  }
  return null;
}

beforeAll(async () => {
  await seedCategories(prisma);
  invalidateCategoryCache();
});

describe("Arabic-friendly text normalisation", () => {
  it("makes spelling variants comparable", () => {
    expect(normalizeText("الأَسنان")).toBe(normalizeText("الاسنان"));
    expect(normalizeText("مقهى")).toBe(normalizeText("مقهي"));
    expect(normalizeText("مدرسة")).toBe(normalizeText("مدرسه"));
    expect(normalizeText("إنترنت")).toBe(normalizeText("انترنت"));
    expect(normalizeText("Dentist  ")).toBe("dentist");
    expect(normalizeText("٣٠ طبيب")).toBe("30 طبيب");
  });
});

describe("Language resolution", () => {
  const req = (query: any, header?: string) => ({ query, headers: header ? { "accept-language": header } : {} }) as any;
  it("prefers ?lang, then Accept-Language by weight, then Arabic", () => {
    expect(resolveLanguage(req({ lang: "en" }))).toBe("en");
    expect(resolveLanguage(req({}, "en-US,en;q=0.9,ar;q=0.8"))).toBe("en");
    expect(resolveLanguage(req({}, "fr;q=0.9,ar;q=0.4"))).toBe("ar");
    expect(resolveLanguage(req({ lang: "xx" }, "de"))).toBe("ar");
    expect(resolveLanguage(req({}))).toBe("ar");
  });
});

describe("The sections tree", () => {
  it("seeds every section and is safe to re-run", async () => {
    const before = await prisma.category.count();
    await seedCategories(prisma);
    expect(await prisma.category.count()).toBe(before);
    const tree = (await request(app).get("/categories")).body;
    for (const slug of ["health", "electronics", "mobiles", "factories", "companies"]) {
      expect(tree.some((n: any) => n.slug === slug)).toBe(true);
    }
    expect(CATEGORY_TREE.length).toBeGreaterThanOrEqual(5);
  });

  it("names every node in Arabic by default and in English on request", async () => {
    const ar = (await request(app).get("/categories")).body;
    expect(find(ar, "health").name).toBe("الطبي");
    expect(find(ar, "health-doctors-dentist").name).toBe("أسنان");
    expect(find(ar, "factories").name).toBe("المعامل");

    const en = (await request(app).get("/categories").query({ lang: "en" })).body;
    expect(find(en, "health").name).toBe("Medical");
    expect(find(en, "health-doctors-dentist").name).toBe("Dentist");

    const header = (await request(app).get("/categories").set("Accept-Language", "en-GB,en;q=0.8")).body;
    expect(find(header, "mobiles").name).toBe("Mobiles");

    // sections > professions > specialties
    const doctors = find(ar, "health").children.find((c: any) => c.slug === "health-doctors");
    expect(doctors.children.length).toBeGreaterThanOrEqual(10);
    expect(find(ar, "health").icon).toBeTruthy();
  });

  it("falls back to Arabic for a node that has no translation in the requested language", async () => {
    const custom = await prisma.category.create({ data: { name: "قسم بلا ترجمة", slug: `untranslated-${crypto.randomUUID().slice(0, 6)}` } });
    invalidateCategoryCache();
    const en = (await request(app).get("/categories").query({ lang: "en" })).body;
    expect(find(en, custom.slug).name).toBe("قسم بلا ترجمة");
  });
});

describe("Category search", () => {
  const top = async (q: string, lang?: string) => (await request(app).get("/categories/search").query({ q, ...(lang ? { lang } : {}) })).body;

  it("finds a specialty however it is spelled or typed", async () => {
    for (const q of ["اسنان", "أسنان", "الأسنان", "دكتور اسنان", "طبيب أسنان", "سنان", "تقويم", "dentist", "Dentist", "teeth"]) {
      const hits = await top(q);
      expect(hits[0]?.slug, `query "${q}"`).toBe("health-doctors-dentist");
    }
  });

  it("returns the profession itself for generic words, and the breadcrumb path in the requested language", async () => {
    expect((await top("اطباء"))[0].slug).toBe("health-doctors");
    expect((await top("doctors"))[0].slug).toBe("health-doctors");
    const ar = await top("اسنان");
    expect(ar[0].path).toBe("الطبي › أطباء › أسنان");
    const en = await top("اسنان", "en"); // an Arabic query still works while the app is in English
    expect(en[0].path).toBe("Medical › Doctors › Dentist");
  });

  it("covers the other first sections", async () => {
    expect((await top("ايفون"))[0].slug).toBe("mobiles-new");
    expect((await top("صيانة موبايل"))[0].slug).toBe("mobiles-repair");
    expect((await top("الواح شمسية"))[0].slug).toBe("electronics-power-solar");
    expect((await top("معمل"))[0].slug).toBe("factories");
    expect((await top("استيراد"))[0].slug).toBe("companies-trading");
    expect((await top("مخبر"))[0].slug).toBe("health-lab");
  });

  it("returns nothing for gibberish and rejects an empty query", async () => {
    expect(await top("zzqqxx")).toEqual([]);
    expect((await request(app).get("/categories/search").query({ q: "" })).status).toBe(400);
  });
});

describe("Places under a section", () => {
  it("shows every specialty's places when the profession is picked, and counts roll up", async () => {
    const dentist = await approvedShop("عيادة الابتسامة", "health-doctors-dentist");
    const pediatric = await approvedShop("عيادة الصغار", "health-doctors-pediatrics");
    const pharmacy = await approvedShop("صيدلية الشفاء", "health-pharmacy");
    invalidateCategoryCache();

    const doctors = await prisma.category.findUniqueOrThrow({ where: { slug: "health-doctors" } });
    const dentistCat = await prisma.category.findUniqueOrThrow({ where: { slug: "health-doctors-dentist" } });
    const health = await prisma.category.findUniqueOrThrow({ where: { slug: "health" } });

    const ids = async (query: object) => (await request(app).get("/merchant").query(query)).body.map((m: any) => m.id);
    const underDoctors = await ids({ categoryId: doctors.id });
    expect(underDoctors).toEqual(expect.arrayContaining([dentist, pediatric]));
    expect(underDoctors).not.toContain(pharmacy);
    const underDentist = await ids({ categoryId: dentistCat.id });
    expect(underDentist).toContain(dentist);
    expect(underDentist).not.toContain(pediatric);
    expect(await ids({ categoryId: health.id })).toEqual(expect.arrayContaining([dentist, pediatric, pharmacy]));

    const tree = (await request(app).get("/categories")).body;
    expect(find(tree, "health-doctors").merchantCount).toBeGreaterThanOrEqual(2);
    expect(find(tree, "health").merchantCount).toBeGreaterThanOrEqual(3);
    expect(find(tree, "health-doctors-dentist").merchantCount).toBeGreaterThanOrEqual(1);

    // typing the specialty finds its places even though the shop's own name never says it
    expect(await ids({ q: "dentist" })).toContain(dentist);
    expect(await ids({ q: "دكتور اسنان" })).toContain(dentist);
    expect(await ids({ q: "دكتور اسنان" })).not.toContain(pharmacy);
  });

  it("offers matching sections in the search box suggestions, with their path", async () => {
    const res = await request(app).get("/merchant/suggest").query({ q: "اسنان" });
    expect(res.status).toBe(200);
    expect(res.body.categories[0]).toMatchObject({ slug: "health-doctors-dentist", path: "الطبي › أطباء › أسنان" });
    const en = await request(app).get("/merchant/suggest").query({ q: "dentist", lang: "en" });
    expect(en.body.categories[0].path).toBe("Medical › Doctors › Dentist");
  });
});

describe("Places show their category in the customer's language", () => {
  it("returns the translated category name on the directory, the place page and the suggestions", async () => {
    const name = `Lang Clinic ${crypto.randomUUID().slice(0, 6)}`;
    const id = await approvedShop(name, "health-doctors-dentist");

    const search = async (lang?: string) => (await request(app).get("/merchant").query({ q: name, ...(lang ? { lang } : {}) })).body[0];
    expect((await search()).category.name).toBe("أسنان"); // Arabic by default
    expect((await search("en")).category.name).toBe("Dentist");
    expect((await request(app).get("/merchant").query({ q: name }).set("Accept-Language", "en-US,en;q=0.9")).body[0].category.name).toBe("Dentist");

    const detail = await request(app).get(`/merchant/${id}`).query({ lang: "en" });
    expect(detail.body.category.name).toBe("Dentist");
    expect((await request(app).get(`/merchant/${id}`)).body.category.name).toBe("أسنان");

    const suggest = await request(app).get("/merchant/suggest").query({ q: name, lang: "en" });
    expect(suggest.body.merchants[0].category.name).toBe("Dentist");
  });
});

describe("Admin can add a translated category", () => {
  it("stores translations and synonyms and finds them straight away", async () => {
    const admin = await account("catadmin");
    await prisma.user.update({ where: { email: admin.email }, data: { role: "ADMIN" } });
    const parent = await prisma.category.findUniqueOrThrow({ where: { slug: "health-doctors" } });
    const unique = crypto.randomUUID().slice(0, 8); // the dev database persists between runs
    const created = await request(app)
      .post("/categories")
      .set(admin.auth)
      .send({
        name: `طب رياضي ${unique}`,
        parentId: parent.id,
        icon: "🏃",
        translations: [
          { lang: "en", name: `Sports medicine ${unique}`, synonyms: [`sports doctor ${unique}`] },
          { lang: "ar", synonyms: [`اصابات ملاعب ${unique}`] },
        ],
      });
    expect(created.status).toBe(201);
    const en = (await request(app).get("/categories").query({ lang: "en" })).body;
    expect(find(en, created.body.slug).name).toBe(`Sports medicine ${unique}`);
    expect((await request(app).get("/categories/search").query({ q: `sports doctor ${unique}` })).body[0].id).toBe(created.body.id);
    expect((await request(app).get("/categories/search").query({ q: `اصابات ملاعب ${unique}` })).body[0].id).toBe(created.body.id);
    // non-admins cannot
    const user = await account("catuser");
    expect((await request(app).post("/categories").set(user.auth).send({ name: "ممنوع" })).status).toBe(403);
  });
});

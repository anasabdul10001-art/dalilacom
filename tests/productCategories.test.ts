import { describe, it, expect, afterAll, beforeAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { seedProductCategories } from "../prisma/productCategories.seed";
import { PRODUCT_CATEGORIES } from "../prisma/productCategories.data";

beforeAll(async () => {
  await seedProductCategories(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Pc ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
async function shop() {
  const cat = await prisma.category.upsert({ where: { slug: "pc-test-cat" }, update: {}, create: { name: "Pc Test", slug: "pc-test-cat" } });
  const owner = await account("pcshop", { role: "MERCHANT" });
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Pc Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  return { owner, id: reg.body.id as string };
}
type Node = { slug: string; name: string; children?: Node[] };
const find = (tree: Node[], slug: string): Node | null => {
  for (const n of tree) {
    if (n.slug === slug) return n;
    const hit = find(n.children ?? [], slug);
    if (hit) return hit;
  }
  return null;
};

describe("the categories products are filed under", () => {
  it("are a large list of its own, in Arabic and English, apart from the professions", async () => {
    const tree = (await request(app).get("/product-categories")).body as Node[];
    const count = (n: Node): number => 1 + (n.children ?? []).reduce((a, c) => a + count(c), 0);
    expect(tree.length).toBeGreaterThanOrEqual(10);
    expect(tree.reduce((a, n) => a + count(n), 0)).toBeGreaterThanOrEqual(250);
    expect(find(tree, "p-women-dress")!.name).toBe("فساتين");
    const english = (await request(app).get("/product-categories").set("Accept-Language", "en")).body as Node[];
    expect(find(english, "p-women-dress")!.name).toBe("Dresses");
    // every department says which store section its products appear in
    for (const d of PRODUCT_CATEGORIES) expect(d.section, d.slug).toBeTruthy();
    // none of it is the professions' tree
    expect(((await request(app).get("/categories")).body as Node[]).some((n) => n.slug === "p-fashion")).toBe(false);
  });

  it("are found by typing, in either language, with where each one sits", async () => {
    const ar = (await request(app).get("/product-categories/search").query({ q: "فستان" })).body;
    expect(ar[0].slug).toBe("p-women-dress");
    expect(ar[0].path).toBe("أزياء › ملابس نسائية › فساتين");
    const en = (await request(app).get("/product-categories/search").query({ q: "laptop" }).set("Accept-Language", "en")).body;
    expect(en[0].slug).toBe("p-laptops");
    expect(en[0].path).toBe("Electronics › Computers & laptops › Laptops");
    expect((await request(app).get("/product-categories/search").query({ q: "ايفون" })).body.some((h: { slug: string }) => h.slug === "p-phones-new")).toBe(true);
    expect((await request(app).get("/product-categories/search").query({ q: "x" })).body).toEqual([]);
  });

  it("a product filed under a category appears in that category's store section", async () => {
    const s = await shop();
    const dress = await prisma.productCategory.findUniqueOrThrow({ where: { slug: "p-women-dress" } });
    const res = await request(app).post("/products").set(s.owner.auth).send({ name: "فستان صيفي", priceCents: 2500, stock: 3, productCategoryId: dress.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ productCategoryId: dress.id, storeSection: "fashion" });
    const phone = await prisma.productCategory.findUniqueOrThrow({ where: { slug: "p-phones-new" } });
    const moved = await request(app).patch(`/products/${res.body.id}`).set(s.owner.auth).send({ productCategoryId: phone.id });
    expect(moved.body).toMatchObject({ productCategoryId: phone.id, storeSection: "electronics" });
    expect((await request(app).post("/products").set(s.owner.auth).send({ name: "منتج", priceCents: 100, productCategoryId: crypto.randomUUID() })).status).toBe(404);
  });

  it("a shop adds a category of its own under another; the same name is not added twice; the admin sees and removes it", async () => {
    const s = await shop();
    const parent = await prisma.productCategory.findUniqueOrThrow({ where: { slug: "p-women" } });
    const add = await request(app).post("/product-categories").set(s.owner.auth).send({ name: "عبايات سهرة", parentId: parent.id });
    expect(add.status).toBe(201);
    const again = await request(app).post("/product-categories").set(s.owner.auth).send({ name: "  عبايات   سهرة ", parentId: parent.id });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(add.body.id);
    expect((await request(app).get("/product-categories/search").query({ q: "عبايات سهرة" })).body[0].id).toBe(add.body.id);

    // not too deep, only a shop, nothing for a customer
    const kind = await prisma.productCategory.findUniqueOrThrow({ where: { slug: "p-women-dress" } });
    expect((await request(app).post("/product-categories").set(s.owner.auth).send({ name: "فساتين قصيرة", parentId: kind.id })).status).toBe(400);
    expect((await request(app).post("/product-categories").set((await account("pccust")).auth).send({ name: "شي", parentId: parent.id })).status).toBe(403);

    const product = await request(app).post("/products").set(s.owner.auth).send({ name: "عباية سهرة سوداء", priceCents: 9000, stock: 2, productCategoryId: add.body.id });
    expect(product.status).toBe(201);

    const boss = await account("pcboss", { role: "ADMIN" });
    const list = (await request(app).get("/admin/product-categories").set(boss.auth)).body;
    const mine = list.find((x: { id: string }) => x.id === add.body.id);
    expect(mine).toMatchObject({ name: "عبايات سهرة", productCount: 1, parentName: "ملابس نسائية" });
    expect(mine.shop).toContain("Pc Shop");
    expect((await request(app).patch(`/admin/product-categories/${add.body.id}`).set(boss.auth).send({ nameEn: "Evening abayas" })).status).toBe(200);

    // removing it hands its products to the category above
    expect((await request(app).delete(`/admin/product-categories/${add.body.id}`).set(boss.auth)).status).toBe(200);
    expect((await prisma.product.findUnique({ where: { id: product.body.id } }))!.productCategoryId).toBe(parent.id);
    expect((await request(app).delete(`/admin/product-categories/${parent.id}`).set(boss.auth)).status).toBe(409); // a seeded one stays
  });
});

import request from "supertest";
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";

const saved = process.env.PUBLIC_BASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = saved;
});
afterAll(() => prisma.$disconnect());

describe("The website has one address", () => {
  it("moves pages and sign-in starts from the old Render address to the public address, but leaves the API alone", async () => {
    process.env.PUBLIC_BASE_URL = "https://dalilacom.com";
    const page = await request(app).get("/app/?merchant=abc").set("Host", "dalilacom-api.onrender.com");
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe("https://dalilacom.com/app/?merchant=abc");

    const start = await request(app).get("/auth/social/facebook/start?platform=app").set("Host", "dalilacom-api.onrender.com");
    expect(start.status).toBe(302);
    expect(start.headers.location).toBe("https://dalilacom.com/auth/social/facebook/start?platform=app");

    const api = await request(app).get("/health").set("Host", "dalilacom-api.onrender.com");
    expect(api.status).toBe(200);
    const post = await request(app).post("/auth/login").set("Host", "dalilacom-api.onrender.com").send({});
    expect(post.status).not.toBe(302);
  });

  it("does nothing on the public address itself, locally, or when the public address is the Render one", async () => {
    process.env.PUBLIC_BASE_URL = "https://dalilacom.com";
    expect((await request(app).get("/app/").set("Host", "dalilacom.com")).status).toBe(200);
    expect((await request(app).get("/app/")).status).toBe(200);
    process.env.PUBLIC_BASE_URL = "https://dalilacom-api.onrender.com";
    expect((await request(app).get("/app/").set("Host", "dalilacom-api.onrender.com")).status).toBe(200);
  });
});

describe("The main website is at the root, the owner's pages are not public", () => {
  it("serves the app at / and at /app/ (assets resolve through the base tag)", async () => {
    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain('<base href="/app/"');
    expect(root.text).toContain("app.js");
    expect((await request(app).get("/app/")).status).toBe(200);
    expect((await request(app).get("/app/app.js")).status).toBe(200);
  });

  it("serves the admin panel at /admin (the old /admin.html moves there) and keeps the /admin API behind sign-in", async () => {
    const panel = await request(app).get("/admin");
    expect(panel.status).toBe(200);
    expect(panel.text).toContain("لوحة التحكم");
    const slash = await request(app).get("/admin/");
    expect(slash.status).toBe(301);
    expect(slash.headers.location).toBe("/admin");
    const old = await request(app).get("/admin.html");
    expect(old.status).toBe(301);
    expect(old.headers.location).toBe("/admin");
    expect((await request(app).get("/admin/users")).status).toBe(401);
  });

  it("keeps the developer console on the testing address only (HIDE_DEV_CONSOLE)", async () => {
    expect((await request(app).get("/console.html")).status).toBe(200);
    process.env.HIDE_DEV_CONSOLE = "true";
    try {
      expect((await request(app).get("/console.html")).status).toBe(404);
      expect((await request(app).get("/admin")).status).toBe(200);
      expect((await request(app).get("/")).status).toBe(200);
      expect((await request(app).get("/health")).status).toBe(200);
    } finally {
      delete process.env.HIDE_DEV_CONSOLE;
    }
  });
});

describe("Share preview cards", () => {
  it("gives the website a title, description and picture for WhatsApp/Facebook, and a shop link that shop's name", async () => {
    const home = await request(app).get("/");
    expect(home.text).toContain('property="og:title"');
    expect(home.text).toContain('property="og:description"');
    expect(home.text).toContain('/brand/og-share-v2.png');
    expect(home.text).toContain('name="twitter:card" content="summary_large_image"');
    expect((await request(app).get("/brand/og-share-v2.png")).status).toBe(200);

    const category = await prisma.category.create({ data: { name: "مطاعم الاختبار", slug: `share-${Date.now()}` } });
    const owner = await prisma.user.create({ data: { email: `share${Date.now()}@example.com`, passwordHash: "x", fullName: "Owner", role: "MERCHANT" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: 'مطعم "الياسمين" <b>', categoryId: category.id, address: "دمشق - المزة", approvalStatus: "APPROVED" } });
    await prisma.discount.create({ data: { merchantId: shop.id, title: "خصم", percent: 15, isActive: true } });
    const page = await request(app).get(`/?merchant=${shop.id}`);
    expect(page.text).toContain("مطعم &quot;الياسمين&quot; &lt;b&gt; — دليلكم"); // escaped, never raw HTML
    expect(page.text).toContain("خصم 15%");
    expect(page.text).toContain("دمشق - المزة");
    expect(page.text).toContain(`?merchant=${shop.id}`);

    // an unknown or not-approved shop falls back to the website's own card
    const pending = await prisma.merchantProfile.update({ where: { id: shop.id }, data: { approvalStatus: "PENDING" } });
    expect((await request(app).get(`/?merchant=${pending.id}`)).text).not.toContain("الياسمين");
    expect((await request(app).get("/?merchant=not-an-id")).status).toBe(200);
  });
});

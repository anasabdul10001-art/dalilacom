import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";

const BASE = (process.env.PUBLIC_BASE_URL ?? "https://dalilacom.com").replace(/\/+$/, "");

afterAll(async () => {
  await prisma.$disconnect();
});

describe("being found: icons, home page text, shop pages, sitemap, robots and llms.txt", () => {
  it("serves the favicon where Google looks for it, in sizes that are multiples of 48", async () => {
    const ico = await request(app).get("/favicon.ico");
    expect(ico.status).toBe(200);
    expect(ico.headers["content-type"]).toMatch(/icon/);
    for (const size of [48, 96, 192, 512]) expect((await request(app).get(`/brand/favicon-${size}.png`)).status).toBe(200);
    const home = (await request(app).get("/")).text;
    expect(home).toContain('rel="icon" href="/favicon.ico"');
    expect(home).toContain('sizes="48x48"');
    expect(home).toContain('rel="manifest"');
    expect((await request(app).get("/manifest.webmanifest")).status).toBe(200);
  });

  it("the home page carries real text, a canonical address and structured data for crawlers that do not run the app", async () => {
    const home = (await request(app).get("/")).text;
    expect(home).toContain("<h1>دليلكم");
    expect(home).toContain(`<link rel="canonical" href="${BASE}/"`);
    expect(home).toContain('"@type":"Organization"');
    expect(home).toContain('"@type":"WebSite"');
    expect(home).not.toContain("معاينة حيّة للتطبيق"); // the old preview banner is gone
  });

  it("a shop's page names the shop, its place and its offers, with LocalBusiness data; a refused shop shows the default page", async () => {
    const cat = await prisma.category.upsert({ where: { slug: "seo-test-cat" }, update: {}, create: { name: "SEO Test", slug: "seo-test-cat" } });
    const owner = await prisma.user.create({ data: { email: `seo-${crypto.randomUUID()}@example.test`, passwordHash: "x", fullName: "Seo", role: "MERCHANT" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: "عيادة الابتسامة <b>", categoryId: cat.id, address: "حلب، الجميلية", phone: "+963111", latitude: 36.2, longitude: 37.13, approvalStatus: "APPROVED" } });
    const html = (await request(app).get(`/?merchant=${shop.id}`)).text;
    expect(html).toContain("<h1>عيادة الابتسامة &lt;b&gt;</h1>"); // escaped, never raw
    expect(html).toContain("حلب، الجميلية");
    expect(html).toContain('"@type":"LocalBusiness"');
    expect(html).toContain('"latitude":36.2');
    expect(html).toContain(`<link rel="canonical" href="${BASE}/?merchant=${shop.id}"`);
    expect(html).not.toContain("<b>"); // no raw markup from the name

    await prisma.merchantProfile.update({ where: { id: shop.id }, data: { approvalStatus: "REJECTED" } });
    const refused = (await request(app).get(`/?merchant=${shop.id}`)).text;
    expect(refused).not.toContain("عيادة الابتسامة");
    expect(refused).toContain("<h1>دليلكم");
  });

  it("the sitemap lists the home page and approved shops only", async () => {
    const cat = await prisma.category.upsert({ where: { slug: "seo-test-cat" }, update: {}, create: { name: "SEO Test", slug: "seo-test-cat" } });
    const make = async (status: "APPROVED" | "PENDING") => {
      const u = await prisma.user.create({ data: { email: `seo-${crypto.randomUUID()}@example.test`, passwordHash: "x", fullName: "Seo", role: "MERCHANT" } });
      return prisma.merchantProfile.create({ data: { userId: u.id, businessName: `Sitemap ${status}`, categoryId: cat.id, address: "x", approvalStatus: status } });
    };
    const ok = await make("APPROVED");
    const waiting = await make("PENDING");
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/xml/);
    expect(res.text).toContain(`<loc>${BASE}/</loc>`);
    expect(res.text).toContain(`/?merchant=${ok.id}`);
    expect(res.text).not.toContain(waiting.id);
  });

  it("robots.txt points to the sitemap and keeps private paths out; llms.txt describes the site", async () => {
    const robots = (await request(app).get("/robots.txt")).text;
    expect(robots).toContain("Sitemap: https://dalilacom.com/sitemap.xml");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("User-agent: GPTBot");
    const llms = await request(app).get("/llms.txt");
    expect(llms.status).toBe(200);
    expect(llms.text).toContain("DALILACOM");
  });
});

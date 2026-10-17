import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { normalizeSocialUrl } from "../src/services/socialLinks.service";

const password = "correct-horse-battery-staple";

async function admin() {
  const email = uniqueEmail("soc");
  await request(app).post("/auth/register").send({ email, password, fullName: "Social Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

afterAll(async () => {
  await prisma.platformSetting.deleteMany({ where: { key: "socialLinks" } });
  await prisma.$disconnect();
});

describe("our social media links (admin panel)", () => {
  it("accepts only addresses on the platform's own website", () => {
    expect(normalizeSocialUrl("instagram", "instagram.com/dalilacom")).toBe("https://instagram.com/dalilacom");
    expect(normalizeSocialUrl("youtube", "https://www.youtube.com/@dalilacom")).toBe("https://www.youtube.com/@dalilacom");
    expect(normalizeSocialUrl("tiktok", "")).toBe("");
    expect(() => normalizeSocialUrl("instagram", "https://evil.example/instagram.com")).toThrow();
    expect(() => normalizeSocialUrl("facebook", "javascript:alert(1)")).toThrow();
    expect(() => normalizeSocialUrl("tiktok", "https://nottiktok.com/x")).toThrow();
    expect(normalizeSocialUrl("googleplay", "play.google.com/store/apps/details?id=com.dalilacom.app")).toBe("https://play.google.com/store/apps/details?id=com.dalilacom.app");
    expect(() => normalizeSocialUrl("googleplay", "https://evil.example/play.google.com")).toThrow();
  });

  it("only the admin can change them, and the public list shows only the ones switched on", async () => {
    const auth = await admin();
    await request(app).put("/admin/social-links").send({ links: [] }).expect(401);
    const bad = await request(app).put("/admin/social-links").set(auth).send({ links: [{ platform: "instagram", url: "https://evil.example/x", visible: true }] });
    expect(bad.status).toBe(400);

    const saved = await request(app).put("/admin/social-links").set(auth).send({
      links: [
        { platform: "instagram", url: "instagram.com/dalilacom", visible: true },
        { platform: "youtube", url: "https://www.youtube.com/@dalilacom", visible: false }, // has an address but is switched off
        { platform: "tiktok", url: "", visible: true }, // switched on but no address: stays off
      ],
    });
    expect(saved.status).toBe(200);
    const pub = await request(app).get("/social-links");
    const platforms = pub.body.links.map((l: any) => l.platform);
    expect(platforms).toContain("instagram");
    expect(platforms).not.toContain("youtube");
    expect(platforms).not.toContain("tiktok");

    const all = await request(app).get("/admin/social-links").set(auth);
    expect(all.body.links.find((l: any) => l.platform === "youtube")).toMatchObject({ url: "https://www.youtube.com/@dalilacom", visible: false });
  });
});

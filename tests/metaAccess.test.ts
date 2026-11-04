import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";
let merchant: Record<string, string>;
let admin: Record<string, string>;

async function account(role: "MERCHANT" | "ADMIN") {
  const email = uniqueEmail(`metaaccess-${role.toLowerCase()}`);
  await request(app).post("/auth/register").send({ email, password, fullName: `Meta access ${role}` });
  await prisma.user.update({ where: { email }, data: { role } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

beforeAll(async () => {
  process.env.META_PUBLIC_ACCESS = "false";
  process.env.META_APP_ID = "1234567890123456";
  process.env.META_APP_SECRET = "test-meta-app-secret";
  process.env.PUBLIC_BASE_URL = "http://localhost:4000";
  await prisma.socialChannel.upsert({ where: { key: "facebook" }, update: { driver: "FACEBOOK", isEnabled: true }, create: { key: "facebook", name: "Facebook", driver: "FACEBOOK" } });
  await prisma.socialChannel.upsert({ where: { key: "telegram" }, update: { driver: "TELEGRAM", isEnabled: true }, create: { key: "telegram", name: "Telegram", driver: "TELEGRAM" } });
  merchant = await account("MERCHANT");
  admin = await account("ADMIN");
});
afterAll(async () => {
  process.env.META_PUBLIC_ACCESS = "true";
  await prisma.$disconnect();
});

describe("Facebook/Instagram linking before Meta approves the app", () => {
  it("shows Facebook as not connectable to a merchant but keeps Telegram open", async () => {
    const res = await request(app).get("/responder/channels").set(merchant);
    expect(res.status).toBe(200);
    expect(res.body.find((c: any) => c.key === "facebook").connectable).toBe(false);
    expect(res.body.find((c: any) => c.key === "telegram").connectable).toBe(true);
  });

  it("refuses the Facebook login start and says it is not available", async () => {
    const status = await request(app).get("/responder/meta/oauth/status").set(merchant);
    expect(status.body.available).toBe(false);
    const start = await request(app).get("/responder/meta/oauth/start").set(merchant);
    expect(start.status).toBe(403);
    expect(start.body.error.code).toBe("META_NOT_OPEN");
  });

  it("refuses a manual Facebook connection from a merchant", async () => {
    const channels = await request(app).get("/responder/channels").set(merchant);
    const facebook = channels.body.find((c: any) => c.key === "facebook");
    const res = await request(app).post("/responder/connections").set(merchant).send({ channelId: facebook.id, credentials: { pageId: "1", pageAccessToken: "x" } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("META_NOT_OPEN");
  });

  it("lets an admin (a role holder on the Meta app) through", async () => {
    const channels = await request(app).get("/responder/channels").set(admin);
    expect(channels.body.find((c: any) => c.key === "facebook").connectable).toBe(true);
    const status = await request(app).get("/responder/meta/oauth/status").set(admin);
    expect(status.body.available).toBe(true);
  });

  it("asks an admin for the comment permissions too (to test them), and a merchant for messaging only", async () => {
    await request(app).post("/responder/activate").set(admin); // the Facebook start needs a running responder (trial)
    const asAdmin = await request(app).get("/responder/meta/oauth/start").set(admin);
    const adminScopes = new URL(asAdmin.body.url).searchParams.get("scope") ?? "";
    expect(adminScopes).toContain("pages_messaging");
    expect(adminScopes).toContain("pages_read_user_content");
    expect(adminScopes).toContain("pages_manage_engagement");

    process.env.META_PUBLIC_ACCESS = "true";
    try {
      await request(app).post("/responder/activate").set(merchant);
      const asMerchant = await request(app).get("/responder/meta/oauth/start").set(merchant);
      const merchantScopes = new URL(asMerchant.body.url).searchParams.get("scope") ?? "";
      expect(merchantScopes).toContain("pages_messaging");
      expect(merchantScopes).not.toContain("pages_read_user_content");
    } finally {
      process.env.META_PUBLIC_ACCESS = "false";
    }
  });

  it("opens to everyone once META_PUBLIC_ACCESS is on", async () => {
    process.env.META_PUBLIC_ACCESS = "true";
    try {
      const channels = await request(app).get("/responder/channels").set(merchant);
      expect(channels.body.find((c: any) => c.key === "facebook").connectable).toBe(true);
    } finally {
      process.env.META_PUBLIC_ACCESS = "false";
    }
  });
});

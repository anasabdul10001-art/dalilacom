import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { decryptJson } from "../src/services/crypto.service";
import { uniqueEmail } from "./helpers";

process.env.META_APP_ID = "1234567890123456";
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.PUBLIC_BASE_URL = "http://localhost:4000";
delete process.env.META_OAUTH_REDIRECT_URI;
delete process.env.META_OAUTH_SCOPES;

const PAGE_A = String(Date.now()).slice(-10);
const PAGE_B = String(Date.now() + 7).slice(-10);
const IG_ID = String(Date.now() + 9).slice(-10);
const PAGE_TOKEN = "EAAB" + "y".repeat(40);

/** Pages the fake Graph API reports for /me/accounts; each test picks what it needs. */
let pagesForAccounts: any[] = [];
const calls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];

const fetchStub = vi.fn(async (url: string, init?: any) => {
  const body = init?.body ? JSON.parse(init.body) : undefined;
  calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body });
  const u = new URL(url);

  if (u.pathname.endsWith("/oauth/access_token")) {
    // The second exchange asks for a long-lived token.
    const long = u.searchParams.get("grant_type") === "fb_exchange_token";
    return new Response(JSON.stringify({ access_token: long ? "LONG-USER-TOKEN" : "SHORT-USER-TOKEN", expires_in: long ? 5184000 : 3600 }));
  }
  if (u.pathname.endsWith("/me/accounts")) {
    return new Response(JSON.stringify({ data: pagesForAccounts }));
  }
  if (init?.method === "POST") return new Response(JSON.stringify({ success: true }));
  const id = u.pathname.split("/").filter(Boolean).pop();
  return new Response(JSON.stringify({ id, name: `page ${id}` }));
});

let token: string;
let userId: string;

async function activatedMerchant(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Merchant" });
  const login = await request(app).post("/auth/login").send({ email, password });
  const bearer = `Bearer ${login.body.token}`;
  expect((await request(app).post("/responder/activate").set("Authorization", bearer)).status).toBe(201);
  return { bearer, userId: login.body.user.id as string };
}

/** Follows /oauth/start to get a genuine, signed state (exactly what the browser would carry back). */
async function startState(bearer: string) {
  const start = await request(app).get("/responder/meta/oauth/start").set("Authorization", bearer);
  expect(start.status).toBe(200);
  const url = new URL(start.body.url);
  return { state: url.searchParams.get("state") as string, url };
}

/** The session the picker page was built for — taken from the flow's own output, not guessed. */
function sessionIdFrom(html: string): string {
  const id = html.match(/session=([0-9a-f-]{36})/)?.[1];
  expect(id).toBeTruthy();
  return id as string;
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchStub);
  await prisma.socialChannel.upsert({ where: { key: "facebook" }, update: { driver: "FACEBOOK" }, create: { key: "facebook", name: "Facebook", driver: "FACEBOOK" } });
  await prisma.socialChannel.upsert({ where: { key: "instagram" }, update: { driver: "INSTAGRAM" }, create: { key: "instagram", name: "Instagram", driver: "INSTAGRAM" } });
  const merchant = await activatedMerchant("oauthuser");
  token = merchant.bearer;
  userId = merchant.userId;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("Facebook Login: starting the flow", () => {
  it("reports availability, the redirect it will use and the permissions it asks for", async () => {
    const res = await request(app).get("/responder/meta/oauth/status").set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.responderRunning).toBe(true);
    expect(res.body.redirectUri).toBe("http://localhost:4000/responder/meta/oauth/callback");
    expect(res.body.scopes).toContain("pages_manage_metadata");
    expect(res.body.scopes).toContain("pages_messaging");
    expect(res.body.deepLink.startsWith("dalilacom://responder/meta")).toBe(true);
  });

  it("hands the app a Facebook dialog URL with our app id, redirect and a signed state", async () => {
    const { url, state } = await startState(token);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("1234567890123456");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4000/responder/meta/oauth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("pages_messaging");
    expect(state.split(".")).toHaveLength(2);
  });

  it("requires a signed-in merchant", async () => {
    const res = await request(app).get("/responder/meta/oauth/start");
    expect(res.status).toBe(401);
  });

  it("refuses to start for a merchant whose auto-responder is not running", async () => {
    const email = uniqueEmail("noresponder");
    const password = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email, password, fullName: "No Responder" });
    const login = await request(app).post("/auth/login").send({ email, password });
    const res = await request(app).get("/responder/meta/oauth/start").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  it("answers META_NOT_CONFIGURED when no Meta app is set up, instead of pretending", async () => {
    const saved = process.env.META_APP_ID;
    delete process.env.META_APP_ID;
    try {
      const res = await request(app).get("/responder/meta/oauth/start").set("Authorization", token);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("META_NOT_CONFIGURED");
    } finally {
      process.env.META_APP_ID = saved;
    }
  });
});

describe("Facebook Login: the callback", () => {
  it("rejects a forged or altered state, and creates nothing", async () => {
    const { state } = await startState(token);
    const tampered = state.slice(0, -2) + "xx";
    const before = await prisma.metaOAuthSession.count();

    for (const bad of [undefined, "not-a-state", `${state.split(".")[0]}.deadbeef`, tampered]) {
      const res = await request(app)
        .get("/responder/meta/oauth/callback")
        .query({ code: "the-code", ...(bad ? { state: bad } : {}) });
      expect(res.status).toBe(400);
      expect(res.text).toContain("تعذّر إكمال الربط");
    }
    expect(await prisma.metaOAuthSession.count()).toBe(before);
  });

  it("surfaces the user cancelling on Facebook without creating anything", async () => {
    const { state } = await startState(token);
    const res = await request(app)
      .get("/responder/meta/oauth/callback")
      .query({ state, error: "access_denied", error_description: "المستخدم رفض" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("تم إلغاء الربط");
  });

  it("explains when the account administers no Pages at all", async () => {
    pagesForAccounts = [];
    const { state } = await startState(token);
    const res = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "c" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("ما لقينا صفحات");
  });

  it("connects the only Page straight away, subscribes it, and stores the token encrypted", async () => {
    pagesForAccounts = [{ id: PAGE_A, name: "متجر الأمل", access_token: PAGE_TOKEN }];
    calls.length = 0;
    const { state } = await startState(token);

    const res = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "the-code" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("تم ربط");
    expect(res.text).toContain("متجر الأمل");
    expect(res.text).toContain("dalilacom://responder/meta");

    // Both token exchanges happened, the long-lived one last.
    const tokenCalls = calls.filter((c) => c.url.includes("oauth/access_token"));
    expect(tokenCalls).toHaveLength(2);
    expect(tokenCalls[1].url).toContain("fb_exchange_token=SHORT-USER-TOKEN");

    const connection = await prisma.channelConnection.findFirst({ where: { userId, externalAccountId: PAGE_A } });
    expect(connection).toBeTruthy();
    expect(connection!.credentialsEnc).not.toContain(PAGE_TOKEN); // never stored in the clear
    expect(decryptJson(connection!.credentialsEnc)).toEqual({ pageId: PAGE_A, pageAccessToken: PAGE_TOKEN });

    // The Page was subscribed to our webhook, which is what makes comments and DMs arrive.
    const subscribed = calls.find((c) => c.method === "POST" && c.url.endsWith(`/${PAGE_A}/subscribed_apps`));
    expect(subscribed).toBeTruthy();
    expect(subscribed!.headers.authorization).toBe(`Bearer ${PAGE_TOKEN}`);

    // The single-use session is spent, so the callback URL cannot be replayed.
    const sessions = await prisma.metaOAuthSession.findMany({ where: { userId } });
    expect(sessions.every((s) => s.consumedAt !== null)).toBe(true);
  });

  it("refuses to connect the same Page twice", async () => {
    pagesForAccounts = [{ id: PAGE_A, name: "متجر الأمل", access_token: PAGE_TOKEN }];
    const { state } = await startState(token);
    const res = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "again" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("مربوط من قبل");
  });

  it("offers a signed picker when the account administers several Pages, and connects the chosen one", async () => {
    pagesForAccounts = [
      { id: PAGE_B, name: "مطعم الياسمين", access_token: PAGE_TOKEN, instagram_business_account: { id: IG_ID, username: "yasmin" } },
      { id: PAGE_A, name: "متجر الأمل", access_token: PAGE_TOKEN },
    ];
    const { state } = await startState(token);

    const res = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "pick-a-page" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("اختر الصفحة");
    expect(res.text).toContain("مطعم الياسمين");
    expect(res.text).toContain("ربط إنستغرام");
    expect(res.text).toContain("@yasmin");

    // Nothing is connected until the merchant picks.
    expect(await prisma.channelConnection.count({ where: { userId, externalAccountId: PAGE_B } })).toBe(0);

    const sessionId = sessionIdFrom(res.text);
    const complete = await request(app)
      .post("/responder/meta/oauth/complete")
      .set("Authorization", token)
      .send({ sessionId, pageId: PAGE_B, driver: "FACEBOOK" });
    expect(complete.status).toBe(201);
    expect(complete.body.externalAccountId).toBe(PAGE_B);
    expect(await prisma.metaOAuthSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({ consumedAt: expect.any(Date) });
  });

  it("lets the app list the discovered Pages and connect a Page's Instagram account", async () => {
    const igPageId = String(Date.now() + 3).slice(-10);
    const otherPageId = String(Date.now() + 8).slice(-10);
    pagesForAccounts = [
      { id: igPageId, name: "معرض النور", access_token: PAGE_TOKEN, instagram_business_account: { id: IG_ID, username: "noor" } },
      { id: otherPageId, name: "فرع تاني", access_token: PAGE_TOKEN },
    ];
    const shop = await activatedMerchant("igmerchant");
    const { state } = await startState(shop.bearer);
    const html = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "ig" });
    const sessionId = sessionIdFrom(html.text);

    const list = await request(app).get(`/responder/meta/oauth/session/${sessionId}`).set("Authorization", shop.bearer);
    expect(list.status).toBe(200);
    expect(list.body.pages.find((p: any) => p.id === igPageId)).toMatchObject({ name: "معرض النور", hasInstagram: true, instagramUsername: "noor" });

    // Another merchant cannot read or complete someone else's session.
    const stranger = await activatedMerchant("oauthstranger");
    expect((await request(app).get(`/responder/meta/oauth/session/${sessionId}`).set("Authorization", stranger.bearer)).status).toBe(404);
    const stolen = await request(app)
      .post("/responder/meta/oauth/complete")
      .set("Authorization", stranger.bearer)
      .send({ sessionId, pageId: igPageId, driver: "INSTAGRAM" });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.code).toBe("SESSION_INVALID");

    const complete = await request(app)
      .post("/responder/meta/oauth/complete")
      .set("Authorization", shop.bearer)
      .send({ sessionId, pageId: igPageId, driver: "INSTAGRAM" });
    expect(complete.status).toBe(201);
    const connection = await prisma.channelConnection.findUniqueOrThrow({ where: { id: complete.body.id } });
    expect(decryptJson(connection.credentialsEnc)).toMatchObject({ instagramAccountId: IG_ID });
  });

  it("refuses Instagram for a Page that has no business account linked", async () => {
    const plainPageId = String(Date.now() + 5).slice(-10);
    pagesForAccounts = [
      { id: plainPageId, name: "بلا إنستغرام", access_token: PAGE_TOKEN },
      { id: String(Date.now() + 6).slice(-10), name: "كتير عادي", access_token: PAGE_TOKEN },
    ];
    const shop = await activatedMerchant("noigmerchant");
    const { state } = await startState(shop.bearer);
    const html = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "noig" });
    const sessionId = sessionIdFrom(html.text);

    const res = await request(app)
      .post("/responder/meta/oauth/complete")
      .set("Authorization", shop.bearer)
      .send({ sessionId, pageId: plainPageId, driver: "INSTAGRAM" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_INSTAGRAM_ACCOUNT");
  });

  it("rejects a browser picker link whose signature was tampered with", async () => {
    pagesForAccounts = [
      { id: String(Date.now() + 1).slice(-10), name: "أ", access_token: PAGE_TOKEN },
      { id: String(Date.now() + 2).slice(-10), name: "ب", access_token: PAGE_TOKEN },
    ];
    const shop = await activatedMerchant("sigmerchant");
    const { state } = await startState(shop.bearer);
    const html = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "sig" });
    const href = html.text.match(/\/responder\/meta\/oauth\/pick\?[^"]+/)?.[0] as string;
    expect(href).toBeTruthy();

    const tampered = href.replace(/sig=[^&]+/, "sig=deadbeef");
    const res = await request(app).get(tampered);
    expect(res.status).toBe(400);
    expect(res.text).toContain("رابط غير صالح");

    // The untouched link works.
    const ok = await request(app).get(href.replace(/&amp;/g, "&"));
    expect(ok.status).toBe(200);
    expect(ok.text).toContain("تم الربط");
  });

  it("cannot reuse a session that was already completed", async () => {
    const pageId = String(Date.now() + 4).slice(-10);
    pagesForAccounts = [
      { id: pageId, name: "مرة وحدة", access_token: PAGE_TOKEN },
      { id: String(Date.now() + 9).slice(-10), name: "تاني", access_token: PAGE_TOKEN },
    ];
    const shop = await activatedMerchant("oncemerchant");
    const { state } = await startState(shop.bearer);
    const html = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "once" });
    const sessionId = sessionIdFrom(html.text);

    const first = await request(app).post("/responder/meta/oauth/complete").set("Authorization", shop.bearer).send({ sessionId, pageId });
    expect(first.status).toBe(201);
    const second = await request(app).post("/responder/meta/oauth/complete").set("Authorization", shop.bearer).send({ sessionId, pageId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("SESSION_INVALID");
  });

  it("cannot complete a session whose 15 minutes are up", async () => {
    const pageId = String(Date.now() + 6).slice(-10);
    pagesForAccounts = [
      { id: pageId, name: "منتهية", access_token: PAGE_TOKEN },
      { id: String(Date.now() + 7).slice(-10), name: "كتير منتهية", access_token: PAGE_TOKEN },
    ];
    const shop = await activatedMerchant("expiredmerchant");
    const { state } = await startState(shop.bearer);
    const html = await request(app).get("/responder/meta/oauth/callback").query({ state, code: "expired" });
    const sessionId = sessionIdFrom(html.text);

    await prisma.metaOAuthSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/responder/meta/oauth/complete").set("Authorization", shop.bearer).send({ sessionId, pageId });
    expect(res.status).toBe(409);
    expect(await prisma.channelConnection.count({ where: { userId: shop.userId } })).toBe(0);
  });

  it("never lets a stranger complete a session by guessing its id", async () => {
    const stranger = await activatedMerchant("guessmerchant");
    const res = await request(app)
      .post("/responder/meta/oauth/complete")
      .set("Authorization", stranger.bearer)
      .send({ sessionId: crypto.randomUUID(), pageId: PAGE_A });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SESSION_INVALID");
  });
});

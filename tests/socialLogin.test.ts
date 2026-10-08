import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

beforeEach(() => {
  fetchStub.mockReset();
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  process.env.FACEBOOK_LOGIN_APP_ID = "fb-app";
  process.env.FACEBOOK_LOGIN_APP_SECRET = "fb-secret";
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FACEBOOK_LOGIN_APP_ID", "FACEBOOK_LOGIN_APP_SECRET"]) delete process.env[key];
  await prisma.$disconnect();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The provider's side: a token for any code, and the given profile for that token. */
function providerAnswers(provider: "google" | "facebook", profile: Record<string, unknown> | null, tokenOk = true) {
  fetchStub.mockImplementation(async (url: string) => {
    const target = String(url);
    if (target.includes("/token") || target.includes("oauth/access_token")) return tokenOk ? json({ access_token: "provider-token" }) : json({ error: "invalid_grant" }, 400);
    if (target.includes("openidconnect.googleapis.com") || target.includes("graph.facebook.com/me")) return profile ? json(profile) : json({}, 401);
    throw new Error(`unexpected fetch ${target}`);
  });
}
const googleProfile = (email: string, over: Record<string, unknown> = {}) => ({ sub: `g-${crypto.randomUUID()}`, email, email_verified: true, name: "Google Person", ...over });
const facebookProfile = (email: string | undefined, over: Record<string, unknown> = {}) => ({ id: `f-${crypto.randomUUID()}`, name: "Facebook Person", ...(email ? { email } : {}), ...over });

/** Runs the browser round trip: start -> (provider) -> callback. Returns where the browser is sent afterwards. */
async function browserFlow(provider: "google" | "facebook", opts: { platform?: "web" | "app"; code?: string | null; cookie?: string } = {}) {
  const start = await request(app).get(`/auth/social/${provider}/start`).query({ platform: opts.platform ?? "web" });
  expect(start.status).toBe(302);
  const state = new URL(start.headers.location).searchParams.get("state")!;
  const cookie = opts.cookie ?? String(start.headers["set-cookie"]).split(";")[0];
  const query: Record<string, string> = { state };
  if (opts.code !== null) query.code = opts.code ?? "auth-code";
  const callback = await request(app).get(`/auth/social/${provider}/callback`).set("Cookie", cookie).query(query);
  return { start, callback, location: callback.headers.location as string };
}
const params = (location: string) => new URL(location, "http://x").searchParams;
const exchange = (ticket: string) => request(app).post("/auth/social/exchange").send({ ticket });

describe("Which social buttons exist", () => {
  it("lists only the providers the server has keys for, and refuses to start an unconfigured one", async () => {
    expect((await request(app).get("/auth/social/providers")).body).toEqual({ google: true, facebook: true });
    delete process.env.FACEBOOK_LOGIN_APP_ID;
    delete process.env.META_APP_ID;
    expect((await request(app).get("/auth/social/providers")).body).toEqual({ google: true, facebook: false });
    const refused = await request(app).get("/auth/social/facebook/start");
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe("SOCIAL_NOT_CONFIGURED");
    expect((await request(app).get("/auth/social/instagram/start")).status).toBe(404); // not offered by Meta for ordinary people
  });

  it("sends the browser to the provider with the app's id, the callback address and a signed state", async () => {
    const start = await request(app).get("/auth/social/google/start").query({ platform: "app", lang: "en" });
    const url = new URL(start.headers.location);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client");
    expect(url.searchParams.get("redirect_uri")).toContain("/auth/social/google/callback");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("auth_type")).toBeNull();
    expect(String(start.headers["set-cookie"])).toMatch(/dlk_social_nonce=.*HttpOnly/);
  });

  it("asks Facebook again for an email that was declined once (rerequest)", async () => {
    const start = await request(app).get("/auth/social/facebook/start").query({ platform: "app", lang: "en" });
    const url = new URL(start.headers.location);
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("auth_type")).toBe("rerequest");
  });
});

describe("Signing in with Google", () => {
  it("creates a verified customer account, hands back a one-time ticket, and the same person returns to the same account", async () => {
    const email = uniqueEmail("googlenew");
    const profile = googleProfile(email);
    providerAnswers("google", profile);

    const first = await browserFlow("google");
    expect(first.location).toMatch(/^\/app\/\?ticket=/);
    const session = await exchange(params(first.location).get("ticket")!);
    expect(session.status).toBe(200);
    expect(session.body.user).toMatchObject({ email, role: "CUSTOMER", emailVerified: true, fullName: "Google Person" });
    expect((await request(app).get("/auth/me").set("Authorization", `Bearer ${session.body.token}`)).status).toBe(200);

    const again = await browserFlow("google");
    const second = await exchange(params(again.location).get("ticket")!);
    expect(second.body.user.id).toBe(session.body.user.id);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.socialIdentity.count({ where: { userId: session.body.user.id } })).toBe(1);
  });

  it("the ticket works once, expires after a minute, and the app is sent back through its own link", async () => {
    providerAnswers("google", googleProfile(uniqueEmail("googleticket")));
    const flow = await browserFlow("google", { platform: "app" });
    expect(flow.location).toMatch(/^dalilacom:\/\/auth\/social\?ticket=/);
    const ticket = params(flow.location).get("ticket")!;
    expect((await exchange(ticket)).status).toBe(200);
    const replay = await exchange(ticket);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("TICKET_INVALID");

    const stale = params((await browserFlow("google")).location).get("ticket")!;
    await prisma.loginTicket.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) }, where: { usedAt: null } });
    expect((await exchange(stale)).status).toBe(401);
    expect((await exchange("not-a-real-ticket-at-all")).status).toBe(401);
  });

  it("links to an existing verified account with the same email — the password keeps working", async () => {
    const email = uniqueEmail("googlelink");
    const registered = await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Has Password" });
    await prisma.user.update({ where: { email }, data: { isEmailVerified: true } });
    providerAnswers("google", googleProfile(email));

    const session = await exchange(params((await browserFlow("google")).location).get("ticket")!);
    expect(session.body.user.id).toBe(registered.body.user.id);
    expect((await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" })).status).toBe(200);
  });

  it("takes an account over from whoever registered someone else's address without verifying it", async () => {
    const email = uniqueEmail("googlehijack");
    const squatter = await request(app).post("/auth/register").send({ email, password: "squatter-password-12345", fullName: "Squatter" });
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).isEmailVerified).toBe(false);
    providerAnswers("google", googleProfile(email));

    const session = await exchange(params((await browserFlow("google")).location).get("ticket")!);
    expect(session.body.user).toMatchObject({ id: squatter.body.user.id, emailVerified: true });
    expect((await request(app).post("/auth/login").send({ email, password: "squatter-password-12345" })).status).toBe(401); // the squatter is out
    expect((await request(app).get("/auth/me").set("Authorization", `Bearer ${squatter.body.token}`)).status).toBe(401); // and so is their open session
  });
});

describe("Signing in with Facebook", () => {
  it("creates an account for a new email, but never merges into an existing one on Facebook's word alone", async () => {
    const fresh = uniqueEmail("fbnew");
    providerAnswers("facebook", facebookProfile(fresh));
    const created = await exchange(params((await browserFlow("facebook")).location).get("ticket")!);
    expect(created.status).toBe(200);
    expect(created.body.user).toMatchObject({ email: fresh, emailVerified: false });

    const taken = uniqueEmail("fbtaken");
    await request(app).post("/auth/register").send({ email: taken, password: "correct-horse-battery-staple", fullName: "Owner" });
    providerAnswers("facebook", facebookProfile(taken));
    const refused = await browserFlow("facebook");
    expect(params(refused.location).get("social_error")).toBe("EMAIL_IN_USE");
    expect(params(refused.location).get("ticket")).toBeNull();
  });

  it("lets the person type an email when Facebook shares none, and never takes over an address that already has an account", async () => {
    providerAnswers("facebook", facebookProfile(undefined));
    const back = await browserFlow("facebook");
    const pending = params(back.location).get("social_pending")!;
    expect(params(back.location).get("social_error")).toBeNull();
    expect(params(back.location).get("ticket")).toBeNull();
    expect(pending).toBeTruthy();

    // a made-up pending token is refused
    expect((await request(app).post("/auth/social/complete").send({ pending: "x".repeat(40), email: uniqueEmail("nope") })).status).toBe(400);

    // an address that already belongs to someone is refused
    const taken = uniqueEmail("fbtaken");
    await request(app).post("/auth/register").send({ email: taken, password: "correct-horse-battery-staple", fullName: "Owner" });
    const refused = await request(app).post("/auth/social/complete").send({ pending, email: taken });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("EMAIL_IN_USE");

    // a free address makes the account and signs in; the address is not verified yet
    const fresh = uniqueEmail("fbtyped");
    const done = await request(app).post("/auth/social/complete").send({ pending, email: fresh.toUpperCase() });
    expect(done.status).toBe(200);
    expect(done.body.user).toMatchObject({ email: fresh, emailVerified: false });
    expect(done.body.token).toBeTruthy();

    // the same Facebook account signs straight in next time
    const again = await request(app).post("/auth/social/complete").send({ pending, email: uniqueEmail("other") });
    expect(again.status).toBe(200);
    expect(again.body.user.email).toBe(fresh);
  });
});

describe("When the flow goes wrong", () => {
  it("rejects a forged state or a browser that did not start the flow, and reports a cancelled or refused sign-in", async () => {
    providerAnswers("google", googleProfile(uniqueEmail("googlewrong")));
    expect((await request(app).get("/auth/social/google/callback").query({ state: "forged", code: "x" })).status).toBe(400);
    expect(params((await browserFlow("google", { cookie: "dlk_social_nonce=someone-elses" })).location).get("social_error")).toBe("BAD_STATE");
    expect(params((await browserFlow("google", { code: null })).location).get("social_error")).toBe("CANCELLED");

    providerAnswers("google", null, false);
    expect(params((await browserFlow("google")).location).get("social_error")).toBe("PROVIDER_REJECTED");
  });

  it("turns away a disabled account", async () => {
    const email = uniqueEmail("googledisabled");
    const profile = googleProfile(email);
    providerAnswers("google", profile);
    const session = await exchange(params((await browserFlow("google")).location).get("ticket")!);
    await prisma.user.update({ where: { id: session.body.user.id }, data: { isDisabled: true } });
    expect(params((await browserFlow("google")).location).get("social_error")).toBe("ACCOUNT_DISABLED");
    expect(params((await browserFlow("google")).location).get("ticket")).toBeNull();
  });
});

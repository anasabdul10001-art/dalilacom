import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const SECRET = "test-meta-app-secret";
const VERIFY = "test-meta-verify-token";
process.env.META_APP_SECRET = SECRET;
process.env.META_VERIFY_TOKEN = VERIFY;

const PAGE_ID = String(Date.now()).slice(-10);
const IG_ID = String(Date.now() + 1).slice(-10);
const TOKEN = "EAAB" + "x".repeat(40);

const calls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];
const fetchStub = vi.fn(async (url: string, init?: any) => {
  const body = init?.body ? JSON.parse(init.body) : undefined;
  calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body });
  if (url.includes("/posts?")) {
    return new Response(JSON.stringify({ data: [{ id: `${PAGE_ID}_1`, message: "عرض الصيف", created_time: "2026-10-01T10:00:00+0000", permalink_url: "https://fb.com/p/1" }] }));
  }
  if (url.includes("/media?")) {
    return new Response(JSON.stringify({ data: [{ id: "ig_media_1", caption: "صورة جديدة", timestamp: "2026-10-01T10:00:00+0000", permalink: "https://instagram.com/p/1" }] }));
  }
  if (init?.method === "POST") return new Response(JSON.stringify({ id: "ok", success: true }));
  const id = url.split("?")[0].split("/").pop();
  return new Response(JSON.stringify({ id }));
});

function signed(payload: unknown, secret = SECRET) {
  const raw = JSON.stringify(payload);
  return { raw, signature: "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex") };
}
async function deliver(payload: unknown) {
  const { raw, signature } = signed(payload);
  return request(app).post("/hooks/meta").set("content-type", "application/json").set("x-hub-signature-256", signature).send(raw);
}
const commentEvent = (over: Record<string, unknown> = {}) => ({
  object: "page",
  entry: [{ id: PAGE_ID, changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: `c_${crypto.randomUUID()}`, post_id: `${PAGE_ID}_1`, parent_id: `${PAGE_ID}_1`, message: "بكم السعر؟", from: { id: "user_1", name: "سامر" }, ...over } }] }],
});

let token: string;
let userId: string;
let connectionId: string;

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchStub);
  await prisma.socialChannel.upsert({ where: { key: "facebook" }, update: { driver: "FACEBOOK" }, create: { key: "facebook", name: "Facebook", driver: "FACEBOOK" } });
  await prisma.socialChannel.upsert({ where: { key: "instagram" }, update: { driver: "INSTAGRAM" }, create: { key: "instagram", name: "Instagram", driver: "INSTAGRAM" } });

  const email = uniqueEmail("metauser");
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Meta User" });
  const login = await request(app).post("/auth/login").send({ email, password });
  token = login.body.token;
  userId = login.body.user.id;
  expect((await request(app).post("/responder/activate").set("Authorization", `Bearer ${token}`)).status).toBe(201);

  const channels = (await request(app).get("/responder/channels").set("Authorization", `Bearer ${token}`)).body;
  const fb = channels.find((c: any) => c.key === "facebook");
  expect(fb.connectable).toBe(true);
  const connect = await request(app)
    .post("/responder/connections")
    .set("Authorization", `Bearer ${token}`)
    .send({ channelId: fb.id, credentials: { pageId: PAGE_ID, pageAccessToken: TOKEN } });
  expect(connect.status).toBe(201);
  connectionId = connect.body.id;

  const rule = (body: object) =>
    request(app).post("/responder/rules").set("Authorization", `Bearer ${token}`).send({ mode: "FIXED", ...body });
  expect((await rule({ name: "سعر المنشور", keywords: ["سعر"], replyTemplate: "أهلا {name}، السعر 10$", postIds: [`${PAGE_ID}_1`] })).status).toBe(201);
  expect((await rule({ name: "الموقع", keywords: ["موقع"], replyTemplate: "نحن بالشام" })).status).toBe(201);
  calls.length = 0;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("Meta webhook: handshake and signature", () => {
  it("answers the subscription challenge only with the right verify token", async () => {
    const ok = await request(app).get("/hooks/meta").query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "12345" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("12345");
    const bad = await request(app).get("/hooks/meta").query({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" });
    expect(bad.status).toBe(403);
  });

  it("rejects deliveries with a missing or wrong signature", async () => {
    const payload = commentEvent();
    const unsigned = await request(app).post("/hooks/meta").send(payload);
    expect(unsigned.status).toBe(401);
    const { raw, signature } = signed(payload, "wrong-secret");
    const wrong = await request(app).post("/hooks/meta").set("content-type", "application/json").set("x-hub-signature-256", signature).send(raw);
    expect(wrong.status).toBe(401);
  });
});

describe("Facebook comments and post targeting", () => {
  it("replies to a comment on the targeted post, once, using the token in a header", async () => {
    const event = commentEvent();
    const commentId = (event.entry[0].changes[0].value as any).comment_id;
    expect((await deliver(event)).status).toBe(200);

    const send = calls.find((c) => c.method === "POST" && c.url.endsWith(`/${commentId}/comments`));
    expect(send).toBeTruthy();
    expect(send!.body.message).toBe("أهلا سامر، السعر 10$");
    expect(send!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(send!.url).not.toContain(TOKEN);

    const item = await prisma.responderInteraction.findFirst({ where: { userId, externalId: commentId } });
    expect(item?.status).toBe("SENT");
    expect(item?.postId).toBe(`${PAGE_ID}_1`);

    // Meta redelivers the same event: no second reply.
    const before = calls.length;
    await deliver(event);
    expect(calls.length).toBe(before);
    expect(await prisma.responderInteraction.count({ where: { userId, externalId: commentId } })).toBe(1);
  });

  it("ignores a post-targeted rule for comments on other posts", async () => {
    const event = commentEvent({ post_id: `${PAGE_ID}_999`, parent_id: `${PAGE_ID}_999` });
    const before = calls.filter((c) => c.method === "POST").length;
    await deliver(event);
    expect(calls.filter((c) => c.method === "POST").length).toBe(before);
    const item = await prisma.responderInteraction.findFirst({ where: { userId, externalId: (event.entry[0].changes[0].value as any).comment_id } });
    expect(item?.status).toBe("SKIPPED");
  });

  it("never auto-replies to a complaint, even on a targeted post", async () => {
    const event = commentEvent({ message: "السعر غالي ومنتجكم سيء" });
    const before = calls.filter((c) => c.method === "POST").length;
    await deliver(event);
    expect(calls.filter((c) => c.method === "POST").length).toBe(before);
    const item = await prisma.responderInteraction.findFirst({ where: { userId, externalId: (event.entry[0].changes[0].value as any).comment_id } });
    expect(item?.status).toBe("NEEDS_REVIEW");
  });

  it("ignores the page's own comments and replies to comments", async () => {
    const before = calls.length;
    await deliver(commentEvent({ from: { id: PAGE_ID, name: "Page" } }));
    await deliver(commentEvent({ parent_id: "some_other_comment" }));
    expect(calls.length).toBe(before);
  });

  it("answers a Messenger DM with a general rule via the messages endpoint", async () => {
    const mid = `m_${crypto.randomUUID()}`;
    await deliver({ object: "page", entry: [{ id: PAGE_ID, messaging: [{ sender: { id: "user_9" }, recipient: { id: PAGE_ID }, message: { mid, text: "وين الموقع؟" } }] }] });
    const send = calls.find((c) => c.url.endsWith(`/${PAGE_ID}/messages`));
    expect(send).toBeTruthy();
    expect(send!.body.recipient.id).toBe("user_9");
    expect(send!.body.message.text).toBe("نحن بالشام");
  });

  it("a post-targeted rule does not answer DMs", async () => {
    const mid = `m_${crypto.randomUUID()}`;
    const before = calls.filter((c) => c.method === "POST").length;
    await deliver({ object: "page", entry: [{ id: PAGE_ID, messaging: [{ sender: { id: "user_9" }, message: { mid, text: "بكم السعر" } }] }] });
    expect(calls.filter((c) => c.method === "POST").length).toBe(before);
  });
});

describe("Post picker and Instagram", () => {
  it("lists the connected page's recent posts for rule targeting", async () => {
    const res = await request(app).get(`/responder/connections/${connectionId}/posts`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: `${PAGE_ID}_1`, text: "عرض الصيف", url: "https://fb.com/p/1" });
  });

  it("does not let another user read a connection's posts", async () => {
    const email = uniqueEmail("other");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Other User" });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    const res = await request(app).get(`/responder/connections/${connectionId}/posts`).set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(404);
  });

  it("refuses to connect the same page twice", async () => {
    const channels = (await request(app).get("/responder/channels").set("Authorization", `Bearer ${token}`)).body;
    const fb = channels.find((c: any) => c.key === "facebook");
    const res = await request(app)
      .post("/responder/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ channelId: fb.id, credentials: { pageId: PAGE_ID, pageAccessToken: TOKEN } });
    expect(res.status).toBe(409);
  });

  it("connects Instagram, lists media, and replies to a comment via /replies", async () => {
    const channels = (await request(app).get("/responder/channels").set("Authorization", `Bearer ${token}`)).body;
    const ig = channels.find((c: any) => c.key === "instagram");
    const connect = await request(app)
      .post("/responder/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ channelId: ig.id, credentials: { instagramAccountId: IG_ID, pageId: PAGE_ID, pageAccessToken: TOKEN } });
    expect(connect.status).toBe(201);

    const media = await request(app).get(`/responder/connections/${connect.body.id}/posts`).set("Authorization", `Bearer ${token}`);
    expect(media.body[0].id).toBe("ig_media_1");

    const commentId = `ig_${crypto.randomUUID()}`;
    await deliver({ object: "instagram", entry: [{ id: IG_ID, changes: [{ field: "comments", value: { id: commentId, text: "وين الموقع", from: { id: "ig_user", username: "lina" }, media: { id: "ig_media_1" } } }] }] });
    const send = calls.find((c) => c.url.endsWith(`/${commentId}/replies`));
    expect(send?.body.message).toBe("نحن بالشام");
  });

  it("validates Meta credentials", async () => {
    const channels = (await request(app).get("/responder/channels").set("Authorization", `Bearer ${token}`)).body;
    const fb = channels.find((c: any) => c.key === "facebook");
    const res = await request(app).post("/responder/connections").set("Authorization", `Bearer ${token}`).send({ channelId: fb.id, credentials: { pageId: "abc", pageAccessToken: "short" } });
    expect(res.status).toBe(400);
  });
});

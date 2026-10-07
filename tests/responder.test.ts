import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { resetAiProviderState } from "../src/services/ai.service";
import { adjustBalance } from "../src/services/wallet.service";
import { getSettings, saveSettings } from "../src/services/settings.service";
import { uniqueEmail } from "./helpers";

const REPLY_URL = "https://reply.example.test/send";
const SECRET = "shared-secret-12345";

type Sent = { url: string; body: any };
let sentReplies: Sent[] = [];
let aiCalls: { system: string; user: string }[] = [];
let aiAnswer: string | null = null;

beforeEach(() => {
  sentReplies = [];
  aiCalls = [];
  aiAnswer = null;
  resetAiProviderState();
  vi.stubGlobal("fetch", async (url: string, init: any) => {
    const target = String(url);
    if (target === REPLY_URL) {
      sentReplies.push({ url: target, body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    }
    if (target.includes("api.groq.com")) {
      const body = JSON.parse(init.body);
      aiCalls.push({ system: body.messages[0].content, user: body.messages[1].content });
      const isClassify = String(body.messages[0].content).startsWith("Classify");
      const content = isClassify ? "inquiry" : aiAnswer;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: content ? 200 : 500 });
    }
    throw new Error(`unexpected fetch ${target}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  resetAiProviderState();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, role: "CUSTOMER" | "MERCHANT" = "CUSTOMER") {
  const email = uniqueEmail(prefix);
  await request(app).post("/auth/register").send({ email, password, fullName: `Responder ${prefix}` });
  const user = await prisma.user.update({ where: { email }, data: { role } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const credit = (userId: string, amount: number) => prisma.$transaction((tx) => adjustBalance(tx, userId, amount, "TOPUP", "test-credit"));
const activate = (u: { auth: Record<string, string> }) => request(app).post("/responder/activate").set(u.auth);

async function webhookChannel() {
  return prisma.socialChannel.upsert({ where: { key: "webhook" }, update: { driver: "GENERIC_WEBHOOK", isEnabled: true }, create: { key: "webhook", name: "Webhook", driver: "GENERIC_WEBHOOK" } });
}

/** A running responder with a generic-webhook channel connected; returns the URL platforms post customer messages to. */
async function running(prefix: string, role: "CUSTOMER" | "MERCHANT" = "CUSTOMER") {
  const owner = await account(prefix, role);
  expect((await activate(owner)).status).toBe(201);
  const channel = await webhookChannel();
  const connected = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: SECRET, replyUrl: REPLY_URL } });
  expect(connected.status).toBe(201);
  const connection = await prisma.channelConnection.findUniqueOrThrow({ where: { id: connected.body.id } });
  return { ...owner, channelId: channel.id, connectionId: connection.id, hook: `/hooks/${connection.hookToken}` };
}
const customerSays = (hook: string, text: string, conversationRef = "chat-1", authorName = "سامر") =>
  request(app).post(hook).set("x-webhook-secret", SECRET).send({ conversationRef, authorName, text });
const rule = (owner: { auth: Record<string, string> }, body: object) =>
  request(app).post("/responder/rules").set(owner.auth).send({ name: "rule", keywords: ["سعر"], mode: "FIXED", replyTemplate: "أهلًا {name}، السعر 10", ...body });
const inbox = (owner: { auth: Record<string, string> }, status?: string) => request(app).get("/responder/inbox").set(owner.auth).query(status ? { status } : {});
const notices = (userId: string) => prisma.notification.findMany({ where: { userId, type: "SYSTEM" }, orderBy: { createdAt: "asc" } });

describe("Starting and paying for the responder", () => {
  it("opens with the one-time free trial, refuses a second start, and stops answering when the trial runs out", async () => {
    const owner = await account("resptrial");
    const status = await request(app).get("/responder/status").set(owner.auth);
    expect(status.body).toMatchObject({ status: "OFF", running: false, trialAvailable: true });

    const started = await activate(owner);
    expect(started.status).toBe(201);
    expect(started.body.kind).toBe("TRIAL_STARTED");
    expect((await activate(owner)).status).toBe(409);
    expect((await request(app).get("/responder/status").set(owner.auth)).body).toMatchObject({ status: "TRIAL", running: true, trialAvailable: false });

    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const after = await request(app).get("/responder/status").set(owner.auth);
    expect(after.body).toMatchObject({ status: "EXPIRED", running: false });
    // the owner is told once that it stopped
    expect((await notices(owner.id)).filter((n) => n.title.includes("انتهت تجربة"))).toHaveLength(1);
    await request(app).get("/responder/status").set(owner.auth);
    expect((await notices(owner.id)).filter((n) => n.title.includes("انتهت تجربة"))).toHaveLength(1);
  });

  it("charges the wallet for a period once the trial is used — refuses when the balance is short, extends when renewed early", async () => {
    const owner = await account("resppay");
    const settings = await getSettings();
    await activate(owner); // trial
    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { status: "EXPIRED", trialEndsAt: new Date(Date.now() - 1000) } });

    const poor = await activate(owner);
    expect(poor.status).toBe(402);
    expect(poor.body.error.details).toMatchObject({ balance: 0, needed: settings.responder.priceCustomer });

    await credit(owner.id, settings.responder.priceCustomer * 3);
    const paid = await activate(owner);
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ kind: "PAID", charged: settings.responder.priceCustomer });
    const firstEnd = new Date(paid.body.sub.periodEnd).getTime();

    const renewed = await request(app).post("/responder/renew").set(owner.auth);
    expect(renewed.status).toBe(200);
    expect(new Date(renewed.body.sub.periodEnd).getTime()).toBe(firstEnd + settings.responder.periodDays * 24 * 3600 * 1000); // added to what was left
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: owner.id } })).balance).toBe(settings.responder.priceCustomer);
  });

  it("only a running subscription can connect a channel, and the channel's credentials are validated", async () => {
    const owner = await account("respconnect");
    const channel = await webhookChannel();
    const early = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: SECRET, replyUrl: REPLY_URL } });
    expect(early.status).toBe(403);

    await activate(owner);
    const weak = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: "short", replyUrl: REPLY_URL } });
    expect(weak.status).toBe(400);
    const insecure = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: SECRET, replyUrl: "http://plain.example.test" } });
    expect(insecure.status).toBe(400);
    const ok = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: SECRET, replyUrl: REPLY_URL } });
    expect(ok.status).toBe(201);
    const list = await request(app).get("/responder/connections").set(owner.auth);
    expect(list.body[0].hookUrl).toContain("/hooks/");
    expect(JSON.stringify(list.body)).not.toContain(SECRET); // the secret is stored encrypted and never listed
  });
});

describe("Answering customers", () => {
  it("answers a matching message with the rule's text (name filled in), records it, and ignores one with no rule", async () => {
    const owner = await running("respfixed");
    expect((await rule(owner, {})).status).toBe(201);

    expect((await customerSays(owner.hook, "بكم السعر؟")).status).toBe(200);
    expect(sentReplies).toEqual([{ url: REPLY_URL, body: { conversationRef: "chat-1", text: "أهلًا سامر، السعر 10" } }]);
    expect((await inbox(owner, "SENT")).body[0]).toMatchObject({ message: "بكم السعر؟", reply: "أهلًا سامر، السعر 10", status: "SENT" });

    await customerSays(owner.hook, "صباح الخير", "chat-2");
    expect(sentReplies).toHaveLength(1);
    expect((await inbox(owner, "SKIPPED")).body[0]).toMatchObject({ reason: "no_matching_rule" });
    expect(await notices(owner.id)).toHaveLength(0); // a message nobody needs to act on does not ring
  });

  it("a wrong secret or an unknown hook answers nothing, and a switched-off rule stays silent until it is switched on", async () => {
    const owner = await running("respguard");
    await rule(owner, {});
    await request(app).post(owner.hook).set("x-webhook-secret", "wrong-secret-0000").send({ conversationRef: "c", authorName: "x", text: "سعر" });
    await request(app).post("/hooks/not-a-real-hook").set("x-webhook-secret", SECRET).send({ conversationRef: "c", authorName: "x", text: "سعر" });
    expect(sentReplies).toHaveLength(0);

    const created = (await rule(owner, { name: "off", keywords: ["عرض"], isActive: false })).body;
    await customerSays(owner.hook, "في عرض؟");
    expect(sentReplies).toHaveLength(0);
    await request(app).patch(`/responder/rules/${created.id}`).set(owner.auth).send({ isActive: true });
    await customerSays(owner.hook, "في عرض؟", "chat-9");
    expect(sentReplies).toHaveLength(1);
  });

  it("answers a complaint with a holding message when the AI cannot settle it, keeps it for a person, and tells the owner once an hour", async () => {
    const owner = await running("respcomplaint");
    await rule(owner, { keywords: ["شكوى", "سعر"] });

    await customerSays(owner.hook, "عندي شكوى على الطلب");
    await customerSays(owner.hook, "ولسا عندي شكوى!"); // same conversation, same hour
    // never ignored, and never a rule's cheerful template: the customer is told a real person will follow up
    expect(sentReplies.map((r) => r.body.text)).toEqual([expect.stringContaining("رح يتواصل معك قريبًا"), expect.stringContaining("رح يتواصل معك قريبًا")]);
    const waiting = (await inbox(owner, "NEEDS_REVIEW")).body;
    expect(waiting).toHaveLength(2);
    expect(waiting[0]).toMatchObject({ intent: "complaint", reason: "complaint" });

    const told = (await notices(owner.id)).filter((n) => n.title.includes("شكوى"));
    expect(told).toHaveLength(1);
    expect(told[0].data).toMatchObject({ kind: "RESPONDER", conversationRef: "chat-1" });

    await customerSays(owner.hook, "شكوى ثانية", "chat-7"); // another conversation: another notice
    expect((await notices(owner.id)).filter((n) => n.title.includes("شكوى"))).toHaveLength(2);

    sentReplies.length = 0;
    const answered = await request(app).post(`/responder/inbox/${waiting[0].id}/send`).set(owner.auth).send({ reply: "نعتذر منك، رح نتواصل معك" });
    expect(answered.status).toBe(200);
    expect(sentReplies).toEqual([{ url: REPLY_URL, body: { conversationRef: "chat-1", text: "نعتذر منك، رح نتواصل معك" } }]);
    expect((await request(app).post(`/responder/inbox/${waiting[0].id}/send`).set(owner.auth).send({ reply: "again" })).status).toBe(409); // no longer waiting
    const stranger = await account("respstranger");
    expect((await request(app).post(`/responder/inbox/${waiting[1].id}/send`).set(stranger.auth).send({ reply: "hi" })).status).toBe(404);
  });

  it("settles a complaint from the shop's own knowledge when it can, and hands over to a person when it cannot", async () => {
    const owner = await running("respcomplaintai", "MERCHANT");
    const category = await prisma.category.upsert({ where: { slug: "resp-test-cat" }, update: {}, create: { name: "Responder Test", slug: "resp-test-cat" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: "متجر الشكاوى", categoryId: category.id, approvalStatus: "APPROVED", address: "شارع الاختبار", phone: "0999" } });
    await prisma.product.create({ data: { merchantId: shop.id, name: "قهوة", priceCents: 500, stock: 3 } });
    process.env.GROQ_API_KEY = "test-groq-key";

    // 1) the shop's information settles it: answered, marked sent, and the owner still hears about it
    aiAnswer = JSON.stringify({ reply: "نعتذر! محلنا بشارع الاختبار ودوامنا حتى 9", handoff: false });
    await customerSays(owner.hook, "عندي شكوى: وين محلكم؟", "c-1");
    expect(sentReplies.at(-1)!.body.text).toBe("نعتذر! محلنا بشارع الاختبار ودوامنا حتى 9");
    expect((await inbox(owner, "SENT")).body[0]).toMatchObject({ reason: "complaint", intent: "complaint", status: "SENT" });
    const call = aiCalls.filter((c) => c.system.startsWith("A customer sent a complaint")).at(-1)!;
    expect(call.system).toContain("Address: شارع الاختبار");
    expect(call.system).toContain("Never promise a refund");
    expect((await notices(owner.id)).some((n) => n.title.includes("تم الرد عليها"))).toBe(true);

    // 2) it cannot be settled: the AI says a person will follow up, and the message waits in the inbox
    aiAnswer = JSON.stringify({ reply: "نعتذر منك، رح يتواصل معك أحد من فريقنا قريبًا", handoff: true });
    await customerSays(owner.hook, "شكوى: طلبي ما وصل وبدي حقي", "c-2");
    expect(sentReplies.at(-1)!.body.text).toBe("نعتذر منك، رح يتواصل معك أحد من فريقنا قريبًا");
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ reason: "complaint", reply: "نعتذر منك، رح يتواصل معك أحد من فريقنا قريبًا" });
    expect((await notices(owner.id)).some((n) => n.title.includes("بانتظار ردّك"))).toBe(true);

    // 3) an answer that is not what was asked for (no JSON) is never sent as written: the holding message goes instead
    aiAnswer = "أكيد رح نعوضك بمبلغ كبير!";
    await customerSays(owner.hook, "شكوى كبيرة", "c-3");
    expect(sentReplies.at(-1)!.body.text).toContain("رح يتواصل معك قريبًا");
    expect(sentReplies.at(-1)!.body.text).not.toContain("نعوضك");
  });

  it("does nothing while the subscription is not running, and says a failed send needs a person", async () => {
    const owner = await running("respfail");
    await rule(owner, {});
    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { status: "EXPIRED", periodEnd: new Date(Date.now() - 1000) } });
    await customerSays(owner.hook, "السعر؟");
    expect(sentReplies).toHaveLength(0);
    expect((await inbox(owner, "SKIPPED")).body[0]).toMatchObject({ reason: "subscription_inactive" });

    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { status: "TRIAL", trialEndsAt: new Date(Date.now() + 86400000 * 3) } });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 })); // the other platform is down
    await customerSays(owner.hook, "السعر؟", "chat-5");
    expect((await inbox(owner, "FAILED")).body[0]).toMatchObject({ status: "FAILED" });
    expect((await notices(owner.id)).some((n) => n.title.includes("تعذّر إرسال"))).toBe(true);
  });
});

describe("When no rule matches: the fallback", () => {
  it("sends a fixed text, or lets the AI answer from the shop's real products and the conversation so far", async () => {
    const owner = await running("respfallback", "MERCHANT");
    const category = await prisma.category.upsert({ where: { slug: "resp-test-cat" }, update: {}, create: { name: "Responder Test", slug: "resp-test-cat" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: "متجر الاختبار", categoryId: category.id, approvalStatus: "APPROVED", address: "شارع الاختبار" } });
    await prisma.product.create({ data: { merchantId: shop.id, name: "شوكولا فاخرة", priceCents: 1250, stock: 5 } });

    // a fixed fallback needs its text
    expect((await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "TEMPLATE" })).status).toBe(400);
    expect((await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "TEMPLATE", fallbackReply: "أهلًا {name}، رح نرد عليك قريبًا" })).status).toBe(200);
    await customerSays(owner.hook, "مرحبا", "chat-fb");
    expect(sentReplies.at(-1)!.body.text).toBe("أهلًا سامر، رح نرد عليك قريبًا");

    // AI fallback: facts come from the shop, not from the model's imagination
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = "الشوكولا الفاخرة بـ 12.50";
    await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "AI", businessDescription: "محل شوكولا" });
    await customerSays(owner.hook, "بكم الشوكولا؟", "chat-ai");
    expect(sentReplies.at(-1)!.body.text).toBe("الشوكولا الفاخرة بـ 12.50");
    const first = aiCalls.filter((c) => !c.system.startsWith("Classify")).at(-1)!;
    expect(first.system).toContain("Product: شوكولا فاخرة — 12.50 — in stock");
    expect(first.system).toContain("Address: شارع الاختبار");
    expect(first.system).toContain("About the business: محل شوكولا");
    expect(first.user).toBe("بكم الشوكولا؟"); // nothing earlier in this conversation

    aiAnswer = "نعم، موجودة";
    await customerSays(owner.hook, "وهل هي متوفرة؟", "chat-ai");
    const second = aiCalls.filter((c) => !c.system.startsWith("Classify")).at(-1)!;
    expect(second.user).toContain("Customer: بكم الشوكولا؟");
    expect(second.user).toContain("You: الشوكولا الفاخرة بـ 12.50");
    expect(second.user).toContain("وهل هي متوفرة؟");
  });

  it("with the AI down, a rule in AI mode falls back to its template, and without one waits for a person", async () => {
    const owner = await running("respaidown");
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = null; // the provider answers 500
    await rule(owner, { name: "ai", keywords: ["دوام"], mode: "AI", replyTemplate: "دوامنا من 9 لـ 5" });
    await customerSays(owner.hook, "شو الدوام؟");
    expect(sentReplies.at(-1)!.body.text).toBe("دوامنا من 9 لـ 5");

    await rule(owner, { name: "ai2", keywords: ["توصيل"], mode: "AI", replyTemplate: "" });
    await customerSays(owner.hook, "في توصيل؟", "chat-3");
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ reason: "ai_unavailable" });
  });

  it("counts only the replies the AI writes against the monthly limit (the quick classification is free)", async () => {
    const owner = await running("respquota");
    const before = await getSettings();
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = "رد من الذكاء";
    try {
      await saveSettings({ responder: { ...before.responder, monthlyAiReplyLimit: 1 } });
      await rule(owner, { keywords: ["سؤال"], mode: "AI", replyTemplate: "رد ثابت" });
      await customerSays(owner.hook, "عندي سؤال", "q1");
      expect(sentReplies.at(-1)!.body.text).toBe("رد من الذكاء");
      expect((await prisma.responderSubscription.findUniqueOrThrow({ where: { userId: owner.id } })).aiRepliesUsed).toBe(1); // one reply, though two AI calls ran
      expect(aiCalls.some((c) => c.system.startsWith("Classify"))).toBe(true);

      await customerSays(owner.hook, "عندي سؤال ثاني", "q2");
      expect(sentReplies.at(-1)!.body.text).toBe("رد ثابت"); // the limit is reached: the template answers
    } finally {
      await saveSettings({ responder: before.responder });
    }
  });
});

describe("Warnings, stats and the owner's settings", () => {
  it("warns once per ending when the trial or the paid period is about to end", async () => {
    const owner = await account("respending");
    await activate(owner);
    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { trialEndsAt: new Date(Date.now() + 36 * 3600 * 1000) } });
    await request(app).get("/responder/status").set(owner.auth);
    await request(app).get("/responder/status").set(owner.auth);
    const soon = (await notices(owner.id)).filter((n) => n.title.includes("تنتهي قريبًا"));
    expect(soon).toHaveLength(1);
    expect(soon[0].data).toMatchObject({ kind: "RESPONDER", reason: "ending" });

    // a later ending is a new warning
    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { trialEndsAt: new Date(Date.now() + 40 * 3600 * 1000) } });
    await request(app).get("/responder/status").set(owner.auth);
    expect((await notices(owner.id)).filter((n) => n.title.includes("تنتهي قريبًا"))).toHaveLength(2);
  });

  it("summarises the last 30 days and keeps the owner's data private", async () => {
    const owner = await running("respstats");
    await rule(owner, {});
    await customerSays(owner.hook, "السعر؟", "a");
    await customerSays(owner.hook, "شكوى", "b");
    await customerSays(owner.hook, "مرحبا", "c");
    expect((await request(app).get("/responder/stats").set(owner.auth)).body).toEqual({ days: 30, sent: 1, needsReview: 1, failed: 0, skipped: 1 });

    const other = await account("respother");
    expect((await request(app).get("/responder/stats").set(other.auth)).body).toMatchObject({ sent: 0, needsReview: 0 });
    expect((await inbox(other)).body).toHaveLength(0);
    expect((await request(app).get("/responder/rules").set(other.auth)).body).toHaveLength(0);
    expect((await request(app).get("/responder/stats")).status).toBe(401);
  });

  it("validates rules: needs keywords and a fixed text, and only its owner can change or delete one", async () => {
    const owner = await account("respvalid");
    expect((await rule(owner, { keywords: [] })).status).toBe(400);
    expect((await rule(owner, { replyTemplate: "  " })).status).toBe(400);
    expect((await rule(owner, { mode: "AI", replyTemplate: "" })).status).toBe(201);
    const id = (await rule(owner, {})).body.id;
    expect((await request(app).delete(`/responder/rules/${id}`).set(owner.auth)).status).toBe(200);
    const stranger = await account("respvalid2");
    expect((await request(app).patch(`/responder/rules/${crypto.randomUUID()}`).set(stranger.auth).send({ name: "x" })).status).toBe(404);
  });
});

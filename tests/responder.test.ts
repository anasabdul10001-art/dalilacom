import crypto from "crypto";
import fs from "fs";
import path from "path";
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
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: content ? 200 : 500 });
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
async function account(prefix: string, role: "CUSTOMER" | "MERCHANT" | "ADMIN" = "CUSTOMER") {
  const email = uniqueEmail(prefix);
  await request(app).post("/auth/register").send({ email, password, fullName: `Responder ${prefix}` });
  const user = await prisma.user.update({ where: { email }, data: { role } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
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
async function responderPlan(name: string, options: { trialDays?: number; includesAi?: boolean; aiReplyLimit?: number } = {}) {
  return prisma.servicePlan.create({ data: {
    service: "RESPONDER_BASIC", name, durationDays: 30, trialDays: options.trialDays ?? 0,
    priceCents: 0, currency: "USD", priceCredits: 0, includesAi: options.includesAi ?? false,
    aiReplyLimit: options.aiReplyLimit ?? 0, removesBadge: false, isActive: true,
  } });
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

  it("lets an account configure a channel before choosing a plan, and validates the channel's credentials", async () => {
    const owner = await account("respconnect");
    const channel = await webhookChannel();
    const early = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: SECRET, replyUrl: REPLY_URL } });
    expect(early.status).toBe(201);
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

  it("normalizes Arabic spelling and picks the highest-priority matching rule", async () => {
    const owner = await running("resppriority");
    await rule(owner, { name: "الأقدم", keywords: ["السعر", "price", "Preis"], replyTemplate: "قديم", priority: 1 });
    const winning = await rule(owner, { name: "الأعلى", keywords: ["سعر"], replyTemplate: "الأفضل", priority: 10 });
    expect((await customerSays(owner.hook, "السَّعْرُ؟")).status).toBe(200);
    expect(sentReplies.at(-1)?.body.text).toBe("الأفضل");
    expect((await prisma.responderInteraction.findFirstOrThrow({ where: { userId: owner.id }, orderBy: { createdAt: "desc" } })).matchedRuleId).toBe(winning.body.id);
    await customerSays(owner.hook, "PREIS bitte", "de");
    expect(sentReplies.at(-1)?.body.text).toBe("قديم");
  });

  it("uses a matching fixed rule before the AI even when the account has an AI plan", async () => {
    const owner = await running("respfixedfirst");
    const plan = await responderPlan("خطة ذكاء للاختبار", { includesAi: true, aiReplyLimit: 10 });
    await prisma.responderEntitlement.create({ data: { userId: owner.id, planId: plan.id, status: "ACTIVE", source: "GRANT", periodEnd: new Date(Date.now() + 86400000) } });
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = JSON.stringify({ reply: "رد الذكاء", complaint: false, handoff: false });
    await rule(owner, { keywords: ["سعر"], mode: "FIXED", replyTemplate: "رد ثابت" });
    await customerSays(owner.hook, "السعر؟");
    expect(sentReplies.at(-1)?.body.text).toBe("رد ثابت");
    expect(aiCalls).toHaveLength(0);
  });

  it("routes an indirect AI-detected complaint to the review inbox from the same reply request", async () => {
    const owner = await running("respindirectcomplaint");
    const plan = await responderPlan("خطة اكتشاف الشكوى", { includesAi: true, aiReplyLimit: 10 });
    await prisma.responderEntitlement.create({ data: { userId: owner.id, planId: plan.id, status: "ACTIVE", source: "GRANT", periodEnd: new Date(Date.now() + 86400000) } });
    await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "AI" });
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = JSON.stringify({ reply: "نعتذر، وصلتنا ملاحظتك وسيتابع معك الفريق.", complaint: true, handoff: true });
    await customerSays(owner.hook, "الطلب وصلني بحالة سيئة", "indirect");
    expect(aiCalls).toHaveLength(1);
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ intent: "complaint", reason: "complaint", reply: expect.stringContaining("نعتذر") });
    expect((await notices(owner.id)).some((n) => n.title.includes("شكوى"))).toBe(true);
    expect(await prisma.responderAiCall.count({ where: { userId: owner.id } })).toBe(1);
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

  it("recognizes normalized complaints in Arabic, English, and German", async () => {
    const owner = await running("respcomplaintwords");
    await customerSays(owner.hook, "خِدْمَتُكم سيئة", "ar");
    await customerSays(owner.hook, "This is a terrible service", "en");
    await customerSays(owner.hook, "Beschwerde wegen Betrug", "de");
    expect(sentReplies).toHaveLength(3);
    expect((await inbox(owner, "NEEDS_REVIEW")).body).toHaveLength(3);
  });

  it("lets an AI plan answer a keyword-detected complaint with AI and preserves its handoff decision", async () => {
    const owner = await running("respcomplaintai", "MERCHANT");
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = JSON.stringify({ reply: "نعتذر منك. راجعت طلبك وسيتواصل معك الفريق.", complaint: true, handoff: true });
    await request(app).patch("/responder/profile").set(owner.auth).send({ businessDescription: "محلنا بشارع الاختبار ودوامنا حتى 9" });
    await customerSays(owner.hook, "عندي شكوى: وين محلكم؟", "c-1");
    expect(sentReplies.at(-1)!.body.text).toContain("راجعت طلبك");
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ reason: "complaint", intent: "complaint", status: "NEEDS_REVIEW" });
    expect(aiCalls).toHaveLength(1);
    expect((await notices(owner.id)).some((n) => n.title.includes("بانتظار ردّك"))).toBe(true);

    aiAnswer = JSON.stringify({ reply: "نعتذر منك، تم حل المشكلة.", complaint: true, handoff: false });
    await customerSays(owner.hook, "شكوى: طلبي ما وصل وبدي حقي", "c-2");
    expect(sentReplies.at(-1)!.body.text).toContain("تم حل المشكلة");
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ intent: "complaint", status: "NEEDS_REVIEW", reason: "complaint" });
    await customerSays(owner.hook, "شكوى كبيرة", "c-3");
    expect(aiCalls).toHaveLength(3);
  });

  it("uses only the fixed complaint holding message and review queue on a basic-only plan", async () => {
    const owner = await running("respcomplaintbasic", "MERCHANT");
    await prisma.responderEntitlement.updateMany({ where: { userId: owner.id }, data: { status: "EXPIRED" } });
    const plan = await responderPlan("خطة أساسية للشكاوى", { includesAi: false });
    await prisma.responderEntitlement.create({ data: { userId: owner.id, planId: plan.id, status: "ACTIVE", source: "GRANT", periodEnd: new Date(Date.now() + 86400000 * 3) } });
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = JSON.stringify({ reply: "هذا الرد لا يجب أن يظهر", handoff: false });
    await customerSays(owner.hook, "عندي شكوى: وين محلكم؟", "basic-c-1");
    expect(sentReplies.at(-1)!.body.text).toContain("وصلت رسالتك لفريقنا");
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ reason: "complaint", intent: "complaint", status: "NEEDS_REVIEW" });
    expect(aiCalls).toHaveLength(0);
  });

  it("does nothing without an active plan, then says a failed send needs a person", async () => {
    const owner = await running("respfail");
    const plan = await responderPlan("خطة استعادة الاختبار");
    await rule(owner, {});
    await prisma.responderSubscription.update({ where: { userId: owner.id }, data: { status: "EXPIRED", periodEnd: new Date(Date.now() - 1000) } });
    await customerSays(owner.hook, "السعر؟");
    expect(sentReplies).toHaveLength(0);
    expect((await inbox(owner, "SKIPPED")).body[0]).toMatchObject({ reason: "basic_plan_required" });

    await prisma.responderEntitlement.create({ data: { userId: owner.id, planId: plan.id, status: "ACTIVE", source: "GRANT", periodEnd: new Date(Date.now() + 86400000 * 3) } });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 })); // the other platform is down
    await customerSays(owner.hook, "سعر؟", "chat-5");
    expect((await inbox(owner, "FAILED")).body[0]).toMatchObject({ status: "FAILED" });
    expect((await notices(owner.id)).some((n) => n.title.includes("تعذّر إرسال"))).toBe(true);
  });
});

describe("When no rule matches: the fallback", () => {
  it("sends a fixed text, or lets the AI answer from what the owner wrote, never from the Dalilacom store, and the conversation so far", async () => {
    const owner = await running("respfallback", "MERCHANT");
    const category = await prisma.category.upsert({ where: { slug: "resp-test-cat" }, update: {}, create: { name: "Responder Test", slug: "resp-test-cat" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: "متجر الاختبار", categoryId: category.id, approvalStatus: "APPROVED", address: "شارع الاختبار" } });
    await prisma.product.create({ data: { merchantId: shop.id, name: "شوكولا فاخرة", priceCents: 1250, stock: 5 } });

    // a fixed fallback needs its text
    expect((await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "TEMPLATE" })).status).toBe(400);
    expect((await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "TEMPLATE", fallbackReply: "أهلًا {name}، رح نرد عليك قريبًا" })).status).toBe(200);
    await customerSays(owner.hook, "مرحبا", "chat-fb");
    expect(sentReplies.at(-1)!.body.text).toBe("أهلًا سامر، رح نرد عليك قريبًا");

    // AI fallback: facts come from the owner's description (and the connected page), never from the Dalilacom store
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = JSON.stringify({ reply: "الشوكولا الفاخرة بـ 12.50", complaint: false, handoff: false });
    await request(app).patch("/responder/profile").set(owner.auth).send({ fallbackMode: "AI", businessDescription: "محل شوكولا" });
    await customerSays(owner.hook, "بكم الشوكولا؟", "chat-ai");
    expect(sentReplies.at(-1)!.body.text).toBe("الشوكولا الفاخرة بـ 12.50");
    const first = aiCalls.filter((c) => !c.system.startsWith("Classify")).at(-1)!;
    expect(first.system).not.toContain("شوكولا فاخرة"); // the responder is separate from the Dalilacom store
    expect(first.system).not.toContain("شارع الاختبار");
    expect(first.system).toContain("About the business: محل شوكولا");
    expect(JSON.parse(first.user).message).toBe("بكم الشوكولا؟"); // nothing earlier in this conversation

    aiAnswer = JSON.stringify({ reply: "نعم، موجودة", complaint: false, handoff: false });
    await customerSays(owner.hook, "وهل هي متوفرة؟", "chat-ai");
    const second = aiCalls.filter((c) => !c.system.startsWith("Classify")).at(-1)!;
    expect(JSON.stringify(JSON.parse(second.user).conversation)).toContain("Customer: بكم الشوكولا؟");
    expect(JSON.stringify(JSON.parse(second.user).conversation)).toContain("You: الشوكولا الفاخرة بـ 12.50");
    expect(JSON.parse(second.user).message).toContain("وهل هي متوفرة؟");
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

  it("counts only the replies the AI writes against the monthly limit and skips separate intent classification", async () => {
    const owner = await running("respquota");
    const before = await getSettings();
    process.env.GROQ_API_KEY = "test-groq-key";
    aiAnswer = JSON.stringify({ reply: "رد من الذكاء", complaint: false, handoff: false });
    try {
      await saveSettings({ responder: { ...before.responder, monthlyAiReplyLimit: 1 }, aiModelPrices: [{ provider: "groq", model: "llama-3.3-70b-versatile", inputUsdPerMillion: 1, outputUsdPerMillion: 2 }] });
      await prisma.servicePlan.update({ where: { id: "00000000-0000-4000-8000-000000000001" }, data: { aiReplyLimit: 1 } });
      await rule(owner, { keywords: ["سؤال"], mode: "AI", replyTemplate: "رد ثابت" });
      await customerSays(owner.hook, "عندي سؤال", "q1");
      expect(sentReplies.at(-1)!.body.text).toBe("رد من الذكاء");
      expect((await prisma.responderSubscription.findUniqueOrThrow({ where: { userId: owner.id } })).aiRepliesUsed).toBe(1);
      expect(await prisma.responderAiCall.count({ where: { userId: owner.id } })).toBe(1);
      expect(aiCalls).toHaveLength(1); // one request writes the answer and checks for a complaint
      const logged = await prisma.responderAiCall.findFirstOrThrow({ where: { userId: owner.id } });
      expect(logged).toMatchObject({ provider: "groq", model: "llama-3.3-70b-versatile", promptTokens: 10, completionTokens: 5 });
      expect(logged.estimatedCostUsd?.toString()).toBe("0.00002");
      expect((await notices(owner.id)).filter((n) => n.data?.reason === "ai_quota_80")).toHaveLength(1);
      expect((await notices(owner.id)).filter((n) => n.data?.reason === "ai_quota_100")).toHaveLength(1);
      const admin = await account("respaicostadmin", "ADMIN");
      const usageReport = await request(app).get("/admin/responder-ai-usage").set(admin.auth);
      expect(usageReport.status).toBe(200);
      expect(usageReport.body.accounts).toContainEqual(expect.objectContaining({ user: expect.objectContaining({ email: owner.email }), calls: 1, promptTokens: 10, completionTokens: 5, estimatedCostUsd: "0.00002" }));

      await customerSays(owner.hook, "عندي سؤال ثاني", "q2");
      expect(sentReplies.at(-1)!.body.text).toBe("رد ثابت"); // the limit is reached: the template answers
      expect((await notices(owner.id)).filter((n) => n.data?.reason === "ai_quota_100")).toHaveLength(1);
    } finally {
      await saveSettings({ responder: before.responder, aiModelPrices: before.aiModelPrices });
      await prisma.servicePlan.update({ where: { id: "00000000-0000-4000-8000-000000000001" }, data: { aiReplyLimit: before.responder.monthlyAiReplyLimit } });
    }
  });
});

describe("Plan access, permanent fixed replies and admin grants", () => {
  it("requires an active plan, sends fixed replies without AI on a no-AI plan, and respects the owner's switch", async () => {
    const owner = await account("respbasic");
    const channel = await webhookChannel();
    const connected = await request(app).post("/responder/connections").set(owner.auth).send({ channelId: channel.id, credentials: { secret: SECRET, replyUrl: REPLY_URL } });
    expect(connected.status).toBe(201);
    const conn = await prisma.channelConnection.findUniqueOrThrow({ where: { id: connected.body.id } });
    const hook = `/hooks/${conn.hookToken}`;
    await rule(owner, { keywords: ["سعر"], mode: "FIXED", replyTemplate: "السعر 20" });

    await customerSays(hook, "السعر؟", "no-plan-1");
    await customerSays(hook, "السعر؟", "no-plan-2");
    expect((await inbox(owner, "SKIPPED")).body[0]).toMatchObject({ reason: "basic_plan_required" });
    expect((await notices(owner.id)).filter((notice) => notice.data?.reason === "basic_plan_required")).toHaveLength(1);
    expect(sentReplies).toHaveLength(0);

    const plan = await responderPlan("ردود ثابتة", { trialDays: 0 });
    const periodEnd = new Date(Date.now() + 30 * 86400000);
    await prisma.responderEntitlement.create({ data: { userId: owner.id, planId: plan.id, status: "ACTIVE", source: "PAID", periodEnd } });
    await customerSays(hook, "السعر؟", "fixed-1");
    expect(sentReplies.at(-1)!.body.text).toBe("السعر 20");
    expect(aiCalls).toHaveLength(0);

    await rule(owner, { keywords: ["توصيل"], mode: "AI", replyTemplate: "التوصيل متاح" });
    await customerSays(hook, "في توصيل؟", "ai-rule-basic");
    expect(sentReplies.at(-1)!.body.text).toBe("التوصيل متاح");
    await rule(owner, { keywords: ["تغطية"], mode: "AI", replyTemplate: "" });
    await customerSays(hook, "في تغطية؟", "ai-rule-no-template");
    expect((await inbox(owner, "NEEDS_REVIEW")).body[0]).toMatchObject({ reason: "ai_requires_plan" });

    await request(app).patch("/responder/profile").set(owner.auth).send({ enabled: false });
    await customerSays(hook, "السعر؟", "disabled-1");
    expect((await inbox(owner, "SKIPPED")).body[0]).toMatchObject({ reason: "responder_disabled" });
    expect(sentReplies).toHaveLength(2);
    expect(aiCalls).toHaveLength(0);
  });

  it("allows one trial per account and plan, including after that trial expires", async () => {
    const plan = await responderPlan("تجربة حسب الخطة", { trialDays: 7 });
    const owner = await account("resptrialplan");
    const started = await request(app).post(`/responder/plans/${plan.id}/trial`).set(owner.auth);
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ status: "TRIAL", source: "TRIAL" });
    expect((await request(app).post(`/responder/plans/${plan.id}/trial`).set(owner.auth)).status).toBe(409);

    await prisma.responderEntitlement.update({ where: { userId_planId: { userId: owner.id, planId: plan.id } }, data: { status: "EXPIRED", trialEndsAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post(`/responder/plans/${plan.id}/trial`).set(owner.auth)).status).toBe(409);
    const other = await account("resptrialplanother");
    expect((await request(app).post(`/responder/plans/${plan.id}/trial`).set(other.auth)).status).toBe(201);
  });

  it("charges the unified catalogue price and applies an active paid-period offer", async () => {
    const plan = await prisma.servicePlan.create({ data: {
      service: "RESPONDER_BASIC", name: "خطة شراء الاختبار", durationDays: 30, trialDays: 0,
      priceCents: 500, currency: "USD", priceCredits: 250, includesAi: true, aiReplyLimit: 10, isActive: true,
    } });
    const offer = await prisma.planOffer.create({ data: { planId: plan.id, paidPeriods: 2, bonusDays: 5, text: "ادفع فترتين وخذ خمسة أيام" } });
    const owner = await account("respcatalogpurchase");
    await credit(owner.id, 500);
    const before = Date.now();
    const purchased = await request(app).post(`/responder/plans/${plan.id}/purchase`).set(owner.auth).send({ offerId: offer.id });
    expect(purchased.status).toBe(201);
    expect(purchased.body).toMatchObject({ kind: "PAID", charged: 500, paidPeriods: 2, bonusDays: 5 });
    expect(new Date(purchased.body.entitlement.periodEnd).getTime()).toBeGreaterThanOrEqual(before + 65 * 86400000);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: owner.id } })).balance).toBe(0);
  });

  it("lets only an admin grant or extend access without charging the account", async () => {
    const admin = await account("respsuperadmin", "ADMIN");
    const owner = await account("respgrantuser");
    const plan = await responderPlan("منحة اختبار");
    expect((await request(app).post("/admin/responder/grant").set(owner.auth).send({ userEmail: admin.email, planId: plan.id, days: 10 })).status).toBe(403);

    const walletBefore = await prisma.wallet.findUnique({ where: { userId: owner.id } });
    const grant = () => request(app).post("/admin/responder/grant").set(admin.auth).send({ userEmail: owner.email, planId: plan.id, days: 10 });
    const first = await grant();
    expect(first.status).toBe(201);
    expect(first.body.entitlement).toMatchObject({ status: "ACTIVE", source: "GRANT" });
    const firstEnd = new Date(first.body.entitlement.periodEnd).getTime();
    const second = await grant();
    expect(second.status).toBe(201);
    expect(new Date(second.body.entitlement.periodEnd).getTime()).toBe(firstEnd + 10 * 86400000);
    expect(await prisma.wallet.findUnique({ where: { userId: owner.id } })).toEqual(walletBefore);
  });

  it("backfills old active subscriptions to the internal plan idempotently and leaves OFF accounts without a plan", async () => {
    const active = await account("respmigrationactive");
    const off = await account("respmigrationoff");
    const endsAt = new Date(Date.now() + 5 * 86400000);
    await prisma.responderSubscription.create({ data: { userId: active.id, status: "TRIAL", trialEndsAt: endsAt } });
    await prisma.responderSubscription.create({ data: { userId: off.id, status: "OFF" } });
    const migration = fs.readFileSync(path.resolve(process.cwd(), "prisma/migrations/20261112130000_responder_entitlements_backfill/migration.sql"), "utf8");
    const backfill = migration.slice(migration.indexOf('INSERT INTO "ResponderEntitlement"'));
    await prisma.$executeRawUnsafe(backfill);
    await prisma.$executeRawUnsafe(backfill);

    const migrated = await prisma.responderEntitlement.findUniqueOrThrow({ where: { userId_planId: { userId: active.id, planId: "00000000-0000-4000-8000-000000000001" } } });
    expect(migrated).toMatchObject({ status: "TRIAL", source: "TRIAL", trialEndsAt: endsAt });
    expect(await prisma.responderEntitlement.count({ where: { userId: off.id } })).toBe(0);
    const legacyPlan = await prisma.servicePlan.findUniqueOrThrow({ where: { id: "00000000-0000-4000-8000-000000000001" } });
    expect(legacyPlan).toMatchObject({ service: "RESPONDER_BASIC", isActive: false });
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
    expect((await request(app).get("/responder/stats").set(owner.auth)).body).toMatchObject({ days: 30, sent: 1, needsReview: 1, failed: 0, skipped: 1, unmatchedCount: 1, topRules: [{ name: "rule", count: 1 }], unmatchedSamples: [{ message: "مرحبا" }] });

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

import { resolveLanguage } from "../lib/languages";
import { translateText } from "../i18n";
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { decryptJson, encryptJson } from "../services/crypto.service";
import { drivers } from "../services/channels";
import { getSettings } from "../services/settings.service";
import { InsufficientBalanceError } from "../services/wallet.service";
import { activate, AlreadyRunningError, getSubscription, isRunning, maybeNotifyEnding, pay, sendThroughConnection } from "../services/responder.service";
import { metaOAuthRouter } from "./metaOAuth.routes";

export const responderRouter = Router();

// "Log in with Facebook" so a merchant never has to paste a Page token (section 7/23).
responderRouter.use("/meta", metaOAuthRouter);

// What a user must supply to connect each kind of channel (the UI renders these as form fields).
const CREDENTIAL_FIELDS = {
  TELEGRAM: [{ key: "botToken", label: "Bot Token (من @BotFather)", secret: true }],
  GENERIC_WEBHOOK: [
    { key: "secret", label: "سر مشترك (8 أحرف+)", secret: true },
    { key: "replyUrl", label: "رابط استقبال الردود (https)", secret: false },
    { key: "authHeader", label: "Authorization header للرد (اختياري)", secret: true },
  ],
  FACEBOOK: [
    { key: 'pageId', label: 'رقم صفحة فيسبوك (Page ID)', secret: false },
    { key: 'pageAccessToken', label: 'Page Access Token', secret: true },
  ],
  INSTAGRAM: [
    { key: 'instagramAccountId', label: 'رقم حساب إنستغرام Business', secret: false },
    { key: 'pageId', label: 'رقم صفحة فيسبوك المربوطة (Page ID)', secret: false },
    { key: 'pageAccessToken', label: 'Page Access Token', secret: true },
  ],
  META_PENDING: [],
} as const;

function insufficient(res: any, err: InsufficientBalanceError) {
  return sendError(res, 402, "PAYMENT_REQUIRED", "رصيدك ما بيكفي — اشحن محفظتك أول", { balance: err.balance, needed: err.needed });
}

responderRouter.get("/status", requireAuth, async (req, res) => {
  const [sub, settings, wallet] = await Promise.all([
    getSubscription(req.user!.id),
    getSettings(),
    prisma.wallet.findUnique({ where: { userId: req.user!.id } }),
  ]);
  // Looking at the service is a natural moment to warn that it is about to end (once per ending).
  await maybeNotifyEnding(sub).catch(() => null);
  const price = req.user!.role === "MERCHANT" ? settings.responder.priceMerchant : settings.responder.priceCustomer;
  res.json({
    status: sub.status,
    running: isRunning(sub.status),
    trialAvailable: !sub.trialUsed && settings.responder.trialDays > 0,
    trialDays: settings.responder.trialDays,
    trialEndsAt: sub.trialEndsAt,
    periodEnd: sub.periodEnd,
    periodDays: settings.responder.periodDays,
    price,
    creditName: settings.creditName,
    balance: wallet?.balance ?? 0,
    aiRepliesUsed: sub.aiRepliesUsed,
    aiReplyLimit: settings.responder.monthlyAiReplyLimit,
    businessDescription: sub.businessDescription,
    tone: sub.tone,
    fallbackMode: sub.fallbackMode,
    fallbackReply: sub.fallbackReply,
  });
});

responderRouter.post("/activate", requireAuth, async (req, res) => {
  try {
    const result = await activate(req.user!.id, req.user!.role);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AlreadyRunningError) return sendError(res, 409, "CONFLICT", "الخدمة شغّالة أصلًا");
    if (err instanceof InsufficientBalanceError) return insufficient(res, err);
    throw err;
  }
});

responderRouter.post("/renew", requireAuth, async (req, res) => {
  try {
    res.json(await pay(req.user!.id, req.user!.role));
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return insufficient(res, err);
    throw err;
  }
});

const profileSchema = z.object({
  businessDescription: z.string().max(1000).optional(),
  tone: z.string().max(200).optional(),
  fallbackMode: z.enum(["OFF", "AI", "TEMPLATE"]).optional(),
  fallbackReply: z.string().max(1000).optional(),
});

responderRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await getSubscription(req.user!.id);
  const merged = { ...parsed.data };
  const current = await prisma.responderSubscription.findUniqueOrThrow({ where: { userId: req.user!.id } });
  const mode = merged.fallbackMode ?? current.fallbackMode;
  const reply = merged.fallbackReply ?? current.fallbackReply;
  if (mode === "TEMPLATE" && !reply?.trim()) return sendError(res, 400, "BAD_REQUEST", "اكتب نص الرد الاحتياطي");
  const sub = await prisma.responderSubscription.update({ where: { userId: req.user!.id }, data: merged });
  res.json({ businessDescription: sub.businessDescription, tone: sub.tone, fallbackMode: sub.fallbackMode, fallbackReply: sub.fallbackReply });
});

// The last 30 days at a glance: what was answered, what waits for a person, what failed.
responderRouter.get("/stats", requireAuth, async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const groups = await prisma.responderInteraction.groupBy({ by: ["status"], where: { userId: req.user!.id, createdAt: { gte: since } }, _count: { _all: true } });
  const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  res.json({ days: 30, sent: count("SENT"), needsReview: count("NEEDS_REVIEW"), failed: count("FAILED"), skipped: count("SKIPPED") });
});

/* ---------------- channels & connections ---------------- */

responderRouter.get("/channels", requireAuth, async (req, res) => {
  const lang = resolveLanguage(req);
  const channels = await prisma.socialChannel.findMany({ where: { isEnabled: true }, orderBy: { createdAt: "asc" } });
  res.json(
    channels.map((c) => ({
      id: c.id,
      key: c.key,
      name: translateText(c.name, lang),
      connectable: c.driver !== "META_PENDING",
      driver: c.driver,
      fields: CREDENTIAL_FIELDS[c.driver].map((f) => ({ ...f, label: translateText(f.label, lang) })),
    })),
  );
});

responderRouter.get("/connections", requireAuth, async (req, res) => {
  const list = await prisma.channelConnection.findMany({
    where: { userId: req.user!.id },
    include: { channel: { select: { name: true, driver: true } } },
    orderBy: { createdAt: "desc" },
  });
  const base = process.env.PUBLIC_BASE_URL ?? "";
  res.json(
    list.map((c) => ({
      id: c.id,
      channel: c.channel.name,
      externalAccountId: c.externalAccountId,
      isActive: c.isActive,
      driver: c.channel.driver,
      supportsPosts: c.channel.driver === "FACEBOOK" || c.channel.driver === "INSTAGRAM",
      // Only generic-webhook users need the URL (they paste it into the other platform); Telegram sets it itself.
      hookUrl: c.channel.driver === "GENERIC_WEBHOOK" ? `${base}/hooks/${c.hookToken}` : null,
    })),
  );
});

const connectSchema = z.object({ channelId: z.string().uuid(), credentials: z.record(z.string()) });

responderRouter.post("/connections", requireAuth, async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const sub = await getSubscription(req.user!.id);
  if (!isRunning(sub.status)) return sendError(res, 403, "FORBIDDEN", "فعّل المجيب الآلي أول (تجربة أو اشتراك)");

  const channel = await prisma.socialChannel.findUnique({ where: { id: parsed.data.channelId } });
  if (!channel || !channel.isEnabled) return sendError(res, 404, "NOT_FOUND", "القناة غير متاحة");

  const driver = drivers[channel.driver];
  const invalid = driver.validateCredentials(parsed.data.credentials);
  if (invalid) return sendError(res, 400, "BAD_REQUEST", invalid);

  const hookToken = crypto.randomBytes(24).toString("hex");
  const ctx = { credentials: parsed.data.credentials, hookToken, channelConfig: channel.config as Record<string, any> };
  let externalAccountId: string | undefined;
  try {
    externalAccountId = (await driver.register?.(ctx))?.externalAccountId;
  } catch (err) {
    return sendError(res, 400, "CHANNEL_CONNECT_FAILED", err instanceof Error ? err.message : "تعذّر ربط القناة");
  }

  const isMeta = channel.driver === "FACEBOOK" || channel.driver === "INSTAGRAM";
  if (isMeta && externalAccountId) {
    // One Meta page/account can feed only one connection, otherwise a comment would be answered twice.
    const taken = await prisma.channelConnection.findFirst({ where: { externalAccountId, channel: { driver: channel.driver } } });
    if (taken) return sendError(res, 409, "CONFLICT", "هالحساب مربوط من قبل");
  }

  const connection = await prisma.channelConnection.create({
    data: {
      userId: req.user!.id,
      channelId: channel.id,
      credentialsEnc: encryptJson(parsed.data.credentials),
      externalAccountId,
      hookToken,
    },
  });
  res.status(201).json({ id: connection.id, externalAccountId: connection.externalAccountId });
});

responderRouter.patch("/connections/:id", requireAuth, async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.channelConnection.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Connection not found");
  const updated = await prisma.channelConnection.update({ where: { id: existing.id }, data: { isActive: parsed.data.isActive } });
  res.json({ id: updated.id, isActive: updated.isActive });
});

// Recent posts of a connected Facebook/Instagram account, so a rule can be limited to specific ones.
responderRouter.get("/connections/:id/posts", requireAuth, async (req, res) => {
  const connection = await prisma.channelConnection.findUnique({ where: { id: req.params.id }, include: { channel: true } });
  if (!connection || connection.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Connection not found");
  const driver = drivers[connection.channel.driver];
  if (!driver.listPosts) return sendError(res, 400, "BAD_REQUEST", "هالقناة ما فيها منشورات");
  try {
    res.json(
      await driver.listPosts({
        credentials: decryptJson(connection.credentialsEnc),
        hookToken: connection.hookToken,
        channelConfig: connection.channel.config as Record<string, any>,
      }),
    );
  } catch (err) {
    return sendError(res, 502, "BAD_GATEWAY", err instanceof Error ? err.message : "تعذّر جلب المنشورات");
  }
});

/* ---------------- rules ---------------- */

const ruleSchema = z.object({
  name: z.string().min(1).max(80),
  keywords: z.array(z.string().trim().min(1)).min(1).max(30),
  mode: z.enum(["FIXED", "AI"]).default("FIXED"),
  replyTemplate: z.string().max(1000).default(""),
  aiInstructions: z.string().max(1000).default(""),
  channelId: z.string().uuid().nullable().optional(),
  postIds: z.array(z.string().min(1).max(100)).max(30).default([]),
  isActive: z.boolean().default(true),
});

responderRouter.get("/rules", requireAuth, async (req, res) => {
  res.json(await prisma.responderRule.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } }));
});

responderRouter.post("/rules", requireAuth, async (req, res) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (parsed.data.mode === "FIXED" && !parsed.data.replyTemplate.trim()) {
    return sendError(res, 400, "BAD_REQUEST", "اكتب نص الرد الثابت");
  }
  if ((await prisma.responderRule.count({ where: { userId: req.user!.id } })) >= 50) {
    return sendError(res, 409, "CONFLICT", "وصلت الحد الأقصى (50 قاعدة)");
  }
  const rule = await prisma.responderRule.create({ data: { ...parsed.data, userId: req.user!.id } });
  res.status(201).json(rule);
});

responderRouter.patch("/rules/:id", requireAuth, async (req, res) => {
  const parsed = ruleSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.responderRule.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Rule not found");
  res.json(await prisma.responderRule.update({ where: { id: existing.id }, data: parsed.data }));
});

responderRouter.delete("/rules/:id", requireAuth, async (req, res) => {
  const existing = await prisma.responderRule.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Rule not found");
  await prisma.responderRule.delete({ where: { id: existing.id } });
  res.json({ id: existing.id });
});

/* ---------------- inbox ---------------- */

responderRouter.get("/inbox", requireAuth, async (req, res) => {
  const status = z.enum(["SENT", "NEEDS_REVIEW", "FAILED", "SKIPPED"]).optional().safeParse(req.query.status);
  const list = await prisma.responderInteraction.findMany({
    where: { userId: req.user!.id, ...(status.success && status.data ? { status: status.data } : {}) },
    include: { connection: { select: { channel: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(list.map((i) => ({ ...i, channel: i.connection.channel.name, connection: undefined })));
});

// A person answers a message the responder held back (complaints, failed sends, AI unavailable).
responderRouter.post("/inbox/:id/send", requireAuth, async (req, res) => {
  const parsed = z.object({ reply: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const item = await prisma.responderInteraction.findUnique({
    where: { id: req.params.id },
    include: { connection: { include: { channel: true } } },
  });
  if (!item || item.userId !== req.user!.id) return sendError(res, 404, "NOT_FOUND", "Message not found");
  if (item.status !== "NEEDS_REVIEW" && item.status !== "FAILED") {
    return sendError(res, 409, "CONFLICT", "هالرسالة مو بانتظار رد");
  }
  const sub = await getSubscription(req.user!.id);
  if (!isRunning(sub.status)) return sendError(res, 403, "FORBIDDEN", "الاشتراك منتهي — جدّده أول");

  try {
    await sendThroughConnection(item.connection, parsed.data.reply, item.conversationRef);
  } catch (err) {
    return sendError(res, 502, "SEND_FAILED", err instanceof Error ? err.message : "تعذّر الإرسال");
  }
  const updated = await prisma.responderInteraction.update({
    where: { id: item.id },
    data: { status: "SENT", reply: parsed.data.reply, reason: null },
  });
  res.json(updated);
});

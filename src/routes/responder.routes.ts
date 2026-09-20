import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { encryptJson } from "../services/crypto.service";
import { drivers } from "../services/channels";
import { getSettings } from "../services/settings.service";
import { InsufficientBalanceError } from "../services/wallet.service";
import { activate, AlreadyRunningError, getSubscription, isRunning, pay, sendThroughConnection } from "../services/responder.service";

export const responderRouter = Router();

// What a user must supply to connect each kind of channel (the UI renders these as form fields).
const CREDENTIAL_FIELDS = {
  TELEGRAM: [{ key: "botToken", label: "Bot Token (من @BotFather)", secret: true }],
  GENERIC_WEBHOOK: [
    { key: "secret", label: "سر مشترك (8 أحرف+)", secret: true },
    { key: "replyUrl", label: "رابط استقبال الردود (https)", secret: false },
    { key: "authHeader", label: "Authorization header للرد (اختياري)", secret: true },
  ],
  META_PENDING: [],
} as const;

function insufficient(res: any, err: InsufficientBalanceError) {
  return res.status(402).json({ error: "رصيدك ما بيكفي — اشحن محفظتك أول", balance: err.balance, needed: err.needed });
}

responderRouter.get("/status", requireAuth, async (req, res) => {
  const [sub, settings, wallet] = await Promise.all([
    getSubscription(req.user!.id),
    getSettings(),
    prisma.wallet.findUnique({ where: { userId: req.user!.id } }),
  ]);
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
  });
});

responderRouter.post("/activate", requireAuth, async (req, res) => {
  try {
    const result = await activate(req.user!.id, req.user!.role);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AlreadyRunningError) return res.status(409).json({ error: "الخدمة شغّالة أصلًا" });
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
});

responderRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await getSubscription(req.user!.id);
  const sub = await prisma.responderSubscription.update({ where: { userId: req.user!.id }, data: parsed.data });
  res.json({ businessDescription: sub.businessDescription, tone: sub.tone });
});

/* ---------------- channels & connections ---------------- */

responderRouter.get("/channels", requireAuth, async (_req, res) => {
  const channels = await prisma.socialChannel.findMany({ where: { isEnabled: true }, orderBy: { createdAt: "asc" } });
  res.json(
    channels.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      connectable: c.driver !== "META_PENDING",
      fields: CREDENTIAL_FIELDS[c.driver],
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
      // Only generic-webhook users need the URL (they paste it into the other platform); Telegram sets it itself.
      hookUrl: c.channel.driver === "GENERIC_WEBHOOK" ? `${base}/hooks/${c.hookToken}` : null,
    })),
  );
});

const connectSchema = z.object({ channelId: z.string().uuid(), credentials: z.record(z.string()) });

responderRouter.post("/connections", requireAuth, async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const sub = await getSubscription(req.user!.id);
  if (!isRunning(sub.status)) return res.status(403).json({ error: "فعّل المجيب الآلي أول (تجربة أو اشتراك)" });

  const channel = await prisma.socialChannel.findUnique({ where: { id: parsed.data.channelId } });
  if (!channel || !channel.isEnabled) return res.status(404).json({ error: "القناة غير متاحة" });

  const driver = drivers[channel.driver];
  const invalid = driver.validateCredentials(parsed.data.credentials);
  if (invalid) return res.status(400).json({ error: invalid });

  const hookToken = crypto.randomBytes(24).toString("hex");
  const ctx = { credentials: parsed.data.credentials, hookToken, channelConfig: channel.config as Record<string, any> };
  let externalAccountId: string | undefined;
  try {
    externalAccountId = (await driver.register?.(ctx))?.externalAccountId;
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "تعذّر ربط القناة" });
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
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.channelConnection.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return res.status(404).json({ error: "Connection not found" });
  const updated = await prisma.channelConnection.update({ where: { id: existing.id }, data: { isActive: parsed.data.isActive } });
  res.json({ id: updated.id, isActive: updated.isActive });
});

/* ---------------- rules ---------------- */

const ruleSchema = z.object({
  name: z.string().min(1).max(80),
  keywords: z.array(z.string().trim().min(1)).min(1).max(30),
  mode: z.enum(["FIXED", "AI"]).default("FIXED"),
  replyTemplate: z.string().max(1000).default(""),
  aiInstructions: z.string().max(1000).default(""),
  channelId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

responderRouter.get("/rules", requireAuth, async (req, res) => {
  res.json(await prisma.responderRule.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } }));
});

responderRouter.post("/rules", requireAuth, async (req, res) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.mode === "FIXED" && !parsed.data.replyTemplate.trim()) {
    return res.status(400).json({ error: "اكتب نص الرد الثابت" });
  }
  if ((await prisma.responderRule.count({ where: { userId: req.user!.id } })) >= 50) {
    return res.status(409).json({ error: "وصلت الحد الأقصى (50 قاعدة)" });
  }
  const rule = await prisma.responderRule.create({ data: { ...parsed.data, userId: req.user!.id } });
  res.status(201).json(rule);
});

responderRouter.patch("/rules/:id", requireAuth, async (req, res) => {
  const parsed = ruleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.responderRule.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return res.status(404).json({ error: "Rule not found" });
  res.json(await prisma.responderRule.update({ where: { id: existing.id }, data: parsed.data }));
});

responderRouter.delete("/rules/:id", requireAuth, async (req, res) => {
  const existing = await prisma.responderRule.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) return res.status(404).json({ error: "Rule not found" });
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
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.responderInteraction.findUnique({
    where: { id: req.params.id },
    include: { connection: { include: { channel: true } } },
  });
  if (!item || item.userId !== req.user!.id) return res.status(404).json({ error: "Message not found" });
  if (item.status !== "NEEDS_REVIEW" && item.status !== "FAILED") {
    return res.status(409).json({ error: "هالرسالة مو بانتظار رد" });
  }
  const sub = await getSubscription(req.user!.id);
  if (!isRunning(sub.status)) return res.status(403).json({ error: "الاشتراك منتهي — جدّده أول" });

  try {
    await sendThroughConnection(item.connection, parsed.data.reply, item.conversationRef);
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "تعذّر الإرسال" });
  }
  const updated = await prisma.responderInteraction.update({
    where: { id: item.id },
    data: { status: "SENT", reply: parsed.data.reply, reason: null },
  });
  res.json(updated);
});

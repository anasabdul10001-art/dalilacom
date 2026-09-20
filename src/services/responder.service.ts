import { ChannelConnection, ResponderStatus, ResponderSubscription, Role, SocialChannel } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptJson } from "./crypto.service";
import { drivers } from "./channels";
import { IncomingMessage } from "./channels/types";
import { aiAvailable, classifyIntent, generateReply } from "./ai.service";
import { adjustBalance } from "./wallet.service";
import { getSettings } from "./settings.service";

const DAY = 24 * 60 * 60 * 1000;

export function isRunning(status: ResponderStatus) {
  return status === "TRIAL" || status === "ACTIVE";
}

/** Expiry is evaluated at the moment of use (no cron): an out-of-date TRIAL/ACTIVE row flips to EXPIRED here. */
export async function getSubscription(userId: string): Promise<ResponderSubscription> {
  let sub = await prisma.responderSubscription.upsert({ where: { userId }, update: {}, create: { userId } });
  const now = Date.now();
  const expired =
    (sub.status === "TRIAL" && (!sub.trialEndsAt || sub.trialEndsAt.getTime() < now)) ||
    (sub.status === "ACTIVE" && (!sub.periodEnd || sub.periodEnd.getTime() < now));
  if (expired) {
    sub = await prisma.responderSubscription.update({ where: { userId }, data: { status: "EXPIRED" } });
  }
  return sub;
}

export type ActivationResult =
  | { kind: "TRIAL_STARTED"; sub: ResponderSubscription }
  | { kind: "PAID"; sub: ResponderSubscription; charged: number };

export class AlreadyRunningError extends Error {}

/** Starts the one-time free trial if it's still available, otherwise charges the wallet for a period. */
export async function activate(userId: string, role: Role): Promise<ActivationResult> {
  const settings = await getSettings();
  const sub = await getSubscription(userId);
  if (isRunning(sub.status)) throw new AlreadyRunningError();

  if (!sub.trialUsed && settings.responder.trialDays > 0) {
    const updated = await prisma.responderSubscription.update({
      where: { userId },
      data: { status: "TRIAL", trialUsed: true, trialEndsAt: new Date(Date.now() + settings.responder.trialDays * DAY) },
    });
    return { kind: "TRIAL_STARTED", sub: updated };
  }
  return pay(userId, role);
}

/** Charges the wallet and extends the paid period. Throws InsufficientBalanceError when the balance is short. */
export async function pay(userId: string, role: Role): Promise<ActivationResult> {
  const settings = await getSettings();
  const price = role === "MERCHANT" ? settings.responder.priceMerchant : settings.responder.priceCustomer;
  return prisma.$transaction(async (tx) => {
    if (price > 0) await adjustBalance(tx, userId, -price, "SUBSCRIPTION", "auto-responder");
    const current = await tx.responderSubscription.upsert({ where: { userId }, update: {}, create: { userId } });
    const now = Date.now();
    const base =
      current.status === "ACTIVE" && current.periodEnd && current.periodEnd.getTime() > now ? current.periodEnd.getTime() : now;
    const sub = await tx.responderSubscription.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        periodEnd: new Date(base + settings.responder.periodDays * DAY),
        aiRepliesUsed: 0,
        aiPeriodStart: new Date(now),
      },
    });
    return { kind: "PAID" as const, sub, charged: price };
  });
}

const COMPLAINT_WORDS = [
  "شكوى", "شكوي", "سيء", "سيئ", "مشكلة", "زفت", "نصب", "احتيال", "استرجاع",
  "complaint", "terrible", "worst", "refund", "scam", "broken",
];

function looksLikeComplaint(text: string) {
  const t = text.toLowerCase();
  return COMPLAINT_WORDS.some((w) => t.includes(w));
}

async function consumeAi(userId: string, limit: number): Promise<boolean> {
  const sub = await prisma.responderSubscription.findUnique({ where: { userId } });
  if (!sub) return false;
  const periodStale = !sub.aiPeriodStart || Date.now() - sub.aiPeriodStart.getTime() > 30 * DAY;
  if (periodStale) {
    await prisma.responderSubscription.update({ where: { userId }, data: { aiRepliesUsed: 1, aiPeriodStart: new Date() } });
    return true;
  }
  if (sub.aiRepliesUsed >= limit) return false;
  await prisma.responderSubscription.update({ where: { userId }, data: { aiRepliesUsed: { increment: 1 } } });
  return true;
}

type ConnectionWithChannel = ChannelConnection & { channel: SocialChannel };
type Outcome = { status: "SENT" | "NEEDS_REVIEW" | "FAILED" | "SKIPPED"; intent?: string | null; reply?: string | null; reason?: string };

export async function handleIncoming(connection: ConnectionWithChannel, msg: IncomingMessage) {
  const userId = connection.userId;
  const base = {
    userId,
    connectionId: connection.id,
    conversationRef: msg.conversationRef,
    authorName: msg.authorName,
    message: msg.text,
  };
  const record = (data: Outcome) => prisma.responderInteraction.create({ data: { ...base, ...data } });

  const sub = await getSubscription(userId);
  if (!isRunning(sub.status)) return record({ status: "SKIPPED", reason: "subscription_inactive" });

  const settings = await getSettings();
  let intent: string | null = looksLikeComplaint(msg.text) ? "complaint" : null;
  if (!intent && aiAvailable() && (await consumeAi(userId, settings.responder.monthlyAiReplyLimit))) {
    intent = await classifyIntent(msg.text);
  }
  // Complaints are never answered automatically — they always wait for a person.
  if (intent === "complaint") return record({ status: "NEEDS_REVIEW", intent, reason: "complaint" });

  const lower = msg.text.toLowerCase();
  const rules = await prisma.responderRule.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: "asc" } });
  const rule = rules.find(
    (r) =>
      (!r.channelId || r.channelId === connection.channelId) &&
      r.keywords.some((k) => k.trim() && lower.includes(k.trim().toLowerCase())),
  );
  if (!rule) return record({ status: "SKIPPED", intent, reason: "no_matching_rule" });

  let reply: string | null = null;
  if (rule.mode === "AI" && aiAvailable() && (await consumeAi(userId, settings.responder.monthlyAiReplyLimit))) {
    reply = await generateReply({
      message: msg.text,
      businessDescription: sub.businessDescription,
      tone: sub.tone,
      instructions: rule.aiInstructions,
    });
  }
  if (!reply && rule.replyTemplate) reply = rule.replyTemplate.replaceAll("{name}", msg.authorName);
  if (!reply) return record({ status: "NEEDS_REVIEW", intent, reason: rule.mode === "AI" ? "ai_unavailable" : "empty_template" });

  try {
    await sendThroughConnection(connection, reply, msg.conversationRef);
    return record({ status: "SENT", intent, reply });
  } catch (err) {
    return record({ status: "FAILED", intent, reply, reason: err instanceof Error ? err.message : "send_failed" });
  }
}

export async function sendThroughConnection(connection: ConnectionWithChannel, text: string, conversationRef: string) {
  const driver = drivers[connection.channel.driver];
  await driver.sendReply(text, conversationRef, {
    credentials: decryptJson(connection.credentialsEnc),
    hookToken: connection.hookToken,
    channelConfig: connection.channel.config as Record<string, any>,
  });
}

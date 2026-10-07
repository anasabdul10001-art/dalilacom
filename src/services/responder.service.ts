import { ChannelConnection, ResponderStatus, ResponderSubscription, Role, SocialChannel } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptJson } from "./crypto.service";
import { drivers } from "./channels";
import { IncomingMessage } from "./channels/types";
import { aiAvailable, answerComplaint, classifyIntent, generateReply } from "./ai.service";
import { adjustBalance } from "./wallet.service";
import { getSettings } from "./settings.service";
import { notify } from "./notification.service";

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
    const was = sub.status;
    sub = await prisma.responderSubscription.update({ where: { userId }, data: { status: "EXPIRED" } });
    // the flip happens once, so the notice does too
    await tell(userId, was === "TRIAL" ? "انتهت تجربة المجيب الآلي" : "انتهى اشتراك المجيب الآلي", "توقّف الرد التلقائي على زبائنك. فعّل أو جدّد الاشتراك ليرجع يشتغل.", { reason: "expired" });
  }
  return sub;
}

/** A notification to the owner of the responder (inbox + push, never an email), tagged so the app opens the responder. */
async function tell(userId: string, title: string, body: string, data: Record<string, string> = {}) {
  await notify({ userId, type: "SYSTEM", title, body, data: { kind: "RESPONDER", ...data }, email: false });
}

const NOTICE_DAYS = { TRIAL: 2, ACTIVE: 3 } as const;

/** Called whenever the owner looks at the service: warns once per ending when the trial or the paid period is about to end. */
export async function maybeNotifyEnding(sub: ResponderSubscription): Promise<void> {
  if (sub.status !== "TRIAL" && sub.status !== "ACTIVE") return;
  const end = sub.status === "TRIAL" ? sub.trialEndsAt : sub.periodEnd;
  if (!end) return;
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / DAY);
  if (daysLeft > NOTICE_DAYS[sub.status] || daysLeft < 0) return;
  if (sub.expiryNoticeFor && sub.expiryNoticeFor.getTime() === end.getTime()) return;
  await prisma.responderSubscription.update({ where: { userId: sub.userId }, data: { expiryNoticeFor: end } });
  await tell(
    sub.userId,
    sub.status === "TRIAL" ? "تجربة المجيب الآلي تنتهي قريبًا" : "اشتراك المجيب الآلي ينتهي قريبًا",
    `باقي ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"}. ${sub.status === "TRIAL" ? "فعّل الاشتراك" : "جدّد الاشتراك"} ليكمل الرد على زبائنك.`,
    { reason: "ending" },
  );
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

/** Sent when the AI cannot (or may not) settle a complaint: the customer is never left unanswered. */
const COMPLAINT_HOLDING_REPLY = "نعتذر منك على هالإزعاج 🙏 وصلت رسالتك لفريقنا، وحدا من الفريق رح يتواصل معك قريبًا.";

const COMPLAINT_WORDS = [
  "شكوى", "شكوي", "سيء", "سيئ", "مشكلة", "زفت", "نصب", "احتيال", "استرجاع",
  "complaint", "terrible", "worst", "refund", "scam", "broken",
];

function looksLikeComplaint(text: string) {
  const t = text.toLowerCase();
  return COMPLAINT_WORDS.some((w) => t.includes(w));
}

/** Is there AI quota left this period? (Read-only: only the replies the AI writes are counted, not the quick classification.) */
async function aiQuotaLeft(userId: string, limit: number): Promise<boolean> {
  const sub = await prisma.responderSubscription.findUnique({ where: { userId } });
  if (!sub) return false;
  const periodStale = !sub.aiPeriodStart || Date.now() - sub.aiPeriodStart.getTime() > 30 * DAY;
  return periodStale || sub.aiRepliesUsed < limit;
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

/** Facts the AI may use for a merchant: the shop, its address and the products with their real prices (capped, so it stays small). */
async function businessInfoFor(userId: string): Promise<string | undefined> {
  const shop = await prisma.merchantProfile.findUnique({
    where: { userId },
    select: { id: true, businessName: true, address: true, phone: true, category: { select: { name: true } }, discounts: { where: { isActive: true }, select: { title: true, percent: true }, take: 10 } },
  });
  if (!shop) return undefined;
  const products = await prisma.product.findMany({ where: { merchantId: shop.id, isActive: true }, orderBy: { createdAt: "desc" }, take: 25, select: { name: true, priceCents: true, stock: true } });
  const lines = [
    `Shop: ${shop.businessName}${shop.category ? ` (${shop.category.name})` : ""}`,
    shop.address ? `Address: ${shop.address}` : "",
    shop.phone ? `Phone: ${shop.phone}` : "",
    ...shop.discounts.map((d) => `Offer for members: ${d.title} (${d.percent}% off)`),
    ...products.map((x) => `Product: ${x.name} — ${(x.priceCents / 100).toFixed(2)} — ${x.stock > 0 ? "in stock" : "out of stock"}`),
  ].filter(Boolean);
  return lines.join("\n").slice(0, 2500);
}

/** The last few turns of this conversation (within a day), oldest first. */
async function historyFor(connectionId: string, conversationRef: string): Promise<{ customer: string; reply?: string | null }[]> {
  const rows = await prisma.responderInteraction.findMany({
    where: { connectionId, conversationRef, createdAt: { gte: new Date(Date.now() - DAY) } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { message: true, reply: true },
  });
  return rows.reverse().map((r) => ({ customer: r.message, reply: r.reply }));
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
    postId: msg.postId,
    externalId: msg.externalId,
  };
  const record = async (data: Outcome) => {
    const row = await prisma.responderInteraction.create({ data: { ...base, ...data } });
    // A complaint always reaches the owner, even when it was answered; anything else only when it waits for a person.
    if (data.status === "NEEDS_REVIEW" || data.status === "FAILED" || data.reason === "complaint") await tellAboutMessage(userId, msg, data);
    return row;
  };

  // Platforms redeliver webhooks; the same comment/message must never be answered twice.
  if (msg.externalId) {
    const duplicate = await prisma.responderInteraction.findFirst({ where: { connectionId: connection.id, externalId: msg.externalId } });
    if (duplicate) return duplicate;
  }

  const sub = await getSubscription(userId);
  if (!isRunning(sub.status)) return record({ status: "SKIPPED", reason: "subscription_inactive" });

  const settings = await getSettings();
  const limit = settings.responder.monthlyAiReplyLimit;
  let intent: string | null = looksLikeComplaint(msg.text) ? "complaint" : null;
  if (!intent && aiAvailable() && (await aiQuotaLeft(userId, limit))) intent = await classifyIntent(msg.text);
  // A complaint is answered from what the shop knows; when that does not settle it, the customer is told that a real
  // person will contact them soon and the message waits in the inbox. The owner is told either way.
  if (intent === "complaint") {
    let answer = null as Awaited<ReturnType<typeof answerComplaint>>;
    if (aiAvailable() && (await consumeAi(userId, limit))) {
      answer = await answerComplaint({
        message: msg.text,
        businessDescription: sub.businessDescription,
        tone: sub.tone,
        businessInfo: await businessInfoFor(userId),
        history: await historyFor(connection.id, msg.conversationRef),
      });
    }
    const complaintReply = answer?.reply ?? COMPLAINT_HOLDING_REPLY;
    const needsPerson = !answer || answer.handoff;
    try {
      await sendThroughConnection(connection, complaintReply, msg.conversationRef);
      return record({ status: needsPerson ? "NEEDS_REVIEW" : "SENT", intent, reply: complaintReply, reason: "complaint" });
    } catch (err) {
      return record({ status: "FAILED", intent, reply: complaintReply, reason: err instanceof Error ? err.message : "send_failed" });
    }
  }

  const lower = msg.text.toLowerCase();
  const rules = await prisma.responderRule.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: "asc" } });
  const rule = rules.find(
    (r) =>
      (!r.channelId || r.channelId === connection.channelId) &&
      // A rule limited to specific posts only ever answers comments on those posts (never DMs or other posts).
      (r.postIds.length === 0 || (!!msg.postId && r.postIds.includes(msg.postId))) &&
      r.keywords.some((k) => k.trim() && lower.includes(k.trim().toLowerCase())),
  );

  // The AI answers with what the shop really has and what was said before in this conversation.
  const writeWithAi = async (instructions: string): Promise<string | null> => {
    if (!aiAvailable() || !(await consumeAi(userId, limit))) return null;
    return generateReply({
      message: msg.text,
      businessDescription: sub.businessDescription,
      tone: sub.tone,
      instructions,
      businessInfo: await businessInfoFor(userId),
      history: await historyFor(connection.id, msg.conversationRef),
    });
  };
  const personalise = (template: string) => template.replaceAll("{name}", msg.authorName);

  let reply: string | null = null;
  let heldBack = "empty_template";
  if (rule) {
    if (rule.mode === "AI") reply = await writeWithAi(rule.aiInstructions);
    if (!reply && rule.replyTemplate) reply = personalise(rule.replyTemplate);
    if (!reply && rule.mode === "AI") heldBack = "ai_unavailable";
  } else if (sub.fallbackMode === "TEMPLATE" && sub.fallbackReply?.trim()) {
    reply = personalise(sub.fallbackReply);
  } else if (sub.fallbackMode === "AI") {
    reply = await writeWithAi("No rule matched this message: answer it only from the business information, briefly. If it is not covered, say the team will follow up.");
    if (!reply) heldBack = "ai_unavailable";
  } else {
    return record({ status: "SKIPPED", intent, reason: "no_matching_rule" });
  }
  if (!reply) return record({ status: "NEEDS_REVIEW", intent, reason: heldBack });

  try {
    await sendThroughConnection(connection, reply, msg.conversationRef);
    return record({ status: "SENT", intent, reply });
  } catch (err) {
    return record({ status: "FAILED", intent, reply, reason: err instanceof Error ? err.message : "send_failed" });
  }
}

/** Tells the owner a message is waiting for a person (a complaint, a failed send, no AI): at most once an hour per conversation. */
async function tellAboutMessage(userId: string, msg: IncomingMessage, outcome: Outcome) {
  const recent = await prisma.notification.findFirst({
    where: {
      userId,
      type: "SYSTEM",
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      AND: [{ data: { path: ["kind"], equals: "RESPONDER" } }, { data: { path: ["conversationRef"], equals: msg.conversationRef } }],
    },
    select: { id: true },
  });
  if (recent) return;
  const title =
    outcome.status === "FAILED"
      ? "تعذّر إرسال رد تلقائي"
      : outcome.reason === "complaint"
        ? outcome.status === "SENT" ? "وصلتك شكوى وتم الرد عليها تلقائيًا" : "شكوى بانتظار ردّك"
        : "رسالة تحتاج ردّك";
  await tell(userId, title, `${msg.authorName}: ${msg.text.slice(0, 90)}`, { reason: "review", conversationRef: msg.conversationRef });
}

export async function sendThroughConnection(connection: ConnectionWithChannel, text: string, conversationRef: string) {
  const driver = drivers[connection.channel.driver];
  await driver.sendReply(text, conversationRef, {
    credentials: decryptJson(connection.credentialsEnc),
    hookToken: connection.hookToken,
    channelConfig: connection.channel.config as Record<string, any>,
  });
}

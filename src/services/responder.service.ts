import { ChannelConnection, ResponderStatus, ResponderSubscription, Role, ServiceKind, SocialChannel } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptJson } from "./crypto.service";
import { drivers } from "./channels";
import { IncomingMessage } from "./channels/types";
import { aiAvailable, answerComplaint, generateReply } from "./ai.service";
import { adjustBalance } from "./wallet.service";
import { getSettings } from "./settings.service";
import { notify } from "./notification.service";
import { normalizeText } from "./category.service";

const DAY = 24 * 60 * 60 * 1000;
export const RESPONDER_LEGACY_PLAN_ID = "00000000-0000-4000-8000-000000000001";
export const RESPONDER_SERVICES: ServiceKind[] = ["RESPONDER_BASIC", "RESPONDER_CUSTOMER", "RESPONDER_MERCHANT"];

export function isRunning(status: ResponderStatus) {
  return status === "TRIAL" || status === "ACTIVE";
}

/** Mark expired plan periods and return the account's currently valid responder plans. */
export async function getActiveResponderEntitlements(userId: string) {
  const now = new Date();
  await prisma.responderEntitlement.updateMany({
    where: {
      userId,
      OR: [
        { status: "TRIAL", OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
        { status: "ACTIVE", OR: [{ periodEnd: null }, { periodEnd: { lte: now } }] },
      ],
    },
    data: { status: "EXPIRED" },
  });
  return prisma.responderEntitlement.findMany({
    where: { userId, OR: [{ status: "TRIAL", trialEndsAt: { gt: now } }, { status: "ACTIVE", periodEnd: { gt: now } }] },
    include: { plan: true },
  });
}

/** Extend one plan without charging. Only the super-admin grant action calls this helper. */
export async function grantResponderEntitlement(userId: string, planId: string, days: number) {
  const existing = await prisma.responderEntitlement.findUnique({ where: { userId_planId: { userId, planId } } });
  const now = Date.now();
  const currentEnd = existing?.status === "ACTIVE" ? existing.periodEnd?.getTime() ?? now : existing?.status === "TRIAL" ? existing.trialEndsAt?.getTime() ?? now : now;
  const periodEnd = new Date(Math.max(now, currentEnd) + days * DAY);
  return prisma.responderEntitlement.upsert({
    where: { userId_planId: { userId, planId } },
    create: { userId, planId, status: "ACTIVE", source: "GRANT", periodEnd },
    update: { status: "ACTIVE", source: "GRANT", trialEndsAt: null, periodEnd },
  });
}

export class ResponderTrialUnavailableError extends Error {}
export class ResponderPlanNotFoundError extends Error {}

/** Starts one plan's trial once per account. An expired entitlement also counts as the trial having been used. */
export async function startResponderTrial(userId: string, planId: string) {
  const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
  if (!plan || !RESPONDER_SERVICES.includes(plan.service) || !plan.isActive) throw new ResponderPlanNotFoundError();
  if (plan.trialDays <= 0) throw new ResponderTrialUnavailableError();
  const previous = await prisma.responderEntitlement.findUnique({ where: { userId_planId: { userId, planId } }, select: { id: true } });
  if (previous) throw new ResponderTrialUnavailableError();
  const trialEndsAt = new Date(Date.now() + plan.trialDays * DAY);
  return prisma.responderEntitlement.create({ data: { userId, planId, status: "TRIAL", source: "TRIAL", trialEndsAt } });
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
    await prisma.responderEntitlement.updateMany({
      where: { userId, planId: RESPONDER_LEGACY_PLAN_ID, status: was === "TRIAL" ? "TRIAL" : "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    // the flip happens once, so the notice does too
    await tell(userId, was === "TRIAL" ? "انتهت تجربة المجيب الآلي" : "انتهى اشتراك المجيب الآلي", "توقّف الرد التلقائي على زبائنك. فعّل أو جدّد الاشتراك ليرجع يشتغل.", { reason: "expired" });
  } else if (sub.status === "EXPIRED") {
    await prisma.responderEntitlement.updateMany({
      where: { userId, planId: RESPONDER_LEGACY_PLAN_ID, status: { in: ["TRIAL", "ACTIVE"] } },
      data: { status: "EXPIRED" },
    });
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
    const trialEndsAt = new Date(Date.now() + settings.responder.trialDays * DAY);
    const updated = await prisma.responderSubscription.update({
      where: { userId },
      data: { status: "TRIAL", trialUsed: true, trialEndsAt },
    });
    await prisma.responderEntitlement.upsert({
      where: { userId_planId: { userId, planId: RESPONDER_LEGACY_PLAN_ID } },
      create: { userId, planId: RESPONDER_LEGACY_PLAN_ID, status: "TRIAL", source: "TRIAL", trialEndsAt },
      update: { status: "TRIAL", source: "TRIAL", trialEndsAt, periodEnd: null },
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
    await tx.responderEntitlement.upsert({
      where: { userId_planId: { userId, planId: RESPONDER_LEGACY_PLAN_ID } },
      create: { userId, planId: RESPONDER_LEGACY_PLAN_ID, status: "ACTIVE", source: "PAID", periodEnd: sub.periodEnd },
      update: { status: "ACTIVE", source: "PAID", trialEndsAt: null, periodEnd: sub.periodEnd },
    });
    return { kind: "PAID" as const, sub, charged: price };
  });
}

/** Sent when the AI cannot (or may not) settle a complaint: the customer is never left unanswered. */
const COMPLAINT_HOLDING_REPLY = "نعتذر منك على هالإزعاج 🙏 وصلت رسالتك لفريقنا، وحدا من الفريق رح يتواصل معك قريبًا.";

const COMPLAINT_WORDS = [
  "شكوى", "شكوي", "سيء", "سيئ", "سيئة", "مشكلة", "مشاكل", "زفت", "نصب", "احتيال", "استرجاع", "ظلم", "ما عجبني", "ماعجبني", "ما وصل", "ماوصل", "تأخر", "تأخير", "خدمة سيئة", "غالي كتير",
  "complaint", "complain", "terrible", "worst", "refund", "scam", "broken", "not working", "disappointed", "bad service",
  "beschwerde", "schlecht", "kaputt", "rückerstattung", "betrug", "nicht angekommen",
];

function looksLikeComplaint(text: string) {
  const t = normalizeText(text);
  return COMPLAINT_WORDS.some((w) => t.includes(normalizeText(w)));
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

/**
 * Facts the AI may use: only what the connected Facebook Page / Instagram account says about itself (about text,
 * address, hours, its own posts), read through the platform. The responder is a service for those accounts and
 * never reads anything from the Dalilacom store. Telegram and webhook channels give none, so the AI there relies
 * on the description the owner wrote in the responder settings alone. Cached a few minutes per connection.
 */
const FACTS_TTL = 10 * 60 * 1000;
const factsCache = new Map<string, { at: number; text: string | undefined }>();

export async function businessInfoFor(connection: ConnectionWithChannel): Promise<string | undefined> {
  const driver = drivers[connection.channel.driver];
  if (!driver.describe) return undefined;
  const cached = factsCache.get(connection.id);
  if (cached && Date.now() - cached.at < FACTS_TTL) return cached.text;
  let text: string | undefined;
  try {
    text = (
      await driver.describe({
        credentials: decryptJson(connection.credentialsEnc),
        hookToken: connection.hookToken,
        channelConfig: connection.channel.config as Record<string, any>,
      })
    ).slice(0, 3500) || undefined;
  } catch {
    return undefined; // do not cache a failure: the next message tries again
  }
  factsCache.set(connection.id, { at: Date.now(), text });
  return text;
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
type Outcome = { status: "SENT" | "NEEDS_REVIEW" | "FAILED" | "SKIPPED"; intent?: string | null; reply?: string | null; reason?: string; matchedRuleId?: string | null; noMatchingRule?: boolean };

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
  if (!sub.enabled) return record({ status: "SKIPPED", reason: "responder_disabled" });
  const entitlements = await getActiveResponderEntitlements(userId);
  if (!entitlements.length) {
    const now = new Date();
    const notice = await prisma.responderSubscription.updateMany({
      where: { userId, OR: [{ basicPlanNoticeAt: null }, { basicPlanNoticeAt: { lte: new Date(now.getTime() - 30 * DAY) } }] },
      data: { basicPlanNoticeAt: now },
    });
    if (notice.count) await tell(userId, "المجيب الآلي يحتاج خطة فعّالة", "اختر خطة للمجيب الآلي ليعود للرد على الرسائل. قنواتك وقواعدك محفوظة.", { reason: "basic_plan_required" });
    return record({ status: "SKIPPED", reason: "basic_plan_required" });
  }
  const aiEntitlements = entitlements.filter((entitlement) => entitlement.plan.includesAi);
  const hasAiPlan = aiEntitlements.length > 0;
  const aiLimit = hasAiPlan ? Math.max(...aiEntitlements.map((entitlement) => entitlement.plan.aiReplyLimit || 0)) : 0;

  const intent: string | null = looksLikeComplaint(msg.text) ? "complaint" : null;
  // Basic plans use a fixed holding reply. AI plans keep their complaint-specific AI answer.
  if (intent === "complaint") {
    try {
      let answer: Awaited<ReturnType<typeof answerComplaint>> = null;
      if (hasAiPlan && aiAvailable() && (await consumeAi(userId, aiLimit))) {
        answer = await answerComplaint({
          message: msg.text,
          businessDescription: sub.businessDescription,
          tone: sub.tone,
          businessInfo: await businessInfoFor(connection),
          history: await historyFor(connection.id, msg.conversationRef),
        });
      }
      const reply = answer?.reply ?? COMPLAINT_HOLDING_REPLY;
      await sendThroughConnection(connection, reply, msg.conversationRef);
      return record({ status: answer?.handoff === false ? "SENT" : "NEEDS_REVIEW", intent, reply, reason: "complaint" });
    } catch (err) {
      return record({ status: "FAILED", intent, reply: COMPLAINT_HOLDING_REPLY, reason: err instanceof Error ? err.message : "send_failed" });
    }
  }

  const rules = await prisma.responderRule.findMany({ where: { userId, isActive: true }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] });
  const normalizedMessage = normalizeText(msg.text);
  const rule = rules.find(
    (r) =>
      (!r.channelId || r.channelId === connection.channelId) &&
      // A rule limited to specific posts only ever answers comments on those posts (never DMs or other posts).
      (r.postIds.length === 0 || (!!msg.postId && r.postIds.includes(msg.postId))) &&
      r.keywords.some((k) => { const keyword = normalizeText(k); return keyword && normalizedMessage.includes(keyword); }),
  );
  const matchTracking = rule ? { matchedRuleId: rule.id } : { noMatchingRule: true };

  // The AI answers with what the shop really has and what was said before in this conversation.
  const writeWithAi = async (instructions: string): Promise<string | null> => {
    if (!hasAiPlan || !aiAvailable() || !(await consumeAi(userId, aiLimit))) return null;
    return generateReply({
      message: msg.text,
      businessDescription: sub.businessDescription,
      tone: sub.tone,
      instructions,
      businessInfo: await businessInfoFor(connection),
      history: await historyFor(connection.id, msg.conversationRef),
    });
  };
  const personalise = (template: string) => template.replaceAll("{name}", msg.authorName);

  let reply: string | null = null;
  let heldBack = "empty_template";
  if (rule) {
    if (rule.mode === "AI" && hasAiPlan) reply = await writeWithAi(rule.aiInstructions);
    if (!reply && rule.replyTemplate) reply = personalise(rule.replyTemplate);
    if (!reply && rule.mode === "AI") heldBack = hasAiPlan ? "ai_unavailable" : "ai_requires_plan";
  } else if (sub.fallbackMode === "TEMPLATE" && sub.fallbackReply?.trim()) {
    reply = personalise(sub.fallbackReply);
  } else if (sub.fallbackMode === "AI") {
    if (hasAiPlan) reply = await writeWithAi("No rule matched this message: answer it only from the business information, briefly. If it is not covered, say the team will follow up.");
    else if (sub.fallbackReply?.trim()) reply = personalise(sub.fallbackReply);
    if (!reply) heldBack = hasAiPlan ? "ai_unavailable" : "ai_requires_plan";
  } else {
    return record({ status: "SKIPPED", intent, reason: "no_matching_rule", ...matchTracking });
  }
  if (!reply) return record({ status: "NEEDS_REVIEW", intent, reason: heldBack, ...matchTracking });

  try {
    await sendThroughConnection(connection, reply, msg.conversationRef);
    return record({ status: "SENT", intent, reply, ...matchTracking });
  } catch (err) {
    return record({ status: "FAILED", intent, reply, reason: err instanceof Error ? err.message : "send_failed", ...matchTracking });
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

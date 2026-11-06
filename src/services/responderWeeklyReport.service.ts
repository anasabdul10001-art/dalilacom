import { NotificationType } from "@prisma/client";
import { prisma } from "../prisma";
import { notify } from "./notification.service";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Send one weekly summary to each account with an active non-AI plan and unmatched messages. */
export async function sendWeeklyResponderReports(now = new Date()) {
  const since = new Date(now.getTime() - WEEK_MS);
  const active = await prisma.responderEntitlement.findMany({
    where: {
      OR: [
        { status: "TRIAL", OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }] },
        { status: "ACTIVE", OR: [{ periodEnd: null }, { periodEnd: { gt: now } }] },
      ],
    },
    select: { userId: true, plan: { select: { includesAi: true } } },
  });
  const aiUsers = new Set(active.filter((row) => row.plan.includesAi).map((row) => row.userId));
  const basicUsers = [...new Set(active.filter((row) => !row.plan.includesAi).map((row) => row.userId))]
    .filter((userId) => !aiUsers.has(userId));
  if (!basicUsers.length) return { eligible: 0, sent: 0 };

  const subscriptions = await prisma.responderSubscription.findMany({
    where: {
      userId: { in: basicUsers },
      enabled: true,
      OR: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { lte: since } }],
    },
    select: { userId: true, weeklyReportSentAt: true },
  });
  const counts = await prisma.responderInteraction.groupBy({
    by: ["userId"],
    where: { userId: { in: subscriptions.map((item) => item.userId) }, noMatchingRule: true, createdAt: { gte: since, lte: now } },
    _count: { _all: true },
  });
  const countByUser = new Map(counts.map((item) => [item.userId, item._count._all]));
  let sent = 0;
  let eligible = 0;
  for (const subscription of subscriptions) {
    const count = countByUser.get(subscription.userId) ?? 0;
    if (count < 1) continue;
    eligible++;

    // Claim the week before sending so overlapping Cron retries cannot duplicate the report.
    const claimed = await prisma.responderSubscription.updateMany({
      where: {
        userId: subscription.userId,
        enabled: true,
        weeklyReportSentAt: subscription.weeklyReportSentAt,
      },
      data: { weeklyReportSentAt: now },
    });
    if (!claimed.count) continue;

    await notify({
      userId: subscription.userId,
      type: NotificationType.SYSTEM,
      title: "ملخص المجيب الآلي لهذا الأسبوع",
      body: `هالأسبوع وصلك ${count} رسالة ما لقت رد ثابت. الذكاء الاصطناعي كان ممكن يرد عليها.`,
      data: { kind: "RESPONDER", reason: "weekly_report", action: "upgrade", count },
    });
    sent++;
  }
  return { eligible, sent };
}


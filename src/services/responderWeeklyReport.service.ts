import { NotificationType } from "@prisma/client";
import { prisma } from "../prisma";
import { notify } from "./notification.service";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Send a daily alert when needed and a weekly summary to basic-plan accounts with unmatched messages. */
export async function sendWeeklyResponderReports(now = new Date()) {
  const sinceWeek = new Date(now.getTime() - WEEK_MS);
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
  if (!basicUsers.length) return { eligible: 0, sent: 0, dailySent: 0, weeklySent: 0 };

  const subscriptions = await prisma.responderSubscription.findMany({
    where: {
      userId: { in: basicUsers },
      enabled: true,
      OR: [
        { dailyReportSentAt: null }, { dailyReportSentAt: { lt: todayUtc } },
        { weeklyReportSentAt: null }, { weeklyReportSentAt: { lte: sinceWeek } },
      ],
    },
    select: { userId: true, dailyReportSentAt: true, weeklyReportSentAt: true },
  });
  const userIds = subscriptions.map((item) => item.userId);
  const [dayCounts, weekCounts] = await Promise.all([
    prisma.responderInteraction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, noMatchingRule: true, createdAt: { gte: new Date(now.getTime() - DAY_MS), lte: now } },
      _count: { _all: true },
    }),
    prisma.responderInteraction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, noMatchingRule: true, createdAt: { gte: new Date(now.getTime() - WEEK_MS), lte: now } },
      _count: { _all: true },
    }),
  ]);
  const dayCountByUser = new Map(dayCounts.map((item) => [item.userId, item._count._all]));
  const weekCountByUser = new Map(weekCounts.map((item) => [item.userId, item._count._all]));
  let sent = 0;
  let eligible = 0;
  let dailySent = 0;
  let weeklySent = 0;
  for (const subscription of subscriptions) {
    const dailyCount = dayCountByUser.get(subscription.userId) ?? 0;
    const weeklyCount = weekCountByUser.get(subscription.userId) ?? 0;
    const dailyDue = !subscription.dailyReportSentAt || subscription.dailyReportSentAt < todayUtc;
    const weeklyDue = !subscription.weeklyReportSentAt || subscription.weeklyReportSentAt <= sinceWeek;

    // Prefer the weekly summary if both are due, so the account does not receive two alerts together.
    if (weeklyDue && weeklyCount > 0) {
      eligible++;
      const claimed = await prisma.responderSubscription.updateMany({
        where: {
          userId: subscription.userId,
          enabled: true,
          dailyReportSentAt: subscription.dailyReportSentAt,
          weeklyReportSentAt: subscription.weeklyReportSentAt,
        },
        data: { dailyReportSentAt: now, weeklyReportSentAt: now },
      });
      if (!claimed.count) continue;

      await notify({
        userId: subscription.userId,
        type: NotificationType.SYSTEM,
        title: "ملخص المجيب الآلي لهذا الأسبوع",
        body: `هالأسبوع وصلك ${weeklyCount} رسالة ما لقت رد ثابت. الذكاء الاصطناعي كان ممكن يرد عليها.`,
        data: { kind: "RESPONDER", reason: "weekly_report", action: "upgrade", count: weeklyCount },
      });
      sent++;
      weeklySent++;
      continue;
    }

    if (dailyDue && dailyCount > 0) {
      eligible++;
      const claimed = await prisma.responderSubscription.updateMany({
        where: {
          userId: subscription.userId,
          enabled: true,
          dailyReportSentAt: subscription.dailyReportSentAt,
          weeklyReportSentAt: subscription.weeklyReportSentAt,
        },
        data: { dailyReportSentAt: now },
      });
      if (!claimed.count) continue;

      await notify({
        userId: subscription.userId,
        type: NotificationType.SYSTEM,
        title: "تنبيه يومي: رسائل بانتظار رد",
        body: `خلال آخر 24 ساعة وصلك ${dailyCount} رسالة ما لقت رد ثابت. الذكاء الاصطناعي كان ممكن يرد عليها.`,
        data: { kind: "RESPONDER", reason: "daily_report", action: "upgrade", count: dailyCount },
      });
      sent++;
      dailySent++;
    }
  }
  return { eligible, sent, dailySent, weeklySent };
}


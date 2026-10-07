import { NotificationMode, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { emailService } from "./email.service";
import { sendPushToUser } from "./push.service";

/** Every type the app knows about, in the order the preferences screen lists them (section 87). */
export const NOTIFICATION_TYPES = Object.values(NotificationType);

/** How long before the end date a member starts being reminded, and how often at most (section 13). */
const EXPIRY_WARNING_DAYS = 7;
const EXPIRY_REMINDER_INTERVAL_HOURS = 24;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Prisma.InputJsonValue;
}

export interface NotifyResult {
  mode: NotificationMode;
  created: boolean;
  emailed: boolean;
}

/** Nothing stored for a (user, type) pair means the default: FULL. */
async function effectiveMode(userId: string, type: NotificationType): Promise<NotificationMode> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
  return row?.mode ?? NotificationMode.FULL;
}

/**
 * The single way a notification is produced. It applies the section 87 preference, writes the inbox
 * row and — on FULL — sends the email. It never throws and is never part of the caller's transaction:
 * a notification that fails must not fail the order, discount or payment that caused it.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const mode = await effectiveMode(input.userId, input.type).catch(() => NotificationMode.FULL);
  if (mode === NotificationMode.OFF) return { mode, created: false, emailed: false };

  let created = false;
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        data: input.data,
      },
    });
    created = true;
  } catch {
    return { mode, created: false, emailed: false };
  }

  if (mode !== NotificationMode.FULL) return { mode, created, emailed: false };

  // FULL = inbox + push + email. Push is best-effort (it never throws) and does nothing without Firebase configured.
  await sendPushToUser(input.userId, {
    title: input.title,
    body: input.body,
    data: { type: input.type, ...(input.data && typeof input.data === "object" && !Array.isArray(input.data) ? (input.data as Record<string, unknown>) : {}) },
  });

  let emailed = false;
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (user?.email) {
      await emailService.send({ to: user.email, subject: input.title, text: input.body ?? input.title });
      emailed = true;
    }
  } catch {
    /* best-effort: the inbox row is already saved, and email has its own console fallback */
  }
  return { mode, created, emailed };
}

/** The inbox, newest first, plus the unread badge count in one round trip. */
export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; take?: number; skip?: number } = {}) {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      skip: Math.max(opts.skip ?? 0, 0),
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Scoped by userId, so one account can never mark another account's notification as read. */
export async function markRead(userId: string, id: string): Promise<boolean> {
  const res = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  return res.count > 0;
}

export function markAllRead(userId: string): Promise<Prisma.BatchPayload> {
  return prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

/** Every type, with the stored preference or the FULL default the UI should show. */
export async function getPreferences(userId: string): Promise<{ type: NotificationType; mode: NotificationMode }[]> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const stored = new Map(rows.map((r) => [r.type, r.mode]));
  return NOTIFICATION_TYPES.map((type) => ({ type, mode: stored.get(type) ?? NotificationMode.FULL }));
}

export async function setPreferences(
  userId: string,
  entries: { type: NotificationType; mode: NotificationMode }[],
): Promise<{ type: NotificationType; mode: NotificationMode }[]> {
  for (const entry of entries) {
    await prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type: entry.type } },
      create: { userId, type: entry.type, mode: entry.mode },
      update: { mode: entry.mode },
    });
  }
  return getPreferences(userId);
}

/**
 * Section 13: warn shortly before the membership ends. This deployment has no scheduler (no cron on
 * the free plan), so the reminder is produced lazily — while the member is using the app — and at
 * most once per interval. Returns null when there is nothing to warn about or it was just sent.
 */
export async function notifyExpiringMembership(userId: string): Promise<NotifyResult | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE", endDate: { gt: new Date() } },
    orderBy: { endDate: "desc" },
    select: { id: true, endDate: true },
  });
  if (!membership) return null;

  const daysLeft = Math.ceil((membership.endDate.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > EXPIRY_WARNING_DAYS) return null;

  const since = new Date(Date.now() - EXPIRY_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000);
  const alreadySent = await prisma.notification.findFirst({
    where: { userId, type: NotificationType.MEMBERSHIP_EXPIRING, createdAt: { gte: since } },
    select: { id: true },
  });
  if (alreadySent) return null;

  return notify({
    userId,
    type: NotificationType.MEMBERSHIP_EXPIRING,
    title: "عضويتك عم تنتهي قريبًا",
    body: `باقي ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"} على انتهاء عضويتك. جدّدها لتضل تستفيد من الحسومات.`,
    data: { membershipId: membership.id, endDate: membership.endDate.toISOString() },
  });
}

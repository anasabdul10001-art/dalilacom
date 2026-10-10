import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { getSettings } from "./settings.service";
import { adjustBalance, InsufficientBalanceError } from "./wallet.service";
import { notify } from "./notification.service";

const startOfMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** The shop's running package (the one that ends last), with what is left of its uses; null when there is none. */
async function activeSubscription(userId: string) {
  const sub = await prisma.aiSubscription.findFirst({ where: { userId, endDate: { gt: new Date() } }, orderBy: { endDate: "desc" } });
  if (!sub) return null;
  const used = await prisma.aiUse.count({ where: { subscriptionId: sub.id } });
  return { id: sub.id, name: sub.name, uses: sub.uses, used, left: Math.max(0, sub.uses - used), endDate: sub.endDate, autoRenew: sub.autoRenew };
}

/** What a shop has left: its package, then its free uses this month, then what a use costs; and its wallet balance. */
export async function aiQuotaFor(userId: string) {
  await renewDueForUser(userId); // a package that has just ended is renewed (when the shop asked for that) before anything is counted
  const [settings, usedFree, wallet, subscription] = await Promise.all([
    getSettings(),
    prisma.aiUse.count({ where: { userId, subscriptionId: null, createdAt: { gte: startOfMonth() } } }),
    prisma.wallet.findUnique({ where: { userId } }),
    activeSubscription(userId),
  ]);
  const { freePerMonth, creditsPerUse } = settings.ai;
  return { freePerMonth, used: usedFree, freeLeft: Math.max(0, freePerMonth - usedFree), creditsPerUse, balance: wallet?.balance ?? 0, subscription };
}

/** Before the work: the shop has a package use or a free use left, or can pay for this one. Throws what the app shows. */
export async function ensureCanUseAi(userId: string) {
  const q = await aiQuotaFor(userId);
  if ((q.subscription?.left ?? 0) > 0 || q.freeLeft > 0) return q;
  if (q.creditsPerUse <= 0) throw new ApiError(403, "AI_QUOTA_USED", "انتهت استخداماتك المجانية للذكاء الاصطناعي هالشهر");
  if (q.balance < q.creditsPerUse) throw new ApiError(402, "PAYMENT_REQUIRED", "انتهت استخداماتك المجانية، ورصيدك ما بيكفي لاستخدام جديد — اشحن محفظتك");
  return q;
}

/** After the work succeeded: a use of the package, or a free use, or the price taken from the wallet. */
export async function recordAiUse(userId: string, kind: string) {
  await prisma.$transaction(async (tx) => {
    const q = await aiQuotaFor(userId);
    if (q.subscription && q.subscription.left > 0) {
      await tx.aiUse.create({ data: { userId, kind, credits: 0, subscriptionId: q.subscription.id } });
      return;
    }
    let credits = 0;
    if (q.freeLeft <= 0 && q.creditsPerUse > 0) {
      try {
        await adjustBalance(tx, userId, -q.creditsPerUse, "AI", `ai:${kind}`);
        credits = q.creditsPerUse;
      } catch (err) {
        if (err instanceof InsufficientBalanceError) return; // it was checked before the work; if the money went meanwhile, the use is on the house
        throw err;
      }
    }
    await tx.aiUse.create({ data: { userId, kind, credits } });
  });
}

/** Buys a package out of the wallet: a new one, or (when one is running) more days and uses on top of it. */
export async function buyAiPackage(userId: string, packageId: string) {
  const settings = await getSettings();
  const pack = settings.ai.packages.find((p) => p.id === packageId);
  if (!pack) throw new ApiError(404, "NOT_FOUND", "الباقة غير موجودة");
  return prisma.$transaction(async (tx) => {
    if (pack.credits > 0) {
      try {
        await adjustBalance(tx, userId, -pack.credits, "AI", `package:${pack.id}`);
      } catch (err) {
        if (err instanceof InsufficientBalanceError) throw new ApiError(402, "PAYMENT_REQUIRED", "رصيدك ما بيكفي لهالباقة — اشحن محفظتك");
        throw err;
      }
    }
    const running = await tx.aiSubscription.findFirst({ where: { userId, endDate: { gt: new Date() } }, orderBy: { endDate: "desc" } });
    const addMs = pack.days * 86_400_000;
    if (running) {
      return tx.aiSubscription.update({ where: { id: running.id }, data: { uses: { increment: pack.uses }, endDate: new Date(running.endDate.getTime() + addMs), name: pack.name, packageId: pack.id } });
    }
    return tx.aiSubscription.create({ data: { userId, packageId: pack.id, name: pack.name, uses: pack.uses, endDate: new Date(Date.now() + addMs) } });
  });
}

/* ---------------- renewing a package by itself ---------------- */

/** Renews one ended package: the same package again from the wallet, starting now. Tells the shop once when the money is not there. */
async function renewOne(old: { id: string; userId: string; packageId: string; renewFailedAt: Date | null }): Promise<"renewed" | "waiting" | "gone"> {
  const settings = await getSettings();
  const pack = settings.ai.packages.find((p) => p.id === old.packageId);
  if (!pack) {
    await prisma.aiSubscription.update({ where: { id: old.id }, data: { renewedAt: new Date(), autoRenew: false } }); // the package is no longer sold
    return "gone";
  }
  try {
    await prisma.$transaction(async (tx) => {
      // claim it first, so two requests at the same moment cannot renew it twice
      const claimed = await tx.aiSubscription.updateMany({ where: { id: old.id, renewedAt: null }, data: { renewedAt: new Date() } });
      if (claimed.count === 0) return;
      if (pack.credits > 0) await adjustBalance(tx, old.userId, -pack.credits, "AI", `renew:${pack.id}`);
      await tx.aiSubscription.create({ data: { userId: old.userId, packageId: pack.id, name: pack.name, uses: pack.uses, endDate: new Date(Date.now() + pack.days * 86_400_000), autoRenew: true } });
    });
    return "renewed";
  } catch (err) {
    if (!(err instanceof InsufficientBalanceError)) throw err;
    if (!old.renewFailedAt) {
      await prisma.aiSubscription.update({ where: { id: old.id }, data: { renewFailedAt: new Date() } });
      await notify({
        userId: old.userId,
        type: "SYSTEM",
        title: "ما انجددت باقة الذكاء الاصطناعي ⚠️",
        body: `رصيدك ما بيكفي لتجديد «${pack.name}». اشحن محفظتك وبتتجدد لحالها.`,
        data: { kind: "AI_RENEW_FAILED" },
      }).catch(() => undefined);
    }
    return "waiting";
  }
}

/** The shop's latest package, when it has ended, wanted renewing and nobody renewed it yet. */
async function renewDueForUser(userId: string) {
  const latest = await prisma.aiSubscription.findFirst({ where: { userId }, orderBy: { endDate: "desc" } });
  if (!latest || !latest.autoRenew || latest.renewedAt || latest.endDate > new Date()) return;
  await renewOne(latest);
}

/** The sweep (hourly, and when a shop looks): every ended package that wants renewing. */
export async function renewAllDueAiPackages(): Promise<number> {
  const due = await prisma.aiSubscription.findMany({ where: { autoRenew: true, renewedAt: null, endDate: { lte: new Date() } }, take: 200 });
  let renewed = 0;
  for (const sub of due) {
    // only a shop's latest package counts (an older one was replaced)
    const newer = await prisma.aiSubscription.findFirst({ where: { userId: sub.userId, endDate: { gt: sub.endDate } } });
    if (newer) { await prisma.aiSubscription.update({ where: { id: sub.id }, data: { renewedAt: new Date() } }); continue; }
    if ((await renewOne(sub)) === "renewed") renewed++;
  }
  return renewed;
}

/** Switches the automatic renewal of the shop's latest package on or off. */
export async function setAiAutoRenew(userId: string, on: boolean) {
  const latest = await prisma.aiSubscription.findFirst({ where: { userId }, orderBy: { endDate: "desc" } });
  if (!latest) throw new ApiError(404, "NOT_FOUND", "ما عندك باقة");
  await prisma.aiSubscription.update({ where: { id: latest.id }, data: { autoRenew: on, ...(on ? { renewFailedAt: null } : {}) } });
}

import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { getSettings } from "./settings.service";
import { adjustBalance, InsufficientBalanceError } from "./wallet.service";

const startOfMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** The shop's running package (the one that ends last), with what is left of its uses; null when there is none. */
async function activeSubscription(userId: string) {
  const sub = await prisma.aiSubscription.findFirst({ where: { userId, endDate: { gt: new Date() } }, orderBy: { endDate: "desc" } });
  if (!sub) return null;
  const used = await prisma.aiUse.count({ where: { subscriptionId: sub.id } });
  return { id: sub.id, name: sub.name, uses: sub.uses, used, left: Math.max(0, sub.uses - used), endDate: sub.endDate };
}

/** What a shop has left: its package, then its free uses this month, then what a use costs; and its wallet balance. */
export async function aiQuotaFor(userId: string) {
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

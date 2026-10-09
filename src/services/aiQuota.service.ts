import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { getSettings } from "./settings.service";
import { adjustBalance, InsufficientBalanceError } from "./wallet.service";

const startOfMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** What a shop has left of its free AI uses this month, what a use costs after that, and its wallet balance. */
export async function aiQuotaFor(userId: string) {
  const [settings, used, wallet] = await Promise.all([
    getSettings(),
    prisma.aiUse.count({ where: { userId, createdAt: { gte: startOfMonth() } } }),
    prisma.wallet.findUnique({ where: { userId } }),
  ]);
  const { freePerMonth, creditsPerUse } = settings.ai;
  return { freePerMonth, used, freeLeft: Math.max(0, freePerMonth - used), creditsPerUse, balance: wallet?.balance ?? 0 };
}

/** Before the work: the shop either has a free use left or can pay for this one. Throws what the app shows. */
export async function ensureCanUseAi(userId: string) {
  const q = await aiQuotaFor(userId);
  if (q.freeLeft > 0) return q;
  if (q.creditsPerUse <= 0) throw new ApiError(403, "AI_QUOTA_USED", "انتهت استخداماتك المجانية للذكاء الاصطناعي هالشهر");
  if (q.balance < q.creditsPerUse) throw new ApiError(402, "PAYMENT_REQUIRED", "انتهت استخداماتك المجانية، ورصيدك ما بيكفي لاستخدام جديد — اشحن محفظتك");
  return q;
}

/** After the work succeeded: one free use is spent, or the price is taken from the wallet. */
export async function recordAiUse(userId: string, kind: string) {
  await prisma.$transaction(async (tx) => {
    const q = await aiQuotaFor(userId);
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

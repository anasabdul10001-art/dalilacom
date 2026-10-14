import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { adjustBalance, InsufficientBalanceError } from "./wallet.service";
import { creditsChargeFor } from "./plan.service";
import { getSettings } from "./settings.service";

/**
 * A shop's store (selling products) opens when it chooses a plan: the free one or a paid one, at the prices the owner sets
 * in the admin panel. While the owner has set no store plan at all, nothing is required.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StorePlanView {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  priceCredits: number | null; // null = the owner has not priced it in credits yet (cannot be chosen)
  free: boolean;
  features: { text: string; included: boolean }[];
}

const activePlans = () => prisma.servicePlan.findMany({ where: { service: "MERCHANT_ACCOUNT", isActive: true }, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }], include: { features: { orderBy: { sortOrder: "asc" } } } });

export async function storePlanRequired(): Promise<boolean> {
  if (process.env.STORE_PLAN === "off") return false; // the tests turn it off (storePlan.test.ts turns it on)
  return (await prisma.servicePlan.count({ where: { service: "MERCHANT_ACCOUNT", isActive: true } })) > 0;
}

export function hasActiveStorePlan(shop: { planId: string | null; planEndsAt: Date | null }): boolean {
  return !!shop.planId && (!shop.planEndsAt || shop.planEndsAt.getTime() > Date.now());
}

/** What the shop sees on its "store" page: the plans with their price, and the plan it has now. */
export async function storePlansFor(shop: { planId: string | null; planEndsAt: Date | null }, countryCode: string | null) {
  const plans = await activePlans();
  const views: StorePlanView[] = [];
  for (const p of plans) {
    const credits = await creditsChargeFor(p, countryCode);
    views.push({
      id: p.id,
      name: p.name,
      description: p.description,
      durationDays: p.durationDays,
      priceCredits: credits ?? null,
      free: credits === 0,
      features: p.features.map((f) => ({ text: f.text, included: f.included })),
    });
  }
  const current = shop.planId ? await prisma.servicePlan.findUnique({ where: { id: shop.planId }, select: { id: true, name: true } }) : null;
  return {
    creditName: (await getSettings()).creditName, // the wallet's unit, for showing prices
    required: plans.length > 0,
    active: plans.length === 0 || hasActiveStorePlan(shop),
    current: current ? { id: current.id, name: current.name, endsAt: shop.planEndsAt } : null,
    plans: views,
  };
}

/** The shop chooses (or renews) a plan: the price comes out of the wallet in the same step; a free plan costs nothing. */
export async function subscribeStorePlan(userId: string, shopId: string, planId: string, countryCode: string | null) {
  const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive || plan.service !== "MERCHANT_ACCOUNT") throw new ApiError(404, "NOT_FOUND", "Plan not found");
  const charge = await creditsChargeFor(plan, countryCode);
  if (charge === null || charge === undefined) throw new ApiError(409, "PLAN_PRICING_NOT_CONFIGURED", "This plan has no price set yet");
  const shop = await prisma.merchantProfile.findUniqueOrThrow({ where: { id: shopId }, select: { planId: true, planEndsAt: true } });
  // the same plan renewed early adds to what is left
  const from = shop.planId === plan.id && shop.planEndsAt && shop.planEndsAt.getTime() > Date.now() ? shop.planEndsAt.getTime() : Date.now();
  try {
    await prisma.$transaction(async (tx) => {
      if (charge > 0) await adjustBalance(tx, userId, -charge, "SUBSCRIPTION", `store:${plan.name}`);
      await tx.merchantProfile.update({ where: { id: shopId }, data: { planId: plan.id, planEndsAt: new Date(from + plan.durationDays * DAY_MS) } });
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw new ApiError(409, "INSUFFICIENT_BALANCE", `Your balance is ${err.balance} and the plan needs ${err.needed}: top up your wallet first`);
    throw err;
  }
}

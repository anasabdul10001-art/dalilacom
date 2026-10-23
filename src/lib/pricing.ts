import { Prisma } from "@prisma/client";

/**
 * Syrian shops price in lira or in dollars, chosen once for the whole shop (and the dollar rate with it). Every cart, order
 * and invoice works in the market currency of the country (lira or dollar, set per country in the admin panel), so when a
 * shop writes its prices in the other one they are converted with the shop's own dollar rate (lira per dollar) and stored next
 * to what the shop typed. When the shop changes its rate or its currency, every product is worked out again at once.
 */
export const PRICE_CURRENCIES = ["SYP", "USD"] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

/** Dollar cents x lira-per-dollar = lira "cents": both sides have 100 minor units. */
export const usdToSyp = (usdCents: number, rate: number) => Math.round(usdCents * rate);
export const sypToUsd = (sypCents: number, rate: number) => Math.round(sypCents / rate);

export const isPriceCurrency = (c: string | null | undefined): c is PriceCurrency => c === "SYP" || c === "USD";
export const otherCurrency = (c: PriceCurrency): PriceCurrency => (c === "SYP" ? "USD" : "SYP");

/** `cents` written in `from`, expressed in `to` with the dollar rate. */
export function convert(cents: number, from: PriceCurrency, to: PriceCurrency, rate: number): number {
  if (from === to) return cents;
  return from === "USD" ? usdToSyp(cents, rate) : sypToUsd(cents, rate);
}

type Shop = { priceCurrency: string | null; usdRateSyp: number | null; showBothCurrencies: boolean };

/** The money the shop writes its prices in: its own choice, else the market currency. */
export const shopMoney = (shop: Pick<Shop, "priceCurrency">, market: string): PriceCurrency | null =>
  isPriceCurrency(shop.priceCurrency) ? shop.priceCurrency : isPriceCurrency(market) ? market : null;

/** What shoppers see: both amounts (when the shop asked for it and has a rate), else the shop's own money. */
export function displayCurrencyOf(shop: Shop, market: string): string {
  if (shop.showBothCurrencies && shop.usdRateSyp) return "BOTH";
  return shopMoney(shop, market) ?? market;
}

/**
 * The columns to store for a price the shop typed in its own money: kept as it is when that is the market currency (or the
 * market is neither lira nor dollar), converted with the shop's rate otherwise. Null when a rate is needed and missing.
 */
export function priceColumns(input: { priceCents: number; memberPriceCents?: number | null }, shop: Shop, market: string) {
  const typed = shopMoney(shop, market);
  if (!typed || !isPriceCurrency(market) || typed === market) {
    return { priceCents: input.priceCents, memberPriceCents: input.memberPriceCents ?? null, enteredPriceCents: null, enteredMemberPriceCents: null };
  }
  if (!shop.usdRateSyp) return null;
  return {
    priceCents: convert(input.priceCents, typed, market, shop.usdRateSyp),
    memberPriceCents: input.memberPriceCents != null ? convert(input.memberPriceCents, typed, market, shop.usdRateSyp) : null,
    enteredPriceCents: input.priceCents,
    enteredMemberPriceCents: input.memberPriceCents ?? null,
  };
}

type PriceRow = { priceCents: number; memberPriceCents: number | null; enteredPriceCents: number | null; enteredMemberPriceCents: number | null };

/** What a shopper sees next to the market amount: the same price in the other of lira / dollar, when it is known. */
export function altView(p: PriceRow, shop: Shop, market: string) {
  if (!isPriceCurrency(market)) return { altCurrency: null, altPriceCents: null, altMemberPriceCents: null };
  const alt = otherCurrency(market);
  if (p.enteredPriceCents != null && shopMoney(shop, market) === alt) return { altCurrency: alt, altPriceCents: p.enteredPriceCents, altMemberPriceCents: p.enteredMemberPriceCents };
  if (!shop.usdRateSyp) return { altCurrency: alt, altPriceCents: null, altMemberPriceCents: null };
  return { altCurrency: alt, altPriceCents: convert(p.priceCents, market, alt, shop.usdRateSyp), altMemberPriceCents: p.memberPriceCents != null ? convert(p.memberPriceCents, market, alt, shop.usdRateSyp) : null };
}

/**
 * The shop changed its money or its rate: every product keeps its worth (a change of money rewrites the typed price in the new
 * money at the old-to-new rate) and gets its market amounts again, so the shop never edits products one by one.
 */
export async function reapplyShopPricing(
  tx: Prisma.TransactionClient,
  merchantId: string,
  change: { from: PriceCurrency; to: PriceCurrency; oldRate: number | null; newRate: number | null },
  market: string,
) {
  if (!isPriceCurrency(market)) return;
  const transitionRate = change.newRate ?? change.oldRate;
  const products = await tx.product.findMany({ where: { merchantId }, select: { id: true, priceCents: true, memberPriceCents: true, enteredPriceCents: true, enteredMemberPriceCents: true } });
  for (const p of products) {
    const typedOld = p.enteredPriceCents ?? p.priceCents;
    const typedOldMember = p.enteredPriceCents != null ? p.enteredMemberPriceCents : p.memberPriceCents;
    const move = (v: number) => (change.from === change.to ? v : convert(v, change.from, change.to, transitionRate!));
    const typed = move(typedOld);
    const typedMember = typedOldMember != null ? move(typedOldMember) : null;
    if (change.to === market) {
      await tx.product.update({ where: { id: p.id }, data: { priceCents: typed, memberPriceCents: typedMember, enteredPriceCents: null, enteredMemberPriceCents: null } });
    } else {
      await tx.product.update({
        where: { id: p.id },
        data: {
          priceCents: convert(typed, change.to, market, change.newRate!),
          memberPriceCents: typedMember != null ? convert(typedMember, change.to, market, change.newRate!) : null,
          enteredPriceCents: typed,
          enteredMemberPriceCents: typedMember,
        },
      });
    }
  }
}

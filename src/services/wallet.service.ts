import { commissionOnSpending } from "./referral.service";
import { Prisma, WalletTxType } from "@prisma/client";

export class InsufficientBalanceError extends Error {
  constructor(public balance: number, public needed: number) {
    super("INSUFFICIENT_BALANCE");
  }
}

/**
 * Every balance change goes through here, inside the caller's transaction, so wallet and ledger never
 * drift. Returns the new balance and the id of the ledger row it wrote, so the caller can reference
 * the payment it just made (e.g. a membership stores which transaction bought it).
 */
export async function adjustBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  type: WalletTxType,
  ref?: string,
): Promise<{ balance: number; transactionId: string }> {
  const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  if (amount < 0 && wallet.balance < -amount) {
    throw new InsufficientBalanceError(wallet.balance, -amount);
  }
  const updated = await tx.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
  const created = await tx.walletTransaction.create({ data: { userId, type, amount, ref } });
  // what a referred person spends earns the marketer who brought him (and the manager above) their share
  if (amount < 0) await commissionOnSpending(tx, userId, -amount, type, ref);
  return { balance: updated.balance, transactionId: created.id };
}

// USDT on the TRON network (TRC20) — official USDT contract.
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRONGRID = process.env.TRONGRID_BASE_URL ?? "https://api.trongrid.io";

export type UsdtCheck =
  | { ok: true; usdAmount: number }
  | { ok: false; reason: "NOT_FOUND" | "NETWORK_ERROR" };

/**
 * Looks for a confirmed USDT transfer with this txid *to the platform's own address* directly on the
 * blockchain (TronGrid). Nothing the user types is trusted except the txid they point us at.
 */
export async function verifyUsdtTransfer(txid: string, platformAddress: string): Promise<UsdtCheck> {
  try {
    const url =
      `${TRONGRID}/v1/accounts/${encodeURIComponent(platformAddress)}/transactions/trc20` +
      `?only_confirmed=true&only_to=true&limit=200&contract_address=${USDT_TRC20_CONTRACT}`;
    const headers: Record<string, string> = {};
    if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
    const res = await fetch(url, { headers });
    if (!res.ok) return { ok: false, reason: "NETWORK_ERROR" };
    const body = (await res.json()) as {
      data?: { transaction_id: string; to: string; value: string; token_info?: { decimals?: number } }[];
    };
    const match = (body.data ?? []).find((t) => t.transaction_id === txid && t.to === platformAddress);
    if (!match) return { ok: false, reason: "NOT_FOUND" };
    const decimals = match.token_info?.decimals ?? 6;
    return { ok: true, usdAmount: Number(match.value) / 10 ** decimals };
  } catch {
    return { ok: false, reason: "NETWORK_ERROR" };
  }
}

/* ---------------- Sham Cash: the transfer is looked up at the provider the owner connected ---------------- */

export const SHAM_CASH = "SHAM_CASH";

/** Automatic checking is on only when the owner has put the provider's address and token in the server settings. */
export const shamCashConfigured = () => !!(process.env.SHAMCASH_API_BASE && process.env.SHAMCASH_API_TOKEN);

/** One spelling per transaction number, so "ab 12" and "AB12" are the same number. */
export const normalizeReference = (reference: string) => reference.replace(/\s+/g, "").toUpperCase();

export type ShamCashCheck =
  | { ok: true; amount?: number; currency?: string }
  | { ok: false; reason: "NOT_FOUND" | "NETWORK_ERROR" };

/**
 * Asks the provider for this transaction number among the incoming transfers of the connected account. Nothing the user types
 * is trusted except the number they point us at; the amount and currency come from the provider (when it reports them).
 */
export async function verifyShamCashTransfer(reference: string): Promise<ShamCashCheck> {
  try {
    const base = (process.env.SHAMCASH_API_BASE ?? "").replace(/\/$/, "");
    const params = new URLSearchParams({ transaction_ids: reference, limit: "5" });
    if (process.env.SHAMCASH_ACCOUNT_ID) params.set("account_id", process.env.SHAMCASH_ACCOUNT_ID);
    const res = await fetch(`${base}/transactions?${params}`, { headers: { Authorization: `Bearer ${process.env.SHAMCASH_API_TOKEN}`, Accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: "NETWORK_ERROR" };
    const body = (await res.json()) as unknown;
    const list = (Array.isArray(body) ? body : ((body as { data?: unknown[]; items?: unknown[]; transactions?: unknown[] }).data ?? (body as { items?: unknown[] }).items ?? (body as { transactions?: unknown[] }).transactions ?? [])) as Record<string, unknown>[];
    const hit = list.find((t) => normalizeReference(String(t.id ?? t.transaction_id ?? t.reference ?? "")) === reference);
    if (!hit) return { ok: false, reason: "NOT_FOUND" };
    const amount = Number(hit.amount ?? hit.value ?? hit.total);
    const currency = String(hit.currency ?? hit.coin ?? hit.coin_id ?? "").toUpperCase();
    return { ok: true, amount: Number.isFinite(amount) && amount > 0 ? amount : undefined, currency: currency || undefined };
  } catch {
    return { ok: false, reason: "NETWORK_ERROR" };
  }
}

/** Credits for what the provider says arrived; null when the amount or the currency cannot be turned into credits safely. */
export function creditsForShamCash(amount: number | undefined, currency: string | undefined, creditsPerUsd: number, sypPerUsd: number): number | null {
  if (!amount) return null;
  const c = (currency ?? "").toUpperCase();
  if (c === "USD" || c === "USDT") return Math.floor(amount * creditsPerUsd);
  if ((c === "SYP" || c === "SYR" || c === "LS") && sypPerUsd > 0) return Math.floor((amount / sypPerUsd) * creditsPerUsd);
  return null;
}

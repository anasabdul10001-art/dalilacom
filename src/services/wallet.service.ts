import { Prisma, WalletTxType } from "@prisma/client";

export class InsufficientBalanceError extends Error {
  constructor(public balance: number, public needed: number) {
    super("INSUFFICIENT_BALANCE");
  }
}

/** Every balance change goes through here, inside the caller's transaction, so wallet and ledger never drift. */
export async function adjustBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  type: WalletTxType,
  ref?: string,
) {
  const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  if (amount < 0 && wallet.balance < -amount) {
    throw new InsufficientBalanceError(wallet.balance, -amount);
  }
  const updated = await tx.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
  await tx.walletTransaction.create({ data: { userId, type, amount, ref } });
  return updated.balance;
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

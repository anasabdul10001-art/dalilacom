import { prisma } from "../prisma";

// Super-admin-managed settings live in PlatformSetting; these defaults apply until the admin sets them.
export interface LocalWallet {
  key: string;
  label: string;
  accountNumber: string;
  instructions?: string;
}

export interface PlatformSettings {
  creditName: string;
  creditsPerUsd: number;
  responder: {
    priceCustomer: number;
    priceMerchant: number;
    periodDays: number;
    trialDays: number;
    monthlyAiReplyLimit: number;
  };
  payment: {
    usdtTrc20Address: string;
    localWallets: LocalWallet[];
  };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  creditName: "دليلكم كوين",
  creditsPerUsd: 100,
  responder: { priceCustomer: 500, priceMerchant: 1000, periodDays: 30, trialDays: 7, monthlyAiReplyLimit: 500 },
  payment: { usdtTrc20Address: "", localWallets: [] },
};

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<PlatformSettings>;
  return {
    creditName: stored.creditName ?? DEFAULT_SETTINGS.creditName,
    creditsPerUsd: stored.creditsPerUsd ?? DEFAULT_SETTINGS.creditsPerUsd,
    responder: { ...DEFAULT_SETTINGS.responder, ...(stored.responder ?? {}) },
    payment: { ...DEFAULT_SETTINGS.payment, ...(stored.payment ?? {}) },
  };
}

export async function saveSettings(patch: Partial<PlatformSettings>) {
  const current = await getSettings();
  const next: PlatformSettings = {
    creditName: patch.creditName ?? current.creditName,
    creditsPerUsd: patch.creditsPerUsd ?? current.creditsPerUsd,
    responder: { ...current.responder, ...(patch.responder ?? {}) },
    payment: { ...current.payment, ...(patch.payment ?? {}) },
  };
  for (const [key, value] of Object.entries(next)) {
    await prisma.platformSetting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } });
  }
  return next;
}

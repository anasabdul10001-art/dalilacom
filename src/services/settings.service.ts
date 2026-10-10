import { prisma } from "../prisma";

// Super-admin-managed settings live in PlatformSetting; these defaults apply until the admin sets them.
export interface LocalWallet {
  key: string;
  label: string;
  accountNumber: string;
  instructions?: string;
}

/** Advertising space in the store: how long a shop may rent it and for how many credits (the admin sets both). */
export interface AdSettings {
  packages: { days: number; credits: number }[];
  /** The same for the big banners: how long and for how many credits (the admin then contacts the shop to make it). */
  bannerPackages: { days: number; credits: number }[];
  /** True = a paid booking is shown at once; false = the admin approves each one first. */
  autoApprove: boolean;
  /** How long each big banner of the store's front page stays before the next one. */
  bannerSeconds: number;
}

/** A monthly AI package a shop can buy: a fixed price in wallet credits for a number of uses over some days. */
export interface AiPackage {
  id: string;
  name: string;
  days: number;
  uses: number;
  credits: number;
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
  /** Merchants' announcements (broadcast.service): what a shop may do when no plan says otherwise. */
  broadcasts: {
    merchantDefaultMonthly: number;
    maxRadiusKm: number;
    merchantMaxAudience: number;
    /** What one announcement costs a shop, in wallet credits, once its plan's included announcements are used (0 = not for sale). */
    pricePerAnnouncement: number;
  };
  ads: AdSettings;
  /** The AI for shops (descriptions from photos, photo editing): free uses per month, then a price in wallet credits. */
  ai: { freePerMonth: number; creditsPerUse: number; packages: AiPackage[] };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  creditName: "دليلكم كوين",
  creditsPerUsd: 100,
  responder: { priceCustomer: 500, priceMerchant: 1000, periodDays: 30, trialDays: 7, monthlyAiReplyLimit: 500 },
  payment: { usdtTrc20Address: "", localWallets: [] },
  broadcasts: { merchantDefaultMonthly: 10, maxRadiusKm: 50, merchantMaxAudience: 2000, pricePerAnnouncement: 0 },
  ads: {
    packages: [
      { days: 1, credits: 300 },
      { days: 2, credits: 500 },
      { days: 3, credits: 700 },
      { days: 5, credits: 1000 },
    ],
    bannerPackages: [
      { days: 1, credits: 1500 },
      { days: 3, credits: 3500 },
      { days: 7, credits: 7000 },
    ],
    autoApprove: false,
    bannerSeconds: 5,
  },
  ai: {
    freePerMonth: 10,
    creditsPerUse: 5,
    packages: [
      { id: "basic", name: "الباقة الأساسية", days: 30, uses: 100, credits: 1500 },
      { id: "pro", name: "الباقة الاحترافية", days: 30, uses: 400, credits: 4000 },
    ],
  },
};

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<PlatformSettings>;
  return {
    creditName: stored.creditName ?? DEFAULT_SETTINGS.creditName,
    creditsPerUsd: stored.creditsPerUsd ?? DEFAULT_SETTINGS.creditsPerUsd,
    responder: { ...DEFAULT_SETTINGS.responder, ...(stored.responder ?? {}) },
    payment: { ...DEFAULT_SETTINGS.payment, ...(stored.payment ?? {}) },
    broadcasts: { ...DEFAULT_SETTINGS.broadcasts, ...(stored.broadcasts ?? {}) },
    ads: { ...DEFAULT_SETTINGS.ads, ...(stored.ads ?? {}) },
    ai: { ...DEFAULT_SETTINGS.ai, ...(stored.ai ?? {}) },
  };
}

export async function saveSettings(patch: Partial<PlatformSettings>) {
  const current = await getSettings();
  const next: PlatformSettings = {
    creditName: patch.creditName ?? current.creditName,
    creditsPerUsd: patch.creditsPerUsd ?? current.creditsPerUsd,
    responder: { ...current.responder, ...(patch.responder ?? {}) },
    payment: { ...current.payment, ...(patch.payment ?? {}) },
    broadcasts: { ...current.broadcasts, ...(patch.broadcasts ?? {}) },
    ads: { ...current.ads, ...(patch.ads ?? {}) },
    ai: { ...current.ai, ...(patch.ai ?? {}) },
  };
  for (const [key, value] of Object.entries(next)) {
    await prisma.platformSetting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } });
  }
  return next;
}

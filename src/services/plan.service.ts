import { Prisma, ServiceKind } from "@prisma/client";
import { prisma } from "../prisma";
import { getSettings } from "./settings.service";
import { DEFAULT_LANGUAGE } from "../lib/languages";
import { translateText } from "../i18n";

/**
 * The pricing catalogue (sections 24/60/64).
 *
 * `ServicePlan` is the single source of truth for every sellable service: membership plans, merchant
 * plans and any future add-on. Two deliberate exceptions live here instead of in the table:
 *
 * - The auto-responder prices still come from `PlatformSetting` (where the responder flow reads them),
 *   so the catalogue *renders* them as read-only entries rather than duplicating them and drifting.
 * - A country price override (`PlanPrice`) is an exception, not a copy: a plan with no row for the
 *   customer's country falls back to the plan's own `priceCredits`.
 */

export interface CatalogFeature {
  text: string;
  included: boolean;
}

export interface CatalogPlan {
  id: string;
  service: ServiceKind;
  name: string;
  description: string | null;
  durationDays: number;
  trialDays: number;
  /** What the wallet is debited for this customer right now (country override applied). */
  priceCredits: number | null;
  /** The plan's own price, shown when a country override is active so the UI can explain the difference. */
  basePriceCredits: number | null;
  priceFrom: "country" | "default";
  cashAmountCents: number;
  currency: string;
  monthlyBroadcastLimit: number | null;
  features: CatalogFeature[];
  /** "settings" = read-only entry derived from the auto-responder settings, not the catalogue table. */
  source: "catalog" | "settings";
  editable: boolean;
}

export interface CatalogService {
  service: ServiceKind;
  plans: CatalogPlan[];
}

export interface Catalog {
  creditName: string;
  creditsPerUsd: number;
  /** The country the prices were resolved for (the account's own, or what the client asked for). */
  countryCode: string | null;
  services: CatalogService[];
}

/** Every service the pricing page can list, in display order. */
const SERVICE_ORDER: ServiceKind[] = ["MEMBERSHIP", "MERCHANT_ACCOUNT", "RESPONDER_CUSTOMER", "RESPONDER_MERCHANT"];

/** A plan row plus its country overrides, exactly as the catalogue query returns it. */
type PlanWithPrices = Prisma.ServicePlanGetPayload<{ include: { prices: true } }>;

function priceFor(plan: PlanWithPrices, countryId: string | null) {
  const override = countryId ? plan.prices.find((p) => p.countryId === countryId) : undefined;
  if (!override) {
    return {
      priceCredits: plan.priceCredits,
      cashAmountCents: plan.priceCents,
      currency: plan.currency,
      priceFrom: "default" as const,
    };
  }
  return {
    priceCredits: override.priceCredits,
    cashAmountCents: override.cashAmountCents ?? plan.priceCents,
    currency: override.currencyCode ?? plan.currency,
    priceFrom: "country" as const,
  };
}

/**
 * The whole catalogue, with prices resolved for one country.
 * `countryCode` is an ISO-2 code (the signed-in account's own, or the client's guess for guests).
 */
export async function getCatalog(countryCode: string | null, lang: string = DEFAULT_LANGUAGE): Promise<Catalog> {
  const settings = await getSettings();
  const country = countryCode
    ? await prisma.country.findUnique({ where: { isoCode2: countryCode.toUpperCase() }, select: { id: true } })
    : null;

  const plans = await prisma.servicePlan.findMany({
    where: { isActive: true },
    orderBy: [{ service: "asc" }, { sortOrder: "asc" }, { priceCredits: "asc" }],
    include: {
      features: { orderBy: { sortOrder: "asc" } },
      prices: { where: { isActive: true } },
    },
  });

  const fromCatalog: CatalogPlan[] = plans.map((plan) => {
    const price = priceFor(plan, country?.id ?? null);
    return {
      id: plan.id,
      service: plan.service,
      name: plan.name,
      description: plan.description,
      durationDays: plan.durationDays,
      trialDays: plan.trialDays,
      priceCredits: price.priceCredits,
      basePriceCredits: plan.priceCredits,
      priceFrom: price.priceFrom,
      cashAmountCents: price.cashAmountCents,
      currency: price.currency,
      monthlyBroadcastLimit: plan.monthlyBroadcastLimit,
      features: plan.features.map((f) => ({ text: f.text, included: f.included })),
      source: "catalog",
      editable: true,
    };
  });

  // The auto-responder still lives in the settings (its purchase flow reads them), so it is rendered
  // here read-only from that single source instead of being copied into the catalogue.
  const responder = settings.responder;
  const responderFeature: CatalogFeature[] =
    responder.monthlyAiReplyLimit > 0
      ? [{ text: translateText(`${responder.monthlyAiReplyLimit} رد ذكاء اصطناعي شهريًا`, lang), included: true }]
      : [];
  const fromSettings = (service: ServiceKind, priceCredits: number, name: string): CatalogPlan => ({
    id: `settings:${service}`,
    service,
    name,
    description: null,
    durationDays: responder.periodDays,
    trialDays: responder.trialDays,
    priceCredits,
    basePriceCredits: priceCredits,
    priceFrom: "default",
    cashAmountCents: 0,
    currency: "EUR",
    monthlyBroadcastLimit: null,
    features: responderFeature,
    source: "settings",
    editable: false,
  });

  const all = [
    ...fromCatalog,
    fromSettings("RESPONDER_CUSTOMER", responder.priceCustomer, translateText("المجيب الآلي — زبون", lang)),
    fromSettings("RESPONDER_MERCHANT", responder.priceMerchant, translateText("المجيب الآلي — تاجر", lang)),
  ];

  const services: CatalogService[] = SERVICE_ORDER.map((service) => ({
    service,
    plans: all.filter((p) => p.service === service),
  })).filter((group) => group.plans.length > 0);

  return {
    creditName: translateText(settings.creditName, lang),
    creditsPerUsd: settings.creditsPerUsd,
    countryCode: countryCode ? countryCode.toUpperCase() : null,
    services,
  };
}

/** Everything an admin screen needs in one call: all services, features and country overrides. */
export async function listPlansForAdmin() {
  return prisma.servicePlan.findMany({
    orderBy: [{ service: "asc" }, { sortOrder: "asc" }, { priceCents: "asc" }],
    include: {
      features: { orderBy: { sortOrder: "asc" } },
      prices: { include: { country: { select: { isoCode2: true, name: true, currencyCode: true } } }, orderBy: { countryId: "asc" } },
      _count: { select: { memberships: true } },
    },
  });
}

export class PlanInUseError extends Error {
  constructor(public memberships: number) {
    super("PLAN_IN_USE");
  }
}

export async function deletePlan(id: string): Promise<void> {
  const memberships = await prisma.membership.count({ where: { planId: id } });
  if (memberships > 0) throw new PlanInUseError(memberships);
  await prisma.servicePlan.delete({ where: { id } });
}

/** Replaces a plan's specification list in one shot (the admin UI submits the whole list). */
export async function replaceFeatures(planId: string, features: CatalogFeature[]) {
  await prisma.$transaction([
    prisma.planFeature.deleteMany({ where: { planId } }),
    prisma.planFeature.createMany({
      data: features.map((f, index) => ({ planId, text: f.text, included: f.included, sortOrder: index })),
    }),
  ]);
  return prisma.planFeature.findMany({ where: { planId }, orderBy: { sortOrder: "asc" } });
}

export interface CountryPriceInput {
  countryId: string;
  priceCredits: number;
  cashAmountCents?: number | null;
  currencyCode?: string | null;
  isActive?: boolean;
}

export async function replacePrices(planId: string, prices: CountryPriceInput[]) {
  await prisma.$transaction([
    prisma.planPrice.deleteMany({ where: { planId } }),
    prisma.planPrice.createMany({
      data: prices.map((p) => ({
        planId,
        countryId: p.countryId,
        priceCredits: p.priceCredits,
        cashAmountCents: p.cashAmountCents ?? null,
        currencyCode: p.currencyCode ?? null,
        isActive: p.isActive ?? true,
      })),
    }),
  ]);
  return prisma.planPrice.findMany({ where: { planId }, include: { country: { select: { isoCode2: true } } } });
}

export function listTaxRates() {
  return prisma.taxRate.findMany({
    include: { country: { select: { isoCode2: true, name: true, currencyCode: true } } },
    orderBy: [{ countryId: "asc" }],
  });
}

/**
 * Creates or updates one rate. A row with no country is the platform default (used for customers whose
 * country has no rate of its own), which is why `isDefault` is derived rather than typed by hand.
 */
export async function upsertTaxRate(input: { countryId?: string | null; name: string; percentBps: number }) {
  const countryId = input.countryId ?? null;
  const isDefault = countryId === null;
  const existing = await prisma.taxRate.findFirst({ where: { countryId } });
  if (existing) {
    return prisma.taxRate.update({ where: { id: existing.id }, data: { name: input.name, percentBps: input.percentBps, isDefault } });
  }
  return prisma.taxRate.create({ data: { countryId, name: input.name, percentBps: input.percentBps, isDefault } });
}

export function deleteTaxRate(id: string) {
  return prisma.taxRate.delete({ where: { id } });
}

/**
 * What subscribing to [plan] costs in wallet credits for a customer in [countryCode]: the country's active
 * override when there is one (the same price the pricing page shows), otherwise the plan's own price.
 * Returns null when the plan costs money but nobody has priced it in credits yet — the caller must refuse
 * rather than invent an exchange rate. A plan priced 0 is free.
 */
export async function creditsChargeFor(
  plan: { id: string; priceCents: number; priceCredits: number | null },
  countryCode: string | null,
): Promise<number | null> {
  if (countryCode) {
    const country = await prisma.country.findUnique({ where: { isoCode2: countryCode.toUpperCase() }, select: { id: true } });
    if (country) {
      const override = await prisma.planPrice.findFirst({ where: { planId: plan.id, countryId: country.id, isActive: true } });
      if (override) return override.priceCredits;
    }
  }
  return plan.priceCents > 0 ? plan.priceCredits : 0;
}

/** The rate that applies to a customer in `countryCode`, falling back to the platform default. */
export async function taxRateFor(countryCode: string | null) {
  if (countryCode) {
    const country = await prisma.country.findUnique({ where: { isoCode2: countryCode.toUpperCase() }, select: { id: true } });
    if (country) {
      const own = await prisma.taxRate.findFirst({ where: { countryId: country.id } });
      if (own) return own;
    }
  }
  return prisma.taxRate.findFirst({ where: { countryId: null } });
}

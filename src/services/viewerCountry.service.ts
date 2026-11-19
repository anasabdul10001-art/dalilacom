import type { Request } from "express";
import { prisma } from "../prisma";
import { verifyAuthToken } from "../utils/jwt";

/** The money of a country's shoppers (its ISO 4217 code, set per country in the admin panel); euros when the country is not configured. */
export async function currencyOf(countryCode: string): Promise<string> {
  const country = await prisma.country.findUnique({ where: { isoCode2: countryCode }, select: { currencyCode: true } });
  return country?.currencyCode ?? "EUR";
}

/** The money a shop's prices are kept in: the currency of its owner's country (the platform's first country when unknown). */
export async function marketOfUser(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { countryCode: true } });
  return currencyOf(u?.countryCode ?? DEFAULT_COUNTRY);
}

let marketCache: { at: number; only: string | null } | null = null;

/** The one country the platform serves, or null when more than one is set up (cached for half a minute). */
export async function onlyCountry(): Promise<string | null> {
  if (marketCache && Date.now() - marketCache.at < 30_000) return marketCache.only;
  const countries = await prisma.country.findMany({ where: { isActive: true }, select: { isoCode2: true }, take: 2 });
  marketCache = { at: Date.now(), only: countries.length === 1 ? countries[0].isoCode2.toUpperCase() : null };
  return marketCache.only;
}

/** For tests: forget what was learned about how many countries there are. */
export function resetMarketCache() {
  marketCache = null;
  activeCache = null;
}

/** The signed-in person's id when the request carries a valid token, otherwise null (for pages that also work for visitors). */
export async function optionalUserId(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = verifyAuthToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, tokenVersion: true, isDisabled: true } });
    return user && user.tokenVersion === payload.tokenVersion && !user.isDisabled ? user.id : null;
  } catch {
    return null;
  }
}

/** The country the platform serves first; also where an account or a visitor whose country cannot be told is placed. */
export const DEFAULT_COUNTRY = "SY";

export interface IpPlace { code: string | null; city: string | null; latitude: number | null; longitude: number | null }
const lookups = new Map<string, { place: IpPlace; at: number }>();
const LOOKUP_TTL_MS = 6 * 3600_000;
const LOOKUP_MAX = 5000;

const iso2 = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : null);

const isPrivate = (ip: string) =>
  !ip || ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(ip.replace(/^::ffff:/, ""));

/** The country and town an internet address belongs to (a free lookup, cached); null when it cannot be told. */
export async function locateIp(ip: string): Promise<IpPlace | null> {
  if (process.env.NODE_ENV === "test" || isPrivate(ip)) return null;
  const hit = lookups.get(ip);
  if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.place;
  let place: IpPlace;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,city,latitude,longitude`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { success?: boolean; country_code?: string; city?: string; latitude?: number; longitude?: number };
    place = body.success
      ? { code: iso2(body.country_code), city: body.city?.trim() || null, latitude: Number.isFinite(body.latitude) ? body.latitude! : null, longitude: Number.isFinite(body.longitude) ? body.longitude! : null }
      : { code: null, city: null, latitude: null, longitude: null };
  } catch {
    return null; // not cached: try again next time
  }
  if (lookups.size >= LOOKUP_MAX) lookups.clear();
  lookups.set(ip, { place, at: Date.now() });
  return place;
}

async function countryOfIp(ip: string): Promise<string | null> {
  return (await locateIp(ip))?.code ?? null;
}

let activeCache: { at: number; codes: Set<string> } | null = null;
/** True when the country is one the platform lists (cached for a minute); a visitor's own choice is only honoured for those. */
async function isListedCountry(code: string): Promise<boolean> {
  if (!activeCache || Date.now() - activeCache.at > 60_000) {
    const rows = await prisma.country.findMany({ where: { isActive: true }, select: { isoCode2: true } });
    activeCache = { at: Date.now(), codes: new Set(rows.map((r) => r.isoCode2.toUpperCase())) };
  }
  return activeCache.codes.has(code);
}

/**
 * Whose market a person belongs to. Their account's country when it has one; otherwise wherever they are
 * connecting from (a visitor from Syria is a Syrian shopper even before choosing a country); otherwise the
 * platform's first country. Shoppers only ever see their own country's shops.
 */
export async function viewerCountry(req: Request): Promise<string> {
  // While the platform serves a single country, everyone belongs to it: there is no other market to keep apart. The moment
  // a second country is added in the admin panel, shoppers are told apart by country again.
  const only = await onlyCountry();
  if (only) return only;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAuthToken(header.slice(7));
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { countryCode: true } });
      const own = iso2(user?.countryCode);
      if (own) return own;
    } catch {
      /* an expired or invalid token is simply a visitor */
    }
  }
  // a visitor who picked a country in the app says so with every request; it beats guessing from the connection
  const chosen = iso2(req.headers["x-viewer-country"]);
  if (chosen && (await isListedCountry(chosen))) return chosen;
  const fromEdge = iso2(req.headers["cf-ipcountry"]) ?? iso2(req.headers["x-country-code"]);
  if (fromEdge && fromEdge !== "XX" && fromEdge !== "T1") return fromEdge;
  return (await countryOfIp(req.ip ?? "")) ?? DEFAULT_COUNTRY;
}

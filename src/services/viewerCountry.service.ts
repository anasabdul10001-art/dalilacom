import type { Request } from "express";
import { prisma } from "../prisma";
import { verifyAuthToken } from "../utils/jwt";

/** The country the platform serves first; also where an account or a visitor whose country cannot be told is placed. */
export const DEFAULT_COUNTRY = "SY";

const lookups = new Map<string, { code: string | null; at: number }>();
const LOOKUP_TTL_MS = 6 * 3600_000;
const LOOKUP_MAX = 5000;

const iso2 = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : null);

const isPrivate = (ip: string) =>
  !ip || ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(ip.replace(/^::ffff:/, ""));

/** The country an internet address belongs to (a free lookup, cached); null when it cannot be told. */
async function countryOfIp(ip: string): Promise<string | null> {
  if (process.env.NODE_ENV === "test" || isPrivate(ip)) return null;
  const hit = lookups.get(ip);
  if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.code;
  let code: string | null = null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { success?: boolean; country_code?: string };
    if (body.success) code = iso2(body.country_code);
  } catch {
    return null; // not cached: try again next time
  }
  if (lookups.size >= LOOKUP_MAX) lookups.clear();
  lookups.set(ip, { code, at: Date.now() });
  return code;
}

/**
 * Whose market a person belongs to. Their account's country when it has one; otherwise wherever they are
 * connecting from (a visitor from Syria is a Syrian shopper even before choosing a country); otherwise the
 * platform's first country. Shoppers only ever see their own country's shops.
 */
export async function viewerCountry(req: Request): Promise<string> {
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
  const fromEdge = iso2(req.headers["cf-ipcountry"]) ?? iso2(req.headers["x-country-code"]);
  if (fromEdge && fromEdge !== "XX" && fromEdge !== "T1") return fromEdge;
  return (await countryOfIp(req.ip ?? "")) ?? DEFAULT_COUNTRY;
}

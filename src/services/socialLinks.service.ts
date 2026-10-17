import { prisma } from "../prisma";

/**
 * The links of Dalilacom's own social media pages (and of the app's page on Google Play, shown with them). The owner sets them in the admin panel, each with a switch to show or hide it;
 * the website, the Android app and the e-mails show only the ones that are switched on and have an address.
 */
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "youtube", "tiktok", "googleplay"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  visible: boolean;
}

const KEY = "socialLinks";

/** The domains each platform's address may be on: a link to anywhere else is refused (so a typo cannot send people to a stranger). */
const HOSTS: Record<SocialPlatform, string[]> = {
  facebook: ["facebook.com", "fb.com", "fb.me"],
  instagram: ["instagram.com", "instagr.am"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  googleplay: ["play.google.com"],
};

const DEFAULTS: SocialLink[] = [
  { platform: "facebook", url: "https://www.facebook.com/Dalilacomsy", visible: true },
  { platform: "instagram", url: "", visible: false },
  { platform: "youtube", url: "", visible: false },
  { platform: "tiktok", url: "", visible: false },
  { platform: "googleplay", url: "", visible: false },
];

export class SocialLinkError extends Error {}

/** A clean https address on the platform's own domain; "" clears it. Throws SocialLinkError for anything else. */
export function normalizeSocialUrl(platform: SocialPlatform, raw: string): string {
  let text = (raw ?? "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) text = "https://" + text.replace(/^\/+/, "");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SocialLinkError("INVALID_URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SocialLinkError("INVALID_URL");
  const host = url.hostname.toLowerCase();
  if (!HOSTS[platform].some((h) => host === h || host.endsWith("." + h))) throw new SocialLinkError("WRONG_DOMAIN");
  url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

/** All four platforms, as stored (or the defaults). */
export async function getSocialLinks(): Promise<SocialLink[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const stored = Array.isArray(row?.value) ? (row!.value as unknown as Partial<SocialLink>[]) : null;
  return DEFAULTS.map((d) => {
    const s = stored?.find((x) => x?.platform === d.platform);
    return s ? { platform: d.platform, url: typeof s.url === "string" ? s.url : d.url, visible: !!s.visible } : d;
  });
}

/** Saves the links the admin sent; a link can be shown only when it has an address. */
export async function saveSocialLinks(input: { platform: SocialPlatform; url: string; visible: boolean }[]): Promise<SocialLink[]> {
  const current = await getSocialLinks();
  const next = current.map((c) => {
    const given = input.find((i) => i.platform === c.platform);
    if (!given) return c;
    const url = normalizeSocialUrl(c.platform, given.url);
    return { platform: c.platform, url, visible: given.visible && url !== "" };
  });
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value: next as object[] }, create: { key: KEY, value: next as object[] } });
  cache = { at: Date.now(), links: next.filter((l) => l.visible && l.url).map(({ platform, url }) => ({ platform, url })) };
  return next;
}

/** What everyone may see: only the links that are switched on. */
export async function getVisibleSocialLinks(): Promise<{ platform: SocialPlatform; url: string }[]> {
  return (await getSocialLinks()).filter((l) => l.visible && l.url).map(({ platform, url }) => ({ platform, url }));
}

let cache: { at: number; links: { platform: SocialPlatform; url: string }[] } | null = null;
let refreshing = false;

function refresh() {
  if (refreshing) return;
  refreshing = true;
  getVisibleSocialLinks()
    .then((links) => { cache = { at: Date.now(), links }; })
    .catch(() => {})
    .finally(() => { refreshing = false; });
}

/**
 * The visible links as last read, at once (no waiting): the e-mails use it, and an e-mail must go out immediately. It is
 * read at start and again when older than a minute (the next mail then has the new links); saving the links updates it.
 */
export function socialLinksSnapshot(): { platform: SocialPlatform; url: string }[] {
  if (!cache || Date.now() - cache.at > 60_000) refresh();
  return cache?.links ?? [];
}

refresh();

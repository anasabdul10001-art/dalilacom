import crypto from "crypto";
import { ChannelDriver } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptJson, encryptJson } from "./crypto.service";
import { drivers } from "./channels";

/**
 * "Log in with Facebook" for connecting a merchant's Page to the auto-responder (sections 7/23).
 *
 * The merchant never sees or pastes a Page token: we open Facebook's OAuth dialog, and this module
 * turns the returned `code` into the Pages they administer plus their Page tokens. The tokens are
 * only ever stored encrypted (crypto.service) and only ever travel in an Authorization header.
 *
 * Nothing here works without a Meta developer app: META_APP_ID and META_APP_SECRET must be set, and
 * the app must have the scopes below approved by Meta for real users. Until then the endpoints answer
 * META_NOT_CONFIGURED instead of pretending to connect.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
const SESSION_TTL_MINUTES = 15;
const STATE_TTL_MINUTES = 15;

/** Matches what the drivers actually do: read the Page, subscribe webhooks, answer DMs and comments. */
const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
];

export interface MetaPage {
  id: string;
  name: string;
  pageAccessToken: string;
  instagramAccountId?: string;
  instagramUsername?: string;
}

/** A failure the route layer turns into a status code + error code instead of a 500. */
export class MetaOAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const metaAppId = (): string | undefined => process.env.META_APP_ID || undefined;
export const metaAppSecret = (): string | undefined => process.env.META_APP_SECRET || undefined;

/** Both halves of the app are required; the secret alone only verifies webhooks. */
export function metaOAuthConfigured(): boolean {
  return Boolean(metaAppId() && metaAppSecret());
}

export function metaRedirectUri(): string {
  const explicit = process.env.META_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  return `${(process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "")}/responder/meta/oauth/callback`;
}

export function metaScopes(): string[] {
  const override = process.env.META_OAUTH_SCOPES?.split(/[,\s]+/).filter(Boolean);
  return override && override.length > 0 ? override : DEFAULT_SCOPES;
}

/** Where the browser sends the merchant back to at the end. The Android app registers this scheme. */
export function appDeepLink(params: Record<string, string> = {}): string {
  const scheme = process.env.APP_DEEP_LINK_SCHEME || "dalilacom";
  const query = new URLSearchParams(params).toString();
  return `${scheme}://responder/meta${query ? `?${query}` : ""}`;
}

/* ---------------- state: proves the callback belongs to the merchant who started the flow ---------------- */

function sign(value: string): string {
  return crypto.createHmac("sha256", metaAppSecret() ?? "").update(value).digest("base64url");
}

export function signState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, n: crypto.randomBytes(8).toString("hex"), t: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId the flow was started for, or null when the state is forged, altered or stale. */
export function verifyState(state: string | undefined): string | null {
  if (!state) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; t?: unknown };
    if (typeof data.u !== "string" || typeof data.t !== "number") return null;
    if (Date.now() - data.t > STATE_TTL_MINUTES * 60 * 1000) return null;
    return data.u;
  } catch {
    return null;
  }
}

/** The picker links live in a browser with no app token, so the handle + page are signed instead. */
export function signPickerToken(sessionId: string, pageId: string, driver: ChannelDriver): string {
  return sign(`${sessionId}|${pageId}|${driver}`);
}

export function verifyPickerToken(sessionId: string, pageId: string, driver: ChannelDriver, token: string | undefined): boolean {
  if (!token) return false;
  const expected = signPickerToken(sessionId, pageId, driver);
  return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/* ---------------- Facebook itself ---------------- */

export function metaDialogUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: metaAppId() ?? "",
    redirect_uri: metaRedirectUri(),
    state: signState(userId),
    response_type: "code",
    scope: metaScopes().join(","),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new MetaOAuthError("META_API_ERROR", `Meta: ${data?.error?.message ?? res.status}`, 502);
  return data as T;
}

/**
 * code -> short-lived user token -> long-lived user token -> the Pages that token administers.
 * Page tokens obtained from a long-lived user token do not expire on their own, which is what makes
 * this connection durable.
 */
export async function exchangeCodeForPages(code: string): Promise<MetaPage[]> {
  const appId = metaAppId();
  const appSecret = metaAppSecret();
  if (!appId || !appSecret) throw new MetaOAuthError("META_NOT_CONFIGURED", "تطبيق Meta غير مضبوط", 503);

  const short = await graphGet<{ access_token?: string }>("oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: metaRedirectUri(),
    code,
  });
  if (!short.access_token) throw new MetaOAuthError("META_TOKEN_EXCHANGE_FAILED", "تعذّر تبديل الكود بتوكن", 502);

  const long = await graphGet<{ access_token?: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: short.access_token,
  });
  const userToken = long.access_token ?? short.access_token;

  const accounts = await graphGet<{ data?: any[] }>("me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100",
    access_token: userToken,
  });

  return (accounts.data ?? [])
    .filter((p) => p?.id && p?.access_token)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      pageAccessToken: String(p.access_token),
      instagramAccountId: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : undefined,
      instagramUsername: p.instagram_business_account?.username ? String(p.instagram_business_account.username) : undefined,
    }));
}

/* ---------------- sessions: from "just logged in" to "one Page connected" ---------------- */

export async function createSession(userId: string, pages: MetaPage[]): Promise<string> {
  const session = await prisma.metaOAuthSession.create({
    data: {
      userId,
      pagesEnc: encryptJson({ pages }),
      expiresAt: new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000),
    },
  });
  return session.id;
}

/** Pages discovered for this session, or null when it is unknown, expired, used, or someone else's. */
export async function readSession(sessionId: string, userId: string): Promise<MetaPage[] | null> {
  const session = await prisma.metaOAuthSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) return null;
  if (session.consumedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  try {
    return decryptJson<{ pages: MetaPage[] }>(session.pagesEnc).pages ?? [];
  } catch {
    return null;
  }
}

/**
 * Creates the connection for the chosen Page (or its linked Instagram account) and consumes the
 * session. Reuses the same driver `register()` as the manual flow, so the Page is verified against
 * its token and subscribed to our webhook exactly the same way.
 */
export async function connectFromSession(opts: {
  userId: string;
  sessionId: string;
  pageId: string;
  driver: ChannelDriver;
}): Promise<{ id: string; externalAccountId: string | null }> {
  const pages = await readSession(opts.sessionId, opts.userId);
  if (!pages) throw new MetaOAuthError("SESSION_INVALID", "انتهت صلاحية الربط — ارجع وجرّب من جديد", 409);

  const page = pages.find((p) => p.id === opts.pageId);
  if (!page) throw new MetaOAuthError("PAGE_NOT_FOUND", "ما لقينا هي الصفحة بحسابك", 404);

  const channel = await prisma.socialChannel.findFirst({ where: { driver: opts.driver, isEnabled: true } });
  if (!channel) throw new MetaOAuthError("CHANNEL_UNAVAILABLE", "هي القناة غير متاحة", 404);

  let credentials: Record<string, string>;
  if (opts.driver === "INSTAGRAM") {
    if (!page.instagramAccountId) throw new MetaOAuthError("NO_INSTAGRAM_ACCOUNT", "هي الصفحة ما فيها حساب إنستغرام تجاري مربوط", 400);
    credentials = { instagramAccountId: page.instagramAccountId, pageId: page.id, pageAccessToken: page.pageAccessToken };
  } else {
    credentials = { pageId: page.id, pageAccessToken: page.pageAccessToken };
  }

  const driver = drivers[opts.driver];
  const invalid = driver.validateCredentials(credentials);
  if (invalid) throw new MetaOAuthError("BAD_REQUEST", invalid, 400);

  const hookToken = crypto.randomBytes(24).toString("hex");
  const ctx = { credentials, hookToken, channelConfig: channel.config as Record<string, any> };

  let externalAccountId: string | undefined;
  try {
    externalAccountId = (await driver.register?.(ctx))?.externalAccountId;
  } catch (err) {
    throw new MetaOAuthError("CHANNEL_CONNECT_FAILED", err instanceof Error ? err.message : "تعذّر ربط الصفحة", 400);
  }

  // One Meta page/account feeds exactly one connection, otherwise a comment would be answered twice.
  if (externalAccountId) {
    const taken = await prisma.channelConnection.findFirst({
      where: { externalAccountId, channel: { driver: opts.driver } },
    });
    if (taken) throw new MetaOAuthError("CONFLICT", "هالحساب مربوط من قبل", 409);
  }

  const connection = await prisma.channelConnection.create({
    data: {
      userId: opts.userId,
      channelId: channel.id,
      credentialsEnc: encryptJson(credentials),
      externalAccountId,
      hookToken,
    },
  });

  await prisma.metaOAuthSession.update({ where: { id: opts.sessionId }, data: { consumedAt: new Date() } });
  return { id: connection.id, externalAccountId: connection.externalAccountId };
}

import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Role, User } from "@prisma/client";
import { prisma } from "../prisma";
import { generateRawToken, hashToken } from "./token.service";
import { isSupportedLanguage } from "../lib/languages";

/**
 * "Continue with Google / Facebook". The server runs the whole OAuth exchange (authorization-code flow), so the apps and
 * the web page only open a link and receive a one-time ticket back — no SDKs, no provider secrets on any client.
 *
 * Instagram is deliberately absent: Meta no longer offers Instagram sign-in for ordinary people (only for business accounts).
 */
export type SocialProvider = "GOOGLE" | "FACEBOOK";
export type SocialPlatform = "web" | "app";

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  profile: (accessToken: string) => Promise<SocialProfile | null>;
}

export interface SocialProfile {
  id: string;
  email: string | null;
  /** The provider vouches that the person controls this address. */
  emailVerified: boolean;
  name: string;
}

export class SocialError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const PROVIDERS: Record<SocialProvider, ProviderConfig> = {
  GOOGLE: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID || undefined,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET || undefined,
    profile: async (accessToken) => {
      const data = await getJson("https://openidconnect.googleapis.com/v1/userinfo", { Authorization: `Bearer ${accessToken}` });
      if (!data || typeof data.sub !== "string") return null;
      return {
        id: data.sub,
        email: typeof data.email === "string" ? data.email.toLowerCase() : null,
        emailVerified: data.email_verified === true,
        name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Dalilacom user",
      };
    },
  },
  FACEBOOK: {
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scope: "email,public_profile",
    // The same Meta app that links Pages for the auto-responder can serve Facebook Login.
    clientId: () => process.env.FACEBOOK_LOGIN_APP_ID || process.env.META_APP_ID || undefined,
    clientSecret: () => process.env.FACEBOOK_LOGIN_APP_SECRET || process.env.META_APP_SECRET || undefined,
    profile: async (accessToken) => {
      const data = await getJson(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
      if (!data || typeof data.id !== "string") return null;
      if (typeof data.email !== "string") {
        // Say why in the server log (permission states only, nothing personal): declined, never asked, or an account with no email.
        const perms = await getJson(`https://graph.facebook.com/me/permissions?access_token=${encodeURIComponent(accessToken)}`);
        const list = Array.isArray(perms?.data) ? (perms!.data as Array<{ permission?: string; status?: string }>) : [];
        console.warn("Facebook sign-in without an email — permissions:", list.map((p) => `${p.permission}=${p.status}`).join(", ") || "unreadable", "| profile keys:", Object.keys(data).join(","));
      }
      return {
        id: data.id,
        email: typeof data.email === "string" ? data.email.toLowerCase() : null,
        // Facebook gives no "verified" flag for the address, so it is never used to take over an existing account.
        emailVerified: false,
        name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Dalilacom user",
      };
    },
  },
};

export function parseProvider(value: string): SocialProvider | null {
  const upper = value.toUpperCase();
  return upper === "GOOGLE" || upper === "FACEBOOK" ? upper : null;
}

export function isProviderConfigured(provider: SocialProvider): boolean {
  const config = PROVIDERS[provider];
  return !!config.clientId() && !!config.clientSecret();
}

export function configuredProviders(): Record<"google" | "facebook", boolean> {
  return { google: isProviderConfigured("GOOGLE"), facebook: isProviderConfigured("FACEBOOK") };
}

const redirectUri = (provider: SocialProvider) => `${process.env.PUBLIC_BASE_URL ?? ""}/auth/social/${provider.toLowerCase()}/callback`;

interface StatePayload {
  p: SocialProvider;
  pl: SocialPlatform;
  n: string; // also kept in a cookie: the browser that finishes the flow must be the one that started it
  lang?: string;
}

const signState = (payload: StatePayload) => jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: "10m" });

export function readState(state: string): StatePayload | null {
  try {
    return jwt.verify(state, process.env.JWT_SECRET as string) as StatePayload;
  } catch {
    return null;
  }
}

/** Where to send the browser to sign in at the provider, plus the nonce to keep in a cookie. */
export function startLogin(provider: SocialProvider, platform: SocialPlatform, lang?: string): { url: string; nonce: string } {
  const config = PROVIDERS[provider];
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signState({ p: provider, pl: platform, n: nonce, lang: lang && isSupportedLanguage(lang) ? lang : undefined });
  const query = new URLSearchParams({
    client_id: config.clientId() as string,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: config.scope,
    state,
  });
  if (provider === "GOOGLE") query.set("prompt", "select_account");
  // Facebook remembers a declined permission and never asks again, which leaves the sign-in without an email (we need one).
  // "rerequest" asks again for exactly what was declined, and shows nothing when everything was already granted.
  if (provider === "FACEBOOK") query.set("auth_type", "rerequest");
  return { url: `${config.authorizeUrl}?${query.toString()}`, nonce };
}

/** The authorization code in exchange for the person's profile at the provider. */
export async function fetchProfile(provider: SocialProvider, code: string): Promise<SocialProfile> {
  const config = PROVIDERS[provider];
  let accessToken: string | undefined;
  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId() as string,
        client_secret: config.clientSecret() as string,
        redirect_uri: redirectUri(provider),
        grant_type: "authorization_code",
      }).toString(),
    });
    if (res.ok) accessToken = ((await res.json()) as { access_token?: string }).access_token;
  } catch {
    /* handled below */
  }
  if (!accessToken) throw new SocialError("PROVIDER_REJECTED", "The sign-in was not accepted");
  const profile = await config.profile(accessToken);
  if (!profile) throw new SocialError("PROVIDER_REJECTED", "Could not read the account");
  return profile;
}

/**
 * Finds or creates the Dalilacom account for this outside account.
 *  - Seen before → that account.
 *  - Provider-verified email of an existing account → linked. If that account's own email was never verified (anyone may
 *    have registered with someone else's address), its password is discarded first: whoever proves the address owns it.
 *  - Unverified email of an existing account (Facebook) → refused: sign in the usual way first.
 *  - Otherwise a new customer account with an unusable password.
 */
export async function resolveUser(provider: SocialProvider, profile: SocialProfile, lang?: string): Promise<User> {
  const known = await prisma.socialIdentity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.id } },
    include: { user: true },
  });
  if (known) {
    if (known.user.isDisabled) throw new SocialError("ACCOUNT_DISABLED", "This account is disabled");
    return known.user;
  }
  if (!profile.email) throw new SocialError("NO_EMAIL", "The account did not share an email address");

  const existing = await prisma.user.findUnique({ where: { email: profile.email } });
  const link = (userId: string) => prisma.socialIdentity.create({ data: { userId, provider, providerUserId: profile.id, email: profile.email } });

  if (existing) {
    if (existing.isDisabled) throw new SocialError("ACCOUNT_DISABLED", "This account is disabled");
    if (!profile.emailVerified) throw new SocialError("EMAIL_IN_USE", "An account with this email already exists — sign in with your password first");
    let user = existing;
    if (!existing.isEmailVerified) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await unusablePassword(), isEmailVerified: true, tokenVersion: { increment: 1 } },
      });
    }
    await link(user.id);
    return user;
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      passwordHash: await unusablePassword(),
      fullName: profile.name,
      role: Role.CUSTOMER,
      isEmailVerified: profile.emailVerified,
      ...(lang && isSupportedLanguage(lang) ? { language: lang } : {}),
    },
  });
  await link(user.id);
  return user;
}

/** A password nobody knows: the account signs in through the provider (or resets its password by email). */
async function unusablePassword(): Promise<string> {
  return bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
}

const TICKET_TTL_MS = 60 * 1000;

export async function createTicket(userId: string): Promise<string> {
  const { raw, hash } = generateRawToken();
  await prisma.loginTicket.create({ data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + TICKET_TTL_MS) } });
  return raw;
}

/** Spends the ticket (once) and returns whose it was; null when unknown, used or expired. */
export async function redeemTicket(raw: string): Promise<User | null> {
  const hash = hashToken(raw);
  const claimed = await prisma.loginTicket.updateMany({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return null;
  const ticket = await prisma.loginTicket.findUnique({ where: { tokenHash: hash }, include: { user: true } });
  return ticket && !ticket.user.isDisabled ? ticket.user : null;
}

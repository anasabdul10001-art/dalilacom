import { Router, Response } from "express";
import { z } from "zod";
import { sendError, sendValidationError } from "../lib/apiError";
import { signAuthToken } from "../utils/jwt";
import { logSecurityEvent } from "../services/securityEvent.service";
import { issueVerificationToken, sendVerificationEmail } from "./auth.routes";
import { socialLoginRateLimiter } from "../middleware/rateLimit";
import {
  configuredProviders,
  createTicket,
  completeWithEmail,
  fetchProfile,
  isProviderConfigured,
  parseProvider,
  readPending,
  readState,
  redeemTicket,
  resolveUser,
  signPending,
  SocialError,
  SocialPlatform,
  startLogin,
} from "../services/social.service";

/** "Continue with Google / Facebook" — see social.service for how the flow works. */
export const socialRouter = Router();

const NONCE_COOKIE = "dlk_social_nonce";

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Back to the web page or the app, carrying either a one-time ticket or the reason it did not work. */
function finish(res: Response, platform: SocialPlatform, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  res.clearCookie(NONCE_COOKIE, { path: "/auth/social" });
  res.redirect(platform === "app" ? `dalilacom://auth/social?${query}` : `/app/?${query}`);
}

/** Which buttons to show: only providers the server has keys for. */
socialRouter.get("/providers", (_req, res) => {
  res.json(configuredProviders());
});

const startSchema = z.object({ platform: z.enum(["web", "app"]).default("web"), lang: z.string().max(5).optional() });

socialRouter.get("/:provider/start", socialLoginRateLimiter, (req, res) => {
  const provider = parseProvider(req.params.provider);
  if (!provider) return sendError(res, 404, "NOT_FOUND", "Unknown sign-in provider");
  const parsed = startSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (!isProviderConfigured(provider)) return sendError(res, 404, "SOCIAL_NOT_CONFIGURED", "This sign-in method is not enabled yet");

  const { url, nonce } = startLogin(provider, parsed.data.platform, parsed.data.lang);
  res.cookie(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000, path: "/auth/social" });
  res.redirect(url);
});

socialRouter.get("/:provider/callback", socialLoginRateLimiter, async (req, res) => {
  const provider = parseProvider(req.params.provider);
  const state = typeof req.query.state === "string" ? readState(req.query.state) : null;
  if (!provider || !state || state.p !== provider) return sendError(res, 400, "BAD_STATE", "The sign-in link is not valid or has expired");
  // the browser that comes back must be the one that left
  if (cookieValue(req.headers.cookie, NONCE_COOKIE) !== state.n) return finish(res, state.pl, { social_error: "BAD_STATE" });

  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code) return finish(res, state.pl, { social_error: "CANCELLED" }); // the person said no, or the provider refused

  let profile: Awaited<ReturnType<typeof fetchProfile>> | undefined;
  try {
    profile = await fetchProfile(provider, code);
    const user = await resolveUser(provider, profile, state.lang);
    await logSecurityEvent({ userId: user.id, type: "LOGIN_SUCCESS", req, metadata: { via: provider } });
    finish(res, state.pl, { ticket: await createTicket(user.id) });
  } catch (err) {
    if (err instanceof SocialError) {
      // The provider gave no email: let the person type one instead of turning them away.
      if (err.code === "NO_EMAIL" && profile) return finish(res, state.pl, { social_pending: signPending(provider, profile, state.lang), name: profile.name });
      return finish(res, state.pl, { social_error: err.code });
    }
    throw err;
  }
});

const completeSchema = z.object({ pending: z.string().min(20).max(2000), email: z.string().trim().toLowerCase().email().max(200) });

/** The person typed the email the provider did not give us: make the account and sign in (the address is confirmed by mail). */
socialRouter.post("/complete", socialLoginRateLimiter, async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const pending = readPending(parsed.data.pending);
  if (!pending) return sendError(res, 400, "BAD_STATE", "The sign-in link is not valid or has expired");
  try {
    const { user, created } = await completeWithEmail(pending, parsed.data.email);
    if (created) await sendVerificationEmail(user.email, await issueVerificationToken(user.id), user.language ?? undefined);
    await logSecurityEvent({ userId: user.id, type: "LOGIN_SUCCESS", req, metadata: { via: pending.p, emailTyped: true } });
    const token = signAuthToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, emailVerified: user.isEmailVerified } });
  } catch (err) {
    if (err instanceof SocialError) {
      const status = err.code === "EMAIL_IN_USE" ? 409 : 403;
      return sendError(res, status, err.code, err.message);
    }
    throw err;
  }
});

const exchangeSchema = z.object({ ticket: z.string().min(16).max(200) });

/** The app/web page trades its one-time ticket for a normal session — the same answer as a password login. */
socialRouter.post("/exchange", socialLoginRateLimiter, async (req, res) => {
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const user = await redeemTicket(parsed.data.ticket);
  if (!user) return sendError(res, 401, "TICKET_INVALID", "The sign-in expired — try again");
  const token = signAuthToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, emailVerified: user.isEmailVerified } });
});

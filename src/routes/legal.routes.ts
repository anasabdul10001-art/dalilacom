import crypto from "crypto";
import express, { Router } from "express";
import { sendError } from "../lib/apiError";
import { unlinkFacebook } from "../services/accountDeletion.service";

/**
 * What Meta requires of every app that offers Facebook sign-in: a "deauthorize" callback (the person removed the app)
 * and a "data deletion request" callback. Facebook posts a signed_request signed with the app secret; anything not signed
 * by it is refused.
 */
export const legalRouter = Router();
legalRouter.use(express.urlencoded({ extended: false }));

const base64url = (text: string) => Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** The Facebook user id inside a signed request, or null when the signature is not ours. */
export function parseSignedRequest(signed: unknown, secret: string | undefined): string | null {
  if (typeof signed !== "string" || !secret) return null;
  const [signature, payload] = signed.split(".");
  if (!signature || !payload) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const given = base64url(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(base64url(payload).toString("utf8")) as { user_id?: string };
    return data.user_id ? String(data.user_id) : null;
  } catch {
    return null;
  }
}

const appSecret = () => process.env.FACEBOOK_LOGIN_APP_SECRET || process.env.META_APP_SECRET;

legalRouter.post("/facebook/deauthorize", async (req, res) => {
  const facebookId = parseSignedRequest(req.body?.signed_request, appSecret());
  if (!facebookId) return sendError(res, 400, "BAD_REQUEST", "Invalid signed request");
  await unlinkFacebook(facebookId);
  res.json({ ok: true });
});

legalRouter.post("/facebook/data-deletion", async (req, res) => {
  const facebookId = parseSignedRequest(req.body?.signed_request, appSecret());
  if (!facebookId) return sendError(res, 400, "BAD_REQUEST", "Invalid signed request");
  await unlinkFacebook(facebookId);
  // The code is what the person is shown on the status page; it carries nothing about them.
  const code = crypto.randomBytes(8).toString("hex");
  const base = process.env.PUBLIC_BASE_URL ?? "";
  res.json({ url: `${base}/data-deletion.html?code=${code}`, confirmation_code: code });
});

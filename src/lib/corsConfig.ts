import cors from "cors";
import { NextFunction, Request, Response } from "express";
import { sendError } from "./apiError";

function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface OriginPolicy {
  allowedOrigins: string[];
  isProduction: boolean;
}

/**
 * Origin allowlist driven by CORS_ALLOWED_ORIGINS (comma-separated) — never a hardcoded production
 * domain (section: CORS). Allowed: no Origin header (native/Android, server-to-server, curl),
 * the server's OWN origin, anything in the allowlist, and — outside production only — anything
 * when the allowlist is empty.
 *
 * The server's own origin must always pass: browsers attach `Origin` to same-origin POST/PUT/DELETE
 * requests, so without this the pages this server hosts (public/app, public/admin.html) could not
 * register, log in or save anything in production.
 */
export function isOriginAllowed(
  request: { origin: string | undefined; host: string | undefined; protocol: string },
  policy: OriginPolicy,
): boolean {
  const { origin, host, protocol } = request;
  if (!origin) return true;
  if (host && origin === `${protocol}://${host}`) return true;
  if (policy.allowedOrigins.includes(origin)) return true;
  return !policy.isProduction && policy.allowedOrigins.length === 0;
}

const policy: OriginPolicy = {
  allowedOrigins: parseOrigins(process.env.CORS_ALLOWED_ORIGINS),
  isProduction: process.env.NODE_ENV === "production",
};

const reflect = cors({ origin: true, credentials: true });

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isOriginAllowed({ origin: req.header("origin"), host: req.get("host"), protocol: req.protocol }, policy)) {
    return sendError(res, 403, "CORS_FORBIDDEN", "Origin not allowed");
  }
  return reflect(req, res, next);
}

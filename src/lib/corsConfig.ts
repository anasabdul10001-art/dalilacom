import { CorsOptions } from "cors";

function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedOrigins = parseOrigins(process.env.CORS_ALLOWED_ORIGINS);
const isProduction = process.env.NODE_ENV === "production";

/**
 * Origin allowlist driven entirely by CORS_ALLOWED_ORIGINS (comma-separated) — never a
 * hardcoded production domain (section: CORS). Requests with no Origin header (native/Android,
 * server-to-server webhooks, curl) are always allowed since CORS only governs browsers.
 *
 * In development, an empty allowlist falls back to permissive (reflect the caller's origin) so
 * local work isn't blocked. In production, an empty allowlist means no cross-origin *browser*
 * request is allowed until CORS_ALLOWED_ORIGINS is actually set — same-origin pages served by
 * this same server (public/app, public/admin.html) are unaffected either way, since same-origin
 * fetches never go through CORS at all.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProduction && allowedOrigins.length === 0) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

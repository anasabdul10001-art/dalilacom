import rateLimit from "express-rate-limit";
import { sendError } from "../lib/apiError";
import { logSecurityEvent } from "../services/securityEvent.service";

/**
 * Builds a rate limiter whose limit/window are configurable via env vars (never hardcoded —
 * section: Rate Limiting). E.g. name="AUTH_LOGIN" reads AUTH_LOGIN_RATE_LIMIT (max requests)
 * and AUTH_LOGIN_RATE_WINDOW_MINUTES (window size), falling back to the given defaults.
 */
function makeLimiter(name: string, defaultMax: number, defaultWindowMinutes: number) {
  const max = Number(process.env[`${name}_RATE_LIMIT`] ?? defaultMax);
  const windowMs = Number(process.env[`${name}_RATE_WINDOW_MINUTES`] ?? defaultWindowMinutes) * 60 * 1000;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logSecurityEvent({ type: "RATE_LIMIT_EXCEEDED", req, metadata: { route: name } }).catch(() => {});
      sendError(res, 429, "RATE_LIMITED", "عدد المحاولات تجاوز الحد المسموح، حاول لاحقًا");
    },
  });
}

export const loginRateLimiter = makeLimiter("AUTH_LOGIN", 10, 15);
export const registerRateLimiter = makeLimiter("AUTH_REGISTER", 10, 60);
export const forgotPasswordRateLimiter = makeLimiter("AUTH_FORGOT_PASSWORD", 5, 15);
export const resetPasswordRateLimiter = makeLimiter("AUTH_RESET_PASSWORD", 10, 15);
export const verifyEmailRateLimiter = makeLimiter("AUTH_VERIFY_EMAIL", 20, 15);
export const resendVerificationRateLimiter = makeLimiter("AUTH_RESEND_VERIFICATION", 5, 15);
export const qrRedeemRateLimiter = makeLimiter("QR_REDEEM", 30, 1);
export const qrVerifyRateLimiter = makeLimiter("QR_VERIFY", 60, 1);

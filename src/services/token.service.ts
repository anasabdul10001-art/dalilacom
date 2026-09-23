import crypto from "crypto";

/**
 * Generates a cryptographically random single-use token. Only `hash` is ever persisted
 * (SHA-256, one-way) — `raw` goes out in the email link and is never stored anywhere.
 */
export function generateRawToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

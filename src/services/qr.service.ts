import crypto from "crypto";

const TTL_SECONDS = Number(process.env.QR_TOKEN_TTL_SECONDS ?? 30);

export interface QrPayload {
  m: string; // memberNumber
  c: string; // rotating code
}

function currentTimeStep(): bigint {
  return BigInt(Math.floor(Date.now() / 1000 / TTL_SECONDS));
}

function codeForStep(qrSecret: string, timeStep: bigint): string {
  const hmac = crypto.createHmac("sha256", qrSecret);
  hmac.update(timeStep.toString());
  const digest = hmac.digest();
  // Dynamic truncation (RFC 4226 style) into a 6-digit decimal code.
  const offset = digest[digest.length - 1] & 0x0f;
  const binCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binCode % 1_000_000).padStart(6, "0");
}

/** Generates the current rotating code for a membership's QR / manual-entry display. */
export function generateCurrentCode(qrSecret: string): { code: string; expiresInSeconds: number } {
  const step = currentTimeStep();
  const secondsIntoStep = Math.floor(Date.now() / 1000) % TTL_SECONDS;
  return {
    code: codeForStep(qrSecret, step),
    expiresInSeconds: TTL_SECONDS - secondsIntoStep,
  };
}

/**
 * Validates a presented code against the last 3 time steps (tolerance for clock drift / scan delay).
 * Returns the matched time step (to be used for replay protection) or null if invalid.
 */
export function findMatchingTimeStep(
  qrSecret: string,
  presentedCode: string,
  lastRedeemedTimeStep: bigint | null,
): bigint | null {
  if (!/^\d{6}$/.test(presentedCode)) {
    return null;
  }
  const current = currentTimeStep();
  for (const delta of [0n, -1n, 1n]) {
    const step = current + delta;
    if (lastRedeemedTimeStep !== null && step <= lastRedeemedTimeStep) {
      continue; // already redeemed at or before this step — reject to prevent replay
    }
    const expected = codeForStep(qrSecret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(presentedCode))) {
      return step;
    }
  }
  return null;
}

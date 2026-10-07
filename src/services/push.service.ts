import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

/**
 * Push notifications to phones through Firebase Cloud Messaging (HTTP v1).
 *
 * Needs one secret on the server: FIREBASE_SERVICE_ACCOUNT_JSON — the whole service-account key file
 * (Firebase console -> Project settings -> Service accounts -> Generate new private key) pasted as one
 * environment variable. It is never sent to a client. Without it nothing here does anything: the inbox
 * and email keep working and no call is made, so a deploy without Firebase is perfectly fine.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushMessage {
  title: string;
  body?: string | null;
  /** Everything is sent as strings (an FCM requirement); the app reads e.g. data.orderId. */
  data?: Record<string, unknown>;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Must match the channel the Android app creates, or the phone drops the notification. */
export const ANDROID_CHANNEL_ID = "dalilacom_default";

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      // Env vars often hold the key with literal "\n" sequences instead of real newlines.
      return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
    }
  } catch {
    /* fall through: a malformed value is treated as "not configured" */
  }
  return null;
}

export function isPushConfigured(): boolean {
  return serviceAccount() !== null;
}

let cachedToken: { value: string; expiresAt: number; account: string } | null = null;

/** A Google OAuth access token for the service account, reused until a minute before it expires. */
async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.account === account.client_email && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }, account.private_key, { algorithm: "RS256" });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, account: account.client_email };
  return json.access_token;
}

export function resetPushTokenCache() {
  cachedToken = null;
}

function stringifyData(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

/** FCM answers 404 UNREGISTERED (app uninstalled / token rotated) or 400 INVALID_ARGUMENT for a dead token. */
function isDeadToken(status: number, body: string): boolean {
  return status === 404 || (status === 400 && body.includes("INVALID_ARGUMENT")) || body.includes("UNREGISTERED");
}

/**
 * Sends [message] to every device of [userId]. Best-effort by design: it never throws, a dead token is
 * removed so it is not retried forever, and one failing device does not stop the others.
 * Returns how many devices accepted the message.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<number> {
  const account = serviceAccount();
  if (!account) return 0;

  try {
    const devices = await prisma.deviceToken.findMany({ where: { userId }, select: { id: true, token: true } });
    if (!devices.length) return 0;
    const bearer = await accessToken(account);
    let delivered = 0;

    for (const device of devices) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: message.title, ...(message.body ? { body: message.body } : {}) },
              data: stringifyData(message.data),
              android: { priority: "HIGH", notification: { channel_id: ANDROID_CHANNEL_ID } },
            },
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          delivered++;
        } else if (isDeadToken(res.status, await res.text().catch(() => ""))) {
          await prisma.deviceToken.deleteMany({ where: { id: device.id } });
        }
      } catch {
        /* this device failed (timeout/network); try the rest */
      }
    }
    return delivered;
  } catch {
    return 0;
  }
}

/* ---------------- devices ---------------- */

/** Registers (or re-points) a phone's FCM token for this account. */
export async function registerDevice(userId: string, token: string, platform = "android") {
  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    // A token seen again — possibly after a different account signed in on the same phone — belongs to the latest signed-in user.
    update: { userId, platform, lastSeenAt: new Date() },
    select: { id: true },
  });
}

export async function unregisterDevice(userId: string, token: string): Promise<boolean> {
  // Scoped by user: nobody can unregister another account's phone.
  const res = await prisma.deviceToken.deleteMany({ where: { userId, token } });
  return res.count > 0;
}

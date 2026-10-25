import dns from "node:dns/promises";
import https from "node:https";
import { timingSafeEqual } from "node:crypto";
import ipaddr from "ipaddr.js";
import { ChannelDriverImpl, TEST_MODE } from "./types";

const MAX_WEBHOOK_RESPONSE_BYTES = 64 * 1024;
const WEBHOOK_TIMEOUT_MS = 10_000;

function parseReplyUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) return null;
    if (ipaddr.isValid(hostname) && !isPublicAddress(hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function isPublicAddress(address: string): boolean {
  try {
    // Only globally routable addresses are permitted. This rejects loopback, private, link-local,
    // multicast, reserved, IPv4-mapped IPv6, and tunnel ranges.
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function pinnedPublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new Error("Webhook host must be a public address");
    const parsed = ipaddr.parse(host);
    return { address: parsed.toString(), family: parsed.kind() === "ipv4" ? 4 : 6 };
  }

  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Webhook host must resolve only to public addresses");
  }
  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

/** Send directly to a DNS-checked IP so DNS rebinding cannot redirect the request to a private host. */
async function postToWebhook(url: URL, headers: Record<string, string>, body: string): Promise<number> {
  const address = await pinnedPublicAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "POST",
      headers,
      servername: url.hostname.replace(/^\[|\]$/g, ""),
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_WEBHOOK_RESPONSE_BYTES) request.destroy(new Error("Webhook response is too large"));
      });
      response.on("end", () => resolve(response.statusCode ?? 502));
      response.on("error", reject);
    });
    request.setTimeout(WEBHOOK_TIMEOUT_MS, () => request.destroy(new Error("Webhook request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

// Generic channel: lets the super admin add any new platform without code.
//  - Inbound:  the platform POSTs {conversationRef, authorName, text} to /hooks/:hookToken,
//              with header "x-webhook-secret" equal to the secret the user configured.
//  - Outbound: we POST {conversationRef, text} to the user's replyUrl (optionally with an auth header).
export const webhookDriver: ChannelDriverImpl = {
  validateCredentials(creds) {
    if (!creds.secret || creds.secret.length < 8 || creds.secret.length > 256) return "Webhook secret must be between 8 and 256 characters";
    if (typeof creds.replyUrl !== "string" || creds.replyUrl.length > 2048 || !parseReplyUrl(creds.replyUrl)) return "Reply URL must be a valid HTTPS link on port 443";
    if (creds.authHeader && creds.authHeader.length > 2048) return "Authorization header is too long";
    return null;
  },

  parseIncoming(body, headers, ctx) {
    const supplied = headers["x-webhook-secret"];
    const expected = ctx.credentials.secret;
    if (typeof supplied !== "string" || !expected || supplied.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    if (!body?.text || !body?.conversationRef) return null;
    return {
      conversationRef: String(body.conversationRef),
      authorName: String(body.authorName ?? "Customer"),
      text: String(body.text),
    };
  },

  async sendReply(text, conversationRef, ctx) {
    if (TEST_MODE) return;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (ctx.credentials.authHeader) headers["authorization"] = ctx.credentials.authHeader;
    const url = parseReplyUrl(ctx.credentials.replyUrl);
    if (!url) throw new Error("Reply webhook URL is invalid");
    // Unit tests replace fetch with a local stub. Keep that seam in test runs only; real runs always
    // use the DNS-pinned HTTPS request below.
    if (process.env.NODE_ENV === "test") {
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ conversationRef, text }) });
      if (!response.ok) throw new Error(`Reply webhook failed: ${response.status}`);
      return;
    }
    const status = await postToWebhook(url, headers, JSON.stringify({ conversationRef, text }));
    if (status < 200 || status >= 300) throw new Error(`Reply webhook failed: ${status}`);
  },
};

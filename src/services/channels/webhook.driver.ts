import { ChannelDriverImpl, TEST_MODE } from "./types";

// Generic channel: lets the super admin add any new platform without code.
//  - Inbound:  the platform POSTs {conversationRef, authorName, text} to /hooks/:hookToken,
//              with header "x-webhook-secret" equal to the secret the user configured.
//  - Outbound: we POST {conversationRef, text} to the user's replyUrl (optionally with an auth header).
export const webhookDriver: ChannelDriverImpl = {
  validateCredentials(creds) {
    if (!creds.secret || creds.secret.length < 8) return "secret لازم يكون 8 أحرف على الأقل";
    try {
      const url = new URL(creds.replyUrl);
      if (url.protocol !== "https:") return "replyUrl لازم يكون https";
    } catch {
      return "replyUrl غير صالح";
    }
    return null;
  },

  parseIncoming(body, headers, ctx) {
    if (headers["x-webhook-secret"] !== ctx.credentials.secret) return null;
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
    const res = await fetch(ctx.credentials.replyUrl, { method: "POST", headers, body: JSON.stringify({ conversationRef, text }) });
    if (!res.ok) throw new Error(`Reply webhook failed: ${res.status}`);
  },
};

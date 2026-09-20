import crypto from "crypto";
import { ChannelDriverImpl, DriverContext, TEST_MODE } from "./types";

// Telegram Bot API — works immediately with a bot token from @BotFather, no platform approval needed.
export function telegramSecret(hookToken: string): string {
  return crypto.createHash("sha256").update(`tg:${hookToken}`).digest("hex").slice(0, 32);
}

export const telegramDriver: ChannelDriverImpl = {
  validateCredentials(creds) {
    return /^\d+:[\w-]{20,}$/.test(creds.botToken ?? "") ? null : "botToken غير صالح (متل 123456:ABC...)";
  },

  parseIncoming(body, headers, ctx) {
    if (headers["x-telegram-bot-api-secret-token"] !== telegramSecret(ctx.hookToken)) return null;
    const msg = body?.message;
    if (!msg?.text || !msg.chat?.id) return null;
    const from = msg.from ?? {};
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram user";
    return { conversationRef: String(msg.chat.id), authorName: name, text: msg.text };
  },

  async sendReply(text, conversationRef, ctx) {
    if (TEST_MODE) return;
    const res = await fetch(`https://api.telegram.org/bot${ctx.credentials.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: conversationRef, text }),
    });
    if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
  },

  async register(ctx) {
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) throw new Error("PUBLIC_BASE_URL is not configured on the server");
    if (TEST_MODE) return { externalAccountId: "test-bot" };
    const api = `https://api.telegram.org/bot${ctx.credentials.botToken}`;
    const set = await fetch(`${api}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `${base}/hooks/${ctx.hookToken}`,
        secret_token: telegramSecret(ctx.hookToken),
        allowed_updates: ["message"],
      }),
    });
    const setBody = (await set.json()) as { ok?: boolean; description?: string };
    if (!setBody.ok) throw new Error(setBody.description ?? "Telegram rejected the webhook");
    const me = (await (await fetch(`${api}/getMe`)).json()) as { result?: { username?: string } };
    return { externalAccountId: me.result?.username };
  },
};

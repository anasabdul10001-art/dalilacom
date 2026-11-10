import crypto from "crypto";
import { ChannelDriverImpl, DriverContext, IncomingMessage, PostSummary } from "./types";

// WhatsApp still goes through Meta's review before it can read or send anything, so that channel stays
// in the catalogue but cannot be connected — it fails loudly instead of pretending to work.
export const metaPendingDriver: ChannelDriverImpl = {
  validateCredentials() {
    return "هالقناة بانتظار ربط تطبيق Meta والموافقة عليه — لسا مو متاحة";
  },
  parseIncoming() {
    return null;
  },
  async sendReply() {
    throw new Error("Meta channels are not connected yet");
  },
};

/* ---------------- Facebook Pages & Instagram (Meta Graph API) ---------------- */

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v21.0"}`;

async function graph<T = any>(path: string, token: string, init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown }): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: init?.method ?? "GET",
    // The token travels in a header, never in the URL, so it can't end up in access logs.
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`Meta: ${data?.error?.message ?? res.status}`);
  return data as T;
}

function validateMetaCredentials(needsInstagram: boolean) {
  return (creds: Record<string, string>): string | null => {
    if (!/^\d{5,}$/.test(creds.pageId ?? "")) return "pageId غير صالح (أرقام فقط)";
    if (needsInstagram && !/^\d{5,}$/.test(creds.instagramAccountId ?? "")) return "instagramAccountId غير صالح (أرقام فقط)";
    if ((creds.pageAccessToken ?? "").length < 20) return "pageAccessToken غير صالح";
    return null;
  };
}

/** Replies to a comment, or sends a DM, depending on what the conversationRef points at. */
async function replyViaMeta(kind: "facebook" | "instagram", text: string, ref: string, ctx: DriverContext) {
  const token = ctx.credentials.pageAccessToken;
  const split = ref.indexOf(":");
  const type = ref.slice(0, split);
  const id = ref.slice(split + 1);
  if (type === "comment") {
    await graph(`${id}/${kind === "facebook" ? "comments" : "replies"}`, token, { method: "POST", body: { message: text } });
  } else {
    await graph(`${ctx.credentials.pageId}/messages`, token, {
      method: "POST",
      body: { recipient: { id }, messaging_type: "RESPONSE", message: { text } },
    });
  }
}

async function subscribePage(pageId: string, token: string) {
  // Best effort: the user may also (or instead) subscribe the page from the Meta dashboard.
  await graph(`${pageId}/subscribed_apps`, token, { method: "POST", body: { subscribed_fields: ["feed", "messages"] } }).catch(() => undefined);
}

/** Stops Facebook from delivering this Page's messages and comments to our app. Best effort: the connection is deleted regardless. */
async function unsubscribePage(pageId: string, token: string) {
  await graph(`${pageId}/subscribed_apps`, token, { method: "DELETE" }).catch(() => undefined);
}

export const facebookDriver: ChannelDriverImpl = {
  validateCredentials: validateMetaCredentials(false),
  parseIncoming: () => null, // Meta posts to the single app-level /hooks/meta endpoint, parsed by parseMetaWebhook()
  sendReply: (text, ref, ctx) => replyViaMeta("facebook", text, ref, ctx),

  async register(ctx) {
    const { pageId, pageAccessToken } = ctx.credentials;
    const page = await graph<{ id: string; name?: string }>(`${pageId}?fields=id,name`, pageAccessToken);
    if (page.id !== pageId) throw new Error("الـpageId ما بيطابق الـtoken");
    await subscribePage(pageId, pageAccessToken);
    return { externalAccountId: pageId, accountName: page.name };
  },

  async listPosts(ctx): Promise<PostSummary[]> {
    const data = await graph<{ data?: any[] }>(
      `${ctx.credentials.pageId}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=25`,
      ctx.credentials.pageAccessToken,
    );
    return (data.data ?? []).map((p) => ({
      id: p.id,
      text: p.message ?? "(منشور بدون نص)",
      createdAt: p.created_time,
      url: p.permalink_url,
      image: p.full_picture,
    }));
  },

  async unregister(ctx) {
    await unsubscribePage(ctx.credentials.pageId, ctx.credentials.pageAccessToken);
  },

  /** Everything the Page itself states: its about text, address, contact details, hours and what it posted. */
  async describe(ctx): Promise<string> {
    const { pageId, pageAccessToken } = ctx.credentials;
    const page = await graph<any>(
      `${pageId}?fields=name,about,description,category,phone,website,emails,single_line_address,hours,price_range`,
      pageAccessToken,
    ).catch(() => ({}));
    const hours = page.hours ? clip(JSON.stringify(page.hours), 300) : "";
    const lines = [
      page.name ? `Page: ${clip(page.name, 120)}${page.category ? ` (${clip(page.category, 80)})` : ""}` : "",
      page.about ? `About: ${clip(page.about)}` : "",
      page.description ? `Description: ${clip(page.description, 800)}` : "",
      page.single_line_address ? `Address: ${clip(page.single_line_address, 200)}` : "",
      page.phone ? `Phone: ${clip(page.phone, 40)}` : "",
      page.website ? `Website: ${clip(page.website, 200)}` : "",
      Array.isArray(page.emails) && page.emails.length ? `Email: ${clip(page.emails[0], 120)}` : "",
      page.price_range ? `Price range: ${clip(page.price_range, 40)}` : "",
      hours ? `Opening hours: ${hours}` : "",
      ...postLines(await facebookDriver.listPosts!(ctx).catch(() => [])),
    ].filter(Boolean);
    return lines.join("\n");
  },
};

export const instagramDriver: ChannelDriverImpl = {
  validateCredentials: validateMetaCredentials(true),
  parseIncoming: () => null,
  sendReply: (text, ref, ctx) => replyViaMeta("instagram", text, ref, ctx),

  async register(ctx) {
    const { pageId, instagramAccountId, pageAccessToken } = ctx.credentials;
    const account = await graph<{ id: string; username?: string }>(`${instagramAccountId}?fields=id,username`, pageAccessToken);
    if (account.id !== instagramAccountId) throw new Error("حساب إنستغرام ما بيطابق الـtoken");
    await subscribePage(pageId, pageAccessToken);
    return { externalAccountId: instagramAccountId, accountName: account.username ? `@${account.username}` : undefined };
  },

  async listPosts(ctx): Promise<PostSummary[]> {
    const data = await graph<{ data?: any[] }>(
      `${ctx.credentials.instagramAccountId}/media?fields=id,caption,timestamp,permalink,media_url,thumbnail_url&limit=25`,
      ctx.credentials.pageAccessToken,
    );
    return (data.data ?? []).map((m) => ({
      id: m.id,
      text: m.caption ?? "(منشور بدون نص)",
      createdAt: m.timestamp,
      url: m.permalink,
      image: m.thumbnail_url ?? m.media_url,
    }));
  },

  async unregister(ctx) {
    await unsubscribePage(ctx.credentials.pageId, ctx.credentials.pageAccessToken);
  },

  /** The account's own bio and what it posted; nothing from outside Instagram. */
  async describe(ctx): Promise<string> {
    const { instagramAccountId, pageAccessToken } = ctx.credentials;
    const account = await graph<any>(`${instagramAccountId}?fields=name,username,biography,website`, pageAccessToken).catch(() => ({}));
    const lines = [
      account.name || account.username ? `Account: ${clip(account.name || account.username, 120)}${account.username ? ` (@${clip(account.username, 60)})` : ""}` : "",
      account.biography ? `Bio: ${clip(account.biography, 600)}` : "",
      account.website ? `Website: ${clip(account.website, 200)}` : "",
      ...postLines(await instagramDriver.listPosts!(ctx).catch(() => [])),
    ].filter(Boolean);
    return lines.join("\n");
  },
};


/** Keeps one line per fact short, so a long post cannot crowd the others out of the prompt. */
const clip = (v: unknown, n = 400): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function postLines(posts: PostSummary[], limit = 12): string[] {
  return posts
    .filter((p) => p.text && !p.text.startsWith("("))
    .slice(0, limit)
    .map((p) => `Post${p.createdAt ? ` (${p.createdAt.slice(0, 10)})` : ""}: ${clip(p.text)}`);
}

/** Meta signs every webhook body with the app secret — anything unsigned or mis-signed is rejected. */
export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export interface MetaEvent {
  accountId: string; // the Page id (Facebook) or Instagram business account id the event is about
  message: IncomingMessage;
}

/** Flattens one Meta webhook delivery into the individual comments/DMs that need an answer. */
export function parseMetaWebhook(body: any): MetaEvent[] {
  const events: MetaEvent[] = [];
  const isInstagram = body?.object === "instagram";
  if (!isInstagram && body?.object !== "page") return events;

  for (const entry of body.entry ?? []) {
    const accountId = String(entry.id);

    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (!isInstagram && change.field === "feed" && v.item === "comment" && v.verb === "add") {
        // Only top-level comments on a post — replies to comments are conversations, not new questions.
        if (v.parent_id && v.parent_id !== v.post_id) continue;
        if (!v.message || !v.comment_id || String(v.from?.id) === accountId) continue;
        events.push({
          accountId,
          message: {
            conversationRef: `comment:${v.comment_id}`,
            authorName: v.from?.name ?? "Facebook user",
            text: v.message,
            postId: v.post_id,
            externalId: String(v.comment_id),
          },
        });
      } else if (isInstagram && change.field === "comments") {
        if (v.parent_id) continue;
        if (!v.text || !v.id || String(v.from?.id) === accountId) continue;
        events.push({
          accountId,
          message: {
            conversationRef: `comment:${v.id}`,
            authorName: v.from?.username ?? "Instagram user",
            text: v.text,
            postId: v.media?.id,
            externalId: String(v.id),
          },
        });
      }
    }

    for (const m of entry.messaging ?? []) {
      if (!m.message?.text || m.message.is_echo || !m.sender?.id || String(m.sender.id) === accountId) continue;
      events.push({
        accountId,
        message: {
          conversationRef: `dm:${m.sender.id}`,
          authorName: isInstagram ? "Instagram user" : "Messenger user",
          text: m.message.text,
          externalId: m.message.mid ? String(m.message.mid) : undefined,
        },
      });
    }
  }
  return events;
}

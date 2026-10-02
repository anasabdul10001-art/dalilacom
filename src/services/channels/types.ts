export interface IncomingMessage {
  conversationRef: string; // where to send the reply
  authorName: string;
  text: string;
  externalAccountId?: string;
  /** The post a comment was made on (Facebook/Instagram) — lets rules target specific posts. */
  postId?: string;
  /** The platform's id for this message/comment, used to ignore webhook redeliveries. */
  externalId?: string;
}

export interface PostSummary {
  id: string;
  text: string;
  createdAt?: string;
  url?: string;
  image?: string;
}

export interface ChannelDriverImpl {
  /** Turns a raw webhook request into a message (null = nothing to answer, e.g. an edit or a non-text update). */
  parseIncoming(body: any, headers: Record<string, string | string[] | undefined>, ctx: DriverContext): IncomingMessage | null;
  sendReply(text: string, conversationRef: string, ctx: DriverContext): Promise<void>;
  /** Called when a user connects: registers the webhook with the platform where needed. */
  register?(ctx: DriverContext): Promise<{ externalAccountId?: string }>;
  /** Validates the credentials a user must supply, or returns an error message. */
  validateCredentials(creds: Record<string, string>): string | null;
  /** Recent posts of the connected account, so a rule can be limited to specific ones. */
  listPosts?(ctx: DriverContext): Promise<PostSummary[]>;
}

export interface DriverContext {
  credentials: Record<string, string>;
  hookToken: string;
  channelConfig: Record<string, any>;
}

export const TEST_MODE = process.env.RESPONDER_TEST_MODE === "1";

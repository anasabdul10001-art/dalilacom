// Replies written by an AI provider. The keys live only in the server environment — never in any client.
// Groq is tried first (fast and free); Anthropic is the fallback.
export function aiAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Which providers are configured, and which one a call would actually use first (ask() always tries
 * Groq before Anthropic). Booleans only — this backs the admin sanity check, it never returns a key.
 */
export function aiProviderStatus(): {
  groqConfigured: boolean;
  anthropicConfigured: boolean;
  activeProvider: "groq" | "anthropic" | null;
} {
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    groqConfigured,
    anthropicConfigured,
    activeProvider: groqConfigured ? "groq" : anthropicConfigured ? "anthropic" : null,
  };
}

type Provider = "groq" | "anthropic";
type ProviderUsage = { attempts: number; successes: number; failures: number };

// Per-process counters: Render restarts the service on every deploy and a free instance sleeps after
// ~15 idle minutes, so read these as "since this process started", never as lifetime totals.
const usage: Record<Provider, ProviderUsage> = {
  groq: { attempts: 0, successes: 0, failures: 0 },
  anthropic: { attempts: 0, successes: 0, failures: 0 },
};
let lastProvider: Provider | null = null;
let lastUsedAt: string | null = null;

/**
 * Real provider traffic this process has seen — what turns "is Groq actually answering?" from an
 * inference into a number. Surfaced by GET /admin/ai-status. Counters only, never any message text.
 */
export function aiUsage(): {
  groq: ProviderUsage;
  anthropic: ProviderUsage;
  lastProvider: Provider | null;
  lastUsedAt: string | null;
} {
  return {
    groq: { ...usage.groq },
    anthropic: { ...usage.anthropic },
    lastProvider,
    lastUsedAt,
  };
}

/** An attempt is only counted once a request is really about to be sent (the key check comes first). */
function recordAttempt(provider: Provider): void {
  usage[provider].attempts += 1;
}

/** Records the outcome of an attempt and passes the answer through untouched. */
function recordAnswer(provider: Provider, text: string | null): string | null {
  if (text) {
    usage[provider].successes += 1;
    lastProvider = provider;
    lastUsedAt = new Date().toISOString();
    return text;
  }
  usage[provider].failures += 1;
  return null;
}

export async function classifyIntent(message: string): Promise<string | null> {
  const text = await ask(
    "Classify the customer message into exactly one word: purchase, inquiry, complaint, praise, other. Reply with the single word only.",
    message,
    10,
  );
  const word = text?.trim().toLowerCase().split(/\s+/)[0];
  return word && ["purchase", "inquiry", "complaint", "praise", "other"].includes(word) ? word : null;
}

export async function generateReply(opts: {
  message: string;
  businessDescription?: string | null;
  tone?: string | null;
  instructions?: string;
}): Promise<string | null> {
  const system = [
    "You write short replies to customers on behalf of a business, in the same language the customer used.",
    opts.businessDescription ? `About the business: ${opts.businessDescription}` : "",
    opts.tone ? `Tone of voice: ${opts.tone}` : "",
    opts.instructions ? `Extra instructions: ${opts.instructions}` : "",
    "Never invent prices, availability, or policies you were not told. If unsure, say the team will follow up.",
    "Reply with the message text only.",
  ]
    .filter(Boolean)
    .join("\n");
  return ask(system, opts.message, 400);
}

// Groq speaks the OpenAI chat-completions shape. No key -> no request at all, so an
// Anthropic-only deployment never pays for a doomed Groq round trip.
async function askGroq(system: string, user: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  recordAttempt("groq");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return recordAnswer("groq", null);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return recordAnswer("groq", body.choices?.[0]?.message?.content?.trim() || null);
  } catch {
    return recordAnswer("groq", null);
  }
}

async function ask(system: string, user: string, maxTokens: number): Promise<string | null> {
  if (!aiAvailable()) return null;

  const groq = await askGroq(system, user, maxTokens);
  if (groq) return groq;

  // Fallback needs its own key check: aiAvailable() is true when only Groq is configured,
  // and sending Anthropic a request with an undefined key would fail anyway.
  if (!process.env.ANTHROPIC_API_KEY) return null;
  recordAttempt("anthropic");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.RESPONDER_AI_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return recordAnswer("anthropic", null);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return recordAnswer("anthropic", body.content?.find((c) => c.type === "text")?.text?.trim() ?? null);
  } catch {
    return recordAnswer("anthropic", null);
  }
}

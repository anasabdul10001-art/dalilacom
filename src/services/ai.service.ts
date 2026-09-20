// Replies written by Claude. The key lives only in the server environment — never in any client.
export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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

async function ask(system: string, user: string, maxTokens: number): Promise<string | null> {
  if (!aiAvailable()) return null;
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
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return body.content?.find((c) => c.type === "text")?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

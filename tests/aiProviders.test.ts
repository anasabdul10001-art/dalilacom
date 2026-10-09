import { describe, it, expect, afterAll, afterEach, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { aiAvailable, aiProviderStatus, aiUsage, classifyIntent, generateReply, resetAiProviderState, testProvider } from "../src/services/ai.service";
import { uniqueEmail } from "./helpers";

const KEYS = ["GROQ_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "NVIDIA_API_KEY", "SAMBANOVA_API_KEY", "TOGETHER_API_KEY", "HUGGINGFACE_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
const MODELS = ["CEREBRAS_MODEL", "GEMINI_MODEL", "OPENROUTER_MODEL", "MISTRAL_MODEL", "NVIDIA_MODEL", "SAMBANOVA_MODEL", "TOGETHER_MODEL", "HUGGINGFACE_MODEL", "DEEPSEEK_MODEL", "OPENAI_MODEL", "AI_PROVIDER_ORDER", "AI_TIMEOUT_MS"];

beforeEach(() => {
  resetAiProviderState();
  for (const key of [...KEYS, ...MODELS]) delete process.env[key];
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetAiProviderState();
  for (const key of [...KEYS, ...MODELS]) delete process.env[key];
});
afterAll(async () => {
  await prisma.$disconnect();
});

const withKeys = (...ids: string[]) => ids.forEach((id) => (process.env[`${id}_API_KEY`] = `test-${id.toLowerCase()}-key`));

type Reply = { status: number; text?: string; headers?: Record<string, string>; throws?: Error; hang?: boolean };
const HOSTS: Record<string, string> = {
  "api.groq.com": "groq",
  "api.cerebras.ai": "cerebras",
  "generativelanguage.googleapis.com": "gemini",
  "openrouter.ai": "openrouter",
  "api.mistral.ai": "mistral",
  "integrate.api.nvidia.com": "nvidia",
  "api.sambanova.ai": "sambanova",
  "api.together.xyz": "together",
  "router.huggingface.co": "huggingface",
  "api.deepseek.com": "deepseek",
  "api.openai.com": "openai",
  "api.anthropic.com": "anthropic",
};

/** Each provider answers as scripted; every call is written down in order, with what it sent. */
function stubProviders(script: Record<string, Reply>) {
  const calls: { provider: string; url: string; init: RequestInit; body: Record<string, any> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const provider = HOSTS[new URL(String(url)).host];
    calls.push({ provider, url: String(url), init, body: JSON.parse(String(init.body)) });
    const reply = script[provider];
    if (!reply) throw new Error(`unexpected call to ${provider}`);
    if (reply.hang) {
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))));
    }
    if (reply.throws) throw reply.throws;
    const ok = reply.status >= 200 && reply.status < 300;
    const content = reply.text ?? "inquiry";
    return {
      ok,
      status: reply.status,
      headers: { get: (name: string) => reply.headers?.[name.toLowerCase()] ?? null },
      json: async () => (provider === "anthropic" ? { content: [{ type: "text", text: content }] } : { choices: [{ message: { content } }] }),
    };
  });
  return calls;
}
const order = (calls: { provider: string }[]) => calls.map((c) => c.provider);

describe("Which providers exist and in what order", () => {
  it("lists every provider with the free ones before Anthropic, and reports the first configured as active", () => {
    expect(aiAvailable()).toBe(false);
    expect(aiProviderStatus().activeProvider).toBeNull();
    expect(aiProviderStatus().providers.map((p) => p.id)).toEqual(["groq", "cerebras", "sambanova", "gemini", "openrouter", "mistral", "nvidia", "together", "huggingface", "deepseek", "openai", "anthropic"]);

    withKeys("MISTRAL", "ANTHROPIC");
    expect(aiAvailable()).toBe(true);
    const status = aiProviderStatus();
    expect(status.activeProvider).toBe("mistral");
    expect(status.groqConfigured).toBe(false);
    expect(status.anthropicConfigured).toBe(true);
    expect(status.providers.filter((p) => p.configured).map((p) => p.id)).toEqual(["mistral", "anthropic"]);
  });

  it("lets AI_PROVIDER_ORDER move providers to the front", async () => {
    withKeys("GROQ", "GEMINI");
    process.env.AI_PROVIDER_ORDER = "gemini";
    const calls = stubProviders({ gemini: { status: 200 }, groq: { status: 200 } });
    await classifyIntent("hello");
    expect(order(calls)).toEqual(["gemini"]);
  });
});

describe("Talking to each provider", () => {
  it("sends the right request to every OpenAI-compatible provider, with its own key and model", async () => {
    withKeys("GROQ", "CEREBRAS", "GEMINI", "OPENROUTER", "MISTRAL", "NVIDIA");
    process.env.GEMINI_MODEL = "gemini-test";
    process.env.NVIDIA_MODEL = "nvidia/test-model";
    // everyone but the last one refuses, so one call walks the whole chain
    const calls = stubProviders({ groq: { status: 500 }, cerebras: { status: 500 }, gemini: { status: 500 }, openrouter: { status: 500 }, mistral: { status: 500 }, nvidia: { status: 200, text: " other " } });

    expect(await classifyIntent("hi")).toBe("other");
    expect(order(calls)).toEqual(["groq", "cerebras", "gemini", "openrouter", "mistral", "nvidia"]);
    const byProvider = Object.fromEntries(calls.map((c) => [c.provider, c]));
    expect(byProvider.groq.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(byProvider.gemini.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(byProvider.nvidia.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>).authorization).toBe(`Bearer test-${call.provider}-key`);
      expect(call.body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    }
    expect(byProvider.gemini.body.model).toBe("gemini-test");
    expect(byProvider.nvidia.body.model).toBe("nvidia/test-model");
    expect((byProvider.openrouter.init.headers as Record<string, string>)["X-Title"]).toBe("Dalilacom");
  });

  it("also reaches SambaNova, Together, Hugging Face, DeepSeek and OpenAI, each with its own key, address and model", async () => {
    withKeys("SAMBANOVA", "TOGETHER", "HUGGINGFACE", "DEEPSEEK", "OPENAI");
    process.env.DEEPSEEK_MODEL = "deepseek-test";
    const calls = stubProviders({
      sambanova: { status: 500 }, together: { status: 429 }, huggingface: { status: 401 }, deepseek: { status: 500 }, openai: { status: 200, text: " other " },
    });
    expect(await classifyIntent("hi")).toBe("other");
    expect(order(calls)).toEqual(["sambanova", "together", "huggingface", "deepseek", "openai"]);
    const by = Object.fromEntries(calls.map((c) => [c.provider, c]));
    expect(by.sambanova.url).toBe("https://api.sambanova.ai/v1/chat/completions");
    expect(by.together.url).toBe("https://api.together.xyz/v1/chat/completions");
    expect(by.huggingface.url).toBe("https://router.huggingface.co/v1/chat/completions");
    expect(by.deepseek.url).toBe("https://api.deepseek.com/chat/completions");
    expect(by.openai.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((by.openai.init.headers as Record<string, string>).authorization).toBe("Bearer test-openai-key");
    expect(by.deepseek.body.model).toBe("deepseek-test");
    expect(by.openai.body.model).toBe("gpt-4o-mini");
  });

  it("keeps Anthropic as the last resort, in its own request shape", async () => {
    withKeys("GROQ", "MISTRAL", "ANTHROPIC");
    const calls = stubProviders({ groq: { status: 502 }, mistral: { status: 401 }, anthropic: { status: 200, text: " purchase " } });
    expect(await classifyIntent("how much?")).toBe("purchase");
    expect(order(calls)).toEqual(["groq", "mistral", "anthropic"]);
    const claude = calls[2];
    expect((claude.init.headers as Record<string, string>)["x-api-key"]).toBe("test-anthropic-key");
    expect(claude.body.system).toContain("Classify");
    expect(claude.body.messages).toEqual([{ role: "user", content: "how much?" }]);
    expect(aiUsage().lastProvider).toBe("anthropic");
  });

  it("still answers reply and announcement-style calls through the same chain", async () => {
    withKeys("CEREBRAS");
    stubProviders({ cerebras: { status: 200, text: "We open at nine." } });
    expect(await generateReply({ message: "when do you open?" })).toBe("We open at nine.");
  });
});

describe("Saying why a provider refused", () => {
  it("adds the provider's own words, without anything that looks like a key", async () => {
    withKeys("GROQ");
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { message: "The model `old-model` does not exist (key gsk_abcdefghijklmnopqrstuvwxyz123456)" } }),
    }));
    await classifyIntent("hi");
    const reason = aiProviderStatus().providers.find((p) => p.id === "groq")!.lastError!;
    expect(reason).toContain("request refused (404): The model `old-model` does not exist");
    expect(reason).not.toContain("gsk_abcdefghijklmnopqrstuvwxyz");
  });
});

describe("When the model we asked for is gone", () => {
  it("asks the provider which model this key may use, switches to it, and keeps using it", async () => {
    withKeys("GROQ");
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/models")) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: "whisper-large-v3" }, { id: "llama-3.1-8b-instant" }, { id: "openai/gpt-oss-120b" }] }) };
      }
      const model = JSON.parse(String(init.body)).model;
      asked.push(model);
      if (model === "llama-3.3-70b-versatile") return { ok: false, status: 404, headers: { get: () => null }, text: async () => "model does not exist" };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
    });
    expect(await testProvider("groq")).toMatchObject({ ok: true });
    expect(asked).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
    expect(aiProviderStatus().providers.find((p) => p.id === "groq")!.model).toBe("openai/gpt-oss-120b");

    asked.length = 0;
    expect(await testProvider("groq")).toMatchObject({ ok: true });
    expect(asked).toEqual(["openai/gpt-oss-120b"]); // no second discovery
  });
});

describe("Models that are retired or that think before answering", () => {
  it("steps past retired models (410) to one that answers, and gives a thinking model room to answer", async () => {
    withKeys("NVIDIA", "GROQ");
    const sent: Record<string, any>[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (String(url).endsWith("/models")) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: "meta/llama-3.1-70b-instruct" }, { id: "openai/gpt-oss-120b" }] }) };
      }
      const body = JSON.parse(String(init.body));
      sent.push(body);
      if (body.model === "meta/llama-3.3-70b-instruct" || body.model === "meta/llama-3.1-70b-instruct") return { ok: false, status: 410, headers: { get: () => null }, text: async () => "end of life" };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
    });
    expect(await testProvider("nvidia")).toMatchObject({ ok: true });
    expect(sent.map((b) => b.model)).toEqual(["meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b"]);
    const thinking = sent[1];
    expect(thinking.max_tokens).toBeGreaterThanOrEqual(400); // a reasoning model spends tokens thinking first
    expect(thinking.reasoning_effort).toBeUndefined(); // only asked of Groq and OpenRouter
  });
});

describe("Trying one provider on its own", () => {
  it("asks only that provider and says whether it really answered", async () => {
    expect(await testProvider("nope")).toBeNull();
    expect(await testProvider("sambanova")).toEqual({ ok: false, reason: "no key set", ms: 0 });

    withKeys("SAMBANOVA", "GROQ");
    const calls = stubProviders({ sambanova: { status: 200, text: "ok" } });
    expect(await testProvider("sambanova")).toMatchObject({ ok: true, reason: null });
    expect(order(calls)).toEqual(["sambanova"]); // Groq, ahead of it in the chain, is not asked

    stubProviders({ sambanova: { status: 401 } });
    expect(await testProvider("sambanova")).toMatchObject({ ok: false, reason: "key rejected (401)" });
  });
});

describe("When a provider fails", () => {
  it("moves on for every kind of failure — 429, 401, 500, an empty answer, a dead connection and a timeout", async () => {
    withKeys("GROQ", "CEREBRAS", "GEMINI", "OPENROUTER", "MISTRAL", "NVIDIA", "ANTHROPIC");
    process.env.AI_TIMEOUT_MS = "40";
    const start = aiUsage(); // counters live for the whole process: compare with where they stood
    const calls = stubProviders({
      groq: { status: 429 },
      cerebras: { status: 401 },
      gemini: { status: 500 },
      openrouter: { status: 200, text: "   " },
      mistral: { status: 0, throws: new Error("socket hang up") },
      nvidia: { status: 0, hang: true },
      anthropic: { status: 200, text: "praise" },
    });
    expect(await classifyIntent("thanks!")).toBe("praise");
    expect(order(calls)).toEqual(["groq", "cerebras", "gemini", "openrouter", "mistral", "nvidia", "anthropic"]);

    const reasons = Object.fromEntries(aiProviderStatus().providers.map((p) => [p.id, p.lastError]));
    expect(reasons).toMatchObject({
      groq: "rate limited (429)",
      cerebras: "key rejected (401)",
      gemini: "provider error (500)",
      openrouter: "empty answer",
      mistral: "unreachable",
      nvidia: "timed out",
      anthropic: null,
    });
    const used = aiUsage();
    for (const id of ["groq", "cerebras", "gemini", "openrouter", "mistral", "nvidia"] as const) {
      expect(used[id]).toEqual({ attempts: start[id].attempts + 1, failures: start[id].failures + 1, successes: start[id].successes });
    }
    expect(used.anthropic).toEqual({ attempts: start.anthropic.attempts + 1, failures: start.anthropic.failures, successes: start.anthropic.successes + 1 });
  });

  it("benches a failing provider so the next customer does not wait for it again — and tries it last when nothing else is left", async () => {
    withKeys("GROQ", "CEREBRAS");
    const calls = stubProviders({ groq: { status: 401 }, cerebras: { status: 200, text: "other" } });
    await classifyIntent("one");
    expect(order(calls)).toEqual(["groq", "cerebras"]);
    expect(aiProviderStatus().providers.find((p) => p.id === "groq")!.cooldownSeconds).toBeGreaterThan(0);

    calls.length = 0;
    await classifyIntent("two");
    expect(order(calls)).toEqual(["cerebras"]); // Groq is resting

    calls.length = 0;
    stubProviders({ groq: { status: 200, text: "other" }, cerebras: { status: 500 } });
    const later = stubProviders({ groq: { status: 200, text: "other" }, cerebras: { status: 500 } });
    // Cerebras fails now and is benched too; Groq is still benched: with both resting, both are tried (Cerebras answers nothing, Groq now recovers)
    await classifyIntent("three");
    expect(order(later)).toEqual(["cerebras", "groq"]);
    expect(aiUsage().lastProvider).toBe("groq");
    expect(aiProviderStatus().providers.find((p) => p.id === "groq")!.cooldownSeconds).toBe(0); // a good answer clears the bench
  });

  it("honours Retry-After on a rate limit, within reason", async () => {
    withKeys("GROQ", "CEREBRAS");
    stubProviders({ groq: { status: 429, headers: { "retry-after": "7" } }, cerebras: { status: 200, text: "other" } });
    await classifyIntent("hello");
    const cooldown = aiProviderStatus().providers.find((p) => p.id === "groq")!.cooldownSeconds;
    expect(cooldown).toBeGreaterThan(0);
    expect(cooldown).toBeLessThanOrEqual(7);
  });

  it("returns nothing (not an error) when every provider fails, and nothing at all when none is configured", async () => {
    expect(await classifyIntent("hello")).toBeNull();
    withKeys("GROQ", "MISTRAL");
    const calls = stubProviders({ groq: { status: 500 }, mistral: { status: 503 } });
    expect(await classifyIntent("hello")).toBeNull();
    expect(order(calls)).toEqual(["groq", "mistral"]);
  });
});

describe("Every switch is recorded in the database and shown to the admin", () => {
  it("counts each provider's attempt durably, and GET /admin/ai-status lists them all", async () => {
    withKeys("GROQ", "GEMINI");
    stubProviders({ groq: { status: 500 }, gemini: { status: 200, text: "complaint" } });
    const read = (provider: string) => prisma.aiProviderUsage.findUnique({ where: { provider } });
    // earlier tests' counter writes are fire-and-forget: let them land before taking the starting point
    await new Promise((r) => setTimeout(r, 400));
    const before = { groq: await read("groq"), gemini: await read("gemini") };
    await classifyIntent("this is broken");
    for (let i = 0; i < 60; i++) {
      const [g, q] = [await read("gemini"), await read("groq")];
      if ((g?.successes ?? 0) > (before.gemini?.successes ?? 0) && (q?.failures ?? 0) > (before.groq?.failures ?? 0)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect((await read("groq"))!.failures).toBeGreaterThan(before.groq?.failures ?? 0);
    expect((await read("gemini"))!.successes).toBeGreaterThan(before.gemini?.successes ?? 0);

    const email = uniqueEmail("aiprovadmin");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "AI Admin" });
    await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    const res = await request(app).get("/admin/ai-status").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.providers.map((p: { id: string }) => p.id)).toEqual(["groq", "cerebras", "sambanova", "gemini", "openrouter", "mistral", "nvidia", "together", "huggingface", "deepseek", "openai", "anthropic"]);
    expect(res.body.providers.find((p: { id: string }) => p.id === "groq")).toMatchObject({ configured: true, lastError: "provider error (500)" });
    expect(Object.keys(res.body.usage).sort()).toEqual(["anthropic", "cerebras", "deepseek", "gemini", "groq", "huggingface", "lastProvider", "lastUsedAt", "mistral", "nvidia", "openai", "openrouter", "sambanova", "together"]);
    expect(res.body.usageTotals.gemini.successes).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain("test-groq-key");
  });
});

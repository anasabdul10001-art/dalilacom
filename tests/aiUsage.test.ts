import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { classifyIntent } from "../src/services/ai.service";
import { uniqueEmail } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function adminToken() {
  const email = uniqueEmail("aiadmin");
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "AI Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return login.body.token as string;
}

/** The Groq request; the Anthropic one is the fallback. Each stub states its own outcome. */
function stubProviders(groq: "ok" | "reject" | "fail", anthropic: "ok" | "fail") {
  vi.stubGlobal("fetch", async (url: string) => {
    const target = String(url);
    if (target.includes("api.groq.com")) {
      if (groq === "reject") throw new Error("groq unreachable");
      if (groq === "ok") return { ok: true, json: async () => ({ choices: [{ message: { content: " purchase " } }] }) };
      return { ok: false, status: 401, json: async () => ({}) };
    }
    if (target.includes("api.anthropic.com")) {
      if (anthropic === "ok") return { ok: true, json: async () => ({ content: [{ type: "text", text: " inquiry " }] }) };
      return { ok: false, status: 500, json: async () => ({}) };
    }
    throw new Error("unexpected fetch " + target);
  });
}

const readRow = (provider: string) => prisma.aiProviderUsage.findUnique({ where: { provider } });
const zero = { attempts: 0, successes: 0, failures: 0 };

/** persistUsage() is intentionally not awaited, so poll briefly for the row to catch up. */
async function waitForRow(provider: string, predicate: (row: { attempts: number; successes: number; failures: number; lastUsedAt: Date | null }) => boolean) {
  let row = (await readRow(provider)) ?? { provider, ...zero, lastUsedAt: null };
  for (let i = 0; i < 60 && !predicate(row); i++) {
    await new Promise((r) => setTimeout(r, 50));
    row = (await readRow(provider)) ?? { provider, ...zero, lastUsedAt: null };
  }
  return row;
}

describe("AI provider usage counters", () => {
  it("records a Groq answer in the database, not just in memory", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    stubProviders("ok", "fail");

    const before = (await readRow("groq")) ?? { provider: "groq", ...zero, lastUsedAt: null };
    expect(await classifyIntent("do you have this in blue?")).toBe("purchase");

    const after = await waitForRow("groq", (r) => r.attempts > before.attempts);
    expect(after.attempts).toBe(before.attempts + 1);
    expect(after.successes).toBe(before.successes + 1);
    expect(after.failures).toBe(before.failures);
    expect(after.lastUsedAt).not.toBeNull();
  });

  it("records the Groq failure and the Anthropic answer separately when it falls back", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    stubProviders("fail", "ok");

    const groqBefore = (await readRow("groq")) ?? { provider: "groq", ...zero, lastUsedAt: null };
    const anthropicBefore = (await readRow("anthropic")) ?? { provider: "anthropic", ...zero, lastUsedAt: null };

    expect(await classifyIntent("when do you open?")).toBe("inquiry");

    const groqAfter = await waitForRow("groq", (r) => r.failures > groqBefore.failures);
    const anthropicAfter = await waitForRow("anthropic", (r) => r.successes > anthropicBefore.successes);
    expect(groqAfter.attempts).toBe(groqBefore.attempts + 1);
    expect(groqAfter.failures).toBe(groqBefore.failures + 1);
    expect(anthropicAfter.attempts).toBe(anthropicBefore.attempts + 1);
    expect(anthropicAfter.successes).toBe(anthropicBefore.successes + 1);
    expect(anthropicAfter.lastUsedAt).not.toBeNull();
  });

  it("reports a failed attempt without moving the last-answer stamp", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    stubProviders("reject", "fail");

    const before = (await readRow("groq")) ?? { provider: "groq", ...zero, lastUsedAt: null };
    expect(await classifyIntent("hello")).toBeNull();

    const after = await waitForRow("groq", (r) => r.failures > before.failures);
    expect(after.lastUsedAt?.getTime()).toBe(before.lastUsedAt?.getTime());
  });

  it("serves config, this-process counters and durable totals from GET /admin/ai-status", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    delete process.env.ANTHROPIC_API_KEY;
    stubProviders("ok", "fail");
    await classifyIntent("one more");
    await waitForRow("groq", (r) => r.attempts > 0);

    const token = await adminToken();
    const res = await request(app).get("/admin/ai-status").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.groqConfigured).toBe(true);
    expect(res.body.anthropicConfigured).toBe(false);
    expect(res.body.activeProvider).toBe("groq");
    expect(Object.keys(res.body.usage.groq).sort()).toEqual(["attempts", "failures", "successes"]);

    const totals = res.body.usageTotals;
    expect(totals).not.toBeNull();
    expect(totals.groq.attempts).toBeGreaterThan(0);
    expect(totals.groq.successes).toBeGreaterThan(0);
    expect(totals.lastProvider).toBe("groq");
    expect(new Date(totals.lastUsedAt).getTime()).toBeGreaterThan(0);
  });

  it("keeps the endpoint admin-only", async () => {
    const res = await request(app).get("/admin/ai-status");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_MISSING_TOKEN");
  });

  it("still answers when the counter write itself fails", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    stubProviders("ok", "fail");

    // Plain assignment, not vi.spyOn: calling spyOn on a Prisma delegate leaves it broken for the
    // tests that follow, while assigning the property back by identity restores it exactly (asserted
    // below). A diagnostics write must never be able to break a customer reply. Kept last in the
    // file because it touches the shared Prisma delegate object.
    const delegate = prisma.aiProviderUsage;
    const original = delegate.upsert;
    delegate.upsert = (() => Promise.reject(new Error("database down"))) as typeof delegate.upsert;
    try {
      await expect(delegate.upsert({} as never)).rejects.toThrow("database down"); // the stub is really in place
      expect(await classifyIntent("do you deliver?")).toBe("purchase");
    } finally {
      delegate.upsert = original;
    }
    expect(prisma.aiProviderUsage.upsert).toBe(original);
  });
});

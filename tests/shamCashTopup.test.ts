import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { getSettings, saveSettings } from "../src/services/settings.service";

const password = "correct-horse-battery-staple";
let before: Awaited<ReturnType<typeof getSettings>>["payment"];
const realFetch = globalThis.fetch;
const provider = new Map<string, Record<string, unknown>>(); // what the (fake) Sham Cash provider knows
let providerDown = false;

beforeAll(async () => {
  before = (await getSettings()).payment;
  await saveSettings({ payment: { ...before, localWallets: [{ key: "SHAM_CASH", label: "شام كاش", accountNumber: "0999000000" }], sypPerUsd: 10000 } } as never);
  process.env.SHAMCASH_API_BASE = "https://shamcash.test/api";
  process.env.SHAMCASH_API_TOKEN = "test-token";
  vi.stubGlobal("fetch", async (input: unknown, init?: unknown) => {
    const url = String(input);
    if (!url.startsWith("https://shamcash.test/")) return realFetch(input as never, init as never);
    if (providerDown) return new Response("down", { status: 503 });
    const ids = (new URL(url).searchParams.get("transaction_ids") ?? "").split(",");
    const data = ids.filter((id) => provider.has(id)).map((id) => ({ id, ...provider.get(id) }));
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => {
  providerDown = false;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.SHAMCASH_API_BASE;
  delete process.env.SHAMCASH_API_TOKEN;
  await saveSettings({ payment: before } as never);
  await prisma.$disconnect();
});

async function user(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: prefix })).status).toBe(201);
  const login = await request(app).post("/auth/login").send({ email, password });
  const row = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: row.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const topup = (u: { auth: object }, body: object) => request(app).post("/wallet/topups").set(u.auth).send({ method: "SHAM_CASH", ...body });
const balance = async (id: string) => (await prisma.wallet.findUnique({ where: { userId: id } }))?.balance ?? 0;
let seq = 0;
const ref = () => `SC${Date.now()}${seq++}`;

describe("topping up the wallet through Sham Cash, checked automatically", () => {
  it("credits at once when the provider has the transfer, and takes the number only once", async () => {
    const { creditsPerUsd } = await getSettings();
    const a = await user("shama");
    const b = await user("shamb");
    const number = ref();
    provider.set(number, { amount: 5, currency: "USD" });

    const first = await topup(a, { reference: number, amountClaimed: 5 });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: "APPROVED", verifiedBy: "AUTO", amountCredits: 5 * creditsPerUsd });
    expect(await balance(a.id)).toBe(5 * creditsPerUsd);

    // the same number again: refused, however it is written, by the same person or by someone else
    for (const again of [number, ` ${number.toLowerCase()} `, number.slice(0, 3) + " " + number.slice(3)]) {
      const dup = await topup(a, { reference: again, amountClaimed: 5 });
      expect(dup.status).toBe(409);
      expect(dup.body.error.message).toContain("موجود سابقًا");
    }
    expect((await topup(b, { reference: number, amountClaimed: 5 })).status).toBe(409);
    expect(await balance(a.id)).toBe(5 * creditsPerUsd);
    expect(await balance(b.id)).toBe(0);
    expect(await prisma.topUpRequest.count({ where: { reference: number } })).toBe(1);
  });

  it("two requests with the same number at the same moment: one wins, the other is refused", async () => {
    const a = await user("shamrace1");
    const b = await user("shamrace2");
    const number = ref();
    provider.set(number, { amount: 2, currency: "USD" });
    const [x, y] = await Promise.all([topup(a, { reference: number, amountClaimed: 2 }), topup(b, { reference: number, amountClaimed: 2 })]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect(await prisma.topUpRequest.count({ where: { reference: number } })).toBe(1);
    expect((await balance(a.id)) + (await balance(b.id))).toBe(2 * (await getSettings()).creditsPerUsd);
  });

  it("a transfer the provider does not know is refused without taking the number, so it can be tried again", async () => {
    const a = await user("shamnf");
    const number = ref();
    const missing = await topup(a, { reference: number, amountClaimed: 3 });
    expect(missing.status).toBe(404);
    expect(await prisma.topUpRequest.count({ where: { reference: number } })).toBe(0);
    provider.set(number, { amount: 3, currency: "USD" });
    expect((await topup(a, { reference: number, amountClaimed: 3 })).body.status).toBe("APPROVED");
  });

  it("turns pounds into credits with the rate the admin set", async () => {
    const { creditsPerUsd } = await getSettings();
    const a = await user("shamsyp");
    const number = ref();
    provider.set(number, { amount: 50000, currency: "SYP" }); // 5 dollars at 10000 pounds
    const res = await topup(a, { reference: number, amountClaimed: 50000 });
    expect(res.body).toMatchObject({ status: "APPROVED", amountCredits: 5 * creditsPerUsd });
  });

  it("never credits by itself when the amount differs from what was typed, is unknown, or the provider is down; the number is still taken once", async () => {
    const a = await user("shamodd");
    const wrong = ref();
    provider.set(wrong, { amount: 5, currency: "USD" });
    expect((await topup(a, { reference: wrong, amountClaimed: 500 })).body.status).toBe("PENDING");
    const unknown = ref();
    provider.set(unknown, {}); // exists, no amount reported
    expect((await topup(a, { reference: unknown, amountClaimed: 5 })).body.status).toBe("PENDING");
    const down = ref();
    providerDown = true;
    expect((await topup(a, { reference: down, amountClaimed: 5 })).body.status).toBe("PENDING");
    expect(await balance(a.id)).toBe(0);
    for (const n of [wrong, unknown, down]) expect((await topup(a, { reference: n, amountClaimed: 5 })).status).toBe(409);
  });

  it("without the provider's settings the request waits for the admin, and the number is still taken once", async () => {
    const saved = [process.env.SHAMCASH_API_BASE, process.env.SHAMCASH_API_TOKEN];
    delete process.env.SHAMCASH_API_BASE;
    delete process.env.SHAMCASH_API_TOKEN;
    try {
      const a = await user("shamoff");
      const number = ref();
      const res = await topup(a, { reference: number, amountClaimed: 4 });
      expect(res.body.status).toBe("PENDING");
      expect((await topup(a, { reference: number.toLowerCase(), amountClaimed: 4 })).status).toBe(409);
    } finally {
      process.env.SHAMCASH_API_BASE = saved[0];
      process.env.SHAMCASH_API_TOKEN = saved[1];
    }
  });
});

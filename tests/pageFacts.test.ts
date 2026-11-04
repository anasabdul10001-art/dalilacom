import request from "supertest";
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { encryptJson } from "../src/services/crypto.service";
import { businessInfoFor } from "../src/services/responder.service";
import { uniqueEmail } from "./helpers";

afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await prisma.$disconnect();
});

async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Page facts" });
  return prisma.user.update({ where: { email }, data: { role: "MERCHANT" } });
}

async function facebookConnection() {
  const user = await account("pagefacts");
  const channel = await prisma.socialChannel.upsert({ where: { key: "facebook" }, update: { driver: "FACEBOOK", isEnabled: true }, create: { key: "facebook", name: "Facebook", driver: "FACEBOOK" } });
  return prisma.channelConnection.create({
    data: { userId: user.id, channelId: channel.id, credentialsEnc: encryptJson({ pageId: "555", pageAccessToken: "T" }), externalAccountId: "555", hookToken: `hook-${Date.now()}-${Math.random()}` },
    include: { channel: true },
  });
}

describe("What the AI may say: only what the connected Page says about itself", () => {
  it("reads the Page's about text, address and its own posts, and nothing from the Dalilacom store", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("/posts")) return new Response(JSON.stringify({ data: [{ id: "555_1", message: "Water bottles 5 dollars", created_time: "2026-11-01T10:00:00+0000" }] }));
      return new Response(JSON.stringify({ id: "555", name: "Hope Shop", about: "We sell bottles", single_line_address: "Main street 1", phone: "+49 1" }));
    });
    const connection = await facebookConnection();
    const facts = await businessInfoFor(connection);
    expect(facts).toContain("Page: Hope Shop");
    expect(facts).toContain("About: We sell bottles");
    expect(facts).toContain("Address: Main street 1");
    expect(facts).toContain("Post (2026-11-01): Water bottles 5 dollars");
    expect(urls.every((u) => u.startsWith("https://graph.facebook.com/"))).toBe(true);
  });

  it("gives nothing for a channel that has no account to read (the AI then uses the owner's description only)", async () => {
    const user = await account("pagefacts2");
    const channel = await prisma.socialChannel.upsert({ where: { key: "telegram" }, update: { driver: "TELEGRAM", isEnabled: true }, create: { key: "telegram", name: "Telegram", driver: "TELEGRAM" } });
    const connection = await prisma.channelConnection.create({
      data: { userId: user.id, channelId: channel.id, credentialsEnc: encryptJson({ botToken: "x" }), hookToken: `hook-${Date.now()}-${Math.random()}` },
      include: { channel: true },
    });
    expect(await businessInfoFor(connection)).toBeUndefined();
  });
});

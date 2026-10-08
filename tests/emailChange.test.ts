import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { emailService } from "../src/services/email.service";
import { extractToken, uniqueEmail } from "./helpers";

const sendSpy = vi.spyOn(emailService, "send").mockResolvedValue();

beforeEach(() => {
  sendSpy.mockClear();
  process.env.SMTP_HOST = "smtp.test.invalid"; // the route only checks that a mail provider is configured; the spy catches the mail
});
afterEach(() => {
  delete process.env.SMTP_HOST;
});
afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Email ${prefix}` });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: registered.body.user.id as string, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const change = (me: { auth: Record<string, string> }, body: object) => request(app).post("/auth/change-email").set(me.auth).send(body);
const mailTo = (to: string) => sendSpy.mock.calls.map((c) => c[0]).find((m) => m.to === to);

describe("Changing my email", () => {
  it("is refused honestly while no mail provider is configured", async () => {
    delete process.env.SMTP_HOST;
    const me = await account("emailnosmtp");
    const res = await change(me, { newEmail: uniqueEmail("wanted"), password });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("EMAIL_NOT_CONFIGURED");
    expect(await prisma.emailChangeToken.count({ where: { userId: me.id } })).toBe(0);
  });

  it("checks the password, refuses the same or a taken address, and needs a sign-in", async () => {
    const me = await account("emailguard");
    const other = await account("emailtaken");
    sendSpy.mockClear(); // registering sent its own verification mails
    expect((await request(app).post("/auth/change-email").send({ newEmail: uniqueEmail("x"), password })).status).toBe(401);
    expect((await change(me, { newEmail: uniqueEmail("x") })).status).toBe(403);
    expect((await change(me, { newEmail: uniqueEmail("x"), password: "not-the-password" })).status).toBe(403);
    expect((await request(app).get("/auth/me").set(me.auth)).status).toBe(200); // a wrong password never looks like an expired session
    expect((await change(me, { newEmail: me.email, password })).status).toBe(400);
    expect((await change(me, { newEmail: other.email, password })).status).toBe(409);
    expect((await change(me, { newEmail: "not-an-email", password })).status).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("sends a confirmation link to the new address and a warning to the old one — and changes nothing until the link is opened", async () => {
    const me = await account("emailflow");
    const wanted = uniqueEmail("newaddress");
    sendSpy.mockClear();
    const asked = await change(me, { newEmail: wanted, password });
    expect(asked.status).toBe(200);

    const toNew = mailTo(wanted)!;
    const toOld = mailTo(me.email)!;
    expect(toNew.text).toMatch(/\/auth\/confirm-email-change\?token=[a-f0-9]{64}/);
    expect(toOld.text).toContain(wanted);
    expect(toOld.text).not.toMatch(/token=/); // the warning carries no link that could be used by someone else
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).email).toBe(me.email);
    const stored = await prisma.emailChangeToken.findFirstOrThrow({ where: { userId: me.id } });
    expect(stored.tokenHash).not.toContain(extractToken(toNew)); // only a hash is kept

    const opened = await request(app).get("/auth/confirm-email-change").query({ token: extractToken(toNew) });
    expect(opened.status).toBe(200);
    expect(opened.text).toContain("تم تغيير بريدك الإلكتروني");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(row).toMatchObject({ email: wanted, isEmailVerified: true });
    expect(sendSpy.mock.calls.some((c) => c[0].to === me.email && c[0].subject.includes("تم تغيير بريد"))).toBe(true); // the old address hears it happened
    expect((await request(app).get("/auth/me").set(me.auth)).status).toBe(401); // sessions ended
    expect((await request(app).post("/auth/login").send({ email: me.email, password })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: wanted, password })).status).toBe(200);

    // the link works once
    const again = await request(app).get("/auth/confirm-email-change").query({ token: extractToken(toNew) });
    expect(again.status).toBe(400);
    expect(again.text).toContain("غير صالح");
  });

  it("an expired link and an address someone else took meanwhile are refused, and a newer request replaces an older one", async () => {
    const me = await account("emailedge");
    const first = uniqueEmail("first");
    sendSpy.mockClear();
    await change(me, { newEmail: first, password });
    const firstToken = extractToken(mailTo(first)!);
    const second = uniqueEmail("second");
    sendSpy.mockClear();
    await change(me, { newEmail: second, password });
    const secondToken = extractToken(mailTo(second)!);
    expect((await request(app).get("/auth/confirm-email-change").query({ token: firstToken })).status).toBe(400); // replaced

    await prisma.emailChangeToken.updateMany({ where: { userId: me.id, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).get("/auth/confirm-email-change").query({ token: secondToken });
    expect(expired.status).toBe(400);
    expect(expired.text).toContain("انتهت صلاحية");

    sendSpy.mockClear();
    const contested = uniqueEmail("contested");
    await change(me, { newEmail: contested, password });
    const contestedToken = extractToken(mailTo(contested)!);
    await request(app).post("/auth/register").send({ email: contested, password, fullName: "Faster" });
    const taken = await request(app).get("/auth/confirm-email-change").query({ token: contestedToken });
    expect(taken.status).toBe(400);
    expect(taken.text).toContain("مستعملًا بحساب آخر");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).email).toBe(me.email);
    expect((await request(app).get("/auth/confirm-email-change").query({ token: "short" })).status).toBe(400);
  });

  it("an account that signs in with Facebook or Google has no password to repeat", async () => {
    const me = await account("emailsocial");
    await prisma.socialIdentity.create({ data: { userId: me.id, provider: "FACEBOOK", providerUserId: `f-${crypto.randomUUID()}` } });
    const res = await change(me, { newEmail: uniqueEmail("socialnew") });
    expect(res.status).toBe(200);
  });
});

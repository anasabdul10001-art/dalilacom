import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { emailService } from "../src/services/email.service";
import { uniqueEmail, extractToken } from "./helpers";

const sendSpy = vi.spyOn(emailService, "send").mockResolvedValue();

beforeEach(() => {
  sendSpy.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerUser(overrides: Partial<{ email: string; password: string; fullName: string }> = {}) {
  const email = overrides.email ?? uniqueEmail("register");
  const password = overrides.password ?? "correct-horse-battery-staple";
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password, fullName: overrides.fullName ?? "Test User" });
  return { res, email, password };
}

describe("Auth: register", () => {
  it("creates an unverified account and returns a token", async () => {
    const { res, email } = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.emailVerified).toBe(false);
    expect(sendSpy).toHaveBeenCalledOnce();
  });

  it("rejects a duplicate email with a stable error code", async () => {
    const { email, password } = await registerUser();
    const res = await request(app).post("/auth/register").send({ email, password, fullName: "Dup" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("rejects a malformed request with a unified validation envelope", async () => {
    const res = await request(app).post("/auth/register").send({ email: "not-an-email", password: "short", fullName: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toBeDefined();
  });
});

describe("Auth: login", () => {
  it("succeeds with correct credentials", async () => {
    const { email, password } = await registerUser();
    const res = await request(app).post("/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const { email } = await registerUser();
    const wrongPw = await request(app).post("/auth/login").send({ email, password: "totally-wrong" });
    const noSuchUser = await request(app).post("/auth/login").send({ email: uniqueEmail("nope"), password: "totally-wrong" });

    expect(wrongPw.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPw.body.error.code).toBe(noSuchUser.body.error.code);
    expect(wrongPw.body.error.message).toBe(noSuchUser.body.error.message);
  });

  it("rejects login for a disabled account", async () => {
    const { email, password } = await registerUser();
    await prisma.user.update({ where: { email }, data: { isDisabled: true } });
    const res = await request(app).post("/auth/login").send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("Auth: logout", () => {
  it("revokes the token so it can't be reused afterwards", async () => {
    const { email, password } = await registerUser();
    const login = await request(app).post("/auth/login").send({ email, password });
    const token = login.body.token as string;

    const logout1 = await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(logout1.status).toBe(200);

    const logout2 = await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(logout2.status).toBe(401);
    expect(logout2.body.error.code).toBe("AUTH_TOKEN_REVOKED");
  });
});

describe("Auth: email verification", () => {
  it("verifies with a valid token, then treats a repeat as an idempotent success", async () => {
    const { res } = await registerUser();
    const token = extractToken(sendSpy.mock.calls.at(-1)![0]);

    const first = await request(app).post("/auth/verify-email").send({ token });
    expect(first.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: (await prisma.user.findUnique({ where: { email: res.body.user.email } }))!.id } });
    expect(user?.isEmailVerified).toBe(true);

    const second = await request(app).post("/auth/verify-email").send({ token });
    expect(second.status).toBe(200);
    expect(second.body.alreadyVerified).toBe(true);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).post("/auth/verify-email").send({ token: "a".repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_VERIFICATION_TOKEN");
  });

  it("rejects an expired token", async () => {
    await registerUser();
    const token = extractToken(sendSpy.mock.calls.at(-1)![0]);
    const crypto = await import("crypto");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.emailVerificationToken.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/auth/verify-email").send({ token });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VERIFICATION_TOKEN_EXPIRED");
  });

  it("resend-verification invalidates the old token and issues a working new one", async () => {
    const { email } = await registerUser();
    const oldToken = extractToken(sendSpy.mock.calls.at(-1)![0]);

    const resend = await request(app).post("/auth/resend-verification").send({ email });
    expect(resend.status).toBe(200);
    const newToken = extractToken(sendSpy.mock.calls.at(-1)![0]);
    expect(newToken).not.toBe(oldToken);

    const oldAttempt = await request(app).post("/auth/verify-email").send({ token: oldToken });
    expect(oldAttempt.status).toBe(400);
    expect(oldAttempt.body.error.code).toBe("INVALID_VERIFICATION_TOKEN");

    const newAttempt = await request(app).post("/auth/verify-email").send({ token: newToken });
    expect(newAttempt.status).toBe(200);
  });

  it("gives the same generic response for resend on a nonexistent email (no account enumeration)", async () => {
    const { email } = await registerUser();
    const forExisting = await request(app).post("/auth/resend-verification").send({ email });
    const forNonexistent = await request(app).post("/auth/resend-verification").send({ email: uniqueEmail("ghost") });
    expect(forExisting.body.message).toBe(forNonexistent.body.message);
    expect(forExisting.status).toBe(forNonexistent.status);
  });
});

describe("Auth: password reset", () => {
  it("gives an identical generic response whether or not the email exists", async () => {
    const { email } = await registerUser();
    sendSpy.mockClear(); // registration itself already sent a verification email — not what we're counting here
    const forExisting = await request(app).post("/auth/forgot-password").send({ email });
    const forNonexistent = await request(app).post("/auth/forgot-password").send({ email: uniqueEmail("ghost") });
    expect(forExisting.status).toBe(200);
    expect(forNonexistent.status).toBe(200);
    expect(forExisting.body.message).toBe(forNonexistent.body.message);
    expect(sendSpy).toHaveBeenCalledTimes(1); // only for the real account
  });

  it("resets the password, signs out old sessions, and rejects reuse of the token", async () => {
    const { email, password } = await registerUser();
    const oldLogin = await request(app).post("/auth/login").send({ email, password });
    const oldToken = oldLogin.body.token as string;

    await request(app).post("/auth/forgot-password").send({ email });
    const resetToken = extractToken(sendSpy.mock.calls.at(-1)![0]);

    const newPassword = "brand-new-password-123";
    const resetRes = await request(app).post("/auth/reset-password").send({ token: resetToken, newPassword });
    expect(resetRes.status).toBe(200);

    // old JWT (issued before the reset) must no longer work
    const oldTokenCheck = await request(app).post("/auth/logout").set("Authorization", `Bearer ${oldToken}`);
    expect(oldTokenCheck.status).toBe(401);

    // old password no longer works, new one does
    const loginOld = await request(app).post("/auth/login").send({ email, password });
    expect(loginOld.status).toBe(401);
    const loginNew = await request(app).post("/auth/login").send({ email, password: newPassword });
    expect(loginNew.status).toBe(200);

    // the reset token cannot be reused
    const reuse = await request(app).post("/auth/reset-password").send({ token: resetToken, newPassword: "another-one-123" });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("RESET_TOKEN_ALREADY_USED");
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(app).post("/auth/reset-password").send({ token: "b".repeat(64), newPassword: "whatever-123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  it("rejects an expired reset token", async () => {
    const { email } = await registerUser();
    await request(app).post("/auth/forgot-password").send({ email });
    const token = extractToken(sendSpy.mock.calls.at(-1)![0]);
    const crypto = await import("crypto");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.passwordResetToken.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/auth/reset-password").send({ token, newPassword: "whatever-123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RESET_TOKEN_EXPIRED");
  });
});

describe("Auth: change password", () => {
  it("rotates the password, revokes the old token and returns a working new one", async () => {
    const { email, password } = await registerUser();
    const login = await request(app).post("/auth/login").send({ email, password });
    const oldToken = login.body.token as string;

    const wrong = await request(app).post("/auth/change-password").set("Authorization", `Bearer ${oldToken}`).send({ currentPassword: "nope-nope", newPassword: "brand-new-password-1" });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post("/auth/change-password").set("Authorization", `Bearer ${oldToken}`).send({ currentPassword: password, newPassword: "brand-new-password-1" });
    expect(ok.status).toBe(200);

    const oldCheck = await request(app).post("/auth/logout").set("Authorization", `Bearer ${oldToken}`);
    expect(oldCheck.status).toBe(401);
    const newCheck = await request(app).post("/auth/logout").set("Authorization", `Bearer ${ok.body.token}`);
    expect(newCheck.status).toBe(200);

    expect((await request(app).post("/auth/login").send({ email, password })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email, password: "brand-new-password-1" })).status).toBe(200);
  });
});

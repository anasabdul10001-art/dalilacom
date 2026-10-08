import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { signAuthToken } from "../utils/jwt";
import { requireAuth } from "../middleware/auth";
import { sendError, sendValidationError } from "../lib/apiError";
import { DEFAULT_LANGUAGE, resolveLanguage } from "../lib/languages";
import { translateText } from "../i18n";
import { generateRawToken, hashToken } from "../services/token.service";
import { emailService } from "../services/email.service";
import { logSecurityEvent } from "../services/securityEvent.service";
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  resendVerificationRateLimiter,
  resetPasswordRateLimiter,
  verifyEmailRateLimiter,
} from "../middleware/rateLimit";

export const authRouter = Router();

const EMAIL_VERIFICATION_TTL_MS = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS ?? 24) * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30) * 60 * 1000;

function publicUserShape(user: { id: string; email: string; fullName: string; role: string; isEmailVerified: boolean }) {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, emailVerified: user.isEmailVerified };
}

export async function issueVerificationToken(userId: string) {
  const { raw, hash } = generateRawToken();
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) },
  });
  return raw;
}

export async function sendVerificationEmail(to: string, rawToken: string, lang: string = DEFAULT_LANGUAGE) {
  const base = process.env.PUBLIC_BASE_URL ?? "";
  const link = `${base}/auth/verify-email?token=${rawToken}`;
  try {
    await emailService.send({
      to,
      subject: translateText("تأكيد بريدك الإلكتروني — دليلكم", lang),
      text: translateText(`مرحبًا،\n\nلتفعيل حسابك على دليلكم اضغط الرابط التالي (صالح لمدة ${EMAIL_VERIFICATION_TTL_MS / 3_600_000} ساعة):\n${link}\n\nإذا لم تطلب هذا، تجاهل هذه الرسالة.`, lang),
    });
  } catch (err) {
    // Verification email failing to send must never fail registration itself — the user can
    // always use resend-verification once mail delivery is fixed.
    console.error("Failed to send verification email:", err instanceof Error ? err.message : err);
  }
}

async function sendResetEmail(to: string, rawToken: string, lang: string = DEFAULT_LANGUAGE) {
  const base = process.env.PUBLIC_BASE_URL ?? "";
  const link = `${base}/reset-password.html?token=${rawToken}`;
  try {
    await emailService.send({
      to,
      subject: translateText("إعادة تعيين كلمة السر — دليلكم", lang),
      text: translateText(`مرحبًا،\n\nطلب أحدهم إعادة تعيين كلمة سر حسابك على دليلكم. إذا كنت أنت، اضغط الرابط التالي (صالح لمدة ${PASSWORD_RESET_TTL_MS / 60_000} دقيقة):\n${link}\n\nإذا لم تطلب هذا، تجاهل هذه الرسالة — كلمة سرك لن تتغيّر.`, lang),
    });
  } catch (err) {
    console.error("Failed to send password reset email:", err instanceof Error ? err.message : err);
  }
}

/* ---------------- register ---------------- */

const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8),
  fullName: z.string().min(2),
});

authRouter.post("/register", registerRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { email, phone, password, fullName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return sendError(res, 409, "EMAIL_ALREADY_REGISTERED", "هذا البريد الإلكتروني مسجّل مسبقًا");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, phone, passwordHash, fullName, language: resolveLanguage(req) },
  });

  const rawToken = await issueVerificationToken(user.id);
  await sendVerificationEmail(user.email, rawToken, resolveLanguage(req));
  await logSecurityEvent({ userId: user.id, type: "REGISTER", req });

  // Registration signs the user in immediately (email verification is tracked but does not yet
  // gate login — see Phase 1A report). Existing Android/web clients depend on this behavior.
  const token = signAuthToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
  return res.status(201).json({ token, user: publicUserShape(user) });
});

/* ---------------- login ---------------- */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post("/login", loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await logSecurityEvent({ type: "LOGIN_FAILURE", req, metadata: { reason: "no_such_user" } });
    return sendError(res, 401, "AUTH_INVALID_CREDENTIALS", "البريد الإلكتروني أو كلمة السر غير صحيحة");
  }

  if (user.isDisabled) {
    await logSecurityEvent({ userId: user.id, type: "LOGIN_FAILURE", req, metadata: { reason: "disabled" } });
    return sendError(res, 403, "ACCOUNT_DISABLED", "هذا الحساب معطّل، تواصل مع الدعم");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await logSecurityEvent({ userId: user.id, type: "LOGIN_FAILURE", req, metadata: { reason: "bad_password" } });
    return sendError(res, 401, "AUTH_INVALID_CREDENTIALS", "البريد الإلكتروني أو كلمة السر غير صحيحة");
  }

  await logSecurityEvent({ userId: user.id, type: "LOGIN_SUCCESS", req });
  const token = signAuthToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
  return res.json({ token, user: publicUserShape(user) });
});

/* ---------------- current user ---------------- */

// The signed-in user's own profile, including whether their email is verified yet.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  // emailDeliveryEnabled lets clients avoid offering "resend verification" while no mail provider is configured.
  res.json({ user: publicUserShape(user), emailDeliveryEnabled: !!process.env.SMTP_HOST });
});

/* ---------------- logout ---------------- */

// Bumping tokenVersion invalidates this JWT (and every other JWT already issued to this
// user, on every device) immediately, even though JWTs are otherwise stateless.
authRouter.post("/logout", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { tokenVersion: { increment: 1 } },
  });
  await logSecurityEvent({ userId: req.user!.id, type: "LOGOUT", req });
  res.json({ message: "Logged out" });
});

/* ---------------- email verification ---------------- */

async function consumeVerificationToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record) return { outcome: "INVALID" as const };
  if (record.consumedAt) return record.user.isEmailVerified ? { outcome: "ALREADY_VERIFIED" as const } : { outcome: "INVALID" as const };
  if (record.expiresAt.getTime() < Date.now()) return { outcome: "EXPIRED" as const };

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    // Defense in depth: any other still-outstanding token for this user is now moot.
    prisma.emailVerificationToken.updateMany({
      where: { userId: record.userId, consumedAt: null, id: { not: record.id } },
      data: { consumedAt: new Date() },
    }),
  ]);
  await logSecurityEvent({ userId: record.userId, type: "EMAIL_VERIFIED" });
  return { outcome: "VERIFIED" as const };
}

const verifyEmailBodySchema = z.object({ token: z.string().min(10) });

authRouter.post("/verify-email", verifyEmailRateLimiter, async (req, res) => {
  const parsed = verifyEmailBodySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const result = await consumeVerificationToken(parsed.data.token);
  if (result.outcome === "INVALID") return sendError(res, 400, "INVALID_VERIFICATION_TOKEN", "رابط التحقق غير صالح");
  if (result.outcome === "EXPIRED") return sendError(res, 400, "VERIFICATION_TOKEN_EXPIRED", "انتهت صلاحية رابط التحقق، اطلب رابطًا جديدًا");
  return res.json({ message: "تم توثيق البريد الإلكتروني بنجاح", alreadyVerified: result.outcome === "ALREADY_VERIFIED" });
});

// Convenience for clicking the raw link straight from an email client — same-origin GET, no
// frontend build required for this phase. Never returns JSON secrets, just a small HTML page.
authRouter.get("/verify-email", verifyEmailRateLimiter, async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const parsed = verifyEmailBodySchema.safeParse({ token });
  const result = parsed.success ? await consumeVerificationToken(parsed.data.token) : { outcome: "INVALID" as const };

  const messages: Record<string, string> = {
    VERIFIED: "تم توثيق بريدك الإلكتروني بنجاح. يمكنك الآن إغلاق هذه الصفحة والعودة للتطبيق.",
    ALREADY_VERIFIED: "بريدك الإلكتروني موثّق مسبقًا. يمكنك إغلاق هذه الصفحة.",
    EXPIRED: "انتهت صلاحية رابط التحقق. اطلب رابطًا جديدًا من داخل التطبيق.",
    INVALID: "رابط التحقق غير صالح.",
  };
  res.status(result.outcome === "INVALID" ? 400 : 200).type("html").send(
    `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center;color:#1a1a1a"><h2>دليلكم</h2><p>${messages[result.outcome]}</p></body></html>`,
  );
});

const resendSchema = z.object({ email: z.string().email() });

authRouter.post("/resend-verification", resendVerificationRateLimiter, async (req, res) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && !user.isEmailVerified && !user.isDisabled) {
    await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    const rawToken = await issueVerificationToken(user.id);
    await sendVerificationEmail(user.email, rawToken, resolveLanguage(req));
    await logSecurityEvent({ userId: user.id, type: "EMAIL_VERIFICATION_REQUESTED", req });
  }
  // Same response whether or not the account exists/needs it — no account enumeration.
  return res.json({ message: "إذا كان هذا البريد مسجّلًا وغير موثّق، أرسلنا رابط تحقق جديد" });
});

/* ---------------- password reset ---------------- */

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && !user.isDisabled) {
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    const { raw, hash } = generateRawToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
    });
    await sendResetEmail(user.email, raw, resolveLanguage(req));
    await logSecurityEvent({ userId: user.id, type: "PASSWORD_RESET_REQUESTED", req });
  }
  // Deliberately identical response regardless of whether the email exists (section: Password Reset).
  return res.json({ message: "إذا كان هذا البريد مسجّلًا، أرسلنا رابط إعادة تعيين كلمة السر" });
});

const resetPasswordSchema = z.object({ token: z.string().min(10), newPassword: z.string().min(8) });

authRouter.post("/reset-password", resetPasswordRateLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { token, newPassword } = parsed.data;

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record) return sendError(res, 400, "INVALID_RESET_TOKEN", "رابط إعادة التعيين غير صالح");
  if (record.consumedAt) return sendError(res, 400, "RESET_TOKEN_ALREADY_USED", "هذا الرابط استُخدم من قبل");
  if (record.expiresAt.getTime() < Date.now()) return sendError(res, 400, "RESET_TOKEN_EXPIRED", "انتهت صلاحية الرابط، اطلب رابطًا جديدًا");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    // tokenVersion bump signs every existing session out — a password reset must not leave old
    // sessions/tokens usable (section: JWT / Session Security).
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, consumedAt: null, id: { not: record.id } },
      data: { consumedAt: new Date() },
    }),
  ]);
  await logSecurityEvent({ userId: record.userId, type: "PASSWORD_RESET_COMPLETED", req });
  return res.json({ message: "تم تغيير كلمة السر بنجاح، سجّل الدخول من جديد" });
});

/* ---------------- change email (signed-in) ---------------- */

const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
const changeEmailSchema = z.object({ newEmail: z.string().trim().toLowerCase().email(), password: z.string().optional() });

async function sendEmailChangeMails(oldEmail: string, newEmail: string, rawToken: string, lang: string) {
  const base = process.env.PUBLIC_BASE_URL ?? "";
  const link = `${base}/auth/confirm-email-change?token=${rawToken}`;
  try {
    await emailService.send({
      to: newEmail,
      subject: translateText("تأكيد بريدك الإلكتروني الجديد — دليلكم", lang),
      text: translateText(`مرحبًا،\n\nطلبت تغيير بريد حسابك على دليلكم إلى هذا العنوان. لتأكيد التغيير اضغط الرابط التالي (صالح لمدة ساعة):\n${link}\n\nإذا لم تطلب هذا، تجاهل هذه الرسالة.`, lang),
    });
    // The old address is told too: if it was not the owner who asked, they still have time to react.
    await emailService.send({
      to: oldEmail,
      subject: translateText("تنبيه أمني — طلب تغيير بريد حسابك", lang),
      text: translateText(`مرحبًا،\n\nوصلنا طلب لتغيير بريد حسابك على دليلكم إلى ${newEmail}. إذا كنت أنت فلا تحتاج لأي إجراء. إذا لم تكن أنت، غيّر كلمة سرك فورًا.`, lang),
    });
  } catch (err) {
    console.error("Failed to send email-change mails:", err instanceof Error ? err.message : err);
  }
}

// Needs real mail delivery: without it the confirmation link would never reach the new address, so it is refused honestly.
authRouter.post("/change-email", loginRateLimiter, requireAuth, async (req, res) => {
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (!process.env.SMTP_HOST) {
    return sendError(res, 503, "EMAIL_NOT_CONFIGURED", "خدمة البريد غير مفعّلة بعد، ما فينا نأكد الإيميل الجديد");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, email: true, passwordHash: true, socialIdentities: { select: { id: true } } } });
  // 403, not 401: a wrong password here must not look like an expired session (the apps sign out on 401).
  if (user.socialIdentities.length === 0 && (!parsed.data.password || !(await bcrypt.compare(parsed.data.password, user.passwordHash)))) {
    return sendError(res, 403, "WRONG_PASSWORD", "كلمة السر غير صحيحة");
  }
  if (parsed.data.newEmail === user.email) return sendError(res, 400, "BAD_REQUEST", "البريد الجديد نفس بريدك الحالي");
  if (await prisma.user.findUnique({ where: { email: parsed.data.newEmail }, select: { id: true } })) {
    return sendError(res, 409, "EMAIL_IN_USE", "هذا البريد مسجّل بحساب ثاني");
  }
  await prisma.emailChangeToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
  const { raw, hash } = generateRawToken();
  await prisma.emailChangeToken.create({ data: { userId: user.id, newEmail: parsed.data.newEmail, tokenHash: hash, expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) } });
  await sendEmailChangeMails(user.email, parsed.data.newEmail, raw, resolveLanguage(req));
  await logSecurityEvent({ userId: user.id, type: "EMAIL_CHANGE_REQUESTED", req });
  return res.json({ message: "أرسلنا رابط التأكيد للبريد الجديد. اضغطه ليتم التغيير." });
});

// The link in the email: a small page, as for email verification. On success the account carries the new, already-confirmed
// address and every session ends — the person signs in again with the new email.
authRouter.get("/confirm-email-change", verifyEmailRateLimiter, async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  let outcome: "CHANGED" | "EXPIRED" | "INVALID" | "TAKEN" = "INVALID";
  const record = token.length >= 10 ? await prisma.emailChangeToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }) : null;
  if (record && !record.consumedAt) {
    if (record.expiresAt.getTime() < Date.now()) {
      outcome = "EXPIRED";
    } else if (await prisma.user.findUnique({ where: { email: record.newEmail }, select: { id: true } })) {
      outcome = "TAKEN";
    } else {
      await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { email: record.newEmail, isEmailVerified: true, tokenVersion: { increment: 1 } } }),
        prisma.emailChangeToken.updateMany({ where: { userId: record.userId, consumedAt: null }, data: { consumedAt: new Date() } }),
      ]);
      await logSecurityEvent({ userId: record.userId, type: "EMAIL_CHANGED" });
      try {
        await emailService.send({
          to: record.user.email,
          subject: translateText("تم تغيير بريد حسابك", resolveLanguage(req)),
          text: translateText(`تم تغيير بريد حسابك على دليلكم إلى ${record.newEmail}. إذا لم تكن أنت، تواصل معنا فورًا على dalilacomsy@gmail.com.`, resolveLanguage(req)),
        });
      } catch {
        /* best-effort */
      }
      outcome = "CHANGED";
    }
  }
  const messages = {
    CHANGED: "تم تغيير بريدك الإلكتروني وتوثيقه. سجّل الدخول من جديد بالبريد الجديد.",
    EXPIRED: "انتهت صلاحية رابط التغيير. اطلب تغييرًا جديدًا من التطبيق.",
    TAKEN: "هذا البريد صار مستعملًا بحساب آخر، جرّب بريدًا ثانيًا.",
    INVALID: "رابط التغيير غير صالح.",
  };
  res.status(outcome === "CHANGED" ? 200 : 400).type("html").send(
    `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center;color:#1a1a1a"><h2>دليلكم</h2><p>${messages[outcome]}</p></body></html>`,
  );
});

/* ---------------- change password (signed-in) ---------------- */

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

// Lets a signed-in user rotate their own password without needing email delivery — the old token
// is revoked (tokenVersion bump) and a fresh one is returned so this device stays signed in.
authRouter.post("/change-password", loginRateLimiter, requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    await logSecurityEvent({ userId: user.id, type: "LOGIN_FAILURE", req, metadata: { reason: "bad_current_password" } });
    return sendError(res, 401, "AUTH_INVALID_CREDENTIALS", "كلمة السر الحالية غير صحيحة");
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return sendError(res, 400, "BAD_REQUEST", "كلمة السر الجديدة لازم تختلف عن الحالية");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), tokenVersion: { increment: 1 } },
  });
  await logSecurityEvent({ userId: user.id, type: "PASSWORD_RESET_COMPLETED", req, metadata: { via: "change_password" } });
  const token = signAuthToken({ sub: updated.id, role: updated.role, tokenVersion: updated.tokenVersion });
  return res.json({ token, message: "تم تغيير كلمة السر" });
});

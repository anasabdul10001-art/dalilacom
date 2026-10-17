import nodemailer, { Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(msg: EmailMessage): Promise<void>;
}

/**
 * Default when no SMTP is configured: logs the email instead of sending it. Never throws, so
 * auth flows keep working (token is still generated and stored) even without a mail provider —
 * this project intentionally doesn't assume one is set up yet.
 */
class ConsoleEmailService implements EmailService {
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[email:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }
}

class SmtpEmailService implements EmailService {
  private transporter: Transporter;
  private from: string;

  constructor() {
    this.from = process.env.SMTP_FROM || "no-reply@dalilacom.dev";
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      // never hang: a wrong port or an unreachable provider fails within seconds
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  }
}

/**
 * Resend through its web API (HTTPS). The free Render plan blocks the SMTP ports (25, 465, 587), so sending through
 * smtp.resend.com times out there; the same account and the same key work over HTTPS.
 */
class ResendEmailService implements EmailService {
  constructor(private apiKey: string, private from: string) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** The key for Resend's web API: RESEND_API_KEY, or the SMTP password when the SMTP host is Resend's (same key). */
function resendKey(): string | undefined {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  if ((process.env.SMTP_HOST ?? "").toLowerCase() === "smtp.resend.com" && process.env.SMTP_PASS) return process.env.SMTP_PASS;
  return undefined;
}

function createEmailService(): EmailService {
  const key = resendKey();
  if (key) return new ResendEmailService(key, process.env.SMTP_FROM || process.env.RESEND_FROM || "no-reply@dalilacom.com");
  if (process.env.SMTP_HOST) return new SmtpEmailService();
  return new ConsoleEmailService();
}

// Pluggable by design (section: EmailService abstraction) — swapping to SendGrid/SES later
// only means implementing EmailService and changing createEmailService, never touching auth logic.
export const emailService: EmailService = createEmailService();
export { ResendEmailService };

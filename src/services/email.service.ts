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
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  }
}

// Pluggable by design (section: EmailService abstraction) — swapping to Resend/SendGrid/SES later
// only means implementing EmailService and changing this one line, never touching auth logic.
export const emailService: EmailService = process.env.SMTP_HOST ? new SmtpEmailService() : new ConsoleEmailService();

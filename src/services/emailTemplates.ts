import { directionOf, translateText } from "../i18n";
import { socialLinksSnapshot } from "./socialLinks.service";

/**
 * The look of every mail Dalilacom sends: the logo on a red band, a clear title, short paragraphs, one big button, and a
 * footer with the ways to reach us. Built with tables and inline styles because mail apps ignore most of modern CSS.
 * Every text is written in Arabic (the source language) and goes through translateText, like the rest of the server.
 */

const RED = "#ba2a34";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function siteBase(): string {
  return (process.env.PUBLIC_BASE_URL || "https://dalilacom.com").replace(/\/+$/, "");
}

export interface BrandedEmail {
  lang: string;
  /** The big title under the logo. */
  heading: string;
  /** The paragraphs of the message, in order. */
  paragraphs: string[];
  /** The one action: a label and where it goes. */
  button?: { label: string; url: string };
  /** A small grey line under the button (how long the link lives...). */
  note?: string;
  /** A short line at the top shown by the inbox list next to the subject. */
  preheader?: string;
  /** Our social media pages that are switched on (admin panel): shown as small round icons in the footer. */
  social?: { platform: string; url: string }[];
}

/** The HTML of a branded mail. All texts are Arabic and are translated here; [paragraphs] values that are already in the reader's language pass through unchanged. */
export function renderBrandedEmail(mail: BrandedEmail): string {
  const t = (s: string) => translateText(s, mail.lang);
  const dir = directionOf(mail.lang);
  const align = dir === "rtl" ? "right" : "left";
  const base = siteBase();
  const paragraphs = mail.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#2b1f1e;">${esc(t(p))}</p>`)
    .join("");
  const button = mail.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 8px;">
        <tr><td align="center" bgcolor="${RED}" style="border-radius:12px;">
          <a href="${esc(mail.button.url)}" style="display:inline-block;padding:15px 34px;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;font-family:Tahoma,Arial,sans-serif;">${esc(t(mail.button.label))}</a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:12.5px;line-height:1.7;color:#8a7774;text-align:${align};">${esc(t("إذا ما اشتغل الزر، انسخ هذا الرابط والصقه في المتصفح:"))}<br>
        <a href="${esc(mail.button.url)}" style="color:${RED};word-break:break-all;direction:ltr;unicode-bidi:embed;">${esc(mail.button.url)}</a></p>`
    : "";
  const note = mail.note ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#8a7774;">${esc(t(mail.note))}</p>` : "";
  const icons = (mail.social ?? [])
    .map(
      (l) =>
        `<a href="${esc(l.url)}" style="display:inline-block;margin:0 4px;"><img src="${base}/brand/social/${esc(l.platform)}.png" alt="${esc(l.platform)}" width="28" height="28" style="width:28px;height:28px;border:0;display:inline-block;"></a>`,
    )
    .join("");
  const preheader = mail.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4eeed;">${esc(t(mail.preheader))}</div>`
    : "";

  return `<!doctype html>
<html lang="${mail.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(t(mail.heading))}</title>
</head>
<body style="margin:0;padding:0;background:#f4eeed;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4eeed" style="background:#f4eeed;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
    <tr><td align="center" bgcolor="${RED}" style="background:${RED};padding:26px 20px;">
      <img src="${base}/brand/${mail.lang === "ar" ? "logo-full-horizontal-white" : "logo-en-horizontal-white"}.png" alt="DALILACOM" height="46" style="height:46px;width:auto;display:block;border:0;">
    </td></tr>
    <tr><td dir="${dir}" style="padding:30px 28px 10px;text-align:${align};">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;color:${RED};">${esc(t(mail.heading))}</h1>
      ${paragraphs}
      ${button}
      ${note}
    </td></tr>
    <tr><td dir="${dir}" style="padding:10px 28px 26px;text-align:${align};">
      <hr style="border:0;border-top:1px solid #efe3e1;margin:18px 0;">
      <p style="margin:0 0 6px;font-size:13px;line-height:1.7;color:#8a7774;">${esc(t("دليلكم: كل محلات مدينتك وعروضها بمكان واحد"))}</p>
      <p style="margin:0;font-size:12.5px;line-height:1.7;color:#8a7774;">
        <a href="${base}" style="color:${RED};text-decoration:none;">dalilacom.com</a> ·
        <a href="mailto:info@dalilacom.com" style="color:${RED};text-decoration:none;">info@dalilacom.com</a>
      </p>
      ${icons ? `<p style="margin:12px 0 0;text-align:${align};">${icons}</p>` : ""}
      <p style="margin:10px 0 0;font-size:11.5px;line-height:1.7;color:#b3a3a0;">${esc(t("هذه رسالة تلقائية، لا ترد عليها. للمساعدة اكتب لنا على info@dalilacom.com"))}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/* ---------------- the account mails ---------------- */

export function verificationEmailHtml(lang: string, link: string, ttlHours: number): string {
  return renderBrandedEmail({ social: socialLinksSnapshot(),
    lang,
    heading: "أهلًا بك في دليلكم",
    paragraphs: ["اضغط الزر لتأكيد بريدك الإلكتروني وتفعيل حسابك."],
    button: { label: "تأكيد البريد الإلكتروني", url: link },
    note: `الرابط صالح لمدة ${ttlHours} ساعة. إذا لم تنشئ حسابًا عندنا، تجاهل هذه الرسالة.`,
    preheader: "خطوة وحدة لتفعيل حسابك",
  });
}

export function resetEmailHtml(lang: string, link: string, ttlMinutes: number): string {
  return renderBrandedEmail({ social: socialLinksSnapshot(),
    lang,
    heading: "إعادة تعيين كلمة السر",
    paragraphs: ["وصلنا طلب لإعادة تعيين كلمة سر حسابك. اضغط الزر لتختار كلمة سر جديدة."],
    button: { label: "اختيار كلمة سر جديدة", url: link },
    note: `الرابط صالح لمدة ${ttlMinutes} دقيقة. إذا لم تطلب هذا، تجاهل الرسالة وكلمة سرك لن تتغيّر.`,
    preheader: "اختر كلمة سر جديدة لحسابك",
  });
}

export function emailChangeConfirmHtml(lang: string, link: string): string {
  return renderBrandedEmail({ social: socialLinksSnapshot(),
    lang,
    heading: "تأكيد بريدك الجديد",
    paragraphs: ["طلبت تغيير بريد حسابك على دليلكم إلى هذا العنوان. اضغط الزر لتأكيد التغيير."],
    button: { label: "تأكيد البريد الجديد", url: link },
    note: "الرابط صالح لمدة ساعة. إذا لم تطلب هذا، تجاهل هذه الرسالة.",
    preheader: "أكّد بريدك الجديد",
  });
}

export function emailChangeAlertHtml(lang: string, newEmail: string): string {
  return renderBrandedEmail({ social: socialLinksSnapshot(),
    lang,
    heading: "تنبيه أمني",
    paragraphs: [
      `وصلنا طلب لتغيير بريد حسابك على دليلكم إلى ${newEmail}.`,
      "إذا كنت أنت فلا تحتاج لأي إجراء. إذا لم تكن أنت، غيّر كلمة سرك فورًا.",
    ],
    preheader: "طلب تغيير بريد حسابك",
  });
}

export function emailChangedHtml(lang: string, newEmail: string): string {
  return renderBrandedEmail({ social: socialLinksSnapshot(),
    lang,
    heading: "تم تغيير بريد حسابك",
    paragraphs: [
      `تم تغيير بريد حسابك على دليلكم إلى ${newEmail}.`,
      "إذا لم تكن أنت، تواصل معنا فورًا على info@dalilacom.com.",
    ],
  });
}

/** A notification the app wrote for the person: the title and text are already in their language. */
export function notificationEmailHtml(lang: string, title: string, body: string | undefined): string {
  return renderBrandedEmail({ social: socialLinksSnapshot(), lang, heading: title, paragraphs: body ? [body] : [] });
}

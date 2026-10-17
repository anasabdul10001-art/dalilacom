import { describe, it, expect } from "vitest";
import { resetEmailHtml, emailChangeAlertHtml } from "../src/services/emailTemplates";

describe("the branded mails", () => {
  it("are right-to-left in Arabic and left-to-right in English, with the button and the link", async () => {
    const ar = resetEmailHtml("ar", "https://dalilacom.com/reset-password.html?token=abc", 30);
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain("إعادة تعيين كلمة السر");
    expect(ar).toContain('href="https://dalilacom.com/reset-password.html?token=abc"');
    const en = resetEmailHtml("en", "https://dalilacom.com/reset-password.html?token=abc", 30);
    expect(en).toContain('dir="ltr"');
    expect(en).toContain("Reset your password");
    expect(en).toContain("valid for 30 minutes");
    expect(en).not.toMatch(/[؀-ۿ]{4,}(?![^<]*<\/a>)/); // no Arabic sentence left in the English mail (the logo alt is Latin)
  });

  it("never lets an address inject markup", async () => {
    const html = emailChangeAlertHtml("en", '"><script>x</script>@a.b');
    expect(html).not.toContain("<script>");
  });
});

describe("the social icons in the footer", () => {
  it("show only the links that are passed (the ones switched on)", async () => {
    const { renderBrandedEmail } = await import("../src/services/emailTemplates");
    const html = renderBrandedEmail({ lang: "en", heading: "H", paragraphs: ["x"], social: [{ platform: "instagram", url: "https://instagram.com/dalilacom" }] });
    expect(html).toContain("/brand/social/instagram.png");
    expect(html).toContain('href="https://instagram.com/dalilacom"');
    expect(html).not.toContain("/brand/social/youtube.png");
  });
});

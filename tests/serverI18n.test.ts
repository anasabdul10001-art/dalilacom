import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { emailService } from "../src/services/email.service";
import { notify } from "../src/services/notification.service";
import { translateText, translateHtml, localizeBody, registeredLanguages } from "../src/i18n";
import { uniqueEmail } from "./helpers";

const sendSpy = vi.spyOn(emailService, "send").mockResolvedValue();
const PASSWORD = "correct-horse-battery-staple";

afterAll(async () => {
  await prisma.$disconnect();
});

async function account(prefix: string, headers: Record<string, string> = {}) {
  const email = uniqueEmail(prefix);
  const res = await request(app).post("/auth/register").set(headers).send({ email, password: PASSWORD, fullName: "I18n Tester" });
  expect(res.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, email, auth: { Authorization: `Bearer ${res.body.token}` } };
}

describe("translateText", () => {
  it("translates whole texts, texts with numbers and names, and leaves everything else alone", () => {
    expect(translateText("الباقة غير موجودة", "en")).toBe("Plan not found");
    expect(translateText("رصيدك 5 والاشتراك بدو 9. اشحن محفظتك أولًا.", "en")).toBe("Your balance is 5 and the subscription needs 9. Top up your wallet first.");
    expect(translateText("باقي 1 يوم على انتهاء عضويتك. جدّدها لتضل تستفيد من الحسومات.", "en")).toContain("1 day left");
    expect(translateText("باقي 3 أيام على انتهاء عضويتك. جدّدها لتضل تستفيد من الحسومات.", "en")).toContain("3 days left");
    expect(translateText("100 دليلكم كوين", "en")).toBe("100 Dalilacom Credits");
    expect(translateText("نص ما إله ترجمة", "en")).toBe("نص ما إله ترجمة");
    expect(translateText("Already English", "en")).toBe("Already English");
    expect(translateText("الباقة غير موجودة", "ar")).toBe("الباقة غير موجودة");
    expect(translateText("الباقة غير موجودة", "zz")).toBe("الباقة غير موجودة"); // a language without a pack stays Arabic
    expect(registeredLanguages()).toContain("en");
  });

  it("translates a page text by text and never touches names between tags", () => {
    const html = '<!doctype html><html lang="ar" dir="rtl"><title>تم الربط ✅</title><body><b>الباقة غير موجودة</b><b>دليلكم الأمل</b></body></html>';
    const out = translateHtml(html, "en");
    expect(out).toContain('<html lang="en" dir="ltr"');
    expect(out).toContain("<title>Connected ✅</title>");
    expect(out).toContain("<b>Plan not found</b>");
    expect(out).toContain("<b>دليلكم الأمل</b>"); // not an exact phrase: left as written
  });

  it("only rewrites message fields of a response body", () => {
    const body = { message: "الباقة غير موجودة", name: "الباقة غير موجودة", items: [{ message: "الباقة غير موجودة" }], error: { code: "X", message: "الباقة غير موجودة" } };
    expect(localizeBody(body, "en")).toEqual({ message: "Plan not found", name: "الباقة غير موجودة", items: [{ message: "الباقة غير موجودة" }], error: { code: "X", message: "Plan not found" } });
  });
});

describe("The server answers in the language the client asks for", () => {
  it("returns Arabic by default and English for ?lang=en or Accept-Language", async () => {
    const wrong = { email: uniqueEmail("nobody"), password: "wrong-password-123" };
    const ar = await request(app).post("/auth/login").send(wrong);
    expect(ar.body.error.message).toBe("البريد الإلكتروني أو كلمة السر غير صحيحة");
    const byQuery = await request(app).post("/auth/login").query({ lang: "en" }).send(wrong);
    expect(byQuery.body.error.message).toBe("Incorrect email or password");
    const byHeader = await request(app).post("/auth/login").set("Accept-Language", "en-US,en;q=0.9").send(wrong);
    expect(byHeader.body.error.message).toBe("Incorrect email or password");
    expect(byHeader.body.error.code).toBeTruthy(); // the machine-readable code never changes
  });

  it("translates success messages and server-made pages", async () => {
    const forgot = await request(app).post("/auth/forgot-password").set("Accept-Language", "en").send({ email: uniqueEmail("ghost") });
    expect(forgot.body.message).toBe("If this email is registered, we sent a password reset link");

    const page = await request(app).get("/auth/verify-email").query({ token: "not-a-real-token-at-all" }).set("Accept-Language", "en");
    expect(page.status).toBe(400);
    expect(page.text).toContain("The verification link isn't valid.");
    expect(page.text).toContain('lang="en" dir="ltr"');
    const arPage = await request(app).get("/auth/verify-email").query({ token: "not-a-real-token-at-all" });
    expect(arPage.text).toContain("رابط التحقق غير صالح.");
    expect(arPage.text).toContain('dir="rtl"');
  });

  it("sends the verification email in the language of the request", async () => {
    sendSpy.mockClear();
    const en = await account("mailen", { "Accept-Language": "en" });
    const enMail = sendSpy.mock.calls.find((c) => c[0].to === en.email)![0];
    expect(enMail.subject).toBe("Confirm your email — Dalilacom");
    expect(enMail.text).toContain("valid for 24 hours");
    expect(enMail.text).toContain("/auth/verify-email?token=");

    const ar = await account("mailar");
    const arMail = sendSpy.mock.calls.find((c) => c[0].to === ar.email)![0];
    expect(arMail.subject).toBe("تأكيد بريدك الإلكتروني — دليلكم");
  });

  it("remembers the language on the account and rejects unknown ones", async () => {
    const user = await account("langprofile", { "Accept-Language": "en" });
    expect((await request(app).get("/profile/me").set(user.auth)).body.language).toBe("en"); // taken from the sign-up request
    expect((await request(app).patch("/profile/me").set(user.auth).send({ language: "ar" })).body.language).toBe("ar");
    expect((await request(app).patch("/profile/me").set(user.auth).send({ language: "xx" })).status).toBe(400);
  });

  it("names the pricing page and the responder channels in English", async () => {
    const catalog = await request(app).get("/plans/catalog").query({ lang: "en" });
    expect(catalog.body.creditName).toBe("Dalilacom Credits");
    const names = catalog.body.services.flatMap((s: { plans: { name: string }[] }) => s.plans.map((p) => p.name));
    expect(names).toContain("Auto-responder — customers");

    const user = await account("channels");
    const channels = await request(app).get("/responder/channels").query({ lang: "en" }).set(user.auth);
    expect(channels.status).toBe(200);
    const telegram = channels.body.find((c: { key: string }) => c.key === "telegram");
    if (telegram) expect(telegram.fields[0].label).toBe("Bot Token (from @BotFather)");
  });
});

describe("Notifications and invoices follow the reader's language", () => {
  it("writes push/email in the recipient's language but keeps the inbox translatable", async () => {
    sendSpy.mockClear();
    const user = await account("notifen");
    await prisma.user.update({ where: { id: user.id }, data: { language: "en" } });

    await notify({ userId: user.id, type: "MEMBERSHIP_EXPIRING", title: "عضويتك عم تنتهي قريبًا", body: "باقي 3 أيام على انتهاء عضويتك. جدّدها لتضل تستفيد من الحسومات." });
    const mail = sendSpy.mock.calls.find((c) => c[0].to === user.email && c[0].subject.includes("membership"))![0];
    expect(mail.subject).toBe("Your membership is about to expire");
    expect(mail.text).toContain("3 days left");

    const stored = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.title).toBe("عضويتك عم تنتهي قريبًا"); // the original is kept

    const asEnglish = await request(app).get("/notifications").set(user.auth).set("Accept-Language", "en");
    expect(asEnglish.body.items[0].title).toBe("Your membership is about to expire");
    const asArabic = await request(app).get("/notifications").set(user.auth);
    expect(asArabic.body.items[0].title).toBe("عضويتك عم تنتهي قريبًا");
  });

  it("prints an invoice in English, left to right, with the product name as the merchant wrote it", async () => {
    const owner = await account("i18nshop");
    const category = await prisma.category.upsert({ where: { slug: "i18n-test-cat" }, update: {}, create: { name: "I18n Test", slug: "i18n-test-cat" } });
    await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: `متجر ${crypto.randomUUID().slice(0, 4)}`, categoryId: category.id, approvalStatus: "APPROVED" } });
    await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
    const product = await request(app).post("/products").set(owner.auth).send({ name: "ملغي", priceCents: 5000, stock: 5, categoryId: category.id }); // a name that is also an Arabic phrase
    expect(product.status).toBe(201);

    const customer = await account("i18nbuyer");
    await request(app).post("/cart/items").set(customer.auth).send({ productId: product.body.id, quantity: 1 });
    const order = (await request(app).post("/cart/checkout").set(customer.auth)).body[0];

    const en = (await request(app).get(`/invoices/order/${order.id}`).query({ lang: "en" }).set(customer.auth)).text;
    expect(en).toContain('<html lang="en" dir="ltr"');
    expect(en).toContain("Order invoice");
    expect(en).toContain("Invoice number");
    expect(en).toContain("Pending");
    expect(en).toContain("Total");
    expect(en).toContain("<td>ملغي</td>"); // user data is shown exactly as written
    expect(en).toMatch(/October|November|December|January|February|March|April|May|June|July|August|September/);
    expect(en).toContain("direction:ltr");

    const ar = (await request(app).get(`/invoices/order/${order.id}`).set(customer.auth)).text;
    expect(ar).toContain('<html lang="ar" dir="rtl"');
    expect(ar).toContain("فاتورة طلب");
    expect(ar).toContain("direction:rtl");
  });
});

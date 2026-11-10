import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { Prisma, ServiceKind } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";

export const billingRouter = Router();
const DAY = 86_400_000;

async function amountFor(planId: string, userId: string) {
  const [plan, user] = await Promise.all([
    prisma.servicePlan.findFirst({ where: { id: planId, isActive: true }, include: { prices: { where: { isActive: true } } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { countryCode: true } }),
  ]);
  if (!plan) return null;
  const country = user?.countryCode ? await prisma.country.findUnique({ where: { isoCode2: user.countryCode.toUpperCase() }, select: { id: true } }) : null;
  const special = country ? plan.prices.find(p => p.countryId === country.id) : null;
  return { plan, amountCents: special?.cashAmountCents ?? plan.priceCents, currency: special?.currencyCode ?? plan.currency, paypalPlanId: special?.paypalPlanId || plan.paypalPlanId };
}

async function paypalAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const base = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";
  const response = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const data = await response.json() as { access_token?: string };
  return response.ok ? data.access_token ?? null : null;
}

billingRouter.post("/checkout", requireAuth, route(async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid(), provider: z.enum(["STRIPE", "PAYPAL"]).default("STRIPE") }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const origin = process.env.PUBLIC_APP_URL;
  if (!origin) return sendError(res, 503, "BILLING_NOT_CONFIGURED", "يلزم ضبط عنوان الموقع على الخادم.");
  const priced = await amountFor(parsed.data.planId, req.user!.id);
  if (!priced) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة أو غير متاحة");
  if (priced.amountCents <= 0) return sendError(res, 400, "BAD_REQUEST", "هذه الباقة مجانية وتُفعّل من زر الاشتراك المجاني");
  if (!/^[a-z]{3}$/i.test(priced.currency)) return sendError(res, 409, "BAD_REQUEST", "عملة الباقة غير مدعومة للدفع الإلكتروني");
  if (priced.plan.durationDays > 1095) return sendError(res, 409, "BAD_REQUEST", "مدة الباقة تتجاوز الحد المسموح للدفع الدوري");
  if (parsed.data.provider === "PAYPAL") {
    const token = await paypalAccessToken();
    if (!token || !priced.paypalPlanId) return sendError(res, 503, "PAYPAL_NOT_CONFIGURED", "PayPal غير مهيأ لهذه الباقة بعد. يلزم ربط الحساب ومعرّف خطة PayPal.");
    const sub = await prisma.platformSubscription.create({ data: { userId: req.user!.id, planId: priced.plan.id, provider: "PAYPAL", amountCents: priced.amountCents, currency: priced.currency.toUpperCase(), currentPeriodEnd: new Date(Date.now() + priced.plan.durationDays * DAY) } });
    const base = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";
    const response = await fetch(`${base}/v1/billing/subscriptions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ plan_id: priced.paypalPlanId, custom_id: sub.id, application_context: { brand_name: "Dalilacom", user_action: "SUBSCRIBE_NOW", shipping_preference: "NO_SHIPPING", return_url: `${origin.replace(/\/$/, "")}/app/?billing=success`, cancel_url: `${origin.replace(/\/$/, "")}/app/?billing=cancel` } }) });
    const result = await response.json() as { id?: string; links?: Array<{ rel: string; href: string }>; message?: string };
    const approve = result.links?.find(link => link.rel === "approve")?.href;
    if (!response.ok || !result.id || !approve) {
      await prisma.platformSubscription.update({ where: { id: sub.id }, data: { status: "FAILED" } });
      return sendError(res, 502, "PAYMENT_PROVIDER_ERROR", result.message || "تعذر بدء دفع PayPal.");
    }
    await prisma.platformSubscription.update({ where: { id: sub.id }, data: { providerSubscriptionId: result.id } });
    return res.json({ checkoutUrl: approve, provider: "PAYPAL" });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return sendError(res, 503, "BILLING_NOT_CONFIGURED", "Stripe غير مهيأ بعد. يلزم ربط مفاتيح الحساب.");
  const sub = await prisma.platformSubscription.create({ data: { userId: req.user!.id, planId: priced.plan.id, provider: "STRIPE", amountCents: priced.amountCents, currency: priced.currency.toUpperCase(), currentPeriodEnd: new Date(Date.now() + priced.plan.durationDays * DAY) } });
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("payment_method_types[0]", "card");
  params.set("payment_method_types[1]", "sepa_debit");
  params.set("client_reference_id", sub.id);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", priced.currency.toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(priced.amountCents));
  params.set("line_items[0][price_data][recurring][interval]", "day");
  params.set("line_items[0][price_data][recurring][interval_count]", String(priced.plan.durationDays));
  params.set("line_items[0][price_data][product_data][name]", `دليلكم — ${priced.plan.name}`);
  params.set("success_url", `${origin.replace(/\/$/, "")}/app/?billing=success`);
  params.set("cancel_url", `${origin.replace(/\/$/, "")}/app/?billing=cancel`);
  params.set("subscription_data[metadata][dalilacomSubscriptionId]", sub.id);
  params.set("metadata[dalilacomSubscriptionId]", sub.id);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const session = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !session.id || !session.url) {
    await prisma.platformSubscription.update({ where: { id: sub.id }, data: { status: "FAILED" } });
    return sendError(res, 502, "PAYMENT_PROVIDER_ERROR", session.error?.message || "تعذر بدء الدفع. حاول لاحقًا.");
  }
  await prisma.platformSubscription.update({ where: { id: sub.id }, data: { providerCheckoutId: session.id } });
  res.json({ checkoutUrl: session.url, provider: "STRIPE" });
}));

billingRouter.post("/trial", requireAuth, route(async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const priced = await amountFor(parsed.data.planId, req.user!.id);
  if (!priced) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة أو غير متاحة");
  if (priced.plan.trialDays <= 0) return sendError(res, 409, "TRIAL_UNAVAILABLE", "لا توجد فترة تجربة لهذه الباقة");
  const prior = await prisma.platformSubscription.findFirst({ where: { userId: req.user!.id, provider: "TRIAL", plan: { service: priced.plan.service } } });
  if (prior) return sendError(res, 409, "TRIAL_ALREADY_USED", "سبق استخدام فترة التجربة لهذه الخدمة");
  const endsAt = new Date(Date.now() + priced.plan.trialDays * DAY);
  await prisma.$transaction(async tx => {
    await tx.platformSubscription.create({ data: { userId: req.user!.id, planId: priced.plan.id, provider: "TRIAL", status: "ACTIVE", amountCents: 0, currency: priced.currency, currentPeriodEnd: endsAt } });
    await activatePlan(tx, req.user!.id, priced.plan.id, priced.plan.service, endsAt);
  });
  res.status(201).json({ ok: true, endsAt });
}));

billingRouter.post("/activate-free", requireAuth, route(async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const priced = await amountFor(parsed.data.planId, req.user!.id);
  if (!priced) return sendError(res, 404, "NOT_FOUND", "الباقة غير موجودة أو غير متاحة");
  if (priced.amountCents !== 0) return sendError(res, 409, "NOT_FREE", "هذه الباقة ليست مجانية");
  const endsAt = new Date(Date.now() + priced.plan.durationDays * DAY);
  await prisma.$transaction(async tx => {
    await tx.platformSubscription.create({ data: { userId: req.user!.id, planId: priced.plan.id, provider: "FREE", status: "ACTIVE", amountCents: 0, currency: priced.currency, currentPeriodEnd: endsAt } });
    await activatePlan(tx, req.user!.id, priced.plan.id, priced.plan.service, endsAt);
  });
  res.status(201).json({ ok: true, endsAt });
}));

billingRouter.get("/mine", requireAuth, route(async (req, res) => {
  const subscriptions = await prisma.platformSubscription.findMany({ where: { userId: req.user!.id }, include: { plan: { select: { name: true, service: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  res.json(subscriptions);
}));

billingRouter.post("/:id/cancel", requireAuth, route(async (req, res) => {
  const sub = await prisma.platformSubscription.findFirst({ where: { id: req.params.id, userId: req.user!.id, provider: { in: ["STRIPE", "PAYPAL"] }, status: "ACTIVE" } });
  if (!sub?.providerSubscriptionId) return sendError(res, 404, "NOT_FOUND", "الاشتراك النشط غير موجود");
  if (sub.provider === "STRIPE") {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return sendError(res, 503, "BILLING_NOT_CONFIGURED", "إعداد Stripe غير مكتمل");
    const form = new URLSearchParams({ cancel_at_period_end: "true" });
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.providerSubscriptionId)}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const result = await response.json() as { error?: { message?: string } };
    if (!response.ok) return sendError(res, 502, "PAYMENT_PROVIDER_ERROR", result.error?.message || "تعذر إلغاء التجديد الآن");
  } else {
    const [token, base] = [await paypalAccessToken(), process.env.PAYPAL_API_BASE || "https://api-m.paypal.com"];
    if (!token) return sendError(res, 503, "PAYMENT_PROVIDER_ERROR", "إعداد PayPal غير مكتمل");
    const response = await fetch(`${base}/v1/billing/subscriptions/${encodeURIComponent(sub.providerSubscriptionId)}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Customer requested cancellation" }) });
    if (!response.ok) return sendError(res, 502, "PAYMENT_PROVIDER_ERROR", "تعذر إلغاء التجديد الآن");
  }
  res.json({ ok: true, endsAt: sub.currentPeriodEnd });
}));

function verifyStripe(rawBody: Buffer, header: string | undefined, secret: string) {
  if (!header) return false;
  const parts = header.split(",").map(x => x.split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest();
  return signatures.some(value => { try { const got = Buffer.from(value, "hex"); return got.length === expected.length && timingSafeEqual(got, expected); } catch { return false; } });
}

async function activatePlan(tx: Prisma.TransactionClient, userId: string, planId: string, service: ServiceKind, endsAt: Date) {
  const existing = await tx.membership.findFirst({ where: { userId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" } });
  if (service === "MEMBERSHIP") {
    if (existing) await tx.membership.update({ where: { id: existing.id }, data: { planId, status: "ACTIVE", endDate: endsAt, isTrial: false } });
    else await tx.membership.create({ data: { userId, planId, memberNumber: `DLK-${randomInt(1_000_000_000, 9_999_999_999)}`, qrSecret: randomBytes(32).toString("hex"), startDate: new Date(), endDate: endsAt } });
    return;
  }
  if (service === "RESPONDER_CUSTOMER" || service === "RESPONDER_MERCHANT") {
    await tx.responderSubscription.upsert({ where: { userId }, create: { userId, status: "ACTIVE", periodEnd: endsAt, aiPeriodStart: new Date(), aiRepliesUsed: 0 }, update: { status: "ACTIVE", periodEnd: endsAt, aiPeriodStart: new Date(), aiRepliesUsed: 0 } });
    return;
  }
  if (service === "MERCHANT_ACCOUNT") {
    const merchant = await tx.merchantProfile.findUnique({ where: { userId }, select: { id: true } });
    if (merchant) await tx.merchantProfile.update({ where: { userId }, data: { planId, planEndsAt: endsAt } });
    else await tx.marketplaceSubscription.upsert({ where: { userId }, create: { userId, planId, endsAt }, update: { planId, endsAt } });
  }
}

async function deactivatePlan(tx: Prisma.TransactionClient, userId: string, service: ServiceKind) {
  const now = new Date();
  if (service === "MEMBERSHIP") await tx.membership.updateMany({ where: { userId, status: "ACTIVE" }, data: { endDate: now } });
  if (service === "RESPONDER_CUSTOMER" || service === "RESPONDER_MERCHANT") await tx.responderSubscription.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "EXPIRED", periodEnd: now } });
  if (service === "MERCHANT_ACCOUNT") {
    await tx.merchantProfile.updateMany({ where: { userId }, data: { planEndsAt: now } });
    await tx.marketplaceSubscription.updateMany({ where: { userId }, data: { endsAt: now } });
  }
}

billingRouter.post("/webhook/stripe", route(async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!secret || !rawBody) return sendError(res, 503, "BILLING_NOT_CONFIGURED", "إعداد استقبال إشعارات الدفع غير مكتمل");
  if (!verifyStripe(rawBody, req.headers["stripe-signature"] as string | undefined, secret)) return sendError(res, 401, "AUTH_INVALID_SIGNATURE", "إشعار الدفع غير موثوق");
  const event = req.body as { type?: string; data?: { object?: Record<string, any> } };
  const object = event.data?.object || {};
  if (event.type === "checkout.session.completed") {
    const id = object.metadata?.dalilacomSubscriptionId || object.client_reference_id;
    // SEPA and other delayed methods can complete checkout before the first payment settles.
    // Do not grant service until Stripe confirms the payment (invoice.paid also handles this).
    if (typeof id === "string" && object.subscription && object.payment_status === "paid") {
      const sub = await prisma.platformSubscription.findUnique({ where: { id }, include: { plan: true } });
      if (sub && sub.status === "PENDING") {
        const endsAt = new Date(Date.now() + sub.plan.durationDays * DAY);
        await prisma.$transaction(async tx => {
          await tx.platformSubscription.update({ where: { id }, data: { status: "ACTIVE", providerSubscriptionId: String(object.subscription), currentPeriodEnd: endsAt } });
          await activatePlan(tx, sub.userId, sub.planId, sub.plan.service, endsAt);
        });
      }
    }
  } else if (event.type === "invoice.paid") {
    const externalId = String(object.subscription || "");
    const invoiceId = String(object.id || "");
    const sub = externalId ? await prisma.platformSubscription.findUnique({ where: { providerSubscriptionId: externalId }, include: { plan: true } }) : null;
    if (sub && invoiceId && sub.latestInvoiceId !== invoiceId) {
      const periodEndUnix = object.lines?.data?.[0]?.period?.end;
      const endsAt = typeof periodEndUnix === "number" ? new Date(periodEndUnix * 1000) : new Date(Date.now() + sub.plan.durationDays * DAY);
      await prisma.$transaction(async tx => {
        await tx.platformSubscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", latestInvoiceId: invoiceId, currentPeriodEnd: endsAt } });
        await activatePlan(tx, sub.userId, sub.planId, sub.plan.service, endsAt);
      });
    }
  } else if (event.type === "invoice.payment_failed") {
    const externalId = String(object.subscription || "");
    if (externalId) await prisma.platformSubscription.updateMany({ where: { providerSubscriptionId: externalId }, data: { status: "PAST_DUE" } });
  } else if (event.type === "customer.subscription.deleted") {
    const externalId = String(object.id || "");
    const sub = externalId ? await prisma.platformSubscription.findFirst({ where: { providerSubscriptionId: externalId } }) : null;
    if (sub) await prisma.$transaction(async tx => {
      await tx.platformSubscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", currentPeriodEnd: new Date() } });
      await deactivatePlan(tx, sub.userId, (await tx.servicePlan.findUniqueOrThrow({ where: { id: sub.planId } })).service);
    });
  }
  res.json({ received: true });
}));

billingRouter.post("/webhook/paypal", route(async (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const [token, base] = [await paypalAccessToken(), process.env.PAYPAL_API_BASE || "https://api-m.paypal.com"];
  if (!webhookId || !token) return sendError(res, 503, "BILLING_NOT_CONFIGURED", "إعداد استقبال إشعارات PayPal غير مكتمل");
  const verifyBody = {
    auth_algo: req.headers["paypal-auth-algo"],
    cert_url: req.headers["paypal-cert-url"],
    transmission_id: req.headers["paypal-transmission-id"],
    transmission_sig: req.headers["paypal-transmission-sig"],
    transmission_time: req.headers["paypal-transmission-time"],
    webhook_id: webhookId,
    webhook_event: req.body,
  };
  const verification = await fetch(`${base}/v1/notifications/verify-webhook-signature`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(verifyBody) });
  const verified = await verification.json() as { verification_status?: string };
  if (!verification.ok || verified.verification_status !== "SUCCESS") return sendError(res, 401, "AUTH_INVALID_SIGNATURE", "إشعار PayPal غير موثوق");
  const event = req.body as { event_type?: string; resource?: Record<string, any> };
  const resource = event.resource || {};
  const externalId = String(resource.id || resource.billing_agreement_id || resource.billing_subscription_id || "");
  const localId = typeof resource.custom_id === "string" ? resource.custom_id : null;
  const sub = localId
    ? await prisma.platformSubscription.findFirst({ where: { id: localId, provider: "PAYPAL" }, include: { plan: true } })
    : externalId ? await prisma.platformSubscription.findFirst({ where: { providerSubscriptionId: externalId, provider: "PAYPAL" }, include: { plan: true } }) : null;
  if (sub && event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED" && sub.status !== "ACTIVE") {
    const scheduled = resource.billing_info?.next_billing_time ? new Date(resource.billing_info.next_billing_time) : null;
    const endsAt = scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled : new Date(Date.now() + sub.plan.durationDays * DAY);
    await prisma.$transaction(async tx => {
      await tx.platformSubscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", providerSubscriptionId: externalId || sub.providerSubscriptionId, currentPeriodEnd: endsAt } });
      await activatePlan(tx, sub.userId, sub.planId, sub.plan.service, endsAt);
    });
  } else if (sub && event.event_type === "PAYMENT.SALE.COMPLETED") {
    const invoiceId = String(resource.id || "");
    if (invoiceId && invoiceId !== sub.latestInvoiceId) {
      const endsAt = new Date(Date.now() + sub.plan.durationDays * DAY);
      await prisma.$transaction(async tx => {
        await tx.platformSubscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", latestInvoiceId: invoiceId, currentPeriodEnd: endsAt } });
        await activatePlan(tx, sub.userId, sub.planId, sub.plan.service, endsAt);
      });
    }
  } else if (sub && event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
    await prisma.platformSubscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
  } else if (sub && ["BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED"].includes(event.event_type || "")) {
    await prisma.$transaction(async tx => {
      await tx.platformSubscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", currentPeriodEnd: new Date() } });
      await deactivatePlan(tx, sub.userId, sub.plan.service);
    });
  }
  res.json({ received: true });
}));


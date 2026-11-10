import { prisma } from "../prisma";
import { screenShop } from "./ai.service";
import { notify } from "./notification.service";
import { findRude } from "../lib/rude";

/**
 * A shop that registers (or changes its name, address or profession) is read at once: clear profanity or a violation is refused
 * with the reason (the owner can fix it and try again), an ordinary shop goes live by itself, and anything doubtful — or when no
 * AI answers — waits for an admin. SHOP_REVIEW=off turns it off (tests).
 */
export const shopReviewEnabled = () => process.env.SHOP_REVIEW !== "off";

type Status = "APPROVED" | "PENDING" | "REJECTED";
export interface ShopOutcome { status: Status; note: string | null; source: "RULES" | "AI" | null }

const hasLetters = (s: string) => /[\p{L}]{2,}/u.test(s);

/** Plain checks that need no AI: obvious nonsense is only "look at it" (REVIEW), clear profanity is a refusal. */
function ruleVerdict(shop: { businessName: string; address: string | null; suggested?: string | null }): { verdict: "OK" | "REVIEW" | "BLOCK"; reasons: string[] } {
  const rude = findRude(shop.businessName, shop.address, shop.suggested);
  if (rude.length) return { verdict: "BLOCK", reasons: ["الاسم أو العنوان فيه ألفاظ غير لائقة"] };
  const reasons: string[] = [];
  const name = shop.businessName.trim();
  if (!hasLetters(name)) reasons.push("اسم النشاط لازم يكون بحروف واضحة");
  if (/(.)\1{4,}/u.test(name)) reasons.push("اسم النشاط فيه حروف متكررة بشكل غريب");
  if (/https?:\/\/|www\.|@|\d{7,}/i.test(name)) reasons.push("اسم النشاط فيه رابط أو رقم هاتف");
  return { verdict: reasons.length ? "REVIEW" : "OK", reasons };
}

async function tellAdmins(shopName: string, why: string | null) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ userId: a.id, type: "SYSTEM", title: "نشاط بانتظار المراجعة", body: why ? `${shopName}: ${why}` : shopName, data: { kind: "SHOP_REVIEW" }, email: false })));
}

/**
 * Looks at one shop, saves the outcome on it and tells the owner. [wasApproved]: the shop was already live (it changed something):
 * when the AI does not answer it simply stays as it was. Never throws.
 */
export async function reviewShop(merchantId: string, opts: { suggestedCategory?: string | null; wasApproved?: boolean } = {}): Promise<ShopOutcome> {
  try {
    const shop = await prisma.merchantProfile.findUnique({ where: { id: merchantId }, include: { category: { select: { name: true } } } });
    if (!shop) return { status: "PENDING", note: null, source: null };
    const current: Status = shop.approvalStatus;
    if (!shopReviewEnabled()) return { status: current, note: null, source: null };

    const rules = ruleVerdict({ businessName: shop.businessName, address: shop.address, suggested: opts.suggestedCategory });
    let verdict = rules.verdict;
    let reasons = rules.reasons;
    let source: "RULES" | "AI" = "RULES";
    if (verdict !== "BLOCK") {
      const ai = await screenShop({ businessName: shop.businessName, address: shop.address, phone: shop.phone, category: shop.category.name, suggestedCategory: opts.suggestedCategory ?? null });
      if (ai) {
        source = "AI";
        if (ai.verdict === "BLOCK" || (ai.verdict === "REVIEW" && verdict === "OK")) verdict = ai.verdict;
        reasons = [...new Set([...reasons, ...ai.reasons])];
      } else if (verdict === "OK") {
        // nothing could read it: a new shop waits for an admin, a live shop that only changed a detail stays as it is
        return { status: current, note: null, source: null };
      }
    }
    const status: Status = verdict === "OK" ? "APPROVED" : verdict === "BLOCK" ? "REJECTED" : "PENDING";
    const note = reasons.join("، ") || null;
    await prisma.merchantProfile.update({
      where: { id: shop.id },
      data: { approvalStatus: status, rejectionReason: status === "REJECTED" ? note ?? "غير مناسب للنشر" : null, reviewNote: status === "PENDING" ? note : null, reviewSource: source },
    });
    if (status !== current || status === "PENDING") await announce(shop.userId, shop.businessName, status, note, current, shop.latitude !== null || shop.longitude !== null || !!shop.address);
    return { status, note, source };
  } catch (err) {
    console.error("Shop review failed:", err instanceof Error ? err.message : err);
    return { status: "PENDING", note: null, source: null };
  }
}

async function announce(userId: string, name: string, status: Status, note: string | null, before: Status, mapListed = true) {
  if (status === "APPROVED") {
    if (before !== "APPROVED") await notify({ userId, type: "SYSTEM", title: mapListed ? "انقبل نشاطك ✅" : "متجرك جاهز ✅", body: mapListed ? `«${name}» صار على دليلكم وبيظهر للزبائن.` : `«${name}» جاهز لإضافة المنتجات. فيك تضيف عنوانه للخريطة بشكل منفصل إذا حابب.`, data: { kind: "SHOP_APPROVED" }, email: false });
  } else if (status === "REJECTED") {
    await notify({ userId, type: "SYSTEM", title: "ما انقبل نشاطك", body: `«${name}»: ${note ?? "غير مناسب للنشر"}. بتقدر تعدّل معلوماتك وتجرّب من جديد.`, data: { kind: "SHOP_REJECTED" }, email: false });
  } else {
    await tellAdmins(name, note);
  }
}

/** An admin's decision (the shop was waiting): the owner is told. */
export async function adminDecidedShop(merchantId: string, approve: boolean, reason: string | null) {
  const shop = await prisma.merchantProfile.findUnique({ where: { id: merchantId }, select: { userId: true, businessName: true, address: true, latitude: true, longitude: true } });
  if (!shop) return;
  await prisma.merchantProfile.update({ where: { id: merchantId }, data: { reviewNote: null, reviewSource: "ADMIN" } });
  await announce(shop.userId, shop.businessName, approve ? "APPROVED" : "REJECTED", reason, "PENDING", shop.latitude !== null || shop.longitude !== null || !!shop.address);
}

/** The registration waits for the answer, but not for long: after [ms] the shop just shows as waiting and the review finishes by itself. */
export async function reviewShopQuick(merchantId: string, opts: { suggestedCategory?: string | null; wasApproved?: boolean } = {}, ms = 9000): Promise<ShopOutcome> {
  const work = reviewShop(merchantId, opts);
  const late = new Promise<ShopOutcome>((resolve) => setTimeout(() => resolve({ status: "PENDING", note: null, source: null }), ms));
  return Promise.race([work, late]);
}

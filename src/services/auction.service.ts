import crypto from "crypto";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";
import { createOrderPayment } from "./payment.service";
import { recordAffiliateCommissionIfReferred } from "./affiliate.service";

/** How long a seller can run an auction (hours). */
export const AUCTION_HOURS = [24, 72, 168] as const;
/** A bid in the last minutes moves the end a little later, so nobody wins with a last-second bid nobody could answer. */
export const EXTEND_WINDOW_MS = 2 * 60 * 1000;
/** The winner's time to check out. */
export const CLAIM_DAYS = 3;
/** Every bid has to beat the highest one by at least this share. */
const STEP_PERCENT = 5;

/** The lowest bid that is accepted now: the start price for the first bid, then the highest bid plus 5%. */
export function minNextBid(a: { bidCount: number; startPriceCents: number; currentBidCents: number }): number {
  if (a.bidCount === 0) return a.startPriceCents;
  return a.currentBidCents + Math.max(1, Math.ceil((a.currentBidCents * STEP_PERCENT) / 100));
}

export function auctionView(a: { id: string; startPriceCents: number; currentBidCents: number; bidCount: number; endsAt: Date; status: string; claimDeadline: Date | null; highBidderId: string | null }, viewerId?: string | null) {
  return {
    id: a.id,
    status: a.status,
    startPriceCents: a.startPriceCents,
    currentBidCents: a.currentBidCents,
    bidCount: a.bidCount,
    minNextBidCents: minNextBid(a),
    endsAt: a.endsAt.toISOString(),
    claimDeadline: a.claimDeadline?.toISOString() ?? null,
    ...(viewerId ? { youLead: a.highBidderId === viewerId && a.status === "OPEN", youWon: a.highBidderId === viewerId && (a.status === "WON" || a.status === "PAID") } : {}),
  };
}

/** Ends one auction whose time is up (idempotent: only the call that finds it still OPEN does the work). */
export async function settleAuction(id: string, now = new Date()): Promise<boolean> {
  const auction = await prisma.auction.findUnique({ where: { id }, include: { product: { include: { merchant: { select: { userId: true } } } } } });
  if (!auction || auction.status !== "OPEN" || auction.endsAt > now) return false;
  const winner = auction.bidCount > 0 ? auction.highBidderId : null;
  const next = winner ? { status: "WON" as const, claimDeadline: new Date(now.getTime() + CLAIM_DAYS * 86400000) } : { status: "NO_BIDS" as const };
  const done = await prisma.auction.updateMany({ where: { id, status: "OPEN", endsAt: { lte: now } }, data: next });
  if (done.count === 0) return false;
  await prisma.product.update({ where: { id: auction.productId }, data: { stock: 0 } }); // gone from the shelves either way
  const name = auction.product.name;
  const data = { productId: auction.productId, auctionId: id };
  if (winner) {
    await notify({ userId: winner, type: "ORDER_STATUS", title: "فزت بالمزاد 🎉", body: `فزت بمزاد «${name}». أكمل الشراء خلال ${CLAIM_DAYS} أيام.`, data: { ...data, audience: "BIDDER" } });
    await notify({ userId: auction.product.merchant.userId, type: "ORDER_STATUS", title: "انتهى مزادك", body: `انتهى مزاد «${name}» وله فائز. ننتظر إتمامه للشراء.`, data: { ...data, audience: "MERCHANT" } });
  } else {
    await notify({ userId: auction.product.merchant.userId, type: "ORDER_STATUS", title: "انتهى مزادك", body: `انتهى مزاد «${name}» دون أي مزايدة.`, data: { ...data, audience: "MERCHANT" } });
  }
  return true;
}

/** Ends every auction that is due, and marks the won ones nobody paid for. Run every minute. */
export async function settleDueAuctions(now = new Date()): Promise<number> {
  const due = await prisma.auction.findMany({ where: { status: "OPEN", endsAt: { lte: now } }, select: { id: true }, take: 200 });
  let n = 0;
  for (const a of due) if (await settleAuction(a.id, now)) n++;
  const late = await prisma.auction.findMany({ where: { status: "WON", claimDeadline: { lte: now } }, include: { product: { include: { merchant: { select: { userId: true } } } } }, take: 200 });
  for (const a of late) {
    const r = await prisma.auction.updateMany({ where: { id: a.id, status: "WON" }, data: { status: "UNCLAIMED" } });
    if (r.count === 0) continue;
    n++;
    await notify({ userId: a.product.merchant.userId, type: "ORDER_STATUS", title: "لم يكمل الفائز الشراء", body: `لم يُكمل الفائز شراء «${a.product.name}» في الوقت المحدد.`, data: { productId: a.productId, auctionId: a.id, audience: "MERCHANT" } });
  }
  return n;
}

export async function placeBid(productId: string, userId: string, amountCents: number, now = new Date()) {
  const auction = await prisma.auction.findUnique({ where: { productId }, include: { product: { include: { merchant: { select: { userId: true } } } } } });
  if (!auction || !auction.product.isActive || auction.product.moderation !== "APPROVED") throw new ApiError(404, "NOT_FOUND", "المزاد غير موجود");
  if (auction.status !== "OPEN" || auction.endsAt <= now) {
    await settleAuction(auction.id, now);
    throw new ApiError(409, "AUCTION_ENDED", "انتهى هذا المزاد");
  }
  if (auction.product.merchant.userId === userId) throw new ApiError(403, "FORBIDDEN", "لا يمكنك المزايدة على منتجك");
  if (auction.highBidderId === userId) throw new ApiError(409, "ALREADY_HIGHEST", "مزايدتك هي الأعلى حاليًا");
  const min = minNextBid(auction);
  if (amountCents < min) throw new ApiError(409, "BID_TOO_LOW", "مزايدتك أقل من الحد الأدنى المسموح");

  const endsAt = auction.endsAt.getTime() - now.getTime() < EXTEND_WINDOW_MS ? new Date(now.getTime() + EXTEND_WINDOW_MS) : auction.endsAt;
  const previous = auction.highBidderId;
  const won = await prisma.$transaction(async (tx) => {
    // taken only if nobody bid in between: the count is what the bid was checked against
    const r = await tx.auction.updateMany({ where: { id: auction.id, status: "OPEN", bidCount: auction.bidCount, endsAt: { gt: now } }, data: { currentBidCents: amountCents, bidCount: { increment: 1 }, highBidderId: userId, endsAt } });
    if (r.count === 0) return false;
    await tx.auctionBid.create({ data: { auctionId: auction.id, userId, amountCents } });
    return true;
  });
  if (!won) throw new ApiError(409, "BID_CONFLICT", "تغيّر سعر المزاد قبل إرسال مزايدتك. حاول مرة أخرى.");
  if (previous && previous !== userId) {
    await notify({ userId: previous, type: "ORDER_STATUS", title: "تفوّق عليك أحدهم في المزاد", body: `تمت المزايدة بمبلغ أعلى على «${auction.product.name}».`, data: { productId, auctionId: auction.id, audience: "BIDDER" } });
  }
  return prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
}

function generateOrderNumber(): string {
  return `ORD-${crypto.randomInt(1_000_000_000, 9_999_999_999)}`;
}

export interface AuctionCheckoutInput { shippingId?: string; paymentMethod: PaymentMethod; address?: string; phone?: string }

/** The winner pays the winning bid: it becomes an ordinary order of the shop, handled like any other. */
export async function checkoutAuction(productId: string, userId: string, input: AuctionCheckoutInput, now = new Date()) {
  const order = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { productId }, include: { product: { include: { merchant: { select: { id: true, userId: true } } } } } });
    if (!auction || auction.status !== "WON" || auction.highBidderId !== userId) throw new ApiError(404, "NOT_FOUND", "لا يوجد مزاد فزت به لإتمام شرائه");
    if (auction.claimDeadline && auction.claimDeadline <= now) throw new ApiError(409, "CLAIM_EXPIRED", "انتهت مهلة إتمام الشراء");
    const merchant = auction.product.merchant;
    const methods = await tx.shippingMethod.findMany({ where: { merchantId: merchant.id, isActive: true } });
    const picked = methods.find((m) => m.id === input.shippingId);
    if (methods.length > 0 && !picked) throw new ApiError(400, "BAD_REQUEST", "اختر طريقة الشحن");
    const kind = picked?.kind ?? "DELIVERY";
    if (kind !== "PICKUP" && !input.address) throw new ApiError(400, "BAD_REQUEST", "أدخل عنوان التوصيل");
    const provider = input.paymentMethod === "BANK_ALSHAM" || input.paymentMethod === "SYRIATEL" || input.paymentMethod === "MTN" ? input.paymentMethod : null;
    const recipient = provider ? await tx.sellerPaymentMethod.findFirst({ where: { userId: merchant.userId, provider, isEnabled: true } }) : null;
    if (input.paymentMethod === "ONLINE" || (provider && !recipient)) throw new ApiError(400, "PAYMENT_METHOD_UNAVAILABLE", "وسيلة الدفع المختارة غير مفعّلة عند صاحب المتجر. اختر الدفع عند الاستلام أو وسيلة أخرى.");
    const shippingCents = picked?.costCents ?? 0;
    const claimed = await tx.auction.updateMany({ where: { id: auction.id, status: "WON" }, data: { status: "PAID" } });
    if (claimed.count === 0) throw new ApiError(409, "CONFLICT", "تم إتمام هذا الشراء بالفعل");
    const created = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        merchantId: merchant.id,
        subtotalCents: auction.currentBidCents,
        memberDiscountCents: 0,
        shippingName: picked?.name ?? null,
        shippingKind: kind,
        deliveryAddress: kind === "PICKUP" ? null : input.address ?? null,
        deliveryPhone: input.phone ?? null,
        shippingCents,
        totalCents: auction.currentBidCents + shippingCents,
        items: { create: [{ productId: auction.productId, productName: auction.product.name, quantity: 1, unitPriceCents: auction.currentBidCents }] },
      },
      include: { items: true },
    });
    const payment = await createOrderPayment(tx, created.id, input.paymentMethod, created.totalCents, recipient ? { name: recipient.recipientName, account: recipient.accountNumber } : undefined);
    await tx.auction.update({ where: { id: auction.id }, data: { orderId: created.id } });
    await recordAffiliateCommissionIfReferred(tx, merchant.id, userId, "ORDER", created.id, created.totalCents);
    return { ...created, payment, sellerUserId: merchant.userId };
  });
  await notify({ userId, type: "ORDER_PLACED", title: "تم استلام طلبك ✅", body: `طلبك ${order.orderNumber} وصل إلى صاحب النشاط. سيصلك تحديث كلما تغيرت حالته.`, data: { orderId: order.id, orderNumber: order.orderNumber, merchantId: order.merchantId } });
  await notify({ userId: order.sellerUserId, type: "ORDER_PLACED", title: "وصلك طلب جديد 🛒", body: `وصلك الطلب ${order.orderNumber}. افتح الطلبات لتأكيده.`, data: { orderId: order.id, orderNumber: order.orderNumber, audience: "MERCHANT" } });
  const { sellerUserId: _s, ...rest } = order;
  void _s;
  return rest;
}

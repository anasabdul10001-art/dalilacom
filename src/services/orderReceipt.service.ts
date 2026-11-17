import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";

/** Days the receiver has to accept or reject a delivered order; after that it counts as accepted. */
export const RECEIPT_DAYS = 10;

/** The receiver (the customer) accepts or rejects a delivered order. One answer, while it is still pending. */
export async function respondToReceipt(userId: string, orderId: string, decision: "ACCEPT" | "REJECT", note?: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { merchant: { select: { userId: true } } } });
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
  if (order.status !== "DELIVERED" || order.receiptStatus !== "PENDING") throw new ApiError(409, "CONFLICT", "هالطلب ما بيحتاج تأكيد استلام");
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, userId, receiptStatus: "PENDING" },
    data: { receiptStatus: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED", receiptRespondedAt: new Date(), receiptNote: decision === "REJECT" ? note ?? null : null },
  });
  if (claimed.count !== 1) throw new ApiError(409, "CONFLICT", "تم الرد على هالطلب من قبل");
  if (decision === "REJECT") {
    await reverseRejectedOrder(orderId, order.merchant.userId).catch((err) => console.error("Could not reverse a rejected order in accounting", err));
    const drivers = order.driverStaffId ? await prisma.businessStaff.findMany({ where: { id: order.driverStaffId, userId: { not: null } }, select: { userId: true } }) : [];
    for (const target of [order.merchant.userId, ...drivers.map((d) => d.userId as string)]) {
      await notify({ userId: target, type: "ORDER_STATUS", title: `الزبون رفض استلام الطلب ${order.orderNumber}`, body: note ?? "", data: { orderId, orderNumber: order.orderNumber, status: "RECEIPT_REJECTED" } }).catch(() => undefined);
    }
  }
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

/**
 * A rejected delivery is not a sale: the sale income and goods cost booked at delivery are taken out, and the staff commissions
 * on it that are still unpaid are voided. The delivery fee stays (it was spent) and commissions already paid stay (the owner decides).
 */
export async function reverseRejectedOrder(orderId: string, ownerId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.accountingEntry.deleteMany({ where: { userId: ownerId, sourceKey: { in: [`store-order:${orderId}`, `store-order-cost:${orderId}`] } } });
    await tx.businessStaffCommission.updateMany({
      where: { ownerId, status: "ACCRUED", OR: [{ saleId: `order:${orderId}` }, { saleId: { startsWith: `team:order:${orderId}:` } }] },
      data: { amountCents: 0, status: "VOID" },
    });
  });
}

/** Delivered orders nobody answered for RECEIPT_DAYS days count as accepted. */
export async function autoAcceptDueReceipts(now = new Date()) {
  const cutoff = new Date(now.getTime() - RECEIPT_DAYS * 86400000);
  const done = await prisma.order.updateMany({
    where: { status: "DELIVERED", receiptStatus: "PENDING", deliveredAt: { lt: cutoff } },
    data: { receiptStatus: "ACCEPTED", receiptRespondedAt: now, receiptAuto: true },
  });
  return done.count;
}

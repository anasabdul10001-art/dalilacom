import { prisma } from "../prisma";
import { marketOfUser } from "./viewerCountry.service";

/** Record completed web-store orders for the shop owner. The unique source key makes retries harmless. */
export async function recordDeliveredOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { merchant: { select: { userId: true } }, items: { include: { product: { select: { costPriceCents: true } } } } },
  });
  if (!order || order.status !== "DELIVERED") return;
  const userId = order.merchant.userId;
  const currency = await marketOfUser(userId);
  const commissions = await prisma.affiliateCommission.findMany({
    where: { sourceType: "ORDER", sourceId: order.id },
    select: { id: true, commissionCents: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.accountingEntry.upsert({
      where: { userId_sourceKey: { userId, sourceKey: `store-order:${order.id}` } },
      create: {
        userId,
        type: "INCOME",
        category: "مبيعات المتجر",
        description: `الطلب ${order.orderNumber}`,
        amountCents: order.subtotalCents - order.memberDiscountCents,
        currency,
        occurredAt: order.updatedAt,
        source: "ORDER",
        sourceKey: `store-order:${order.id}`,
      },
      update: {},
    });
    for (const commission of commissions) {
      await tx.accountingEntry.upsert({
        where: { userId_sourceKey: { userId, sourceKey: `affiliate-commission:${commission.id}` } },
        create: {
          userId,
          type: "EXPENSE",
          category: "عمولة المسوّقين",
          description: `عمولة تسويق للطلب ${order.orderNumber}`,
          amountCents: commission.commissionCents,
          currency,
          occurredAt: order.updatedAt,
          source: "COMMISSION",
          sourceKey: `affiliate-commission:${commission.id}`,
        },
        update: {},
      });
    }
    const goodsCostCents = order.items.reduce((sum, item) => sum + item.product.costPriceCents * item.quantity, 0);
    if (goodsCostCents > 0) {
      await tx.accountingEntry.upsert({
        where: { userId_sourceKey: { userId, sourceKey: `store-order-cost:${order.id}` } },
        create: { userId, type: "EXPENSE", category: "تكلفة البضاعة المباعة", description: `تكلفة منتجات الطلب ${order.orderNumber}`, amountCents: goodsCostCents, currency, occurredAt: order.updatedAt, source: "ORDER", sourceKey: `store-order-cost:${order.id}` },
        update: {},
      });
    }
    if (order.shippingCents > 0) {
      await tx.accountingEntry.upsert({
        where: { userId_sourceKey: { userId, sourceKey: `store-delivery:${order.id}` } },
        create: { userId, type: "EXPENSE", category: "أجور التوصيل", description: `أجرة الموزّع للطلب ${order.orderNumber}${order.shippingName ? ` — ${order.shippingName}` : ""}`, amountCents: order.shippingCents, currency, occurredAt: order.updatedAt, source: "DELIVERY", sourceKey: `store-delivery:${order.id}` },
        update: {},
      });
    }
  });
}

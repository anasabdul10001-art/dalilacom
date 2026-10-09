import { Router } from "express";
import { z } from "zod";
import { OrderStatus, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { notify } from "../services/notification.service";

/** Customer-facing wording for each order state (section 13: "تغيير حالة الطلب"). */
const STATUS_MESSAGE: Record<OrderStatus, string> = {
  PENDING: "طلبك وصل وبانتظار تأكيد التاجر.",
  CONFIRMED: "التاجر أكّد طلبك وبلّش يجهّزو.",
  PREPARING: "طلبك عم يتحضّر هلق.",
  SHIPPED: "طلبك انطلق للتوصيل 🚚",
  DELIVERED: "طلبك وصل! منتمنى تكون التجربة حلوة ⭐",
  CANCELLED: "تم إلغاء طلبك.",
};

export const orderRouter = Router();

// Customer: their own order history across all merchants (section 6/34)
orderRouter.get("/mine", requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id },
    include: { items: true, merchant: { select: { id: true, businessName: true } } },
    orderBy: { createdAt: "desc" },
  });
  // what the customer has already rated, so a delivered order can offer only what is left to rate
  const [products, shops] = await Promise.all([
    prisma.productReview.findMany({ where: { userId: req.user!.id, productId: { in: orders.flatMap((o) => o.items.map((i) => i.productId)) } }, select: { productId: true } }),
    prisma.merchantReview.findMany({ where: { userId: req.user!.id, merchantId: { in: orders.map((o) => o.merchantId) } }, select: { merchantId: true } }),
  ]);
  const ratedProducts = new Set(products.map((p) => p.productId));
  const ratedShops = new Set(shops.map((s) => s.merchantId));
  res.json(orders.map((o) => ({ ...o, rated: { shop: ratedShops.has(o.merchantId), products: o.items.map((i) => i.productId).filter((id) => ratedProducts.has(id)) } })));
});

// Merchant: orders placed with their store (section 45/6)
orderRouter.get("/merchant", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  }
  const orders = await prisma.order.findMany({
    where: { merchantId: merchant.id },
    include: { items: true, user: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  // how each customer's shops rate them, and whether this shop already rated them
  const customerIds = [...new Set(orders.map((o) => o.userId))];
  const [mine, others] = await Promise.all([
    prisma.customerReview.findMany({ where: { merchantId: merchant.id, customerId: { in: customerIds } }, select: { customerId: true } }),
    prisma.customerReview.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds } }, _avg: { stars: true }, _count: { _all: true } }),
  ]);
  const rated = new Set(mine.map((m) => m.customerId));
  const standing = new Map(others.map((g) => [g.customerId, { rating: g._avg.stars ? Math.round(g._avg.stars * 10) / 10 : 0, ratingCount: g._count._all }]));
  res.json(orders.map((o) => ({ ...o, customerRating: standing.get(o.userId) ?? { rating: 0, ratingCount: 0 }, ratedCustomer: rated.has(o.userId) })));
});

async function loadOrderForRequester(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, merchant: { select: { id: true, userId: true, businessName: true } } },
  });
  if (!order) return null;
  const isCustomer = order.userId === userId;
  const isOwningMerchant = order.merchant.userId === userId;
  if (!isCustomer && !isOwningMerchant) return null;
  return order;
}

orderRouter.get("/:id", requireAuth, async (req, res) => {
  const order = await loadOrderForRequester(req.params.id, req.user!.id);
  if (!order) {
    return sendError(res, 404, "NOT_FOUND", "Order not found");
  }
  // what is left to rate: the customer sees their own ratings, the shop sees how the customer is rated
  if (order.userId === req.user!.id) {
    const [products, shop] = await Promise.all([
      prisma.productReview.findMany({ where: { userId: order.userId, productId: { in: order.items.map((i) => i.productId) } }, select: { productId: true } }),
      prisma.merchantReview.findUnique({ where: { merchantId_userId: { merchantId: order.merchantId, userId: order.userId } }, select: { id: true } }),
    ]);
    return res.json({ ...order, rated: { shop: !!shop, products: products.map((p) => p.productId) } });
  }
  const [standing, mine] = await Promise.all([
    prisma.customerReview.aggregate({ where: { customerId: order.userId }, _avg: { stars: true }, _count: { _all: true } }),
    prisma.customerReview.findUnique({ where: { merchantId_customerId: { merchantId: order.merchantId, customerId: order.userId } }, select: { id: true } }),
  ]);
  const customer = await prisma.user.findUnique({ where: { id: order.userId }, select: { id: true, fullName: true } });
  res.json({ ...order, customer, customerRating: { rating: standing._avg.stars ? Math.round(standing._avg.stars * 10) / 10 : 0, ratingCount: standing._count._all }, ratedCustomer: !!mine });
});

// Forward-only lifecycle (section 6); CANCELLED is reachable up until SHIPPED (section 59.6)
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  cancelReason: z.string().min(3).optional(),
});

// Merchant: move an order through its lifecycle (section 6/59.6)
orderRouter.patch("/:id/status", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!merchant || !order || order.merchantId !== merchant.id) {
    return sendError(res, 404, "NOT_FOUND", "Order not found");
  }

  const { status, cancelReason } = parsed.data;
  if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
    return sendError(res, 409, "CONFLICT", `Cannot move an order from ${order.status} to ${status}`);
  }
  if (status === "CANCELLED" && !cancelReason) {
    return sendError(res, 400, "BAD_REQUEST", "cancelReason is required when the merchant cancels an order");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (status === "CANCELLED") {
      // Restock every item — this cancellation didn't consume the inventory after all.
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      for (const item of items) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
    }
    return tx.order.update({
      where: { id: order.id },
      data: { status, cancelReason: status === "CANCELLED" ? cancelReason : undefined },
    });
  });

  // After the transaction, best-effort (section 13): the status change is what matters, the
  // notification must never be able to roll it back.
  await notify({
    userId: order.userId,
    type: "ORDER_STATUS",
    title: status === "CANCELLED" ? "تم إلغاء طلبك" : `تحديث على طلبك: ${status}`,
    body: STATUS_MESSAGE[status],
    data: { orderId: order.id, orderNumber: order.orderNumber, status },
  });

  res.json(updated);
});

// Customer: cancel their own order before it ships (section 59.6)
orderRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.userId !== req.user!.id) {
    return sendError(res, 404, "NOT_FOUND", "Order not found");
  }
  if (!ALLOWED_TRANSITIONS[order.status].includes("CANCELLED")) {
    return sendError(res, 409, "CONFLICT", `Order can no longer be cancelled (current status: ${order.status})`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    }
    return tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  });

  // The merchant is the one who needs to hear about a customer cancellation (section 13).
  const merchantOwner = await prisma.merchantProfile.findUnique({
    where: { id: order.merchantId },
    select: { userId: true },
  });
  if (merchantOwner) {
    await notify({
      userId: merchantOwner.userId,
      type: "ORDER_STATUS",
      title: "الزبون ألغى طلبًا",
      body: `تم إلغاء الطلب ${order.orderNumber} من قبل الزبون، والمخزون رجع.`,
      data: { orderId: order.id, orderNumber: order.orderNumber, status: "CANCELLED", audience: "MERCHANT" },
    });
  }

  res.json(updated);
});

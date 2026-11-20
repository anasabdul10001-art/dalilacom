import { route } from "../lib/asyncRoute";
import { Router } from "express";
import { z } from "zod";
import { OrderStatus, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { notify } from "../services/notification.service";
import { availablePaymentMethods, settleOnCancel } from "../services/payment.service";
import { recordDeliveredOrder } from "../services/accounting.service";
import { accrueTeamOrderCommissions } from "../services/businessStaff.service";
import { respondToReceipt } from "../services/orderReceipt.service";

/** Customer-facing wording for each order state (section 13: "تغيير حالة الطلب"). */
const STATUS_MESSAGE: Record<OrderStatus, string> = {
  PENDING: "طلبك وصل وبانتظار تأكيد صاحب النشاط.",
  CONFIRMED: "أكّد صاحب النشاط طلبك وبدأ بتجهيزه.",
  PREPARING: "طلبك قيد التحضير الآن.",
  SHIPPED: "طلبك انطلق للتوصيل 🚚",
  DELIVERED: "وصل طلبك! نتمنى أن تكون التجربة جميلة ⭐",
  CANCELLED: "تم إلغاء طلبك.",
};

export const orderRouter = Router();

// The ways to pay that work right now (the apps show only these)
orderRouter.get("/payment-methods", requireAuth, (_req, res) => {
  res.json({ methods: availablePaymentMethods() });
});

// Customer: their own order history across all merchants (section 6/34)
orderRouter.get("/mine", requireAuth, route(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id },
    include: { items: true, payment: true, merchant: { select: { id: true, businessName: true } } },
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
}));

// Merchant: orders placed with their store (section 45/6)
orderRouter.get("/merchant", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return sendError(res, 404, "NOT_FOUND", "Merchant profile not found");
  }
  const orders = await prisma.order.findMany({
    where: { merchantId: merchant.id },
    include: { items: true, payment: true, user: { select: { id: true, fullName: true } } },
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
}));

async function loadOrderForRequester(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true, merchant: { select: { id: true, userId: true, businessName: true } } },
  });
  if (!order) return null;
  const isCustomer = order.userId === userId;
  const isOwningMerchant = order.merchant.userId === userId;
  if (!isCustomer && !isOwningMerchant) return null;
  return order;
}

orderRouter.get("/:id", requireAuth, route(async (req, res) => {
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
}));

// Forward-only lifecycle (section 6); CANCELLED is reachable up until SHIPPED (section 59.6)
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SHIPPED", "CANCELLED"], // a pickup goes straight to DELIVERED when the customer collects it
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  cancelReason: z.string().min(3).optional(),
  courierCompany: z.string().trim().min(2).max(60).optional(),
  trackingNumber: z.string().trim().min(2).max(60).optional(),
});

// Merchant: move an order through its lifecycle (section 6/59.6)
orderRouter.patch("/:id/status", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!merchant || !order || order.merchantId !== merchant.id) {
    return sendError(res, 404, "NOT_FOUND", "Order not found");
  }

  const { status, cancelReason, courierCompany, trackingNumber } = parsed.data;
  const allowed = ALLOWED_TRANSITIONS[order.status].includes(status) || (order.status === "PREPARING" && status === "DELIVERED" && order.shippingKind === "PICKUP");
  if (!allowed) {
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
      await settleOnCancel(tx, order.id);
    }
    return tx.order.update({
      where: { id: order.id },
      data: { status, cancelReason: status === "CANCELLED" ? cancelReason : undefined, ...(status === "SHIPPED" && order.shippingKind === "COURIER" ? { courierCompany: courierCompany ?? null, trackingNumber: trackingNumber ?? null } : {}), ...(status === "DELIVERED" ? { deliveredAt: new Date(), receiptStatus: "PENDING" as const } : {}) },
    });
  });

  if (status === "DELIVERED") {
    await recordDeliveredOrder(order.id).catch((err) => console.error("Could not sync delivered order to accounting", err));
    await accrueTeamOrderCommissions(order.id).catch((err) => console.error("Could not accrue staff commissions", err));
  }

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
}));

// Customer: cancel their own order before it ships (section 59.6)
// Customer: accept or reject a delivered order (it counts as accepted by itself after 10 days)
const receiptSchema = z.object({ decision: z.enum(["ACCEPT", "REJECT"]), note: z.string().trim().min(3).max(500).optional() })
  .refine((v) => v.decision === "ACCEPT" || !!v.note, { message: "اكتب سبب الرفض", path: ["note"] });
orderRouter.post("/:id/receipt", requireAuth, route(async (req, res) => {
  const parsed = receiptSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await respondToReceipt(req.user!.id, req.params.id, parsed.data.decision, parsed.data.note));
}));

orderRouter.post("/:id/cancel", requireAuth, route(async (req, res) => {
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
    await settleOnCancel(tx, order.id);
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
      body: `تم إلغاء الطلب ${order.orderNumber} من قبل الزبون، وأُعيد المخزون.`,
      data: { orderId: order.id, orderNumber: order.orderNumber, status: "CANCELLED", audience: "MERCHANT" },
    });
  }

  res.json(updated);
}));

const transferReferenceSchema = z.object({ reference: z.string().trim().min(3).max(100) });

// The customer records the transaction number after sending money in their banking/wallet app.
orderRouter.post("/:id/payment/submit-transfer", requireAuth, route(async (req, res) => {
  const parsed = transferReferenceSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!order || order.userId !== req.user!.id || !order.payment) return sendError(res, 404, "NOT_FOUND", "Order not found");
  if (!["BANK_ALSHAM", "SYRIATEL", "MTN"].includes(order.payment.method) || order.payment.status !== "PENDING" || order.status === "CANCELLED") {
    return sendError(res, 409, "CONFLICT", "هذا الطلب لا ينتظر تأكيد تحويل");
  }
  const payment = await prisma.payment.update({ where: { id: order.payment.id }, data: { reference: parsed.data.reference } });
  res.json(payment);
}));

// The seller confirms only after checking the incoming transfer in their own account.
orderRouter.post("/:id/payment/confirm-transfer", requireAuth, route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!merchant || !order || order.merchantId !== merchant.id || !order.payment) return sendError(res, 404, "NOT_FOUND", "Order not found");
  if (!["BANK_ALSHAM", "SYRIATEL", "MTN"].includes(order.payment.method) || order.payment.status !== "PENDING" || !order.payment.reference || order.status === "CANCELLED") {
    return sendError(res, 409, "CONFLICT", "لم يرسل الزبون رقم التحويل بعد أو أن الدفع غير معلّق");
  }
  const payment = await prisma.payment.update({ where: { id: order.payment.id }, data: { status: "PAID_ONLINE", paidAt: new Date(), confirmedById: req.user!.id } });
  res.json(payment);
}));

// Merchant: the cash for a pay-on-delivery order arrived (section 54: manual confirmation). Only once the order is on its way or delivered.
orderRouter.post("/:id/payment/confirm-cash", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!merchant || !order || order.merchantId !== merchant.id || !order.payment) {
    return sendError(res, 404, "NOT_FOUND", "Order not found");
  }
  if (order.payment.method !== "COD" || order.payment.status !== "PENDING") {
    return sendError(res, 409, "CONFLICT", "This payment is not waiting for cash");
  }
  if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
    return sendError(res, 409, "CONFLICT", "يُؤكَّد الدفع النقدي بعد شحن الطلب");
  }
  const payment = await prisma.payment.update({
    where: { id: order.payment.id },
    data: { status: "PAID_CASH", paidAt: new Date(), confirmedById: req.user!.id },
  });
  res.json(payment);
}));

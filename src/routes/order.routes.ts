import { Router } from "express";
import { z } from "zod";
import { OrderStatus, Role } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const orderRouter = Router();

// Customer: their own order history across all merchants (section 6/34)
orderRouter.get("/mine", requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id },
    include: { items: true, merchant: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders);
});

// Merchant: orders placed with their store (section 45/6)
orderRouter.get("/merchant", requireAuth, requireRole(Role.MERCHANT), async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  if (!merchant) {
    return res.status(404).json({ error: "Merchant profile not found" });
  }
  const orders = await prisma.order.findMany({
    where: { merchantId: merchant.id },
    include: { items: true, user: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders);
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
    return res.status(404).json({ error: "Order not found" });
  }
  res.json(order);
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
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!merchant || !order || order.merchantId !== merchant.id) {
    return res.status(404).json({ error: "Order not found" });
  }

  const { status, cancelReason } = parsed.data;
  if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
    return res.status(409).json({ error: `Cannot move an order from ${order.status} to ${status}` });
  }
  if (status === "CANCELLED" && !cancelReason) {
    return res.status(400).json({ error: "cancelReason is required when the merchant cancels an order" });
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

  res.json(updated);
});

// Customer: cancel their own order before it ships (section 59.6)
orderRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.userId !== req.user!.id) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (!ALLOWED_TRANSITIONS[order.status].includes("CANCELLED")) {
    return res.status(409).json({ error: `Order can no longer be cancelled (current status: ${order.status})` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    }
    return tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  });

  res.json(updated);
});

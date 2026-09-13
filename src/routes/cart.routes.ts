import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { getActiveMembership } from "../services/membership.service";
import { recordAffiliateCommissionIfReferred } from "../services/affiliate.service";

export const cartRouter = Router();

async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

async function buildCartView(userId: string) {
  const cart = await getOrCreateCart(userId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: { include: { merchant: { select: { id: true, businessName: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const membership = await getActiveMembership(userId);

  const view = items.map((item) => {
    const memberEligible = membership !== null && item.product.memberDiscountEnabled;
    const unitPriceCents = memberEligible ? item.product.memberPriceCents! : item.product.priceCents;
    return {
      id: item.id,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name: item.product.name,
        merchant: item.product.merchant,
        stock: item.product.stock,
        isActive: item.product.isActive,
      },
      regularPriceCents: item.product.priceCents,
      unitPriceCents,
      lineTotalCents: unitPriceCents * item.quantity,
    };
  });

  return { items: view, totalCents: view.reduce((sum, i) => sum + i.lineTotalCents, 0) };
}

cartRouter.get("/", requireAuth, async (req, res) => {
  res.json(await buildCartView(req.user!.id));
});

const addItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

cartRouter.post("/items", requireAuth, async (req, res) => {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { productId, quantity } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) {
    return res.status(404).json({ error: "Product not found" });
  }

  const cart = await getOrCreateCart(req.user!.id);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });
  const newQuantity = (existing?.quantity ?? 0) + quantity;
  if (newQuantity > product.stock) {
    return res.status(409).json({ error: `Only ${product.stock} left in stock` });
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { quantity: newQuantity },
    create: { cartId: cart.id, productId, quantity: newQuantity },
  });

  res.status(201).json(await buildCartView(req.user!.id));
});

const updateItemSchema = z.object({ quantity: z.number().int().positive() });

cartRouter.patch("/items/:id", requireAuth, async (req, res) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const cart = await getOrCreateCart(req.user!.id);
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.id }, include: { product: true } });
  if (!item || item.cartId !== cart.id) {
    return res.status(404).json({ error: "Cart item not found" });
  }
  if (parsed.data.quantity > item.product.stock) {
    return res.status(409).json({ error: `Only ${item.product.stock} left in stock` });
  }

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity } });
  res.json(await buildCartView(req.user!.id));
});

cartRouter.delete("/items/:id", requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.id } });
  if (!item || item.cartId !== cart.id) {
    return res.status(404).json({ error: "Cart item not found" });
  }
  await prisma.cartItem.delete({ where: { id: item.id } });
  res.json(await buildCartView(req.user!.id));
});

function generateOrderNumber(): string {
  return `ORD-${crypto.randomInt(1_000_000_000, 9_999_999_999)}`;
}

// Checkout: a cart holding products from several merchants splits into one Order per
// merchant (section 59.5 "Sub-Orders"), each tracked and updated independently from then on.
cartRouter.post("/checkout", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const cart = await getOrCreateCart(userId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: true },
  });
  if (items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const membership = await getActiveMembership(userId);

  try {
    const orders = await prisma.$transaction(async (tx) => {
      // Re-read each product inside the transaction so we react to any stock/price change
      // that happened since the cart was last viewed (section 59.7).
      const freshProducts = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
      });
      const productById = new Map(freshProducts.map((p) => [p.id, p]));

      for (const item of items) {
        const product = productById.get(item.productId);
        if (!product || !product.isActive) {
          throw new Error(`PRODUCT_UNAVAILABLE:${item.productId}`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`OUT_OF_STOCK:${product.name}`);
        }
      }

      const byMerchant = new Map<string, typeof items>();
      for (const item of items) {
        const list = byMerchant.get(item.product.merchantId) ?? [];
        list.push(item);
        byMerchant.set(item.product.merchantId, list);
      }

      const createdOrders = [];
      for (const [merchantId, merchantItems] of byMerchant) {
        let subtotalCents = 0;
        let totalCents = 0;
        const orderItemsData = [];

        for (const item of merchantItems) {
          const product = productById.get(item.productId)!;
          const memberEligible = membership !== null && product.memberDiscountEnabled;
          const unitPriceCents = memberEligible ? product.memberPriceCents! : product.priceCents;

          subtotalCents += product.priceCents * item.quantity;
          totalCents += unitPriceCents * item.quantity;
          orderItemsData.push({
            productId: product.id,
            productName: product.name,
            quantity: item.quantity,
            unitPriceCents,
          });

          await tx.product.update({
            where: { id: product.id },
            data: { stock: { decrement: item.quantity } },
          });
        }

        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            userId,
            merchantId,
            subtotalCents,
            memberDiscountCents: subtotalCents - totalCents,
            totalCents,
            items: { create: orderItemsData },
          },
          include: { items: true },
        });
        await recordAffiliateCommissionIfReferred(tx, merchantId, userId, "ORDER", order.id, order.totalCents);
        createdOrders.push(order);
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return createdOrders;
    });

    res.status(201).json(orders);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("OUT_OF_STOCK:")) {
      return res.status(409).json({ error: `Not enough stock for "${err.message.split(":")[1]}"` });
    }
    if (err instanceof Error && err.message.startsWith("PRODUCT_UNAVAILABLE:")) {
      return res.status(409).json({ error: "One of the products in your cart is no longer available" });
    }
    throw err;
  }
});

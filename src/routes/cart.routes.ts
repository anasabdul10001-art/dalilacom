import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { getActiveMembership } from "../services/membership.service";
import { recordAffiliateCommissionIfReferred } from "../services/affiliate.service";
import { notify } from "../services/notification.service";

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

  // how each shop in the cart sends its order and what that costs (the customer picks one per shop at checkout)
  const merchantIds = [...new Set(view.map((i) => i.product.merchant.id))];
  const methods = merchantIds.length ? await prisma.shippingMethod.findMany({ where: { merchantId: { in: merchantIds }, isActive: true }, orderBy: { createdAt: "asc" } }) : [];
  const shipping = merchantIds.map((merchantId) => ({
    merchantId,
    methods: methods.filter((m) => m.merchantId === merchantId).map((m) => ({ id: m.id, name: m.name, costCents: m.costCents })),
  }));
  return { items: view, shipping, totalCents: view.reduce((sum, i) => sum + i.lineTotalCents, 0) };
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
    return sendValidationError(res, parsed.error);
  }
  const { productId, quantity } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) {
    return sendError(res, 404, "NOT_FOUND", "Product not found");
  }

  const cart = await getOrCreateCart(req.user!.id);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });
  const newQuantity = (existing?.quantity ?? 0) + quantity;
  if (newQuantity > product.stock) {
    return sendError(res, 409, "CONFLICT", `Only ${product.stock} left in stock`);
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
    return sendValidationError(res, parsed.error);
  }

  const cart = await getOrCreateCart(req.user!.id);
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.id }, include: { product: true } });
  if (!item || item.cartId !== cart.id) {
    return sendError(res, 404, "NOT_FOUND", "Cart item not found");
  }
  if (parsed.data.quantity > item.product.stock) {
    return sendError(res, 409, "CONFLICT", `Only ${item.product.stock} left in stock`);
  }

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity } });
  res.json(await buildCartView(req.user!.id));
});

cartRouter.delete("/items/:id", requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.id } });
  if (!item || item.cartId !== cart.id) {
    return sendError(res, 404, "NOT_FOUND", "Cart item not found");
  }
  await prisma.cartItem.delete({ where: { id: item.id } });
  res.json(await buildCartView(req.user!.id));
});

function generateOrderNumber(): string {
  return `ORD-${crypto.randomInt(1_000_000_000, 9_999_999_999)}`;
}

// Checkout: a cart holding products from several merchants splits into one Order per
// merchant (section 59.5 "Sub-Orders"), each tracked and updated independently from then on.
const checkoutSchema = z.object({ shipping: z.record(z.string().uuid()).optional() }); // shop id -> the chosen shipping method id

cartRouter.post("/checkout", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const checkoutBody = checkoutSchema.safeParse(req.body ?? {});
  if (!checkoutBody.success) return sendValidationError(res, checkoutBody.error);
  const chosenShipping = checkoutBody.data.shipping ?? {};
  const cart = await getOrCreateCart(userId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: true },
  });
  if (items.length === 0) {
    return sendError(res, 400, "BAD_REQUEST", "Cart is empty");
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

      // a shop that lists shipping methods needs one chosen; its cost joins the order's total
      const shopMethods = await tx.shippingMethod.findMany({ where: { merchantId: { in: [...byMerchant.keys()] }, isActive: true } });

      const createdOrders = [];
      for (const [merchantId, merchantItems] of byMerchant) {
        const offered = shopMethods.filter((m) => m.merchantId === merchantId);
        const picked = offered.find((m) => m.id === chosenShipping[merchantId]);
        if (offered.length > 0 && !picked) throw new Error(`SHIPPING_REQUIRED:${merchantId}`);
        const shippingCents = picked?.costCents ?? 0;
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
            shippingName: picked?.name ?? null,
            shippingCents,
            totalCents: totalCents + shippingCents,
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

    // Outside the transaction on purpose (section 13): a checkout must succeed even if the
    // confirmation notification cannot be written. One order per merchant, so one notification each.
    for (const order of orders) {
      await notify({
        userId,
        type: "ORDER_PLACED",
        title: "تم استلام طلبك ✅",
        body: `طلبك ${order.orderNumber} وصل للتاجر. رح يوصلك تحديث كل ما تتغير حالته.`,
        data: { orderId: order.id, orderNumber: order.orderNumber, merchantId: order.merchantId },
      });
    }

    // The merchant is the one who has to act on a new order, so they hear about it too.
    const owners = await prisma.merchantProfile.findMany({
      where: { id: { in: orders.map((o) => o.merchantId) } },
      select: { id: true, userId: true },
    });
    for (const order of orders) {
      const owner = owners.find((m) => m.id === order.merchantId);
      if (!owner) continue;
      await notify({
        userId: owner.userId,
        type: "ORDER_PLACED",
        title: "طلب جديد وصلك 🛒",
        body: `وصلك الطلب ${order.orderNumber}. افتح الطلبات لتأكيده.`,
        data: { orderId: order.id, orderNumber: order.orderNumber, audience: "MERCHANT" },
      });
    }

    res.status(201).json(orders);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("OUT_OF_STOCK:")) {
      return sendError(res, 409, "CONFLICT", `Not enough stock for "${err.message.split(":")[1]}"`);
    }
    if (err instanceof Error && err.message.startsWith("SHIPPING_REQUIRED:")) {
      return sendError(res, 400, "BAD_REQUEST", "اختر طريقة الشحن لكل متجر بالسلة");
    }
    if (err instanceof Error && err.message.startsWith("PRODUCT_UNAVAILABLE:")) {
      return sendError(res, 409, "CONFLICT", "One of the products in your cart is no longer available");
    }
    throw err;
  }
});

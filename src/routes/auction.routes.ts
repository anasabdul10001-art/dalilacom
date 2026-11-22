import { Router } from "express";
import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError, sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { route } from "../lib/asyncRoute";
import { optionalUserId } from "../services/viewerCountry.service";
import { auctionView, checkoutAuction, placeBid, settleAuction } from "../services/auction.service";

/** Online auctions on the store: anyone can watch; bidding and buying need an account. */
export const auctionRouter = Router();

const idSchema = z.object({ id: z.string().uuid() });

// what the signed-in person won and has not paid for yet
auctionRouter.get("/won/list", requireAuth, route(async (req, res) => {
  const rows = await prisma.auction.findMany({
    where: { highBidderId: req.user!.id, status: "WON" },
    include: { product: { select: { id: true, name: true, imageUrl: true, images: true } } },
    orderBy: { claimDeadline: "asc" },
  });
  res.json(rows.map((a) => ({ ...auctionView(a, req.user!.id), product: { id: a.product.id, name: a.product.name, imageUrl: a.product.imageUrl ?? a.product.images[0] ?? null } })));
}));

// the auction of a product: its figures, the bids (the bidders are never named) and what the viewer's own place is
auctionRouter.get("/:id", route(async (req, res) => {
  const parsed = idSchema.safeParse(req.params);
  if (!parsed.success) return sendError(res, 404, "NOT_FOUND", "المزاد غير موجود");
  let auction = await prisma.auction.findUnique({ where: { productId: parsed.data.id }, include: { product: { select: { isActive: true, moderation: true } } } });
  if (!auction || auction.product.moderation !== "APPROVED") return sendError(res, 404, "NOT_FOUND", "المزاد غير موجود");
  if (auction.status === "OPEN" && auction.endsAt <= new Date()) {
    await settleAuction(auction.id);
    auction = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id }, include: { product: { select: { isActive: true, moderation: true } } } });
  }
  const viewer = await optionalUserId(req);
  const bids = await prisma.auctionBid.findMany({ where: { auctionId: auction.id }, orderBy: { amountCents: "desc" }, take: 10 });
  const view = auctionView(auction, viewer);
  // the winner picks how to pay: cash on delivery, or one of the accounts the shop has switched on
  let paymentMethods: string[] | undefined;
  if (view.youWon && auction.status === "WON") {
    const owner = await prisma.product.findUniqueOrThrow({ where: { id: parsed.data.id }, select: { merchant: { select: { userId: true } } } });
    const accounts = await prisma.sellerPaymentMethod.findMany({ where: { userId: owner.merchant.userId, isEnabled: true }, select: { provider: true } });
    paymentMethods = ["COD", ...accounts.map((a) => a.provider)];
  }
  res.json({ ...view, ...(paymentMethods ? { paymentMethods } : {}), bids: bids.map((b) => ({ amountCents: b.amountCents, at: b.createdAt.toISOString(), mine: b.userId === viewer })) });
}));

const bidSchema = z.object({ amountCents: z.number().int().positive() });

auctionRouter.post("/:id/bids", requireAuth, route(async (req, res) => {
  const ids = idSchema.safeParse(req.params);
  const body = bidSchema.safeParse(req.body);
  if (!ids.success) return sendError(res, 404, "NOT_FOUND", "المزاد غير موجود");
  if (!body.success) return sendValidationError(res, body.error);
  try {
    const auction = await placeBid(ids.data.id, req.user!.id, body.data.amountCents);
    res.status(201).json(auctionView(auction, req.user!.id));
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
}));

const checkoutSchema = z.object({
  shippingId: z.string().uuid().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default("COD"),
  address: z.string().trim().min(5).max(300).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
});

auctionRouter.post("/:id/checkout", requireAuth, route(async (req, res) => {
  const ids = idSchema.safeParse(req.params);
  const body = checkoutSchema.safeParse(req.body ?? {});
  if (!ids.success) return sendError(res, 404, "NOT_FOUND", "المزاد غير موجود");
  if (!body.success) return sendValidationError(res, body.error);
  try {
    res.status(201).json(await checkoutAuction(ids.data.id, req.user!.id, body.data));
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
}));

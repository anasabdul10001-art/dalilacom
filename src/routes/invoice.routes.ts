import { Response, Router } from "express";
import { prisma } from "../prisma";
import { sendError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { avatarUrl } from "../lib/profile";
import { DocumentData, formatMoney, renderDocumentHtml } from "../lib/documents";

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

const ORDER_STATUS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "مؤكد",
  PREPARING: "قيد التحضير",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const merchantInclude = {
  select: { businessName: true, phone: true, address: true, userId: true, user: { select: { id: true, bio: true, avatarUpdatedAt: true } } },
} as const;

type MerchantForDoc = {
  businessName: string;
  phone: string | null;
  address: string | null;
  user: { id: string; bio: string | null; avatarUpdatedAt: Date | null };
};

// The issuing account's identity: shop name + the owner's profile photo and description.
function issuerOf(m: MerchantForDoc) {
  return { name: m.businessName, avatarUrl: avatarUrl(m.user.id, m.user.avatarUpdatedAt), bio: m.user.bio, phone: m.phone, address: m.address };
}

function sendHtml(res: Response, doc: DocumentData) {
  res.set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.send(renderDocumentHtml(doc));
}

// The customer or the owning merchant can print an order's invoice; it always carries the merchant's name + photo.
invoiceRouter.get("/order/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true, user: { select: { fullName: true } }, merchant: merchantInclude },
  });
  if (!order || (order.userId !== req.user!.id && order.merchant.userId !== req.user!.id)) {
    return sendError(res, 404, "NOT_FOUND", "Order not found");
  }
  sendHtml(res, {
    kind: "ORDER_INVOICE",
    number: order.orderNumber,
    issuedAt: order.createdAt,
    issuer: issuerOf(order.merchant),
    recipient: { label: "العميل", name: order.user.fullName },
    status: ORDER_STATUS_AR[order.status] ?? order.status,
    rows: order.items.map((i) => ({ label: i.productName, qty: i.quantity, amount: formatMoney(i.unitPriceCents * i.quantity) })),
    totals: [
      { label: "المجموع", value: formatMoney(order.subtotalCents) },
      ...(order.memberDiscountCents > 0 ? [{ label: "حسم أعضاء دليلكم", value: `− ${formatMoney(order.memberDiscountCents)}` }] : []),
      { label: "الإجمالي", value: formatMoney(order.totalCents), strong: true },
    ],
    footnote: "شكراً لتعاملكم معنا — صدرت هذه الفاتورة عبر منصة دليلكم",
  });
});

// A confirmed discount (QR) transaction: the member or the merchant who confirmed it.
invoiceRouter.get("/discount/:ref", async (req, res) => {
  const tx = await prisma.discountTransaction.findUnique({
    where: { transactionRef: req.params.ref },
    include: { membership: { include: { user: { select: { id: true, fullName: true } } } }, merchant: merchantInclude },
  });
  if (!tx || (tx.membership.user.id !== req.user!.id && tx.merchant.userId !== req.user!.id)) {
    return sendError(res, 404, "NOT_FOUND", "Transaction not found");
  }
  sendHtml(res, {
    kind: "DISCOUNT_RECEIPT",
    number: tx.transactionRef,
    issuedAt: tx.createdAt,
    issuer: issuerOf(tx.merchant),
    recipient: { label: "العضو", name: tx.membership.user.fullName },
    rows: [
      { label: "قيمة الفاتورة", amount: formatMoney(tx.billAmountCents) },
      { label: `حسم أعضاء دليلكم (${tx.discountPercent}%)`, amount: `− ${formatMoney(tx.discountAmountCents)}` },
    ],
    totals: [{ label: "المبلغ النهائي", value: formatMoney(tx.finalAmountCents), strong: true }],
    footnote: "صدر هذا الإيصال عبر منصة دليلكم",
  });
});

import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route } from "../lib/asyncRoute";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import express from "express";
import { sniffImageMime } from "../lib/image";
import { extractInvoiceFromPhoto, visionAvailable } from "../services/ai.service";
import { marketOfUser } from "../services/viewerCountry.service";

export const accountingRouter = Router();
accountingRouter.use(requireAuth, route(async (req, res, next) => {
  const active = await prisma.platformSubscription.findFirst({ where: { userId: req.user!.id, status: "ACTIVE", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }], plan: { service: "ACCOUNTING" } }, select: { id: true } });
  if (!active) return sendError(res, 402, "ACCOUNTING_PLAN_REQUIRED", "المحاسبة تحتاج باقة فعّالة أو فترة تجربة. افتح صفحة الباقات من حسابك.");
  next();
}));

accountingRouter.post("/invoices/scan", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "4mb" }), route(async (req, res) => {
  const bytes = req.body;
  if (!Buffer.isBuffer(bytes) || !bytes.length) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل صورة فاتورة بصيغة JPEG أو PNG أو WebP");
  const mime = sniffImageMime(bytes);
  if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف مو صورة فاتورة صالحة");
  if (!visionAvailable()) return sendError(res, 503, "AI_UNAVAILABLE", "قراءة الفواتير بالذكاء الاصطناعي غير مفعّلة حاليًا");
  const extracted = await extractInvoiceFromPhoto({ mime, data: bytes });
  const draft = await prisma.accountingInvoiceDraft.create({ data: { userId: req.user!.id, mime, data: bytes, extracted: extracted ? { supplier: extracted.supplier, description: extracted.description, date: extracted.date, totalCents: extracted.totalCents, currency: extracted.currency } : Prisma.JsonNull } });
  res.status(201).json({ id: draft.id, extracted, needsReview: true });
}));

accountingRouter.post("/invoices/:id/confirm", route(async (req, res) => {
  const parsed = z.object({ category: z.string().trim().min(1).max(50).default("مشتريات"), description: z.string().trim().min(2).max(240).optional(), amountCents: z.number().int().positive().max(2_000_000_000).optional(), currency: currencyCode.optional(), occurredAt: z.string().datetime().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const draft = await prisma.accountingInvoiceDraft.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!draft) return sendError(res, 404, "NOT_FOUND", "صورة الفاتورة غير موجودة");
  if (draft.entryId) return sendError(res, 409, "CONFLICT", "تم تسجيل هذه الفاتورة من قبل");
  const extracted = draft.extracted as { supplier?: string; description?: string; date?: string | null; totalCents?: number | null; currency?: string | null } | null;
  const amountCents = parsed.data.amountCents ?? extracted?.totalCents ?? null;
  if (!amountCents || amountCents <= 0) return sendError(res, 400, "BAD_REQUEST", "ما قدرنا نقرأ المبلغ بوضوح. اكتب المبلغ يدويًا");
  const description = parsed.data.description || [extracted?.supplier, extracted?.description].filter(Boolean).join(" — ") || "فاتورة مشتريات";
  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : extracted?.date ? new Date(`${extracted.date}T12:00:00.000Z`) : new Date();
  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "EXPENSE", category: parsed.data.category, description, amountCents, currency: parsed.data.currency ?? extracted?.currency ?? "EUR", occurredAt, source: "INVOICE", sourceKey: `invoice-draft:${draft.id}` } });
    await tx.accountingInvoiceDraft.update({ where: { id: draft.id }, data: { entryId: created.id, confirmedAt: new Date() } });
    return created;
  });
  res.status(201).json(entry);
}));

accountingRouter.get("/invoices/:id/photo", route(async (req, res) => {
  const draft = await prisma.accountingInvoiceDraft.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { mime: true, data: true } });
  if (!draft) return sendError(res, 404, "NOT_FOUND", "صورة الفاتورة غير موجودة");
  res.type(draft.mime).set("Cache-Control", "private, no-store").send(Buffer.from(draft.data));
}));

const currencyCode = z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase());
const entrySchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(1).max(50),
  description: z.string().trim().min(2).max(240),
  amountCents: z.number().int().positive().max(2_000_000_000),
  currency: currencyCode.default("EUR"),
  occurredAt: z.string().datetime().optional(),
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  barcode: z.string().trim().max(80).optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  unit: z.string().trim().min(1).max(20).default("قطعة"),
  costCents: z.number().int().nonnegative().max(2_000_000_000).default(0),
  salePriceCents: z.number().int().nonnegative().max(2_000_000_000).default(0),
  quantity: z.number().int().nonnegative().max(2_000_000_000).default(0),
  lowStockAt: z.number().int().nonnegative().max(2_000_000_000).default(0),
  currency: currencyCode.default("EUR"),
});

accountingRouter.get("/summary", route(async (req, res) => {
  const userId = req.user!.id;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return sendError(res, 400, "BAD_REQUEST", "الفترة الزمنية غير صحيحة");
  const [totals, productCount, stock, lowStock, storeProducts, recent] = await Promise.all([
    prisma.accountingEntry.groupBy({ by: ["type", "currency"], where: { userId, occurredAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    prisma.accountingProduct.count({ where: { userId } }),
    prisma.accountingProduct.aggregate({ where: { userId }, _sum: { quantity: true } }),
    prisma.accountingProduct.count({ where: { userId, quantity: { lte: 0 } } }),
    prisma.product.findMany({ where: { merchant: { userId }, isActive: true }, select: { stock: true } }),
    prisma.accountingEntry.findMany({ where: { userId }, orderBy: { occurredAt: "desc" }, take: 8 }),
  ]);
  const currencies = [...new Set(totals.map((x) => x.currency))];
  res.json({
    from, to, currencies,
    totals: currencies.map((currency) => {
      const income = totals.find((x) => x.currency === currency && x.type === "INCOME")?._sum.amountCents ?? 0;
      const expenses = totals.find((x) => x.currency === currency && x.type === "EXPENSE")?._sum.amountCents ?? 0;
      return { currency, incomeCents: income, expensesCents: expenses, netCents: income - expenses };
    }),
    inventory: { products: productCount + storeProducts.length, units: (stock._sum.quantity ?? 0) + storeProducts.reduce((sum, p) => sum + p.stock, 0), outOfStock: lowStock + storeProducts.filter(p => p.stock <= 0).length },
    recent,
  });
}));

accountingRouter.get("/entries", route(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const type = req.query.type === "INCOME" || req.query.type === "EXPENSE" ? req.query.type : undefined;
  const rows = await prisma.accountingEntry.findMany({
    where: { userId: req.user!.id, ...(type ? { type } : {}), ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { occurredAt: "desc" }, take: 250,
  });
  res.json(rows.map(({ receiptData, ...row }) => ({ ...row, hasReceipt: !!receiptData })));
}));

accountingRouter.post("/entries", route(async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const row = await prisma.accountingEntry.create({ data: { ...parsed.data, userId: req.user!.id, source: "MANUAL", occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date() } });
  res.status(201).json(row);
}));

accountingRouter.get("/products", route(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const [products, storeProducts, currency] = await Promise.all([prisma.accountingProduct.findMany({
    where: { userId: req.user!.id, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }, { sku: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ quantity: "asc" }, { name: "asc" }], take: 300,
  }), prisma.product.findMany({ where: { merchant: { userId: req.user!.id }, isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }, { sku: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, name: true, barcode: true, sku: true, stock: true, priceCents: true, costPriceCents: true }, take: 300 }), marketOfUser(req.user!.id)]);
  res.json([...products, ...storeProducts.map(p => ({ id: `store:${p.id}`, name: p.name, barcode: p.barcode, sku: p.sku, quantity: p.stock, salePriceCents: p.priceCents, costCents: p.costPriceCents, currency, unit: "قطعة", lowStockAt: 0, isStoreProduct: true }))]);
}));

accountingRouter.get("/products/barcode/:barcode", route(async (req, res) => {
  const product = await prisma.accountingProduct.findFirst({ where: { userId: req.user!.id, barcode: req.params.barcode } });
  if (product) return res.json(product);
  const storeProduct = await prisma.product.findFirst({ where: { merchant: { userId: req.user!.id }, barcode: req.params.barcode } });
  if (!storeProduct) return sendError(res, 404, "NOT_FOUND", "ما لقينا منتج بهالباركود. فيك تضيفه كمنتج جديد.");
  res.json({ id: `store:${storeProduct.id}`, name: storeProduct.name, barcode: storeProduct.barcode, sku: storeProduct.sku, quantity: storeProduct.stock, salePriceCents: storeProduct.priceCents, costCents: storeProduct.costPriceCents, currency: await marketOfUser(req.user!.id), unit: "قطعة", lowStockAt: 0, isStoreProduct: true });
}));

accountingRouter.post("/products", route(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.accountingProduct.create({ data: { ...parsed.data, userId: req.user!.id, barcode: parsed.data.barcode || null, sku: parsed.data.sku || null } });
      if (created.quantity > 0) await tx.accountingStockMovement.create({ data: { userId: req.user!.id, productId: created.id, action: "STOCK_IN", quantity: created.quantity, unitCostCents: created.costCents, note: "رصيد افتتاحي" } });
      return created;
    });
    res.status(201).json(product);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return sendError(res, 409, "CONFLICT", "هذا الباركود مستخدم لمنتج آخر عندك");
    throw err;
  }
}));

accountingRouter.post("/products/:id/stock", route(async (req, res) => {
  const parsed = z.object({ action: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT"]), quantity: z.number().int().nonnegative().max(2_000_000_000), unitCostCents: z.number().int().nonnegative().optional(), note: z.string().trim().max(240).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (req.params.id.startsWith("store:")) {
    const id = req.params.id.slice(6);
    const p = await prisma.product.findFirst({ where: { id, merchant: { userId: req.user!.id } }, select: { id: true, stock: true } });
    if (!p) return sendError(res, 404, "NOT_FOUND", "منتج المتجر غير موجود");
    if (parsed.data.action !== "ADJUSTMENT" && parsed.data.quantity === 0) return sendError(res, 400, "BAD_REQUEST", "أدخل كمية أكبر من صفر");
    const signed = parsed.data.action === "STOCK_IN" ? parsed.data.quantity : parsed.data.action === "STOCK_OUT" ? -parsed.data.quantity : parsed.data.quantity - p.stock;
    if (p.stock + signed < 0) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.product.update({ where: { id: p.id }, data: { stock: { increment: signed }, ...(parsed.data.unitCostCents !== undefined ? { costPriceCents: parsed.data.unitCostCents } : {}) } });
      if (signed !== 0) await tx.accountingStockMovement.create({ data: { userId: req.user!.id, storeProductId: p.id, action: parsed.data.action, quantity: parsed.data.quantity, note: parsed.data.note } });
      return changed;
    });
    return res.json({ ...updated, quantity: updated.stock, id: `store:${updated.id}`, isStoreProduct: true });
  }
  const p = await prisma.accountingProduct.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
  if (parsed.data.action !== "ADJUSTMENT" && parsed.data.quantity === 0) return sendError(res, 400, "BAD_REQUEST", "أدخل كمية أكبر من صفر");
  const signed = parsed.data.action === "STOCK_IN" ? parsed.data.quantity : parsed.data.action === "STOCK_OUT" ? -parsed.data.quantity : parsed.data.quantity - p.quantity;
  if (p.quantity + signed < 0) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.accountingProduct.update({ where: { id: p.id }, data: { quantity: { increment: signed }, ...(parsed.data.unitCostCents !== undefined ? { costCents: parsed.data.unitCostCents } : {}) } });
    if (signed !== 0) await tx.accountingStockMovement.create({ data: { userId: req.user!.id, productId: p.id, action: parsed.data.action, quantity: parsed.data.quantity, unitCostCents: parsed.data.unitCostCents, note: parsed.data.note } });
    return changed;
  });
  res.json(updated);
}));

accountingRouter.post("/products/:id/sell", route(async (req, res) => {
  const parsed = z.object({ quantity: z.number().int().positive().max(1_000_000), unitPriceCents: z.number().int().positive().optional(), note: z.string().trim().max(240).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (req.params.id.startsWith("store:")) {
    const id = req.params.id.slice(6);
    const product = await prisma.product.findFirst({ where: { id, merchant: { userId: req.user!.id }, isActive: true } });
    if (!product) return sendError(res, 404, "NOT_FOUND", "منتج المتجر غير موجود");
    if (product.stock < parsed.data.quantity) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
    const unitPrice = parsed.data.unitPriceCents ?? product.priceCents;
    if (unitPrice <= 0) return sendError(res, 400, "BAD_REQUEST", "أدخل سعر البيع أولاً");
    const total = unitPrice * parsed.data.quantity;
    const ref = `store-manual-sale:${crypto.randomUUID()}`;
    const [updated] = await prisma.$transaction([
      prisma.product.update({ where: { id }, data: { stock: { decrement: parsed.data.quantity }, soldCount: { increment: parsed.data.quantity } } }),
      prisma.accountingStockMovement.create({ data: { userId: req.user!.id, storeProductId: id, action: "STOCK_OUT", quantity: parsed.data.quantity, note: parsed.data.note || "بيع مباشر" } }),
      prisma.accountingEntry.create({ data: { userId: req.user!.id, type: "INCOME", category: "مبيعات", description: `${product.name} × ${parsed.data.quantity}`, amountCents: total, currency: await marketOfUser(req.user!.id), source: "MANUAL", sourceKey: ref } }),
      ...(product.costPriceCents > 0 ? [prisma.accountingEntry.create({ data: { userId: req.user!.id, type: "EXPENSE", category: "تكلفة البضاعة المباعة", description: `${product.name} × ${parsed.data.quantity}`, amountCents: product.costPriceCents * parsed.data.quantity, currency: await marketOfUser(req.user!.id), source: "MANUAL", sourceKey: `${ref}:cost` } })] : []),
    ]);
    const cost = product.costPriceCents * parsed.data.quantity;
    return res.status(201).json({ product: { ...updated, quantity: updated.stock, id: `store:${updated.id}` }, incomeCents: total, costCents: cost, netCents: total - cost });
  }
  const product = await prisma.accountingProduct.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!product) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
  if (product.quantity < parsed.data.quantity) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
  const unitPrice = parsed.data.unitPriceCents ?? product.salePriceCents;
  if (unitPrice <= 0) return sendError(res, 400, "BAD_REQUEST", "أدخل سعر البيع أولاً");
  const total = unitPrice * parsed.data.quantity;
  const ref = `manual-sale:${crypto.randomUUID()}`;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.accountingProduct.update({ where: { id: product.id }, data: { quantity: { decrement: parsed.data.quantity } } });
    await tx.accountingStockMovement.create({ data: { userId: req.user!.id, productId: product.id, action: "STOCK_OUT", quantity: parsed.data.quantity, unitCostCents: product.costCents, note: parsed.data.note || "بيع" } });
    await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "INCOME", category: "مبيعات", description: `${product.name} × ${parsed.data.quantity}`, amountCents: total, currency: product.currency, source: "MANUAL", sourceKey: ref } });
    if (product.costCents > 0) await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "EXPENSE", category: "تكلفة البضاعة المباعة", description: `${product.name} × ${parsed.data.quantity}`, amountCents: product.costCents * parsed.data.quantity, currency: product.currency, source: "MANUAL", sourceKey: `${ref}:cost` } });
    return updated;
  });
  res.status(201).json({ product: result, incomeCents: total, costCents: product.costCents * parsed.data.quantity, netCents: total - product.costCents * parsed.data.quantity });
}));

accountingRouter.get("/export.csv", route(async (req, res) => {
  const rows = await prisma.accountingEntry.findMany({ where: { userId: req.user!.id }, orderBy: { occurredAt: "asc" }, take: 10000 });
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Datum;Typ;Kategorie;Beschreibung;Betrag;Waehrung;Quelle", ...rows.map((r) => [r.occurredAt.toISOString(), r.type, r.category, r.description, (r.amountCents / 100).toFixed(2), r.currency, r.source].map(quote).join(";"))].join("\r\n");
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=dalilacom-accounting.csv", "Cache-Control": "no-store" }).send("\uFEFF" + csv);
}));

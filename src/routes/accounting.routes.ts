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
import { notify } from "../services/notification.service";
/** The largest single accounting entry, in minor units. Far below 2^53, so sums of many entries stay exact as JSON numbers. */
const MAX_ENTRY_CENTS = 9_000_000_000_000;

// Amounts are stored 64-bit; they always fit a JSON number (the limit on one entry keeps even large sums exact).


// ---- tax (experimental: to be checked with an accountant). Rates are in basis points (1900 = 19%). Prices either have their tax inside or get it on top.
async function taxContext(userId: string) {
  const [rates, settings] = await Promise.all([prisma.accountingTaxRate.findMany({ where: { userId, active: true } }), prisma.accountingSettings.findUnique({ where: { userId } })]);
  const byId = new Map(rates.map((r) => [r.id, r.rateBp]));
  const defaultBp = settings?.defaultTaxRateId ? byId.get(settings.defaultTaxRateId) ?? 0 : 0;
  return { byId, defaultBp, include: settings?.pricesIncludeTax ?? true, enabled: rates.length > 0, settings };
}
const bpFor = (ctx: { byId: Map<string, number>; defaultBp: number }, productRateId: string | null | undefined) => (productRateId ? ctx.byId.get(productRateId) ?? ctx.defaultBp : ctx.defaultBp);
/** The tax of each line of an invoice. The invoice discount is shared between the lines by their size (the last one takes what is left), and the tax is on what remains of each line. */
function taxLines(lines: { gross: number; rateBp: number }[], discount: number, include: boolean) {
  const subtotal = lines.reduce((sum, l) => sum + l.gross, 0);
  let left = discount;
  return lines.map((l, i) => {
    const disc = i === lines.length - 1 ? left : Math.round(discount * l.gross / subtotal);
    left -= disc;
    const base = l.gross - disc;
    const tax = l.rateBp > 0 ? (include ? Math.round(base * l.rateBp / (10000 + l.rateBp)) : Math.round(base * l.rateBp / 10000)) : 0;
    return { discount: disc, tax, payable: include ? base : base + tax };
  });
}
async function ownRateId(userId: string, id: string | null | undefined) {
  if (!id) return null;
  const r = await prisma.accountingTaxRate.findFirst({ where: { id, userId }, select: { id: true } });
  return r ? r.id : undefined; // undefined: not the account's
}

/** The next invoice number of an account. The lock makes two sales at the same moment take two different numbers. */
async function nextSaleNumber(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"sale-number:" + userId}))`;
  const last = await tx.accountingSale.aggregate({ where: { userId }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

/** When a sale takes a product down to its minimum (or to nothing), tell the owner once: only when the level has just been crossed. */
function alertLowStock(userId: string, crossed: { name: string; before: number; after: number; min: number }[]) {
  for (const c of crossed) {
    if (!(c.before > c.min && c.after <= c.min)) continue;
    void notify({ userId, type: "SYSTEM", email: false, title: c.after <= 0 ? "خلصت كمية منتج" : "كمية منتج قاربت تخلص", body: `«${c.name}»: ${c.after}`, data: { kind: "accounting-low-stock", name: c.name, quantity: c.after } });
  }
}

const plain = <T extends { amountCents: bigint }>(row: T) => ({ ...row, amountCents: Number(row.amountCents) });

export const accountingRouter = Router();
accountingRouter.use(requireAuth, route(async (req, res, next) => {
  const active = await prisma.platformSubscription.findFirst({ where: { userId: req.user!.id, status: "ACTIVE", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }], plan: { service: "ACCOUNTING" } }, select: { id: true } });
  if (!active) return sendError(res, 402, "ACCOUNTING_PLAN_REQUIRED", "المحاسبة تحتاج باقة فعّالة أو فترة تجربة. افتح صفحة الباقات من حسابك.");
  // entries that repeat by themselves are written when their day has come, before anything is read
  if (req.method === "GET") await runRecurring(req.user!.id).catch(() => undefined);
  next();
}));

accountingRouter.post("/invoices/scan", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "4mb" }), route(async (req, res) => {
  const bytes = req.body;
  if (!Buffer.isBuffer(bytes) || !bytes.length) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل صورة فاتورة بصيغة JPEG أو PNG أو WebP");
  const mime = sniffImageMime(bytes);
  if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف مو صورة فاتورة صالحة");
  if (!visionAvailable()) return sendError(res, 503, "AI_UNAVAILABLE", "قراءة الفواتير بالذكاء الاصطناعي غير مفعّلة حاليًا");
  // every scan costs an AI call: a daily cap per account keeps one account from running up the bill
  const dailyLimit = Number(process.env.ACCOUNTING_SCAN_DAILY_LIMIT) > 0 ? Number(process.env.ACCOUNTING_SCAN_DAILY_LIMIT) : 30;
  if ((await prisma.accountingInvoiceDraft.count({ where: { userId: req.user!.id, createdAt: { gte: new Date(Date.now() - 86400000) } } })) >= dailyLimit) return sendError(res, 429, "SCAN_LIMIT", "وصلت للحد اليومي لقراءة الفواتير. جرّب غدًا أو اكتب الفاتورة يدويًا.");
  const extracted = await extractInvoiceFromPhoto({ mime, data: bytes });
  const draft = await prisma.accountingInvoiceDraft.create({ data: { userId: req.user!.id, mime, data: bytes, extracted: extracted ? { supplier: extracted.supplier, description: extracted.description, date: extracted.date, totalCents: extracted.totalCents, currency: extracted.currency } : Prisma.JsonNull } });
  res.status(201).json({ id: draft.id, extracted, needsReview: true });
}));

accountingRouter.post("/invoices/:id/confirm", route(async (req, res) => {
  const parsed = z.object({ category: z.string().trim().min(1).max(50).default("مشتريات"), description: z.string().trim().min(2).max(240).optional(), amountCents: z.number().int().positive().max(MAX_ENTRY_CENTS).optional(), currency: currencyCode.optional(), occurredAt: z.string().datetime().optional() }).safeParse(req.body);
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
  res.status(201).json(plain(entry));
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
  amountCents: z.number().int().positive().max(MAX_ENTRY_CENTS),
  currency: currencyCode.default("EUR"),
  occurredAt: z.string().datetime().optional(),
  payMethod: z.enum(["CASH", "BANK", "WALLET"]).optional(),
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
  taxRateId: z.string().uuid().nullable().optional(),
});

accountingRouter.get("/summary", route(async (req, res) => {
  const userId = req.user!.id;
  // a plain date (2026-03-10) means the whole day: from its first moment, to its last
  const plainDate = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof req.query.from === "string" ? new Date(plainDate.test(req.query.from) ? `${req.query.from}T00:00:00.000Z` : req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = typeof req.query.to === "string" ? new Date(plainDate.test(req.query.to) ? `${req.query.to}T23:59:59.999Z` : req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return sendError(res, 400, "BAD_REQUEST", "الفترة الزمنية غير صحيحة");
  const [totals, productCount, stock, lowStock, storeProducts, recent, payroll] = await Promise.all([
    prisma.accountingEntry.groupBy({ by: ["type", "currency"], where: { userId, occurredAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    prisma.accountingProduct.count({ where: { userId } }),
    prisma.accountingProduct.aggregate({ where: { userId }, _sum: { quantity: true } }),
    prisma.accountingProduct.count({ where: { userId, quantity: { lte: 0 } } }),
    prisma.product.findMany({ where: { merchant: { userId }, isActive: true }, select: { stock: true } }),
    prisma.accountingEntry.findMany({ where: { userId }, orderBy: { occurredAt: "desc" }, take: 8 }),
    prisma.accountingEntry.groupBy({ by: ["currency"], where: { userId, source: "PAYROLL", occurredAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
  ]);
  const currencies = [...new Set(totals.map((x) => x.currency))];
  res.json({
    from, to, currencies,
    totals: currencies.map((currency) => {
      const income = Number(totals.find((x) => x.currency === currency && x.type === "INCOME")?._sum.amountCents ?? 0);
      const expenses = Number(totals.find((x) => x.currency === currency && x.type === "EXPENSE")?._sum.amountCents ?? 0);
      // the payroll share of the expenses is shown only where salaries were really booked (never an empty line)
      const payrollCents = Number(payroll.find((x) => x.currency === currency)?._sum.amountCents ?? 0);
      return { currency, incomeCents: income, expensesCents: expenses, netCents: income - expenses, ...(payrollCents > 0 ? { payrollCents } : {}) };
    }),
    inventory: { products: productCount + storeProducts.length, units: (stock._sum.quantity ?? 0) + storeProducts.reduce((sum, p) => sum + p.stock, 0), outOfStock: lowStock + storeProducts.filter(p => p.stock <= 0).length },
    recent: recent.map(plain),
  });
}));

accountingRouter.get("/entries", route(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const type = req.query.type === "INCOME" || req.query.type === "EXPENSE" ? req.query.type : undefined;
  const rows = await prisma.accountingEntry.findMany({
    where: { userId: req.user!.id, ...(type ? { type } : {}), ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { occurredAt: "desc" }, take: 250,
  });
  res.json(rows.map(({ receiptData, ...row }) => ({ ...plain(row), hasReceipt: !!receiptData })));
}));

accountingRouter.post("/entries", route(async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const row = await prisma.accountingEntry.create({ data: { ...parsed.data, payMethod: parsed.data.payMethod ?? "CASH", userId: req.user!.id, recordedById: req.user!.id, source: "MANUAL", occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date() } });
  res.status(201).json(plain(row));
}));

// Entries typed by hand (or from a scanned invoice) can be corrected or removed; the ones the store writes by itself
// (orders, commissions, delivery) follow the order and cannot be changed here.
const editableSources = ["MANUAL", "INVOICE"];
accountingRouter.patch("/entries/:id", route(async (req, res) => {
  const parsed = entrySchema.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const row = await prisma.accountingEntry.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true, source: true } });
  if (!row) return sendError(res, 404, "NOT_FOUND", "القيد غير موجود");
  if (row.source === "PAYROLL") return sendError(res, 409, "CONFLICT", "هذا القيد يُسجَّل تلقائيًا من نظام الموارد البشرية ولا يمكن تعديله");
  if (!editableSources.includes(row.source)) return sendError(res, 409, "CONFLICT", "هذا القيد يُسجَّل تلقائيًا من الطلب ولا يمكن تعديله");
  const { occurredAt, ...rest } = parsed.data;
  res.json(plain(await prisma.accountingEntry.update({ where: { id: row.id }, data: { ...rest, ...(occurredAt ? { occurredAt: new Date(occurredAt) } : {}) } })));
}));

accountingRouter.delete("/entries/:id", route(async (req, res) => {
  const row = await prisma.accountingEntry.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true, source: true, sourceKey: true } });
  if (!row) return sendError(res, 404, "NOT_FOUND", "القيد غير موجود");
  // a payroll entry follows its payroll run in the HR section; only one left behind by the old external link (no run to follow) may be removed by hand
  if (row.source === "PAYROLL" && !row.sourceKey?.startsWith("hr-payroll:")) return sendError(res, 409, "CONFLICT", "هذا القيد يُسجَّل تلقائيًا من نظام الموارد البشرية ولا يمكن حذفه");
  if (row.source !== "PAYROLL" && !editableSources.includes(row.source)) return sendError(res, 409, "CONFLICT", "هذا القيد يُسجَّل تلقائيًا من الطلب ولا يمكن حذفه");
  await prisma.accountingEntry.delete({ where: { id: row.id } });
  res.json({ deleted: true });
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
  if (parsed.data.taxRateId && (await ownRateId(req.user!.id, parsed.data.taxRateId)) === undefined) return sendError(res, 404, "NOT_FOUND", "نسبة الضريبة غير موجودة");
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

// The stock quantity changes only through /stock and /sell (so every change leaves a movement); the rest can be edited.
accountingRouter.patch("/products/:id", route(async (req, res) => {
  if (req.params.id.startsWith("store:")) return sendError(res, 400, "BAD_REQUEST", "منتجات المتجر تُعدَّل من صفحة المتجر");
  const parsed = productSchema.omit({ quantity: true }).partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (parsed.data.taxRateId && (await ownRateId(req.user!.id, parsed.data.taxRateId)) === undefined) return sendError(res, 404, "NOT_FOUND", "نسبة الضريبة غير موجودة");
  const p = await prisma.accountingProduct.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
  try {
    res.json(await prisma.accountingProduct.update({ where: { id: p.id }, data: { ...parsed.data, ...(parsed.data.barcode !== undefined ? { barcode: parsed.data.barcode || null } : {}), ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku || null } : {}) } }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return sendError(res, 409, "CONFLICT", "هذا الباركود مستخدم لمنتج آخر عندك");
    throw err;
  }
}));

accountingRouter.delete("/products/:id", route(async (req, res) => {
  if (req.params.id.startsWith("store:")) return sendError(res, 400, "BAD_REQUEST", "منتجات المتجر تُحذف من صفحة المتجر");
  const p = await prisma.accountingProduct.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
  await prisma.accountingProduct.delete({ where: { id: p.id } }); // its stock movements go with it; income already booked stays
  res.json({ deleted: true });
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
      // taking stock out only succeeds while enough is left at this very moment (two requests cannot both take the last pieces)
      if (signed < 0 && !(await tx.product.updateMany({ where: { id: p.id, stock: { gte: -signed } }, data: { stock: { decrement: -signed } } })).count) return null;
      const changed = await tx.product.update({ where: { id: p.id }, data: { ...(signed > 0 ? { stock: { increment: signed } } : {}), ...(parsed.data.unitCostCents !== undefined ? { costPriceCents: parsed.data.unitCostCents } : {}) } });
      if (signed !== 0) await tx.accountingStockMovement.create({ data: { userId: req.user!.id, storeProductId: p.id, action: parsed.data.action, quantity: parsed.data.quantity, note: parsed.data.note } });
      return changed;
    });
    if (!updated) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
    return res.json({ ...updated, quantity: updated.stock, id: `store:${updated.id}`, isStoreProduct: true });
  }
  const p = await prisma.accountingProduct.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
  if (parsed.data.action !== "ADJUSTMENT" && parsed.data.quantity === 0) return sendError(res, 400, "BAD_REQUEST", "أدخل كمية أكبر من صفر");
  const signed = parsed.data.action === "STOCK_IN" ? parsed.data.quantity : parsed.data.action === "STOCK_OUT" ? -parsed.data.quantity : parsed.data.quantity - p.quantity;
  if (p.quantity + signed < 0) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
  const updated = await prisma.$transaction(async (tx) => {
    if (signed < 0 && !(await tx.accountingProduct.updateMany({ where: { id: p.id, quantity: { gte: -signed } }, data: { quantity: { decrement: -signed } } })).count) return null;
    const changed = await tx.accountingProduct.update({ where: { id: p.id }, data: { ...(signed > 0 ? { quantity: { increment: signed } } : {}), ...(parsed.data.unitCostCents !== undefined ? { costCents: parsed.data.unitCostCents } : {}) } });
    if (signed !== 0) await tx.accountingStockMovement.create({ data: { userId: req.user!.id, productId: p.id, action: parsed.data.action, quantity: parsed.data.quantity, unitCostCents: parsed.data.unitCostCents, note: parsed.data.note } });
    return changed;
  });
  if (!updated) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
  res.json(updated);
}));

accountingRouter.post("/products/:id/sell", route(async (req, res) => {
  const parsed = z.object({ quantity: z.number().int().positive().max(1_000_000), unitPriceCents: z.number().int().positive().optional(), note: z.string().trim().max(240).optional(), payMethod: z.enum(["CASH", "BANK", "WALLET"]).default("CASH") }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if ((await taxContext(req.user!.id)).enabled) {
    const out = await createSaleInvoice(req.user!.id, { items: [{ productId: req.params.id, quantity: parsed.data.quantity, unitPriceCents: parsed.data.unitPriceCents }], payMethod: parsed.data.payMethod, note: parsed.data.note });
    if (!out.ok) return sendError(res, out.status, out.code, out.message, out.details);
    const store = req.params.id.startsWith("store:");
    const now = store ? await prisma.product.findUnique({ where: { id: req.params.id.slice(6) } }) : await prisma.accountingProduct.findUnique({ where: { id: req.params.id } });
    const product = store && now ? { ...now, quantity: (now as { stock: number }).stock, id: req.params.id } : now;
    return res.status(201).json({ product, incomeCents: out.sale.totalCents - out.sale.taxCents, costCents: out.costCents, netCents: out.netCents, taxCents: out.sale.taxCents });
  }
  if (req.params.id.startsWith("store:")) {
    const id = req.params.id.slice(6);
    const product = await prisma.product.findFirst({ where: { id, merchant: { userId: req.user!.id }, isActive: true } });
    if (!product) return sendError(res, 404, "NOT_FOUND", "منتج المتجر غير موجود");
    if (product.stock < parsed.data.quantity) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
    const unitPrice = parsed.data.unitPriceCents ?? product.priceCents;
    if (unitPrice <= 0) return sendError(res, 400, "BAD_REQUEST", "أدخل سعر البيع أولاً");
    const total = unitPrice * parsed.data.quantity;
    const ref = `store-manual-sale:${crypto.randomUUID()}`;
    const currency = await marketOfUser(req.user!.id);
    const updated = await prisma.$transaction(async (tx) => {
      // the stock is taken only while enough is left at this very moment, so two sales cannot both take the last pieces
      if (!(await tx.product.updateMany({ where: { id, stock: { gte: parsed.data.quantity } }, data: { stock: { decrement: parsed.data.quantity }, soldCount: { increment: parsed.data.quantity } } })).count) return null;
      await tx.accountingStockMovement.create({ data: { userId: req.user!.id, storeProductId: id, action: "STOCK_OUT", quantity: parsed.data.quantity, note: parsed.data.note || "بيع مباشر" } });
      await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "INCOME", category: "مبيعات", description: `${product.name} × ${parsed.data.quantity}`, amountCents: total, currency, source: "MANUAL", sourceKey: ref, payMethod: parsed.data.payMethod, recordedById: req.user!.id } });
      await tx.accountingSale.create({ data: { userId: req.user!.id, number: await nextSaleNumber(tx, req.user!.id), currency, subtotalCents: total, totalCents: total, payMethod: parsed.data.payMethod, recordedById: req.user!.id, lines: { create: [{ productId: `store:${product.id}`, name: product.name, quantity: parsed.data.quantity, unitPriceCents: unitPrice, unitCostCents: product.costPriceCents, lineTotalCents: total }] } } });
      if (product.costPriceCents > 0) await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "EXPENSE", category: "تكلفة البضاعة المباعة", description: `${product.name} × ${parsed.data.quantity}`, amountCents: product.costPriceCents * parsed.data.quantity, currency, source: "MANUAL", sourceKey: `${ref}:cost`, recordedById: req.user!.id } });
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
    if (!updated) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
    const cost = product.costPriceCents * parsed.data.quantity;
    alertLowStock(req.user!.id, [{ name: product.name, before: product.stock, after: updated.stock, min: 0 }]);
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
    // the stock is taken only while enough is left at this very moment, so two sales cannot both take the last pieces
    if (!(await tx.accountingProduct.updateMany({ where: { id: product.id, quantity: { gte: parsed.data.quantity } }, data: { quantity: { decrement: parsed.data.quantity } } })).count) return null;
    const updated = await tx.accountingProduct.findUniqueOrThrow({ where: { id: product.id } });
    await tx.accountingStockMovement.create({ data: { userId: req.user!.id, productId: product.id, action: "STOCK_OUT", quantity: parsed.data.quantity, unitCostCents: product.costCents, note: parsed.data.note || "بيع" } });
    await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "INCOME", category: "مبيعات", description: `${product.name} × ${parsed.data.quantity}`, amountCents: total, currency: product.currency, source: "MANUAL", sourceKey: ref, payMethod: parsed.data.payMethod, recordedById: req.user!.id } });
    await tx.accountingSale.create({ data: { userId: req.user!.id, number: await nextSaleNumber(tx, req.user!.id), currency: product.currency, subtotalCents: total, totalCents: total, payMethod: parsed.data.payMethod, recordedById: req.user!.id, lines: { create: [{ productId: product.id, name: product.name, quantity: parsed.data.quantity, unitPriceCents: unitPrice, unitCostCents: product.costCents, lineTotalCents: total }] } } });
    if (product.costCents > 0) await tx.accountingEntry.create({ data: { userId: req.user!.id, type: "EXPENSE", category: "تكلفة البضاعة المباعة", description: `${product.name} × ${parsed.data.quantity}`, amountCents: product.costCents * parsed.data.quantity, currency: product.currency, source: "MANUAL", sourceKey: `${ref}:cost`, recordedById: req.user!.id } });
    return updated;
  });
  if (!result) return sendError(res, 409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي");
  alertLowStock(req.user!.id, [{ name: product.name, before: product.quantity, after: result.quantity, min: product.lowStockAt }]);
  res.status(201).json({ product: result, incomeCents: total, costCents: product.costCents * parsed.data.quantity, netCents: total - product.costCents * parsed.data.quantity });
}));


/** How many of each line were returned already (by line id). */
async function returnedBySaleLine(lineIds: string[]) {
  if (!lineIds.length) return {} as Record<string, number>;
  const rows = await prisma.accountingSaleReturnLine.groupBy({ by: ["saleLineId"], where: { saleLineId: { in: lineIds } }, _sum: { quantity: true } });
  return Object.fromEntries(rows.map((r) => [r.saleLineId, r._sum.quantity ?? 0]));
}
async function returnedByPurchaseLine(lineIds: string[]) {
  if (!lineIds.length) return {} as Record<string, number>;
  const rows = await prisma.accountingPurchaseReturnLine.groupBy({ by: ["purchaseLineId"], where: { purchaseLineId: { in: lineIds } }, _sum: { quantity: true } });
  return Object.fromEntries(rows.map((r) => [r.purchaseLineId, r._sum.quantity ?? 0]));
}

// ---- reports: totals, a series by day / week / month, by category and by product, for any period
const COST_CATEGORY = "تكلفة البضاعة المباعة";
const SALES_CATEGORY = "مبيعات";
const RETURNS_CATEGORY = "مرتجعات مبيعات";
accountingRouter.get("/reports", route(async (req, res) => {
  const parsed = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: currencyCode.optional(), groupBy: z.enum(["day", "week", "month"]).default("day"),
  }).safeParse({ from: req.query.from, to: req.query.to, currency: req.query.currency, groupBy: req.query.groupBy ?? "day" });
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id;
  const from = new Date(`${parsed.data.from}T00:00:00.000Z`), to = new Date(`${parsed.data.to}T23:59:59.999Z`);
  if (from > to || to.getTime() - from.getTime() > 800 * 86400000) return sendError(res, 400, "BAD_REQUEST", "الفترة الزمنية غير صحيحة");
  const inRange = { userId, occurredAt: { gte: from, lte: to }, type: { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] } };
  const currencies = (await prisma.accountingEntry.groupBy({ by: ["currency"], where: inRange })).map((c) => c.currency);
  const currency = parsed.data.currency ?? currencies[0] ?? "EUR";
  const trunc = Prisma.raw(`'${parsed.data.groupBy}'`); // whitelisted by the schema above
  const [byType, byCategory, series, products, saleTotals, returnedLines] = await Promise.all([
    prisma.accountingEntry.groupBy({ by: ["type"], where: { ...inRange, currency }, _sum: { amountCents: true } }),
    prisma.accountingEntry.groupBy({ by: ["category", "type"], where: { ...inRange, currency }, _sum: { amountCents: true }, _count: { _all: true }, orderBy: { _sum: { amountCents: "desc" } }, take: 40 }),
    prisma.$queryRaw<{ period: Date; type: string; total: bigint }[]>`SELECT date_trunc(${trunc}, "occurredAt" AT TIME ZONE 'UTC') AS period, "type"::text AS type, SUM("amountCents") AS total FROM "AccountingEntry" WHERE "userId" = ${userId} AND "currency" = ${currency} AND "type" IN ('INCOME', 'EXPENSE') AND "occurredAt" >= ${from} AND "occurredAt" <= ${to} GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw<{ name: string; qty: bigint; revenue: bigint; cost: bigint }[]>`SELECT l."name" AS name, SUM(l."quantity") AS qty, SUM(l."lineTotalCents") AS revenue, SUM(l."unitCostCents" * l."quantity") AS cost FROM "AccountingSaleLine" l JOIN "AccountingSale" s ON s."id" = l."saleId" WHERE s."userId" = ${userId} AND s."currency" = ${currency} AND s."occurredAt" >= ${from} AND s."occurredAt" <= ${to} GROUP BY l."name" ORDER BY revenue DESC LIMIT 50`,
    prisma.accountingSale.aggregate({ where: { userId, currency, occurredAt: { gte: from, lte: to } }, _sum: { discountCents: true }, _count: { _all: true } }),
    prisma.$queryRaw<{ name: string; qty: bigint; revenue: bigint; cost: bigint }[]>`SELECT l."name" AS name, SUM(l."quantity") AS qty, SUM(l."lineTotalCents") AS revenue, SUM(l."unitCostCents" * l."quantity") AS cost FROM "AccountingSaleReturnLine" l JOIN "AccountingSaleReturn" r ON r."id" = l."returnId" WHERE r."userId" = ${userId} AND r."currency" = ${currency} AND r."occurredAt" >= ${from} AND r."occurredAt" <= ${to} GROUP BY l."name"`,
  ]);
  const amount = (t: string) => Number(byType.find((x) => x.type === t)?._sum.amountCents ?? 0);
  const income = amount("INCOME"), expenses = amount("EXPENSE");
  const cat = (c: string, t: string) => Number(byCategory.find((x) => x.category === c && x.type === t)?._sum.amountCents ?? 0);
  const returnsCents = -cat(RETURNS_CATEGORY, "INCOME");
  const salesCents = cat(SALES_CATEGORY, "INCOME") - returnsCents, cogs = cat(COST_CATEGORY, "EXPENSE");
  const periods = new Map<string, { period: string; incomeCents: number; expensesCents: number }>();
  for (const r of series) {
    const key = new Date(r.period).toISOString().slice(0, 10);
    const row = periods.get(key) ?? { period: key, incomeCents: 0, expensesCents: 0 };
    if (r.type === "INCOME") row.incomeCents += Number(r.total); else row.expensesCents += Number(r.total);
    periods.set(key, row);
  }
  res.json({
    from: parsed.data.from, to: parsed.data.to, currency, currencies, groupBy: parsed.data.groupBy,
    totals: { incomeCents: income, expensesCents: expenses, netCents: income - expenses, salesCents, costOfGoodsCents: cogs, returnsCents, grossProfitCents: salesCents - cogs, otherExpensesCents: expenses - cogs, invoices: saleTotals._count._all, discountCents: Number(saleTotals._sum.discountCents ?? 0) },
    series: [...periods.values()].map((p) => ({ ...p, netCents: p.incomeCents - p.expensesCents })),
    byCategory: byCategory.map((c) => ({ category: c.category, type: c.type, amountCents: Number(c._sum.amountCents ?? 0), entries: c._count._all })),
    byProduct: (() => {
      const back = new Map(returnedLines.map((r) => [r.name, r]));
      const names = new Set([...products.map((p) => p.name), ...returnedLines.map((r) => r.name)]);
      return [...names].map((name) => {
        const sold = products.find((p) => p.name === name), r = back.get(name);
        const quantity = Number(sold?.qty ?? 0) - Number(r?.qty ?? 0), revenueCents = Number(sold?.revenue ?? 0) - Number(r?.revenue ?? 0), costCents = Number(sold?.cost ?? 0) - Number(r?.cost ?? 0);
        return { name, quantity, revenueCents, costCents, profitCents: revenueCents - costCents };
      }).filter((x) => x.quantity !== 0 || x.revenueCents !== 0).sort((a, b) => b.revenueCents - a.revenueCents);
    })(),
  });
}));

// ---- stock watch: what is low or out, the movements of a product, and a physical count (counted numbers against the book)
accountingRouter.get("/stock/low", route(async (req, res) => {
  const userId = req.user!.id;
  const [own, shop] = await Promise.all([
    prisma.accountingProduct.findMany({ where: { userId }, select: { id: true, name: true, unit: true, quantity: true, lowStockAt: true, currency: true } }),
    prisma.product.findMany({ where: { merchant: { userId }, isActive: true, stock: { lte: 0 } }, select: { id: true, name: true, stock: true } }),
  ]);
  const items = [
    ...own.filter((p) => p.quantity <= 0 || (p.lowStockAt > 0 && p.quantity <= p.lowStockAt)).map((p) => ({ id: p.id, name: p.name, unit: p.unit, quantity: p.quantity, lowStockAt: p.lowStockAt, currency: p.currency, isStoreProduct: false, level: p.quantity <= 0 ? "OUT" : "LOW" })),
    ...shop.map((p) => ({ id: `store:${p.id}`, name: p.name, unit: "قطعة", quantity: p.stock, lowStockAt: 0, currency: null, isStoreProduct: true, level: "OUT" })),
  ].sort((a, b) => a.quantity - b.quantity);
  res.json({ items, out: items.filter((i) => i.level === "OUT").length, low: items.filter((i) => i.level === "LOW").length });
}));

accountingRouter.get("/products/:id/movements", route(async (req, res) => {
  const store = req.params.id.startsWith("store:");
  const id = store ? req.params.id.slice(6) : req.params.id;
  const owned = store ? await prisma.product.findFirst({ where: { id, merchant: { userId: req.user!.id } }, select: { id: true } }) : await prisma.accountingProduct.findFirst({ where: { id, userId: req.user!.id }, select: { id: true } });
  if (!owned) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
  const rows = await prisma.accountingStockMovement.findMany({ where: { userId: req.user!.id, ...(store ? { storeProductId: id } : { productId: id }) }, orderBy: { occurredAt: "desc" }, take: 100 });
  res.json(rows.map((m) => ({ id: m.id, action: m.action, quantity: m.quantity, unitCostCents: m.unitCostCents, note: m.note, occurredAt: m.occurredAt })));
}));

// The counted quantity of each product replaces the book quantity; every difference leaves an ADJUSTMENT movement. A product whose quantity changed
// meanwhile (a sale during the count) is skipped and reported, never overwritten.
accountingRouter.post("/stock/count", route(async (req, res) => {
  const parsed = z.object({ items: z.array(z.object({ productId: z.string().min(1).max(80), countedQuantity: z.number().int().nonnegative().max(2_000_000_000) })).min(1).max(500), note: z.string().trim().max(240).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id;
  const changed: { id: string; name: string; before: number; after: number; difference: number }[] = [];
  const skipped: { id: string; name: string }[] = [];
  let unchanged = 0;
  for (const it of parsed.data.items) {
    const store = it.productId.startsWith("store:");
    const id = store ? it.productId.slice(6) : it.productId;
    const p = store
      ? await prisma.product.findFirst({ where: { id, merchant: { userId } }, select: { id: true, name: true, stock: true } }).then((x) => x && { id: x.id, name: x.name, quantity: x.stock })
      : await prisma.accountingProduct.findFirst({ where: { id, userId }, select: { id: true, name: true, quantity: true } });
    if (!p) { skipped.push({ id: it.productId, name: it.productId }); continue; }
    if (p.quantity === it.countedQuantity) { unchanged++; continue; }
    const ok = await prisma.$transaction(async (tx) => {
      const done = store
        ? await tx.product.updateMany({ where: { id: p.id, stock: p.quantity }, data: { stock: it.countedQuantity } })
        : await tx.accountingProduct.updateMany({ where: { id: p.id, quantity: p.quantity }, data: { quantity: it.countedQuantity } });
      if (!done.count) return false;
      await tx.accountingStockMovement.create({ data: { userId, ...(store ? { storeProductId: p.id } : { productId: p.id }), action: "ADJUSTMENT", quantity: it.countedQuantity, note: `جرد فعلي: كان ${p.quantity}${parsed.data.note ? ` — ${parsed.data.note}` : ""}` } });
      return true;
    });
    if (ok) changed.push({ id: it.productId, name: p.name, before: p.quantity, after: it.countedQuantity, difference: it.countedQuantity - p.quantity }); else skipped.push({ id: it.productId, name: p.name });
  }
  res.json({ changed, unchanged, skipped });
}));

// ---- customers and suppliers: a ledger of what they owe us / what we owe them, payments against it, and a statement
const partyKind = z.enum(["CUSTOMER", "SUPPLIER"]);
type LedgerRow = { kind: string; amountCents: bigint; currency: string };
const balancesOf = (rows: LedgerRow[]) => {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + (r.kind === "CHARGE" ? 1 : -1) * Number(r.amountCents));
  return [...by.entries()].filter(([, v]) => v !== 0).map(([currency, balanceCents]) => ({ currency, balanceCents }));
};

accountingRouter.get("/parties", route(async (req, res) => {
  const kind = partyKind.safeParse(req.query.kind);
  const archived = req.query.archived === "1";
  const parties = await prisma.accountingParty.findMany({ where: { userId: req.user!.id, ...(kind.success ? { kind: kind.data } : {}), ...(archived ? {} : { archivedAt: null }) }, include: { entries: { select: { kind: true, amountCents: true, currency: true } } }, orderBy: { name: "asc" }, take: 500 });
  const rows = parties.map((p) => ({ id: p.id, kind: p.kind, name: p.name, phone: p.phone, note: p.note, archived: !!p.archivedAt, balances: balancesOf(p.entries) }));
  const total = (k: string) => { const by = new Map<string, number>(); for (const r of rows.filter((x) => x.kind === k)) for (const b of r.balances) by.set(b.currency, (by.get(b.currency) ?? 0) + b.balanceCents); return [...by.entries()].map(([currency, cents]) => ({ currency, cents })); };
  res.json({ parties: rows, receivable: total("CUSTOMER"), payable: total("SUPPLIER") });
}));

accountingRouter.post("/parties", route(async (req, res) => {
  const parsed = z.object({ kind: partyKind, name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional(), note: z.string().trim().max(240).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    const row = await prisma.accountingParty.create({ data: { ...parsed.data, userId: req.user!.id } });
    res.status(201).json({ id: row.id, kind: row.kind, name: row.name, phone: row.phone, note: row.note, archived: false, balances: [] });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return sendError(res, 409, "CONFLICT", "يوجد اسم مسجّل بنفس الاسم");
    throw err;
  }
}));

accountingRouter.patch("/parties/:id", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(40).nullable().optional(), note: z.string().trim().max(240).nullable().optional(), archived: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const own = await prisma.accountingParty.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!own) return sendError(res, 404, "NOT_FOUND", "غير موجود");
  const { archived, ...rest } = parsed.data;
  try {
    const row = await prisma.accountingParty.update({ where: { id: own.id }, data: { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) } });
    res.json({ id: row.id, name: row.name, phone: row.phone, note: row.note, archived: !!row.archivedAt });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return sendError(res, 409, "CONFLICT", "يوجد اسم مسجّل بنفس الاسم");
    throw err;
  }
}));

// The statement: every charge and payment in order, with the balance after each one.
accountingRouter.get("/parties/:id", route(async (req, res) => {
  const p = await prisma.accountingParty.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { entries: { orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] } } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "غير موجود");
  const saleIds = [...new Set(p.entries.map((e) => e.saleId).filter((x): x is string => !!x))];
  const sales = saleIds.length ? await prisma.accountingSale.findMany({ where: { id: { in: saleIds } }, select: { id: true, number: true } }) : [];
  const purchaseIds = [...new Set(p.entries.map((e) => e.purchaseId).filter((x): x is string => !!x))];
  const purchases = purchaseIds.length ? await prisma.accountingPurchase.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, number: true } }) : [];
  const running = new Map<string, number>();
  const entries = p.entries.map((e) => {
    const next = (running.get(e.currency) ?? 0) + (e.kind === "CHARGE" ? 1 : -1) * Number(e.amountCents);
    running.set(e.currency, next);
    return { id: e.id, kind: e.kind, amountCents: Number(e.amountCents), currency: e.currency, payMethod: e.payMethod, note: e.note, occurredAt: e.occurredAt, saleNumber: sales.find((s) => s.id === e.saleId)?.number ?? null, purchaseNumber: purchases.find((x) => x.id === e.purchaseId)?.number ?? null, balanceAfterCents: next };
  });
  res.json({ id: p.id, kind: p.kind, name: p.name, phone: p.phone, note: p.note, archived: !!p.archivedAt, balances: balancesOf(p.entries), entries: entries.reverse() });
}));

// A debt that did not come from an invoice here: an old balance, or something owed without a stock purchase.
// book = true also writes it as income (customer) or as an expense (supplier); otherwise it is only on the account.
accountingRouter.post("/parties/:id/charges", route(async (req, res) => {
  const parsed = z.object({ amountCents: z.number().int().positive().max(MAX_ENTRY_CENTS), currency: currencyCode.default("EUR"), note: z.string().trim().max(240).optional(), book: z.boolean().default(false), occurredAt: z.string().datetime().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id, d = parsed.data;
  const p = await prisma.accountingParty.findFirst({ where: { id: req.params.id, userId, archivedAt: null } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "غير موجود");
  const when = d.occurredAt ? new Date(d.occurredAt) : new Date();
  await prisma.$transaction(async (tx) => {
    let entryId: string | null = null;
    if (d.book) {
      const e = await tx.accountingEntry.create({ data: { userId, type: p.kind === "CUSTOMER" ? "INCOME" : "EXPENSE", category: p.kind === "CUSTOMER" ? "مبيعات آجلة" : "مشتريات", description: d.note ? `${p.name} — ${d.note}` : p.name, amountCents: d.amountCents, currency: d.currency, occurredAt: when, source: "PARTY", recordedById: userId } });
      entryId = e.id;
    }
    await tx.accountingPartyEntry.create({ data: { partyId: p.id, userId, kind: "CHARGE", amountCents: d.amountCents, currency: d.currency, entryId, note: d.note, occurredAt: when } });
  });
  res.status(201).json({ ok: true });
}));

accountingRouter.post("/parties/:id/payments", route(async (req, res) => {
  const parsed = z.object({ amountCents: z.number().int().positive().max(MAX_ENTRY_CENTS), currency: currencyCode.default("EUR"), payMethod: z.enum(["CASH", "BANK", "WALLET"]).default("CASH"), note: z.string().trim().max(240).optional(), occurredAt: z.string().datetime().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id, d = parsed.data;
  const p = await prisma.accountingParty.findFirst({ where: { id: req.params.id, userId }, include: { entries: { select: { kind: true, amountCents: true, currency: true } } } });
  if (!p) return sendError(res, 404, "NOT_FOUND", "غير موجود");
  const owed = balancesOf(p.entries).find((b) => b.currency === d.currency)?.balanceCents ?? 0;
  if (d.amountCents > owed) return sendError(res, 409, "CONFLICT", "المبلغ أكبر من الرصيد المستحق");
  const when = d.occurredAt ? new Date(d.occurredAt) : new Date();
  await prisma.$transaction(async (tx) => {
    const e = await tx.accountingEntry.create({ data: { userId, type: p.kind === "CUSTOMER" ? "RECEIPT" : "PAYOUT", category: p.kind === "CUSTOMER" ? "دفعة زبون" : "دفعة مورد", description: d.note ? `${p.name} — ${d.note}` : p.name, amountCents: d.amountCents, currency: d.currency, occurredAt: when, source: "PARTY", payMethod: d.payMethod, recordedById: userId } });
    await tx.accountingPartyEntry.create({ data: { partyId: p.id, userId, kind: "PAYMENT", amountCents: d.amountCents, currency: d.currency, payMethod: d.payMethod, entryId: e.id, note: d.note, occurredAt: when } });
  });
  res.status(201).json({ ok: true });
}));

// ---- a purchase from a supplier: stock in at its cost (the average cost is updated), money out, and a debt for what is not paid yet
const purchaseSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().positive().max(1_000_000), unitCostCents: z.number().int().nonnegative().max(2_000_000_000), taxRateId: z.string().uuid().nullable().optional() })).min(1).max(100),
  partyId: z.string().uuid().optional(),
  paidCents: z.number().int().nonnegative().max(MAX_ENTRY_CENTS).optional(),
  payMethod: z.enum(["CASH", "BANK", "WALLET"]).default("CASH"),
  note: z.string().trim().max(240).optional(),
  occurredAt: z.string().datetime().optional(),
});
type PurchaseRow = { returned?: Record<string, number>; taxCents?: bigint; id: string; number: number; partyId: string | null; supplierName: string | null; note: string | null; currency: string; totalCents: bigint; paidCents: bigint; payMethod: string; occurredAt: Date; lines: { id: string; productId: string | null; name: string; quantity: number; unitCostCents: bigint; lineTotalCents: bigint; taxRateBp?: number; taxCents?: bigint }[] };
const plainPurchase = (r: PurchaseRow) => ({
  id: r.id, number: r.number, partyId: r.partyId, supplierName: r.supplierName, note: r.note, currency: r.currency, payMethod: r.payMethod, occurredAt: r.occurredAt, totalCents: Number(r.totalCents), paidCents: Number(r.paidCents), taxCents: Number(r.taxCents ?? 0),
  lines: r.lines.map((l) => ({ id: l.id, productId: l.productId, name: l.name, quantity: l.quantity, returnedQuantity: r.returned?.[l.id] ?? 0, unitCostCents: Number(l.unitCostCents), lineTotalCents: Number(l.lineTotalCents), taxRateBp: l.taxRateBp ?? 0, taxCents: Number(l.taxCents ?? 0) })),
});
/** The cost of a product after new units came in: the average of what was there and what arrived, weighted by the quantities. */
const averageCost = (oldQty: number, oldCost: number, addQty: number, addCost: number) => (oldQty > 0 ? Math.round((oldQty * oldCost + addQty * addCost) / (oldQty + addQty)) : addCost);

accountingRouter.post("/purchases", route(async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id, d = parsed.data;
  const wanted = new Map<string, { quantity: number; unitCostCents: number; taxRateId?: string | null }>();
  for (const it of d.items) { const cur = wanted.get(it.productId); if (cur) wanted.set(it.productId, { quantity: cur.quantity + it.quantity, unitCostCents: Math.round((cur.quantity * cur.unitCostCents + it.quantity * it.unitCostCents) / (cur.quantity + it.quantity)), taxRateId: it.taxRateId ?? cur.taxRateId }); else wanted.set(it.productId, { quantity: it.quantity, unitCostCents: it.unitCostCents, taxRateId: it.taxRateId }); }
  const ids = [...wanted.keys()];
  const [own, shop, shopCurrency, tax] = await Promise.all([
    prisma.accountingProduct.findMany({ where: { userId, id: { in: ids.filter((i) => !i.startsWith("store:")) } } }),
    prisma.product.findMany({ where: { merchant: { userId }, id: { in: ids.filter((i) => i.startsWith("store:")).map((i) => i.slice(6)) } } }),
    marketOfUser(userId),
    taxContext(userId),
  ]);
  type Line = { key: string; store: boolean; id: string; name: string; quantity: number; unitCost: number; oldQty: number; oldCost: number; currency: string; rateBp: number };
  const lines: Line[] = [];
  for (const [key, w] of wanted) {
    if (key.startsWith("store:")) {
      const p = shop.find((x) => `store:${x.id}` === key); if (!p) return sendError(res, 404, "NOT_FOUND", "منتج المتجر غير موجود");
      lines.push({ key, store: true, id: p.id, name: p.name, quantity: w.quantity, unitCost: w.unitCostCents, oldQty: p.stock, oldCost: p.costPriceCents, currency: shopCurrency, rateBp: w.taxRateId ? (tax.byId.get(w.taxRateId) ?? tax.defaultBp) : tax.defaultBp });
    } else {
      const p = own.find((x) => x.id === key); if (!p) return sendError(res, 404, "NOT_FOUND", "المنتج غير موجود");
      lines.push({ key, store: false, id: p.id, name: p.name, quantity: w.quantity, unitCost: w.unitCostCents, oldQty: p.quantity, oldCost: p.costCents, currency: p.currency, rateBp: w.taxRateId ? (tax.byId.get(w.taxRateId) ?? bpFor(tax, p.taxRateId)) : bpFor(tax, p.taxRateId) });
    }
  }
  const currency = lines[0].currency;
  if (lines.some((l) => l.currency !== currency)) return sendError(res, 400, "BAD_REQUEST", "كل أصناف الفاتورة لازم تكون بنفس العملة");
  // the cost typed is without tax; the tax paid to the supplier is added on top of it
  const lineTax = lines.map((l) => Math.round(l.unitCost * l.quantity * l.rateBp / 10000));
  const taxTotal = lineTax.reduce((sum, x) => sum + x, 0);
  const total = lines.reduce((sum, l) => sum + l.unitCost * l.quantity, 0) + taxTotal;
  if (total <= 0) return sendError(res, 400, "BAD_REQUEST", "مجموع الفاتورة لازم يكون أكبر من صفر");
  const paid = d.paidCents ?? total;
  if (paid > total) return sendError(res, 400, "BAD_REQUEST", "المبلغ المدفوع أكبر من مجموع الفاتورة");
  let supplier: { id: string; name: string } | null = null;
  if (d.partyId) {
    supplier = await prisma.accountingParty.findFirst({ where: { id: d.partyId, userId, kind: "SUPPLIER", archivedAt: null }, select: { id: true, name: true } });
    if (!supplier) return sendError(res, 404, "NOT_FOUND", "المورد غير موجود");
  } else if (paid < total) return sendError(res, 400, "BAD_REQUEST", "الشراء الآجل لازم يكون من مورد مسجّل");
  const when = d.occurredAt ? new Date(d.occurredAt) : new Date();
  const purchase = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"purchase-number:" + userId}))`;
    const last = await tx.accountingPurchase.aggregate({ where: { userId }, _max: { number: true } });
    const created = await tx.accountingPurchase.create({
      data: { userId, number: (last._max.number ?? 0) + 1, partyId: supplier?.id ?? null, supplierName: supplier?.name ?? null, note: d.note || null, currency, totalCents: total, taxCents: taxTotal, paidCents: paid, payMethod: d.payMethod, occurredAt: when, recordedById: userId,
        lines: { create: lines.map((l, i) => ({ productId: l.key, name: l.name, quantity: l.quantity, unitCostCents: l.unitCost, lineTotalCents: l.unitCost * l.quantity, taxRateBp: l.rateBp, taxCents: lineTax[i] })) } },
      include: { lines: true },
    });
    for (const l of lines) {
      const cost = averageCost(l.oldQty, l.oldCost, l.quantity, l.unitCost);
      if (l.store) await tx.product.update({ where: { id: l.id }, data: { stock: { increment: l.quantity }, costPriceCents: cost } });
      else await tx.accountingProduct.update({ where: { id: l.id }, data: { quantity: { increment: l.quantity }, costCents: cost } });
      await tx.accountingStockMovement.create({ data: { userId, ...(l.store ? { storeProductId: l.id } : { productId: l.id }), action: "STOCK_IN", quantity: l.quantity, unitCostCents: l.unitCost, note: `فاتورة شراء #${created.number}` } });
    }
    const label = `فاتورة شراء #${created.number}${supplier ? ` — ${supplier.name}` : ""}`;
    // the money that left is a payout, not an expense: the cost of these goods reaches the profit when they are sold
    const payout = paid > 0 ? await tx.accountingEntry.create({ data: { userId, type: "PAYOUT", category: "مشتريات بضاعة", description: label, amountCents: paid, currency, occurredAt: when, source: "PURCHASE", sourceKey: `purchase:${created.id}`, payMethod: d.payMethod, recordedById: userId } }) : null;
    if (supplier && paid < total) {
      await tx.accountingPartyEntry.create({ data: { partyId: supplier.id, userId, kind: "CHARGE", amountCents: total, currency, purchaseId: created.id, note: label, occurredAt: when } });
      if (payout) await tx.accountingPartyEntry.create({ data: { partyId: supplier.id, userId, kind: "PAYMENT", amountCents: paid, currency, payMethod: d.payMethod, purchaseId: created.id, entryId: payout.id, note: label, occurredAt: when } });
    }
    return created;
  });
  res.status(201).json(plainPurchase(purchase));
}));

accountingRouter.get("/purchases", route(async (req, res) => {
  const rows = await prisma.accountingPurchase.findMany({ where: { userId: req.user!.id }, include: { lines: true }, orderBy: { number: "desc" }, take: 100 });
  const returned = await returnedByPurchaseLine(rows.flatMap((r) => r.lines.map((l) => l.id)));
  res.json(rows.map((r) => plainPurchase({ ...r, returned })));
}));

accountingRouter.get("/purchases/:id", route(async (req, res) => {
  const row = await prisma.accountingPurchase.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { lines: true } });
  if (!row) return sendError(res, 404, "NOT_FOUND", "الفاتورة غير موجودة");
  res.json(plainPurchase({ ...row, returned: await returnedByPurchaseLine(row.lines.map((l) => l.id)) }));
}));

// ---- returns. A sales return puts the goods back, takes the income and the cost back, lowers what the customer owes first and pays the rest back in money.
// A purchase return takes the goods out, lowers what we owe the supplier first and takes the rest back in money. The invoices themselves never change.
const returnSchema = z.object({
  items: z.array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().positive().max(1_000_000) })).min(1).max(100),
  refundMethod: z.enum(["CASH", "BANK", "WALLET"]).optional(),
  note: z.string().trim().max(240).optional(),
  occurredAt: z.string().datetime().optional(),
});
const owedOn = (rows: LedgerRow[], currency: string) => Math.max(balancesOf(rows).find((b) => b.currency === currency)?.balanceCents ?? 0, 0);

accountingRouter.post("/sales/:id/returns", route(async (req, res) => {
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id, d = parsed.data;
  const sale = await prisma.accountingSale.findFirst({ where: { id: req.params.id, userId }, include: { lines: true } });
  if (!sale) return sendError(res, 404, "NOT_FOUND", "الفاتورة غير موجودة");
  const returned = await returnedBySaleLine(sale.lines.map((l) => l.id));
  const wanted = new Map<string, number>();
  for (const it of d.items) wanted.set(it.lineId, (wanted.get(it.lineId) ?? 0) + it.quantity);
  const picked: { line: (typeof sale.lines)[number]; quantity: number }[] = [];
  for (const [lineId, quantity] of wanted) {
    const line = sale.lines.find((l) => l.id === lineId);
    if (!line) return sendError(res, 404, "NOT_FOUND", "سطر الفاتورة غير موجود");
    if (quantity > line.quantity - (returned[lineId] ?? 0)) return sendError(res, 409, "CONFLICT", "الكمية المرتجعة أكبر من الكمية المباعة");
    picked.push({ line, quantity });
  }
  // each returned line takes back its own share of the discount and of the tax (an old invoice, from before the lines kept theirs, shares the discount of the invoice)
  const legacyDiscount = sale.lines.every((l) => Number(l.discountCents) === 0) && Number(sale.discountCents) > 0;
  const parts = picked.map((p) => {
    const gross = Number(p.line.unitPriceCents) * p.quantity, frac = p.quantity / p.line.quantity;
    const disc = legacyDiscount ? Math.round(Number(sale.discountCents) * gross / Number(sale.subtotalCents)) : Math.round(Number(p.line.discountCents) * frac);
    const taxBackLine = Math.round(Number(p.line.taxCents) * frac);
    return { gross, tax: taxBackLine, base: gross - disc - (sale.pricesIncludeTax ? taxBackLine : 0), payable: gross - disc + (sale.pricesIncludeTax ? 0 : taxBackLine) };
  });
  const total = parts.reduce((sum, x) => sum + x.payable, 0);
  const taxBack = parts.reduce((sum, x) => sum + x.tax, 0);
  const cost = picked.reduce((sum, p) => sum + Number(p.line.unitCostCents) * p.quantity, 0);
  const owed = sale.partyId ? owedOn(await prisma.accountingPartyEntry.findMany({ where: { partyId: sale.partyId }, select: { kind: true, amountCents: true, currency: true } }), sale.currency) : 0;
  const debt = Math.min(total, owed), refund = total - debt;
  const when = d.occurredAt ? new Date(d.occurredAt) : new Date();
  const method = d.refundMethod ?? sale.payMethod;
  const done = await prisma.$transaction(async (tx) => {
    const created = await tx.accountingSaleReturn.create({
      data: { userId, saleId: sale.id, currency: sale.currency, totalCents: total, refundCents: refund, debtCents: debt, payMethod: refund > 0 ? method : null, note: d.note || null, occurredAt: when, recordedById: userId,
        lines: { create: picked.map((p, i) => ({ saleLineId: p.line.id, productId: p.line.productId, name: p.line.name, quantity: p.quantity, unitPriceCents: p.line.unitPriceCents, unitCostCents: p.line.unitCostCents, lineTotalCents: Number(p.line.unitPriceCents) * p.quantity, taxRateBp: p.line.taxRateBp, taxCents: parts[i].tax, baseCents: parts[i].base })) } },
    });
    for (const p of picked) {
      const key = p.line.productId;
      if (key) {
        if (key.startsWith("store:")) await tx.product.updateMany({ where: { id: key.slice(6) }, data: { stock: { increment: p.quantity }, soldCount: { decrement: p.quantity } } });
        else await tx.accountingProduct.updateMany({ where: { id: key, userId }, data: { quantity: { increment: p.quantity } } });
        await tx.accountingStockMovement.create({ data: { userId, ...(key.startsWith("store:") ? { storeProductId: key.slice(6) } : { productId: key }), action: "STOCK_IN", quantity: p.quantity, unitCostCents: Number(p.line.unitCostCents), note: `مرتجع فاتورة بيع #${sale.number}` } }).catch(() => undefined);
      }
    }
    const label = `مرتجع فاتورة بيع #${sale.number}${sale.customerName ? ` — ${sale.customerName}` : ""}`;
    // the income and the cost of the returned goods are taken back (negative entries); the money paid back is a payout, not an expense
    await tx.accountingEntry.create({ data: { userId, type: "INCOME", category: RETURNS_CATEGORY, description: label, amountCents: -(total - taxBack), currency: sale.currency, occurredAt: when, source: "RETURN", sourceKey: `sale-return:${created.id}`, recordedById: userId } });
    if (cost > 0) await tx.accountingEntry.create({ data: { userId, type: "EXPENSE", category: COST_CATEGORY, description: label, amountCents: -cost, currency: sale.currency, occurredAt: when, source: "RETURN", sourceKey: `sale-return:${created.id}:cost`, recordedById: userId } });
    if (refund > 0) {
      const out = await tx.accountingEntry.create({ data: { userId, type: "PAYOUT", category: "رد مبلغ لزبون", description: label, amountCents: refund, currency: sale.currency, occurredAt: when, source: "RETURN", sourceKey: `sale-return:${created.id}:refund`, payMethod: method, recordedById: userId } });
      void out;
    }
    if (debt > 0 && sale.partyId) await tx.accountingPartyEntry.create({ data: { partyId: sale.partyId, userId, kind: "PAYMENT", amountCents: debt, currency: sale.currency, saleId: sale.id, note: label, occurredAt: when } });
    return created;
  });
  res.status(201).json({ id: done.id, totalCents: total, refundCents: refund, debtCents: debt, costCents: cost });
}));

accountingRouter.post("/purchases/:id/returns", route(async (req, res) => {
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id, d = parsed.data;
  const purchase = await prisma.accountingPurchase.findFirst({ where: { id: req.params.id, userId }, include: { lines: true } });
  if (!purchase) return sendError(res, 404, "NOT_FOUND", "الفاتورة غير موجودة");
  const returned = await returnedByPurchaseLine(purchase.lines.map((l) => l.id));
  const wanted = new Map<string, number>();
  for (const it of d.items) wanted.set(it.lineId, (wanted.get(it.lineId) ?? 0) + it.quantity);
  const picked: { line: (typeof purchase.lines)[number]; quantity: number }[] = [];
  for (const [lineId, quantity] of wanted) {
    const line = purchase.lines.find((l) => l.id === lineId);
    if (!line) return sendError(res, 404, "NOT_FOUND", "سطر الفاتورة غير موجود");
    if (quantity > line.quantity - (returned[lineId] ?? 0)) return sendError(res, 409, "CONFLICT", "الكمية المرتجعة أكبر من الكمية المشتراة");
    picked.push({ line, quantity });
  }
  const parts = picked.map((p) => { const base = Number(p.line.unitCostCents) * p.quantity; return { base, tax: Math.round(Number(p.line.taxCents) * p.quantity / p.line.quantity) }; });
  const total = parts.reduce((sum, x) => sum + x.base + x.tax, 0);
  const owed = purchase.partyId ? owedOn(await prisma.accountingPartyEntry.findMany({ where: { partyId: purchase.partyId }, select: { kind: true, amountCents: true, currency: true } }), purchase.currency) : 0;
  const debt = Math.min(total, owed), refund = total - debt;
  const when = d.occurredAt ? new Date(d.occurredAt) : new Date();
  const method = d.refundMethod ?? purchase.payMethod;
  const done = await prisma.$transaction(async (tx) => {
    for (const p of picked) {
      const key = p.line.productId; if (!key) continue;
      const took = key.startsWith("store:")
        ? await tx.product.updateMany({ where: { id: key.slice(6), stock: { gte: p.quantity } }, data: { stock: { decrement: p.quantity } } })
        : await tx.accountingProduct.updateMany({ where: { id: key, userId, quantity: { gte: p.quantity } }, data: { quantity: { decrement: p.quantity } } });
      if (!took.count) throw new SaleError(409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي", { productId: key, name: p.line.name });
      await tx.accountingStockMovement.create({ data: { userId, ...(key.startsWith("store:") ? { storeProductId: key.slice(6) } : { productId: key }), action: "STOCK_OUT", quantity: p.quantity, unitCostCents: Number(p.line.unitCostCents), note: `مرتجع فاتورة شراء #${purchase.number}` } });
    }
    const created = await tx.accountingPurchaseReturn.create({
      data: { userId, purchaseId: purchase.id, currency: purchase.currency, totalCents: total, refundCents: refund, debtCents: debt, payMethod: refund > 0 ? method : null, note: d.note || null, occurredAt: when, recordedById: userId,
        lines: { create: picked.map((p, i) => ({ purchaseLineId: p.line.id, productId: p.line.productId, name: p.line.name, quantity: p.quantity, unitCostCents: p.line.unitCostCents, lineTotalCents: Number(p.line.unitCostCents) * p.quantity, taxRateBp: p.line.taxRateBp, taxCents: parts[i].tax, baseCents: parts[i].base })) } },
    });
    const label = `مرتجع فاتورة شراء #${purchase.number}${purchase.supplierName ? ` — ${purchase.supplierName}` : ""}`;
    if (refund > 0) await tx.accountingEntry.create({ data: { userId, type: "RECEIPT", category: "استرداد من مورد", description: label, amountCents: refund, currency: purchase.currency, occurredAt: when, source: "RETURN", sourceKey: `purchase-return:${created.id}`, payMethod: method, recordedById: userId } });
    if (debt > 0 && purchase.partyId) await tx.accountingPartyEntry.create({ data: { partyId: purchase.partyId, userId, kind: "PAYMENT", amountCents: debt, currency: purchase.currency, purchaseId: purchase.id, note: label, occurredAt: when } });
    return created;
  }).catch((err) => err);
  if (done instanceof SaleError) return sendError(res, done.status, done.code, done.message, done.details);
  if (done instanceof Error) throw done;
  res.status(201).json({ id: done.id, totalCents: total, refundCents: refund, debtCents: debt });
}));

// ---- entries that repeat by themselves (weekly, monthly, yearly): written when their day has come, never twice
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** The date after `due` for a frequency; monthly and yearly keep the day of the month they started on (a short month takes its last day). */
function nextOccurrence(due: string, frequency: "WEEKLY" | "MONTHLY" | "YEARLY", anchorDay: number) {
  const [y, m, d] = due.split("-").map(Number);
  if (frequency === "WEEKLY") return dayStr(new Date(Date.UTC(y, m - 1, d + 7)));
  const months = frequency === "MONTHLY" ? 1 : 12;
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12), nm = total % 12;
  return dayStr(new Date(Date.UTC(ny, nm, Math.min(anchorDay, daysIn(ny, nm)))));
}
const MAX_CATCH_UP = 36;

/** Writes the entry of every due date up to today (at most a few years at once), advances the next date, and tells the owner once. */
export async function runRecurring(userId: string) {
  const today = dayStr(new Date());
  const due = await prisma.accountingRecurring.findMany({ where: { userId, active: true, nextDue: { lte: today } } });
  let written = 0; const names: string[] = [];
  for (const r of due) {
    let next = r.nextDue, count = 0;
    while (next <= today && (!r.endDate || next <= r.endDate) && count < MAX_CATCH_UP) {
      const when = new Date(`${next}T12:00:00.000Z`);
      try {
        await prisma.accountingEntry.create({ data: { userId, type: r.type, category: r.category, description: r.description, amountCents: r.amountCents, currency: r.currency, occurredAt: when, source: "RECURRING", sourceKey: `recurring:${r.id}:${next}`, payMethod: r.payMethod, recordedById: userId } });
        count++;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err; // already written for that date
      }
      next = nextOccurrence(next, r.frequency, r.anchorDay);
    }
    const finished = !!r.endDate && next > r.endDate;
    await prisma.accountingRecurring.update({ where: { id: r.id }, data: { nextDue: next, lastRunAt: new Date(), ...(finished ? { active: false } : {}) } });
    if (count > 0) { written += count; names.push(r.description); }
  }
  if (written > 0) void notify({ userId, type: "SYSTEM", email: false, title: "انسجّلت حركات متكررة", body: names.slice(0, 3).join("، "), data: { kind: "accounting-recurring", count: written } });
  return written;
}

const recurringSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
  category: z.string().trim().min(1).max(50),
  description: z.string().trim().min(2).max(240),
  amountCents: z.number().int().positive().max(MAX_ENTRY_CENTS),
  currency: currencyCode.default("EUR"),
  payMethod: z.enum(["CASH", "BANK", "WALLET"]).optional(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  backfill: z.boolean().default(false), // a start date in the past: write the missed ones too (otherwise it starts from the next one)
});
const plainRecurring = (r: { id: string; type: string; category: string; description: string; amountCents: bigint; currency: string; payMethod: string | null; frequency: string; nextDue: string; endDate: string | null; active: boolean }) => ({ id: r.id, type: r.type, category: r.category, description: r.description, amountCents: Number(r.amountCents), currency: r.currency, payMethod: r.payMethod, frequency: r.frequency, nextDue: r.nextDue, endDate: r.endDate, active: r.active });

accountingRouter.get("/recurring", route(async (req, res) => {
  const rows = await prisma.accountingRecurring.findMany({ where: { userId: req.user!.id }, orderBy: [{ active: "desc" }, { nextDue: "asc" }], take: 200 });
  res.json(rows.map(plainRecurring));
}));

accountingRouter.post("/recurring", route(async (req, res) => {
  const parsed = recurringSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  if (Number.isNaN(new Date(`${d.startDate}T00:00:00.000Z`).getTime())) return sendError(res, 400, "BAD_REQUEST", "التاريخ غير صحيح");
  if (d.endDate && d.endDate < d.startDate) return sendError(res, 400, "BAD_REQUEST", "تاريخ النهاية قبل تاريخ البداية");
  const anchorDay = Number(d.startDate.slice(8, 10));
  // not written for the past unless asked: the first date to write is the first one on or after today
  let nextDue = d.startDate;
  const today = dayStr(new Date());
  if (!d.backfill) { let guard = 0; while (nextDue < today && guard++ < 5000) nextDue = nextOccurrence(nextDue, d.frequency, anchorDay); }
  const row = await prisma.accountingRecurring.create({ data: { userId: req.user!.id, type: d.type, category: d.category, description: d.description, amountCents: d.amountCents, currency: d.currency, payMethod: d.payMethod ?? null, frequency: d.frequency, anchorDay, nextDue, endDate: d.endDate ?? null } });
  await runRecurring(req.user!.id).catch(() => undefined);
  res.status(201).json(plainRecurring((await prisma.accountingRecurring.findUnique({ where: { id: row.id } })) ?? row));
}));

accountingRouter.patch("/recurring/:id", route(async (req, res) => {
  const parsed = z.object({ description: z.string().trim().min(2).max(240).optional(), category: z.string().trim().min(1).max(50).optional(), amountCents: z.number().int().positive().max(MAX_ENTRY_CENTS).optional(), payMethod: z.enum(["CASH", "BANK", "WALLET"]).nullable().optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const own = await prisma.accountingRecurring.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!own) return sendError(res, 404, "NOT_FOUND", "غير موجود");
  const data: Prisma.AccountingRecurringUpdateInput = { ...parsed.data };
  // resumed after a pause: it starts again from the next date, it does not write what was missed while it was off
  if (parsed.data.active === true && !own.active) { const today = dayStr(new Date()); let nd = own.nextDue, guard = 0; while (nd < today && guard++ < 5000) nd = nextOccurrence(nd, own.frequency, own.anchorDay); data.nextDue = nd; }
  const row = await prisma.accountingRecurring.update({ where: { id: own.id }, data });
  res.json(plainRecurring(row));
}));

// Stops it for good. The entries it already wrote stay.
accountingRouter.delete("/recurring/:id", route(async (req, res) => {
  const own = await prisma.accountingRecurring.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!own) return sendError(res, 404, "NOT_FOUND", "غير موجود");
  await prisma.accountingRecurring.delete({ where: { id: own.id } });
  res.json({ deleted: true });
}));

// ---- tax settings, rates, and the tax report (experimental: to be checked with an accountant)
const settingsView = async (userId: string) => {
  const st = await prisma.accountingSettings.findUnique({ where: { userId } });
  return { pricesIncludeTax: st?.pricesIncludeTax ?? true, defaultTaxRateId: st?.defaultTaxRateId ?? null, taxNumber: st?.taxNumber ?? null, businessName: st?.businessName ?? null };
};
accountingRouter.get("/settings", route(async (req, res) => res.json(await settingsView(req.user!.id))));
accountingRouter.put("/settings", route(async (req, res) => {
  const parsed = z.object({ pricesIncludeTax: z.boolean().optional(), defaultTaxRateId: z.string().uuid().nullable().optional(), taxNumber: z.string().trim().max(60).nullable().optional(), businessName: z.string().trim().max(120).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id;
  if (parsed.data.defaultTaxRateId && (await ownRateId(userId, parsed.data.defaultTaxRateId)) === undefined) return sendError(res, 404, "NOT_FOUND", "نسبة الضريبة غير موجودة");
  await prisma.accountingSettings.upsert({ where: { userId }, create: { userId, ...parsed.data }, update: parsed.data });
  res.json(await settingsView(userId));
}));

accountingRouter.get("/tax/rates", route(async (req, res) => {
  const rows = await prisma.accountingTaxRate.findMany({ where: { userId: req.user!.id }, orderBy: [{ active: "desc" }, { rateBp: "asc" }] });
  res.json(rows.map((r) => ({ id: r.id, name: r.name, ratePercent: r.rateBp / 100, rateBp: r.rateBp, active: r.active })));
}));
accountingRouter.post("/tax/rates", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(60), ratePercent: z.number().min(0).max(100) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const row = await prisma.accountingTaxRate.create({ data: { userId: req.user!.id, name: parsed.data.name, rateBp: Math.round(parsed.data.ratePercent * 100) } });
  res.status(201).json({ id: row.id, name: row.name, ratePercent: row.rateBp / 100, rateBp: row.rateBp, active: row.active });
}));
// A rate in use is never deleted (old invoices keep it): it is switched off, and products that had it fall back to the default rate.
accountingRouter.patch("/tax/rates/:id", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(60).optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const own = await prisma.accountingTaxRate.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!own) return sendError(res, 404, "NOT_FOUND", "نسبة الضريبة غير موجودة");
  const row = await prisma.accountingTaxRate.update({ where: { id: own.id }, data: parsed.data });
  res.json({ id: row.id, name: row.name, ratePercent: row.rateBp / 100, rateBp: row.rateBp, active: row.active });
}));

// The tax collected on sales and paid on purchases in a period, by rate, net of what returns took back. The difference is what is owed to (or can be claimed from) the tax office.
accountingRouter.get("/tax/report", route(async (req, res) => {
  const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: currencyCode.optional() }).safeParse({ from: req.query.from, to: req.query.to, currency: req.query.currency });
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id;
  const from = new Date(`${parsed.data.from}T00:00:00.000Z`), to = new Date(`${parsed.data.to}T23:59:59.999Z`);
  if (from > to || to.getTime() - from.getTime() > 800 * 86400000) return sendError(res, 400, "BAD_REQUEST", "الفترة الزمنية غير صحيحة");
  const currency = parsed.data.currency ?? (await prisma.accountingSale.findFirst({ where: { userId }, select: { currency: true }, orderBy: { occurredAt: "desc" } }))?.currency ?? "EUR";
  type Row = { rate: number; base: bigint; tax: bigint };
  const [outSales, outReturns, inBuys, inReturns] = await Promise.all([
    prisma.$queryRaw<Row[]>`SELECT l."taxRateBp" AS rate, SUM(l."lineTotalCents" - l."discountCents" - CASE WHEN s."pricesIncludeTax" THEN l."taxCents" ELSE 0 END) AS base, SUM(l."taxCents") AS tax FROM "AccountingSaleLine" l JOIN "AccountingSale" s ON s."id" = l."saleId" WHERE s."userId" = ${userId} AND s."currency" = ${currency} AND s."occurredAt" >= ${from} AND s."occurredAt" <= ${to} AND l."taxRateBp" > 0 GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT l."taxRateBp" AS rate, SUM(l."baseCents") AS base, SUM(l."taxCents") AS tax FROM "AccountingSaleReturnLine" l JOIN "AccountingSaleReturn" r ON r."id" = l."returnId" WHERE r."userId" = ${userId} AND r."currency" = ${currency} AND r."occurredAt" >= ${from} AND r."occurredAt" <= ${to} AND l."taxRateBp" > 0 GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT l."taxRateBp" AS rate, SUM(l."lineTotalCents") AS base, SUM(l."taxCents") AS tax FROM "AccountingPurchaseLine" l JOIN "AccountingPurchase" p ON p."id" = l."purchaseId" WHERE p."userId" = ${userId} AND p."currency" = ${currency} AND p."occurredAt" >= ${from} AND p."occurredAt" <= ${to} AND l."taxRateBp" > 0 GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT l."taxRateBp" AS rate, SUM(l."baseCents") AS base, SUM(l."taxCents") AS tax FROM "AccountingPurchaseReturnLine" l JOIN "AccountingPurchaseReturn" r ON r."id" = l."returnId" WHERE r."userId" = ${userId} AND r."currency" = ${currency} AND r."occurredAt" >= ${from} AND r."occurredAt" <= ${to} AND l."taxRateBp" > 0 GROUP BY 1`,
  ]);
  const rates = new Set([...outSales, ...outReturns, ...inBuys, ...inReturns].map((r) => r.rate));
  const pick = (rows: Row[], rate: number, k: "base" | "tax") => Number(rows.find((r) => r.rate === rate)?.[k] ?? 0);
  const byRate = [...rates].sort((a, b) => a - b).map((rate) => ({
    ratePercent: rate / 100,
    outputBaseCents: pick(outSales, rate, "base") - pick(outReturns, rate, "base"), outputTaxCents: pick(outSales, rate, "tax") - pick(outReturns, rate, "tax"),
    inputBaseCents: pick(inBuys, rate, "base") - pick(inReturns, rate, "base"), inputTaxCents: pick(inBuys, rate, "tax") - pick(inReturns, rate, "tax"),
  }));
  const output = byRate.reduce((sum, r) => sum + r.outputTaxCents, 0), input = byRate.reduce((sum, r) => sum + r.inputTaxCents, 0);
  res.json({ from: parsed.data.from, to: parsed.data.to, currency, byRate, outputTaxCents: output, inputTaxCents: input, payableCents: output - input, settings: await settingsView(userId) });
}));

// ---- financial statements (experimental: to be checked with an accountant): the income statement of a period, and a simplified financial position as of now.
// Everything comes from what was recorded: cash and bank are the movements entered with a payment method, the opening money and what the owner puts in or takes out are not recorded, so they show as the balancing line.
accountingRouter.get("/statements", route(async (req, res) => {
  const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: currencyCode.optional() }).safeParse({ from: req.query.from, to: req.query.to, currency: req.query.currency });
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const userId = req.user!.id;
  const from = new Date(`${parsed.data.from}T00:00:00.000Z`), to = new Date(`${parsed.data.to}T23:59:59.999Z`);
  if (from > to || to.getTime() - from.getTime() > 800 * 86400000) return sendError(res, 400, "BAD_REQUEST", "الفترة الزمنية غير صحيحة");
  const currencies = (await prisma.accountingEntry.groupBy({ by: ["currency"], where: { userId } })).map((c) => c.currency);
  const currency = parsed.data.currency ?? currencies[0] ?? "EUR";
  const now = new Date();
  const own = { userId, currency, type: { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] } };

  // ---- the income statement of the period
  const [cats, allTime, moves, partyRows, products, shop, shopCurrency] = await Promise.all([
    prisma.accountingEntry.groupBy({ by: ["category", "type"], where: { ...own, occurredAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    prisma.accountingEntry.groupBy({ by: ["type"], where: { ...own, occurredAt: { lte: now } }, _sum: { amountCents: true } }),
    prisma.accountingEntry.groupBy({ by: ["payMethod", "type"], where: { userId, currency, payMethod: { not: null }, occurredAt: { lte: now } }, _sum: { amountCents: true } }),
    prisma.accountingPartyEntry.findMany({ where: { userId, currency, occurredAt: { lte: now } }, select: { kind: true, amountCents: true, party: { select: { kind: true } } } }),
    prisma.accountingProduct.findMany({ where: { userId, currency }, select: { quantity: true, costCents: true } }),
    prisma.product.findMany({ where: { merchant: { userId }, isActive: true }, select: { stock: true, costPriceCents: true } }),
    marketOfUser(userId),
  ]);
  const sum = (rows: { category: string; type: string; _sum: { amountCents: bigint | null } }[], c: string, t: string) => Number(rows.find((x) => x.category === c && x.type === t)?._sum.amountCents ?? 0);
  const sales = sum(cats, SALES_CATEGORY, "INCOME"), returns = -sum(cats, RETURNS_CATEGORY, "INCOME");
  const totalIncome = cats.filter((x) => x.type === "INCOME").reduce((a, x) => a + Number(x._sum.amountCents ?? 0), 0);
  const otherIncome = totalIncome - sales + returns;
  const cogs = sum(cats, COST_CATEGORY, "EXPENSE");
  const expenseRows = cats.filter((x) => x.type === "EXPENSE" && x.category !== COST_CATEGORY).map((x) => ({ category: x.category, amountCents: Number(x._sum.amountCents ?? 0) })).sort((a, b) => b.amountCents - a.amountCents);
  const operating = expenseRows.reduce((a, x) => a + x.amountCents, 0);
  const revenue = totalIncome; // sales less returns, plus the other income
  const incomeStatement = { salesCents: sales, returnsCents: returns, otherIncomeCents: otherIncome, revenueCents: revenue, costOfGoodsCents: cogs, grossProfitCents: revenue - cogs, expenses: expenseRows, operatingExpensesCents: operating, netProfitCents: revenue - cogs - operating };

  // ---- the financial position as of now
  const flow = (m: string) => {
    const g = (t: string) => Number(moves.find((x) => x.payMethod === m && x.type === t)?._sum.amountCents ?? 0);
    return g("INCOME") + g("RECEIPT") - g("EXPENSE") - g("PAYOUT");
  };
  const cash = ["CASH", "BANK", "WALLET"].map((m) => ({ method: m, cents: flow(m) }));
  const cashTotal = cash.reduce((a, x) => a + x.cents, 0);
  const owed = (kind: string) => partyRows.filter((r) => r.party.kind === kind).reduce((a, r) => a + (r.kind === "CHARGE" ? 1 : -1) * Number(r.amountCents), 0);
  const receivables = Math.max(owed("CUSTOMER"), 0), payables = Math.max(owed("SUPPLIER"), 0);
  const inventory = products.reduce((a, x) => a + x.quantity * x.costCents, 0) + (shopCurrency === currency ? shop.reduce((a, x) => a + x.stock * x.costPriceCents, 0) : 0);
  type TaxRow = { tax: bigint };
  const [outS, outR, inP, inR] = await Promise.all([
    prisma.$queryRaw<TaxRow[]>`SELECT COALESCE(SUM(l."taxCents"), 0) AS tax FROM "AccountingSaleLine" l JOIN "AccountingSale" s ON s."id" = l."saleId" WHERE s."userId" = ${userId} AND s."currency" = ${currency}`,
    prisma.$queryRaw<TaxRow[]>`SELECT COALESCE(SUM(l."taxCents"), 0) AS tax FROM "AccountingSaleReturnLine" l JOIN "AccountingSaleReturn" r ON r."id" = l."returnId" WHERE r."userId" = ${userId} AND r."currency" = ${currency}`,
    prisma.$queryRaw<TaxRow[]>`SELECT COALESCE(SUM(l."taxCents"), 0) AS tax FROM "AccountingPurchaseLine" l JOIN "AccountingPurchase" p ON p."id" = l."purchaseId" WHERE p."userId" = ${userId} AND p."currency" = ${currency}`,
    prisma.$queryRaw<TaxRow[]>`SELECT COALESCE(SUM(l."taxCents"), 0) AS tax FROM "AccountingPurchaseReturnLine" l JOIN "AccountingPurchaseReturn" r ON r."id" = l."returnId" WHERE r."userId" = ${userId} AND r."currency" = ${currency}`,
  ]);
  // tax collected but not yet handed over, or paid in advance (a claim)
  const taxNet = Number(outS[0].tax) - Number(outR[0].tax) - (Number(inP[0].tax) - Number(inR[0].tax));
  const taxPayable = Math.max(taxNet, 0), taxClaim = Math.max(-taxNet, 0);
  const assets = cashTotal + receivables + inventory + taxClaim;
  const liabilities = payables + taxPayable;
  const profitToDate = Number(allTime.find((x) => x.type === "INCOME")?._sum.amountCents ?? 0) - Number(allTime.find((x) => x.type === "EXPENSE")?._sum.amountCents ?? 0);
  const equity = assets - liabilities;
  res.json({
    from: parsed.data.from, to: parsed.data.to, currency, currencies, asOf: now.toISOString().slice(0, 10),
    incomeStatement,
    position: { cash, cashTotalCents: cashTotal, receivablesCents: receivables, inventoryCents: inventory, taxClaimCents: taxClaim, totalAssetsCents: assets, payablesCents: payables, taxPayableCents: taxPayable, totalLiabilitiesCents: liabilities, equityCents: equity, profitToDateCents: profitToDate, otherEquityCents: equity - profitToDate },
  });
}));

// ---- a sales invoice: several products in one sale, a discount, a customer name, a number of its own
const saleSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().positive().max(1_000_000), unitPriceCents: z.number().int().positive().max(2_000_000_000).optional() })).min(1).max(100),
  discountCents: z.number().int().nonnegative().max(MAX_ENTRY_CENTS).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  customerName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(240).optional(),
  payMethod: z.enum(["CASH", "BANK", "WALLET"]).default("CASH"),
  occurredAt: z.string().datetime().optional(),
  partyId: z.string().uuid().optional(),
  paidCents: z.number().int().nonnegative().max(MAX_ENTRY_CENTS).optional(),
});
type SaleRow = { returned?: Record<string, number>; taxCents?: bigint; pricesIncludeTax?: boolean; id: string; number: number; partyId?: string | null; paidCents?: bigint; customerName: string | null; note: string | null; currency: string; subtotalCents: bigint; discountCents: bigint; totalCents: bigint; payMethod: string; occurredAt: Date; lines: { id: string; productId: string | null; name: string; quantity: number; unitPriceCents: bigint; unitCostCents: bigint; lineTotalCents: bigint; discountCents?: bigint; taxRateBp?: number; taxCents?: bigint }[] };
const plainSale = (r: SaleRow) => ({
  id: r.id, number: r.number, partyId: r.partyId ?? null, paidCents: Number(r.paidCents ?? r.totalCents), customerName: r.customerName, note: r.note, currency: r.currency, payMethod: r.payMethod, occurredAt: r.occurredAt,
  subtotalCents: Number(r.subtotalCents), discountCents: Number(r.discountCents), totalCents: Number(r.totalCents), taxCents: Number(r.taxCents ?? 0), pricesIncludeTax: r.pricesIncludeTax ?? true,
  lines: r.lines.map((l) => ({ id: l.id, productId: l.productId, name: l.name, quantity: l.quantity, returnedQuantity: r.returned?.[l.id] ?? 0, unitPriceCents: Number(l.unitPriceCents), unitCostCents: Number(l.unitCostCents), lineTotalCents: Number(l.lineTotalCents), discountCents: Number(l.discountCents ?? 0), taxRateBp: l.taxRateBp ?? 0, taxCents: Number(l.taxCents ?? 0) })),
});
class SaleError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); } }

type SaleOutcome = { ok: true; sale: ReturnType<typeof plainSale>; costCents: number; netCents: number } | { ok: false; status: number; code: string; message: string; details?: unknown };
type SaleInput = z.infer<typeof saleSchema>;

/** The sales invoice: stock out, the tax of each line, the income (without the tax), the cost, the debt of a credit sale. */
async function createSaleInvoice(userId: string, d: SaleInput): Promise<SaleOutcome> {
  const fail = (status: number, code: string, message: string, details?: unknown): SaleOutcome => ({ ok: false, status, code, message, details });
  // the same product twice becomes one line
  const wanted = new Map<string, { quantity: number; unitPriceCents?: number }>();
  for (const it of d.items) { const cur = wanted.get(it.productId); wanted.set(it.productId, { quantity: (cur?.quantity ?? 0) + it.quantity, unitPriceCents: it.unitPriceCents ?? cur?.unitPriceCents }); }
  const ids = [...wanted.keys()];
  const [own, shop, shopCurrency, tax] = await Promise.all([
    prisma.accountingProduct.findMany({ where: { userId, id: { in: ids.filter((i) => !i.startsWith("store:")) } } }),
    prisma.product.findMany({ where: { merchant: { userId }, isActive: true, id: { in: ids.filter((i) => i.startsWith("store:")).map((i) => i.slice(6)) } } }),
    marketOfUser(userId),
    taxContext(userId),
  ]);
  type Line = { key: string; store: boolean; id: string; name: string; quantity: number; unitPrice: number; unitCost: number; currency: string; rateBp: number };
  const lines: Line[] = [];
  for (const [key, w] of wanted) {
    if (key.startsWith("store:")) {
      const p = shop.find((x) => `store:${x.id}` === key); if (!p) return fail(404, "NOT_FOUND", "منتج المتجر غير موجود");
      lines.push({ key, store: true, id: p.id, name: p.name, quantity: w.quantity, unitPrice: w.unitPriceCents ?? p.priceCents, unitCost: p.costPriceCents, currency: shopCurrency, rateBp: tax.defaultBp });
    } else {
      const p = own.find((x) => x.id === key); if (!p) return fail(404, "NOT_FOUND", "المنتج غير موجود");
      lines.push({ key, store: false, id: p.id, name: p.name, quantity: w.quantity, unitPrice: w.unitPriceCents ?? p.salePriceCents, unitCost: p.costCents, currency: p.currency, rateBp: bpFor(tax, p.taxRateId) });
    }
  }
  if (lines.some((l) => l.unitPrice <= 0)) return fail(400, "BAD_REQUEST", "أدخل سعر البيع أولاً");
  const currency = lines[0].currency;
  if (lines.some((l) => l.currency !== currency)) return fail(400, "BAD_REQUEST", "كل أصناف الفاتورة لازم تكون بنفس العملة");
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discount = d.discountPercent != null ? Math.round(subtotal * d.discountPercent / 100) : d.discountCents ?? 0;
  if (discount > subtotal) return fail(400, "BAD_REQUEST", "الحسم أكبر من مجموع الفاتورة");
  const calc = taxLines(lines.map((l) => ({ gross: l.unitPrice * l.quantity, rateBp: l.rateBp })), discount, tax.include);
  const total = calc.reduce((sum, c) => sum + c.payable, 0);
  const taxTotal = calc.reduce((sum, c) => sum + c.tax, 0);
  if (total <= 0) return fail(400, "BAD_REQUEST", "مجموع الفاتورة لازم يكون أكبر من صفر");
  // a sale on credit: what was paid now, the rest stays on the customer's account
  const paid = d.paidCents ?? total;
  if (paid > total) return fail(400, "BAD_REQUEST", "المبلغ المدفوع أكبر من مجموع الفاتورة");
  let party: { id: string; name: string } | null = null;
  if (d.partyId) {
    party = await prisma.accountingParty.findFirst({ where: { id: d.partyId, userId, kind: "CUSTOMER", archivedAt: null }, select: { id: true, name: true } });
    if (!party) return fail(404, "NOT_FOUND", "الزبون غير موجود");
  } else if (paid < total) return fail(400, "BAD_REQUEST", "البيع الآجل لازم يكون على زبون مسجّل");
  const customerLabel = d.customerName || party?.name;
  const cost = lines.reduce((sum, l) => sum + l.unitCost * l.quantity, 0);
  const when = d.occurredAt ? new Date(d.occurredAt) : new Date();
  for (let attempt = 0; ; attempt++) {
    try {
      const sale = await prisma.$transaction(async (tx) => {
        // the stock is taken only while enough is left at this very moment: one short line cancels the whole sale
        for (const l of lines) {
          const took = l.store
            ? await tx.product.updateMany({ where: { id: l.id, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity }, soldCount: { increment: l.quantity } } })
            : await tx.accountingProduct.updateMany({ where: { id: l.id, quantity: { gte: l.quantity } }, data: { quantity: { decrement: l.quantity } } });
          if (!took.count) throw new SaleError(409, "INSUFFICIENT_STOCK", "الكمية الموجودة ما بتكفي", { productId: l.key, name: l.name });
        }
        const created = await tx.accountingSale.create({
          data: { userId, number: await nextSaleNumber(tx, userId), customerName: customerLabel || null, partyId: party?.id ?? null, paidCents: paid, note: d.note || null, currency, subtotalCents: subtotal, discountCents: discount, totalCents: total, taxCents: taxTotal, pricesIncludeTax: tax.include, payMethod: d.payMethod, occurredAt: when, recordedById: userId,
            lines: { create: lines.map((l, i) => ({ productId: l.key, name: l.name, quantity: l.quantity, unitPriceCents: l.unitPrice, unitCostCents: l.unitCost, lineTotalCents: l.unitPrice * l.quantity, discountCents: calc[i].discount, taxRateBp: l.rateBp, taxCents: calc[i].tax })) } },
          include: { lines: true },
        });
        for (const l of lines) await tx.accountingStockMovement.create({ data: { userId, ...(l.store ? { storeProductId: l.id } : { productId: l.id }), action: "STOCK_OUT", quantity: l.quantity, unitCostCents: l.unitCost, note: `فاتورة بيع #${created.number}` } });
        const label = `فاتورة بيع #${created.number}${customerLabel ? ` — ${customerLabel}` : ""}`;
        const onCredit = paid < total;
        const net = total - taxTotal;
        // paid in full: the income (without the tax) is the cash itself, and the tax collected comes in with it. On credit: the income is booked, the cash arrives as a receipt (what was paid now), the rest becomes a debt.
        await tx.accountingEntry.create({ data: { userId, type: "INCOME", category: "مبيعات", description: label, amountCents: net, currency, occurredAt: when, source: "SALE", sourceKey: `sale:${created.id}`, payMethod: onCredit ? null : d.payMethod, recordedById: userId } });
        if (!onCredit && taxTotal > 0) await tx.accountingEntry.create({ data: { userId, type: "RECEIPT", category: "ضريبة مبيعات محصّلة", description: label, amountCents: taxTotal, currency, occurredAt: when, source: "SALE", sourceKey: `sale:${created.id}:tax`, payMethod: d.payMethod, recordedById: userId } });
        if (onCredit && paid > 0) {
          const receipt = await tx.accountingEntry.create({ data: { userId, type: "RECEIPT", category: "دفعة زبون", description: label, amountCents: paid, currency, occurredAt: when, source: "SALE", sourceKey: `sale:${created.id}:paid`, payMethod: d.payMethod, recordedById: userId } });
          await tx.accountingPartyEntry.create({ data: { partyId: party!.id, userId, kind: "CHARGE", amountCents: total, currency, saleId: created.id, note: label, occurredAt: when } });
          await tx.accountingPartyEntry.create({ data: { partyId: party!.id, userId, kind: "PAYMENT", amountCents: paid, currency, payMethod: d.payMethod, saleId: created.id, entryId: receipt.id, note: label, occurredAt: when } });
        } else if (onCredit) {
          await tx.accountingPartyEntry.create({ data: { partyId: party!.id, userId, kind: "CHARGE", amountCents: total, currency, saleId: created.id, note: label, occurredAt: when } });
        }
        if (cost > 0) await tx.accountingEntry.create({ data: { userId, type: "EXPENSE", category: "تكلفة البضاعة المباعة", description: label, amountCents: cost, currency, occurredAt: when, source: "SALE", sourceKey: `sale:${created.id}:cost`, recordedById: userId } });
        return created;
      });
      alertLowStock(userId, lines.map((l) => { const before = l.store ? shop.find((x) => x.id === l.id)!.stock : own.find((x) => x.id === l.id)!.quantity; const min = l.store ? 0 : own.find((x) => x.id === l.id)!.lowStockAt; return { name: l.name, before, after: before - l.quantity, min }; }));
      return { ok: true, sale: plainSale(sale), costCents: cost, netCents: total - taxTotal - cost };
    } catch (err) {
      if (err instanceof SaleError) return fail(err.status, err.code, err.message, err.details);
      // two sales at the same moment may pick the same number: take the next one
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 3) continue;
      throw err;
    }
  }
}

accountingRouter.post("/sales", route(async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const out = await createSaleInvoice(req.user!.id, parsed.data);
  if (!out.ok) return sendError(res, out.status, out.code, out.message, out.details);
  res.status(201).json({ ...out.sale, costCents: out.costCents, netCents: out.netCents });
}));

accountingRouter.get("/sales", route(async (req, res) => {
  const rows = await prisma.accountingSale.findMany({ where: { userId: req.user!.id }, include: { lines: true }, orderBy: { number: "desc" }, take: 100 });
  const returned = await returnedBySaleLine(rows.flatMap((r) => r.lines.map((l) => l.id)));
  res.json(rows.map((r) => plainSale({ ...r, returned })));
}));

accountingRouter.get("/sales/:id", route(async (req, res) => {
  const row = await prisma.accountingSale.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { lines: true } });
  if (!row) return sendError(res, 404, "NOT_FOUND", "الفاتورة غير موجودة");
  res.json(plainSale({ ...row, returned: await returnedBySaleLine(row.lines.map((l) => l.id)) }));
}));

// ---- the cash box of a day: what came in and went out in cash, against what was counted when the day was closed
const cashDayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cashKey = z.object({ day: cashDayStr, currency: currencyCode });

/** The opening of a day: the one set by hand, else what was counted when the last closed day ended, else nothing. */
async function cashOpening(userId: string, day: string, currency: string) {
  const own = await prisma.accountingCashDay.findUnique({ where: { userId_day_currency: { userId, day, currency } } });
  if (own && own.openingSetByHand) return { cents: Number(own.openingCents), source: "set" as const, row: own };
  const prev = await prisma.accountingCashDay.findFirst({ where: { userId, currency, day: { lt: day }, closedAt: { not: null }, countedCents: { not: null } }, orderBy: { day: "desc" } });
  if (prev) return { cents: Number(prev.countedCents), source: "previous" as const, row: own };
  return { cents: 0, source: "none" as const, row: own };
}

accountingRouter.get("/cash", route(async (req, res) => {
  const parsed = cashKey.safeParse({ day: req.query.day ?? new Date().toISOString().slice(0, 10), currency: req.query.currency ?? "EUR" });
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { day, currency } = parsed.data;
  const userId = req.user!.id;
  const from = new Date(`${day}T00:00:00.000Z`), to = new Date(`${day}T23:59:59.999Z`);
  const [byMethod, opening] = await Promise.all([
    prisma.accountingEntry.groupBy({ by: ["payMethod", "type"], where: { userId, currency, occurredAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    cashOpening(userId, day, currency),
  ]);
  const sum = (m: string | null, t: string) => Number(byMethod.find((x) => x.payMethod === m && x.type === t)?._sum.amountCents ?? 0);
  const cashIn = sum("CASH", "INCOME") + sum("CASH", "RECEIPT"), cashOut = sum("CASH", "EXPENSE") + sum("CASH", "PAYOUT");
  const expected = opening.cents + cashIn - cashOut;
  const row = opening.row;
  const counted = row?.closedAt && row.countedCents != null ? Number(row.countedCents) : null;
  res.json({
    day, currency,
    openingCents: opening.cents, openingSource: opening.source,
    cashInCents: cashIn, cashOutCents: cashOut, expectedCents: expected,
    closed: !!row?.closedAt, closedAt: row?.closedAt ?? null, countedCents: counted, differenceCents: counted == null ? null : counted - expected, note: row?.note ?? null,
    methods: ["CASH", "BANK", "WALLET"].map((m) => ({ payMethod: m, incomeCents: sum(m, "INCOME") + sum(m, "RECEIPT"), expensesCents: sum(m, "EXPENSE") + sum(m, "PAYOUT") })),
    unspecified: { incomeCents: sum(null, "INCOME") + sum(null, "RECEIPT"), expensesCents: sum(null, "EXPENSE") + sum(null, "PAYOUT") },
  });
}));

accountingRouter.put("/cash/opening", route(async (req, res) => {
  const parsed = cashKey.extend({ openingCents: z.number().int().nonnegative().max(MAX_ENTRY_CENTS) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { day, currency, openingCents } = parsed.data;
  const where = { userId_day_currency: { userId: req.user!.id, day, currency } };
  const existing = await prisma.accountingCashDay.findUnique({ where });
  if (existing?.closedAt) return sendError(res, 409, "CONFLICT", "هالنهار مقفول. افتحو من جديد قبل ما تغيّر رصيد البداية.");
  await prisma.accountingCashDay.upsert({ where, create: { userId: req.user!.id, day, currency, openingCents, openingSetByHand: true }, update: { openingCents, openingSetByHand: true } });
  res.json({ ok: true });
}));

accountingRouter.post("/cash/close", route(async (req, res) => {
  const parsed = cashKey.extend({ countedCents: z.number().int().nonnegative().max(MAX_ENTRY_CENTS), note: z.string().trim().max(240).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { day, currency, countedCents, note } = parsed.data;
  const where = { userId_day_currency: { userId: req.user!.id, day, currency } };
  const opening = await cashOpening(req.user!.id, day, currency);
  await prisma.accountingCashDay.upsert({ where, create: { userId: req.user!.id, day, currency, openingCents: opening.cents, countedCents, note, closedAt: new Date() }, update: { countedCents, note: note ?? null, closedAt: new Date() } });
  res.json({ ok: true });
}));

accountingRouter.delete("/cash/close", route(async (req, res) => {
  const parsed = cashKey.safeParse({ day: req.query.day, currency: req.query.currency });
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { day, currency } = parsed.data;
  await prisma.accountingCashDay.updateMany({ where: { userId: req.user!.id, day, currency }, data: { closedAt: null, countedCents: null } });
  res.json({ ok: true });
}));

accountingRouter.get("/export.csv", route(async (req, res) => {
  const rows = await prisma.accountingEntry.findMany({ where: { userId: req.user!.id }, orderBy: { occurredAt: "asc" }, take: 10000 });
  // a text that starts with = + - @ would be run as a formula by Excel and the like: a leading ' keeps it plain text
  const quote = (v: unknown) => `"${String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const csv = ["Datum;Typ;Kategorie;Beschreibung;Betrag;Waehrung;Quelle", ...rows.map((r) => [r.occurredAt.toISOString(), r.type, r.category, r.description, (Number(r.amountCents) / 100).toFixed(2), r.currency, r.source].map(quote).join(";"))].join("\r\n");
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=dalilacom-accounting.csv", "Cache-Control": "no-store" }).send("\uFEFF" + csv);
}));

// Linking the bookkeeping with the HR system (payroll cost arrives by itself). Like the rest of accounting, it needs an active plan.

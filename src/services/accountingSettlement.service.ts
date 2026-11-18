import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { marketOfUser } from "./viewerCountry.service";

/**
 * Who sold what, and the cash a distributor or branch still holds.
 * A sale from a location is booked as income at once (see createSaleInvoice); the cash itself sits with the seller until he hands it over,
 * so held = cash paid at his sales - cash paid back on returns - what he handed over.
 */

const big = (v: bigint | number | null | undefined) => Number(v ?? 0);
const notFound = (msg: string) => new ApiError(404, "NOT_FOUND", msg);

/** Cash held per location and currency (all time). */
export async function cashHeld(userId: string, locationIds: string[]) {
  const out = new Map<string, Map<string, { sold: number; cash: number; otherPaid: number; credit: number; refunded: number; handed: number }>>();
  if (!locationIds.length) return out;
  const cell = (loc: string, cur: string) => {
    const m = out.get(loc) ?? new Map();
    out.set(loc, m);
    const c = m.get(cur) ?? { sold: 0, cash: 0, otherPaid: 0, credit: 0, refunded: 0, handed: 0 };
    m.set(cur, c);
    return c;
  };
  const sales = await prisma.accountingSale.findMany({ where: { userId, locationId: { in: locationIds } }, select: { id: true, locationId: true, currency: true, totalCents: true, paidCents: true, payMethod: true } });
  const where = new Map(sales.map((s) => [s.id, s]));
  for (const s of sales) {
    const c = cell(s.locationId!, s.currency);
    c.sold += big(s.totalCents);
    if (s.payMethod === "CASH") c.cash += big(s.paidCents); else c.otherPaid += big(s.paidCents);
    c.credit += big(s.totalCents) - big(s.paidCents);
  }
  const returns = await prisma.accountingSaleReturn.findMany({ where: { userId, saleId: { in: sales.map((s) => s.id) }, payMethod: "CASH" }, select: { saleId: true, refundCents: true, currency: true } });
  for (const r of returns) cell(where.get(r.saleId)!.locationId!, r.currency).refunded += big(r.refundCents);
  const handovers = await prisma.accountingHandover.findMany({ where: { userId, locationId: { in: locationIds } }, select: { locationId: true, currency: true, amountCents: true } });
  for (const h of handovers) cell(h.locationId, h.currency).handed += big(h.amountCents);
  return out;
}

export const heldOf = (c: { cash: number; refunded: number; handed: number }) => c.cash - c.refunded - c.handed;

/** The settlement of one location: what was sold, what came in as cash, what was handed over, and what is still held. */
export async function settlement(userId: string, locationId: string, day?: string) {
  const loc = await prisma.accountingLocation.findFirst({ where: { id: locationId, userId }, include: { stock: { include: { product: { select: { name: true } } } } } });
  if (!loc) throw notFound("الموقع غير موجود");
  const held = (await cashHeld(userId, [locationId])).get(locationId) ?? new Map();
  const start = new Date(`${day ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);
  const [todaySales, todayHand, recent] = await Promise.all([
    prisma.accountingSale.findMany({ where: { userId, locationId, occurredAt: { gte: start, lt: end } }, select: { currency: true, totalCents: true, paidCents: true, payMethod: true } }),
    prisma.accountingHandover.findMany({ where: { userId, locationId, createdAt: { gte: start, lt: end } }, select: { currency: true, amountCents: true } }),
    prisma.accountingHandover.findMany({ where: { userId, locationId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const staff = loc.staffId ? await prisma.businessStaff.findFirst({ where: { id: loc.staffId }, select: { name: true } }) : null;
  const cur = new Set<string>([...held.keys(), ...todaySales.map((s) => s.currency), ...todayHand.map((h) => h.currency)]);
  return {
    locationId, name: loc.name, kind: loc.kind, staffName: staff?.name ?? null,
    day: start.toISOString().slice(0, 10),
    currencies: [...cur].map((currency) => {
      const h = held.get(currency) ?? { sold: 0, cash: 0, otherPaid: 0, credit: 0, refunded: 0, handed: 0 };
      const ts = todaySales.filter((s) => s.currency === currency);
      return {
        currency, soldCents: h.sold, cashCents: h.cash, otherPaidCents: h.otherPaid, creditCents: h.credit, refundedCents: h.refunded, handedOverCents: h.handed, heldCents: heldOf(h),
        today: { count: ts.length, soldCents: ts.reduce((a, s) => a + big(s.totalCents), 0), cashCents: ts.filter((s) => s.payMethod === "CASH").reduce((a, s) => a + big(s.paidCents), 0), handedOverCents: todayHand.filter((x) => x.currency === currency).reduce((a, x) => a + big(x.amountCents), 0) },
      };
    }),
    goods: loc.stock.filter((s) => s.onHand > 0).map((s) => ({ productId: s.productId, name: s.product.name, onHand: s.onHand })),
    handovers: recent.map((h) => ({ id: h.id, currency: h.currency, amountCents: big(h.amountCents), note: h.note, createdAt: h.createdAt })),
  };
}

/** The owner (or whoever has the money permission) receives cash from a location. More than it holds is refused. */
export async function recordHandover(userId: string, actorId: string, locationId: string, currency: string, amountCents: number, note?: string) {
  const loc = await prisma.accountingLocation.findFirst({ where: { id: locationId, userId }, select: { id: true } });
  if (!loc) throw notFound("الموقع غير موجود");
  return prisma.$transaction(async (tx) => {
    // one handover at a time per location, so two receipts cannot both pass the check
    await tx.$queryRaw`SELECT "id" FROM "AccountingLocation" WHERE "id" = ${locationId} FOR UPDATE`;
    const sales = await tx.accountingSale.findMany({ where: { userId, locationId, currency, payMethod: "CASH" }, select: { id: true, paidCents: true } });
    const returns = await tx.accountingSaleReturn.findMany({ where: { userId, saleId: { in: sales.map((s) => s.id) }, payMethod: "CASH" }, select: { refundCents: true } });
    const handed = await tx.accountingHandover.aggregate({ where: { userId, locationId, currency }, _sum: { amountCents: true } });
    const held = sales.reduce((a, s) => a + big(s.paidCents), 0) - returns.reduce((a, r) => a + big(r.refundCents), 0) - big(handed._sum.amountCents);
    if (amountCents > held) throw new ApiError(409, "CONFLICT", "المبلغ أكبر من الكاش المسجّل عند هالموقع", { heldCents: held });
    return tx.accountingHandover.create({ data: { userId, locationId, currency, amountCents, note: note || null, recordedById: actorId } });
  });
}

/** Sales per seller and per channel in a period, with commissions and the cash each distributor still holds. */
export async function sellerReport(userId: string, from: Date, to: Date) {
  const sales = await prisma.accountingSale.findMany({ where: { userId, occurredAt: { gte: from, lt: to } }, select: { id: true, recordedById: true, channel: true, currency: true, totalCents: true, paidCents: true, taxCents: true }, take: 50000 });
  const returns = await prisma.accountingSaleReturn.findMany({ where: { userId, saleId: { in: sales.map((s) => s.id) } }, select: { saleId: true, totalCents: true } });
  const returnedOf = new Map<string, number>();
  for (const r of returns) returnedOf.set(r.saleId, (returnedOf.get(r.saleId) ?? 0) + big(r.totalCents));

  const channels = new Map<string, { channel: string; currency: string; count: number; totalCents: number; netCents: number; paidCents: number; creditCents: number; returnedCents: number }>();
  type Seller = { sellerId: string | null; currency: string; count: number; totalCents: number; netCents: number; paidCents: number; creditCents: number; returnedCents: number; commissionAccruedCents: number; commissionPaidCents: number; cashHeldCents: number };
  const sellers = new Map<string, Seller>();
  const blank = (sellerId: string | null, currency: string): Seller => ({ sellerId, currency, count: 0, totalCents: 0, netCents: 0, paidCents: 0, creditCents: 0, returnedCents: 0, commissionAccruedCents: 0, commissionPaidCents: 0, cashHeldCents: 0 });
  const sellerRow = (sellerId: string | null, currency: string) => { const k = `${sellerId}|${currency}`; const r = sellers.get(k) ?? blank(sellerId, currency); sellers.set(k, r); return r; };
  for (const s of sales) {
    const total = big(s.totalCents), paid = big(s.paidCents), net = total - big(s.taxCents), back = returnedOf.get(s.id) ?? 0;
    const ck = `${s.channel}|${s.currency}`;
    const c = channels.get(ck) ?? { channel: s.channel, currency: s.currency, count: 0, totalCents: 0, netCents: 0, paidCents: 0, creditCents: 0, returnedCents: 0 };
    channels.set(ck, c);
    const r = sellerRow(s.recordedById, s.currency);
    for (const x of [c, r]) { x.count++; x.totalCents += total; x.netCents += net; x.paidCents += paid; x.creditCents += total - paid; x.returnedCents += back; }
  }

  // the online store's own orders (delivered ones are booked as income in accounting); the shop's own seller is not an employee
  const orders = await prisma.order.findMany({ where: { merchant: { userId }, status: "DELIVERED", updatedAt: { gte: from, lt: to } }, select: { subtotalCents: true, memberDiscountCents: true } });
  if (orders.length) {
    const currency = await marketOfUser(userId);
    const t = orders.reduce((a, o) => a + (o.subtotalCents - o.memberDiscountCents), 0);
    channels.set(`ONLINE|${currency}`, { channel: "ONLINE", currency, count: orders.length, totalCents: t, netCents: t, paidCents: t, creditCents: 0, returnedCents: 0 });
  }

  const staff = await prisma.businessStaff.findMany({ where: { ownerId: userId, status: { not: "REMOVED" } }, select: { id: true, userId: true, name: true, role: true } });
  const commissions = await prisma.businessStaffCommission.findMany({ where: { ownerId: userId, createdAt: { gte: from, lt: to }, status: { in: ["ACCRUED", "PAID"] } }, select: { staffId: true, currency: true, status: true, amountCents: true } });
  for (const c of commissions) {
    const st = staff.find((x) => x.id === c.staffId);
    if (!st?.userId) continue;
    const r = sellerRow(st.userId, c.currency);
    if (c.status === "PAID") r.commissionPaidCents += big(c.amountCents); else r.commissionAccruedCents += big(c.amountCents);
  }
  const locations = await prisma.accountingLocation.findMany({ where: { userId, staffId: { not: null } }, select: { id: true, staffId: true } });
  const held = await cashHeld(userId, locations.map((l) => l.id));
  for (const l of locations) {
    const st = staff.find((x) => x.id === l.staffId);
    if (!st?.userId) continue;
    for (const [currency, c] of held.get(l.id) ?? []) { const h = heldOf(c); if (h !== 0) sellerRow(st.userId, currency).cashHeldCents += h; }
  }

  return {
    from: from.toISOString(), to: to.toISOString(),
    channels: [...channels.values()],
    sellers: [...sellers.values()].map((r) => {
      const st = r.sellerId ? staff.find((x) => x.userId === r.sellerId) : null;
      return { ...r, isOwner: r.sellerId === userId, name: st?.name ?? null, role: st?.role ?? null };
    }),
  };
}

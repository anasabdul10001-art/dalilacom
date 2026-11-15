import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { BusinessStaff, BusinessStaffRole, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";
import { recordDeliveredOrder } from "./accounting.service";
import { marketOfUser } from "./viewerCountry.service";

/**
 * The staff of a business owner. A staff member works inside the owner's accounting with the account of their own:
 * every request names the business (header X-Business-Owner), the owner's plan covers them, and every record carries
 * the staff member's id as the one who typed it. Their section shows up only after a real invitation was accepted.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The account that really typed the request, when it works for an owner (the owner's own requests have none). */
      staffActor?: { staff: BusinessStaff; userId: string };
    }
  }
}

const INVITE_DAYS = 7;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
/** Roles that sell nothing themselves: their commission is on all sales of the business. */
const TEAM_ROLES: BusinessStaffRole[] = ["STOCK", "MARKETER"];
export const MAX_RATE_BP = 5000; // a commission above 50% of a sale is a typing mistake

// ---------------------------------------------------------------- what each role may do in accounting

type Tag = "sell" | "salesRead" | "productsRead" | "partiesRead" | "stockWrite" | "money" | "reports" | "admin" | "destructive";
const ALL: Tag[] = ["sell", "salesRead", "productsRead", "partiesRead", "stockWrite", "money", "reports", "admin", "destructive"];
export const ROLE_TAGS: Record<BusinessStaffRole, Tag[]> = {
  CASHIER: ["sell", "salesRead", "productsRead", "partiesRead"],
  STOCK: ["productsRead", "stockWrite"],
  ASSISTANT: ["sell", "salesRead", "productsRead", "partiesRead", "money"],
  MANAGER: ALL,
  DRIVER: [], // works on deliveries, not in accounting
  MARKETER: [], // works on offers and announcements, not in accounting
};

/** What a request to the accounting router needs. Anything not listed is "money". */
export function tagFor(method: string, path: string): Tag {
  const p = path.replace(/\/+$/, "") || "/";
  const m = method.toUpperCase();
  if (m === "DELETE") return "destructive";
  if (/^\/(summary|reports|statements|tax\/report|export\.csv)$/.test(p)) return "reports";
  if (/^\/(sales|purchases)\/[^/]+\/returns$/.test(p) || /^\/(settings|tax)(\/|$)/.test(p)) return "admin";
  if (m === "POST" && (p === "/sales" || /^\/products\/[^/]+\/sell$/.test(p))) return "sell";
  if (m === "GET" && (p === "/sales" || /^\/sales\/[^/]+$/.test(p))) return "salesRead";
  if (m === "GET" && (p === "/products" || /^\/products\/barcode\/[^/]+$/.test(p) || p === "/stock/low")) return "productsRead";
  if (m === "GET" && p === "/parties") return "partiesRead";
  if (/^\/products(\/|$)/.test(p) || /^\/stock(\/|$)/.test(p)) return "stockWrite";
  return "money";
}

export const roleAllows = (role: BusinessStaffRole, method: string, path: string) => ROLE_TAGS[role].includes(tagFor(method, path));

/**
 * Runs first on the accounting routes. With X-Business-Owner the request is answered as the owner's accounting
 * (req.user becomes the owner, so every query already scopes to them) and the real person is kept in req.staffActor.
 */
export async function actAsBusinessStaff(req: Request, _res: Response, next: NextFunction) {
  const owner = req.headers["x-business-owner"];
  if (typeof owner !== "string" || !owner || owner === req.user!.id) return next();
  const staff = await prisma.businessStaff.findFirst({ where: { ownerId: owner, userId: req.user!.id, status: "ACTIVE" } });
  if (!staff) return next(new ApiError(403, "FORBIDDEN", "ما عندك صلاحية على محاسبة هالنشاط"));
  if (!roleAllows(staff.role, req.method, req.path)) return next(new ApiError(403, "FORBIDDEN", "دورك ما بيسمح لك بهالعملية"));
  req.staffActor = { staff, userId: req.user!.id };
  req.user = { id: owner, role: req.user!.role };
  next();
}

/** Who typed it: the staff member, or the owner. */
export const actorOf = (req: Request) => req.staffActor?.userId ?? req.user!.id;

// ---------------------------------------------------------------- the owner's side

const notFound = () => new ApiError(404, "NOT_FOUND", "الموظف غير موجود");

export async function listStaff(ownerId: string) {
  const rows = await prisma.businessStaff.findMany({ where: { ownerId, status: { not: "REMOVED" } }, orderBy: { createdAt: "asc" } });
  const owed = await prisma.businessStaffCommission.groupBy({ by: ["staffId", "currency"], where: { ownerId, status: "ACCRUED" }, _sum: { amountCents: true } });
  return rows.map(({ codeHash, ...s }) => ({
    ...s,
    fixedPayCents: Number(s.fixedPayCents),
    inviteState: s.userId ? "LINKED" : s.codeExpiresAt && s.codeExpiresAt > new Date() ? "PENDING" : "NONE",
    unpaidCommissions: owed.filter((o) => o.staffId === s.id).map((o) => ({ currency: o.currency, cents: Number(o._sum.amountCents ?? 0) })),
  }));
}

export async function createStaff(ownerId: string, input: { name: string; role: BusinessStaffRole; salesRateBp?: number; fixedPayCents?: number }) {
  const rate = input.salesRateBp ?? 0;
  return prisma.businessStaff.create({ data: { ownerId, name: input.name, role: input.role, salesRateBp: rate, fixedPayCents: input.fixedPayCents ?? 0 }, select: { id: true } });
}

export async function updateStaff(ownerId: string, id: string, input: { name?: string; role?: BusinessStaffRole; salesRateBp?: number; fixedPayCents?: number }) {
  const cur = await prisma.businessStaff.findFirst({ where: { id, ownerId, status: { not: "REMOVED" } } });
  if (!cur) throw notFound();
  await prisma.businessStaff.update({ where: { id }, data: { ...input } });
}

/** Removes the staff member: access stops at once; the history and the commissions already earned stay. */
export async function removeStaff(ownerId: string, id: string) {
  const cur = await prisma.businessStaff.findFirst({ where: { id, ownerId, status: { not: "REMOVED" } } });
  if (!cur) throw notFound();
  await prisma.businessStaff.update({ where: { id }, data: { status: "REMOVED", userId: null, codeHash: null, codeExpiresAt: null } });
}

/** A fresh invitation code; an earlier one stops working. */
export async function inviteStaff(ownerId: string, id: string) {
  const cur = await prisma.businessStaff.findFirst({ where: { id, ownerId, status: { not: "REMOVED" } } });
  if (!cur) throw notFound();
  if (cur.userId) throw new ApiError(409, "CONFLICT", "الموظف مرتبط بحساب من قبل");
  const code = `bsi_${crypto.randomBytes(18).toString("base64url")}`;
  const codeExpiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await prisma.businessStaff.update({ where: { id }, data: { codeHash: sha256(code), codeExpiresAt } });
  return { code, expiresAt: codeExpiresAt };
}

// ---------------------------------------------------------------- the staff member's side

/** The staff member enters the code: the account is linked, and the workplace shows up for them from now on. */
export async function acceptInvite(userId: string, code: string) {
  const bad = () => new ApiError(400, "STAFF_INVITE_INVALID", "الدعوة غير صحيحة أو انتهت صلاحيتها");
  const staff = await prisma.businessStaff.findUnique({ where: { codeHash: sha256(code.trim()) } });
  if (!staff || staff.status === "REMOVED" || staff.userId || !staff.codeExpiresAt || staff.codeExpiresAt < new Date()) throw bad();
  if (staff.ownerId === userId) throw new ApiError(409, "CONFLICT", "أنت صاحب هالنشاط، ما بتنضم له كموظف");
  try {
    const claimed = await prisma.businessStaff.updateMany({ where: { id: staff.id, userId: null, codeHash: staff.codeHash }, data: { userId, status: "ACTIVE", acceptedAt: new Date(), codeHash: null, codeExpiresAt: null } });
    if (claimed.count !== 1) throw bad();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "CONFLICT", "حسابك مرتبط بهالنشاط من قبل");
    throw err;
  }
  const owner = await prisma.user.findUnique({ where: { id: staff.ownerId }, select: { id: true, fullName: true } });
  await notify({ userId: staff.ownerId, type: "SYSTEM", title: "موظف جديد قبل دعوتك", body: `«${staff.name}» انضم لفريقك`, data: { kind: "business-staff-joined" }, email: false }).catch(() => undefined);
  return { staffId: staff.id, ownerId: staff.ownerId, ownerName: owner?.fullName ?? null, role: staff.role };
}

/** The businesses this account works for (empty for everyone who was never invited: the section stays hidden). */
export async function workplaces(userId: string) {
  const rows = await prisma.businessStaff.findMany({ where: { userId, status: "ACTIVE" }, include: { owner: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "asc" } });
  const out = [];
  for (const r of rows) {
    const owed = await prisma.businessStaffCommission.groupBy({ by: ["currency"], where: { staffId: r.id, status: "ACCRUED" }, _sum: { amountCents: true } });
    out.push({
      staffId: r.id, ownerId: r.ownerId, businessName: r.owner.fullName, role: r.role, salesRateBp: r.salesRateBp, fixedPayCents: Number(r.fixedPayCents),
      allowed: ROLE_TAGS[r.role],
      unpaidCommissions: owed.map((o) => ({ currency: o.currency, cents: Number(o._sum.amountCents ?? 0) })),
    });
  }
  return out;
}

/** The staff member's own commission list (never anyone else's). */
export async function myCommissions(userId: string, staffId: string) {
  const staff = await prisma.businessStaff.findFirst({ where: { id: staffId, userId, status: "ACTIVE" } });
  if (!staff) throw notFound();
  const rows = await prisma.businessStaffCommission.findMany({ where: { staffId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((c) => ({ id: c.id, saleId: c.saleId, baseCents: Number(c.baseCents), rateBp: c.rateBp, amountCents: Number(c.amountCents), currency: c.currency, status: c.status, paidAt: c.paidAt, createdAt: c.createdAt }));
}

// ---------------------------------------------------------------- commissions

type Tx = Prisma.TransactionClient;

/**
 * A sale earns commissions on its net (without tax): the staff member who recorded it gets their rate, and a stock keeper
 * or marketer with a rate gets it on every sale of the business (they sell nothing themselves). One commission per person per sale.
 */
export async function accrueSaleCommission(tx: Tx, input: { ownerId: string; actorUserId: string; saleId: string; netCents: number; currency: string }) {
  if (input.netCents <= 0) return;
  const staff = await tx.businessStaff.findMany({ where: { ownerId: input.ownerId, status: "ACTIVE", salesRateBp: { gt: 0 }, OR: [{ userId: input.actorUserId }, { role: { in: TEAM_ROLES } }] } });
  for (const st of staff) {
    if (st.userId === input.ownerId) continue;
    const mine = st.userId === input.actorUserId && !TEAM_ROLES.includes(st.role);
    if (!mine && !TEAM_ROLES.includes(st.role)) continue;
    const amountCents = Math.round((input.netCents * st.salesRateBp) / 10000);
    if (amountCents <= 0) continue;
    await tx.businessStaffCommission.create({ data: { ownerId: input.ownerId, staffId: st.id, saleId: mine ? input.saleId : `team:${input.saleId}:${st.id}`, baseCents: input.netCents, rateBp: st.salesRateBp, amountCents, currency: input.currency } });
  }
}

/** A returned part of a sale takes back its share of the commissions on it, while they are still unpaid. */
export async function reduceSaleCommission(tx: Tx, saleId: string, returnedNetCents: number) {
  if (returnedNetCents <= 0) return;
  const rows = await tx.businessStaffCommission.findMany({ where: { OR: [{ saleId }, { saleId: { startsWith: `team:${saleId}:` } }], status: "ACCRUED" } });
  for (const c of rows) {
    const take = Math.min(Number(c.amountCents), Math.round((returnedNetCents * c.rateBp) / 10000));
    const left = Number(c.amountCents) - take;
    await tx.businessStaffCommission.update({ where: { id: c.id }, data: left > 0 ? { amountCents: left } : { amountCents: 0, status: "VOID" } });
  }
}

/** What the owner sees: per staff member and currency, the unpaid commissions. */
export async function commissionOverview(ownerId: string) {
  const rows = await prisma.businessStaffCommission.groupBy({ by: ["staffId", "currency", "status"], where: { ownerId }, _sum: { amountCents: true }, _count: true });
  return rows.map((r) => ({ staffId: r.staffId, currency: r.currency, status: r.status, cents: Number(r._sum.amountCents ?? 0), count: r._count }));
}

/**
 * The owner pays a staff member the commissions they earned: they are marked paid, and one expense is booked in accounting.
 * Staff linked to a payroll employee are paid through the payslip instead (see payCommissionsInPayroll).
 */
export async function payCommissions(ownerId: string, staffId: string, currency: string, actorUserId: string) {
  const staff = await prisma.businessStaff.findFirst({ where: { id: staffId, ownerId, status: { not: "REMOVED" } } });
  if (!staff) throw notFound();
  return prisma.$transaction(async (tx) => {
    const due = await tx.businessStaffCommission.findMany({ where: { ownerId, staffId, currency, status: "ACCRUED", amountCents: { gt: 0 } } });
    const total = due.reduce((s, c) => s + Number(c.amountCents), 0);
    if (total <= 0) throw new ApiError(409, "CONFLICT", "ما في عمولات مستحقة لهالموظف");
    const claimed = await tx.businessStaffCommission.updateMany({ where: { id: { in: due.map((c) => c.id) }, status: "ACCRUED" }, data: { status: "PAID", paidAt: new Date() } });
    if (claimed.count !== due.length) throw new ApiError(409, "CONFLICT", "العمولات اندفعت من قبل");
    await tx.accountingEntry.create({
      data: { userId: ownerId, type: "EXPENSE", category: "عمولات الموظفين", description: `عمولات ${staff.name}`, amountCents: total, currency, source: "COMMISSION", sourceKey: `staff-commission:${staffId}:${Date.now()}`, recordedById: actorUserId },
    });
    return { paidCents: total, count: due.length };
  });
}

// ---------------------------------------------------------------- the driver: the shop's store orders on their way

async function driverFor(userId: string, staffId: string) {
  const staff = await prisma.businessStaff.findFirst({ where: { id: staffId, userId, status: "ACTIVE", role: "DRIVER" } });
  if (!staff) throw new ApiError(403, "FORBIDDEN", "ما عندك صلاحية على التوصيل");
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: staff.ownerId }, select: { id: true } });
  return { staff, merchantId: merchant?.id ?? null };
}

/** Orders ready to take (PREPARING), and the ones on the road (SHIPPED: this driver's own, or nobody's yet). */
export async function driverOrders(userId: string, staffId: string) {
  const { staff, merchantId } = await driverFor(userId, staffId);
  if (!merchantId) return [];
  const rows = await prisma.order.findMany({
    where: { merchantId, OR: [{ status: "PREPARING" }, { status: "SHIPPED", OR: [{ driverStaffId: staff.id }, { driverStaffId: null }] }] },
    include: { items: { select: { productName: true, quantity: true } }, payment: { select: { method: true, status: true } }, user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" }, take: 100,
  });
  return rows.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, customerName: o.user.fullName, totalCents: o.totalCents, shippingName: o.shippingName, items: o.items, paymentMethod: o.payment?.method ?? null, paymentStatus: o.payment?.status ?? null, mine: o.driverStaffId === staff.id }));
}

/** The driver takes an order that is ready: it goes SHIPPED and is theirs. Only one driver can take it. */
export async function driverPickup(userId: string, staffId: string, orderId: string) {
  const { staff, merchantId } = await driverFor(userId, staffId);
  const claimed = await prisma.order.updateMany({ where: { id: orderId, merchantId: merchantId ?? "none", status: "PREPARING" }, data: { status: "SHIPPED", driverStaffId: staff.id } });
  if (claimed.count !== 1) throw new ApiError(409, "CONFLICT", "الطلب مو جاهز للاستلام أو أخدو موزّع ثاني");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await notify({ userId: order.userId, type: "ORDER_STATUS", title: "تحديث على طلبك: SHIPPED", body: "طلبك انطلق للتوصيل 🚚", data: { orderId, orderNumber: order.orderNumber, status: "SHIPPED" } }).catch(() => undefined);
}

/** The driver delivers: DELIVERED, booked in the owner accounting like any delivered order, with the driver commission on its net. */
export async function driverDeliver(userId: string, staffId: string, orderId: string) {
  const { staff, merchantId } = await driverFor(userId, staffId);
  const claimed = await prisma.order.updateMany({ where: { id: orderId, merchantId: merchantId ?? "none", status: "SHIPPED", OR: [{ driverStaffId: staff.id }, { driverStaffId: null }] }, data: { status: "DELIVERED", driverStaffId: staff.id } });
  if (claimed.count !== 1) throw new ApiError(409, "CONFLICT", "الطلب مو بعهدتك أو انسلّم من قبل");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await recordDeliveredOrder(orderId).catch((err) => console.error("Could not sync delivered order to accounting", err));
  const net = order.subtotalCents - order.memberDiscountCents;
  const amountCents = Math.round((net * staff.salesRateBp) / 10000);
  if (staff.salesRateBp > 0 && amountCents > 0) {
    const currency = await marketOfUser(staff.ownerId);
    await prisma.businessStaffCommission.create({ data: { ownerId: staff.ownerId, staffId: staff.id, saleId: `order:${orderId}`, baseCents: net, rateBp: staff.salesRateBp, amountCents, currency } }).catch(() => undefined);
  }
  await accrueTeamOrderCommissions(orderId).catch(() => undefined);
  await notify({ userId: order.userId, type: "ORDER_STATUS", title: "تحديث على طلبك: DELIVERED", body: "طلبك وصل! منتمنى تكون التجربة حلوة ⭐", data: { orderId, orderNumber: order.orderNumber, status: "DELIVERED" } }).catch(() => undefined);
}

/** The owner pays the fixed monthly pay set for a staff member: one expense in accounting, in the owner currency. */
export async function payFixedSalary(ownerId: string, staffId: string, actorUserId: string) {
  const st = await prisma.businessStaff.findFirst({ where: { id: staffId, ownerId, status: { not: "REMOVED" } } });
  if (!st) throw notFound();
  const amountCents = Number(st.fixedPayCents);
  if (amountCents <= 0) throw new ApiError(409, "CONFLICT", "ما في راتب ثابت محدد لهالموظف");
  const currency = await marketOfUser(ownerId);
  await prisma.accountingEntry.create({ data: { userId: ownerId, type: "EXPENSE", category: "رواتب الموظفين", description: `راتب ${st.name}`, amountCents, currency, source: "MANUAL", recordedById: actorUserId } });
  return { paidCents: amountCents, currency };
}

/** A delivered store order earns the stock keepers and marketers with a rate their share of its net (once per person per order). */
export async function accrueTeamOrderCommissions(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { merchant: { select: { userId: true } } } });
  if (!order || order.status !== "DELIVERED") return;
  const ownerId = order.merchant.userId;
  const net = order.subtotalCents - order.memberDiscountCents;
  const team = await prisma.businessStaff.findMany({ where: { ownerId, status: "ACTIVE", role: { in: TEAM_ROLES }, salesRateBp: { gt: 0 } } });
  if (!team.length || net <= 0) return;
  const currency = await marketOfUser(ownerId);
  for (const st of team) {
    const amountCents = Math.round((net * st.salesRateBp) / 10000);
    if (amountCents <= 0) continue;
    await prisma.businessStaffCommission.create({ data: { ownerId, staffId: st.id, saleId: `team:order:${orderId}:${st.id}`, baseCents: net, rateBp: st.salesRateBp, amountCents, currency } }).catch(() => undefined);
  }
}

/** The owner HR employees a staff member can be linked to (empty when the owner has no HR company: nothing to show then). */
export async function hrEmployeesFor(ownerId: string) {
  const company = await prisma.hrCompany.findUnique({ where: { ownerId }, select: { id: true } });
  if (!company) return [];
  const rows = await prisma.hrEmployee.findMany({ where: { companyId: company.id, employmentStatus: { not: "TERMINATED" } }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" } });
  return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim() }));
}

/** Links a staff member to an employee of the owner's payroll (or unlinks with null): their unpaid commissions then join the payslip. */
export async function linkHrEmployee(ownerId: string, staffId: string, hrEmployeeId: string | null) {
  const st = await prisma.businessStaff.findFirst({ where: { id: staffId, ownerId, status: { not: "REMOVED" } } });
  if (!st) throw notFound();
  if (hrEmployeeId) {
    const emp = await prisma.hrEmployee.findFirst({ where: { id: hrEmployeeId, company: { ownerId }, employmentStatus: { not: "TERMINATED" } }, select: { id: true } });
    if (!emp) throw new ApiError(404, "NOT_FOUND", "الموظف غير موجود بكشف الرواتب");
    if (await prisma.businessStaff.count({ where: { ownerId, hrEmployeeId, status: { not: "REMOVED" }, id: { not: staffId } } })) throw new ApiError(409, "CONFLICT", "موظف الرواتب مربوط بموظف ثاني");
  }
  await prisma.businessStaff.update({ where: { id: staffId }, data: { hrEmployeeId } });
}

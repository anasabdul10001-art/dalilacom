import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { BusinessStaff, BusinessStaffRole, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";

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
export const MAX_RATE_BP = 5000; // a commission above 50% of a sale is a typing mistake

// ---------------------------------------------------------------- what each role may do in accounting

type Tag = "sell" | "salesRead" | "productsRead" | "partiesRead" | "stockWrite" | "money" | "reports" | "admin" | "destructive";
const ALL: Tag[] = ["sell", "salesRead", "productsRead", "partiesRead", "stockWrite", "money", "reports", "admin", "destructive"];
export const ROLE_TAGS: Record<BusinessStaffRole, Tag[]> = {
  CASHIER: ["sell", "salesRead", "productsRead", "partiesRead"],
  STOCK: ["productsRead", "stockWrite"],
  ASSISTANT: ["sell", "salesRead", "productsRead", "partiesRead", "money"],
  MANAGER: ALL,
};
/** Roles that sell, and so can earn a commission on sales. */
export const SELLING_ROLES: BusinessStaffRole[] = ["CASHIER", "ASSISTANT", "MANAGER"];

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
  if (rate > 0 && !SELLING_ROLES.includes(input.role)) throw new ApiError(400, "BAD_REQUEST", "هالدور ما بيسجّل مبيعات، فما في عمولة على المبيعات");
  return prisma.businessStaff.create({ data: { ownerId, name: input.name, role: input.role, salesRateBp: rate, fixedPayCents: input.fixedPayCents ?? 0 }, select: { id: true } });
}

export async function updateStaff(ownerId: string, id: string, input: { name?: string; role?: BusinessStaffRole; salesRateBp?: number; fixedPayCents?: number }) {
  const cur = await prisma.businessStaff.findFirst({ where: { id, ownerId, status: { not: "REMOVED" } } });
  if (!cur) throw notFound();
  const role = input.role ?? cur.role;
  const rate = input.salesRateBp ?? cur.salesRateBp;
  if (rate > 0 && !SELLING_ROLES.includes(role)) throw new ApiError(400, "BAD_REQUEST", "هالدور ما بيسجّل مبيعات، فما في عمولة على المبيعات");
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

/** A sale recorded by a staff member with a rate earns them a commission on its net (without tax). One per sale. */
export async function accrueSaleCommission(tx: Tx, input: { ownerId: string; actorUserId: string; saleId: string; netCents: number; currency: string }) {
  if (input.actorUserId === input.ownerId || input.netCents <= 0) return;
  const staff = await tx.businessStaff.findFirst({ where: { ownerId: input.ownerId, userId: input.actorUserId, status: "ACTIVE" } });
  if (!staff || staff.salesRateBp <= 0) return;
  const amountCents = Math.round((input.netCents * staff.salesRateBp) / 10000);
  if (amountCents <= 0) return;
  await tx.businessStaffCommission.create({ data: { ownerId: input.ownerId, staffId: staff.id, saleId: input.saleId, baseCents: input.netCents, rateBp: staff.salesRateBp, amountCents, currency: input.currency } });
}

/** A returned part of a sale takes back its share of the commission, while that commission is still unpaid. */
export async function reduceSaleCommission(tx: Tx, saleId: string, returnedNetCents: number) {
  const c = await tx.businessStaffCommission.findUnique({ where: { saleId } });
  if (!c || c.status !== "ACCRUED" || returnedNetCents <= 0) return;
  const take = Math.min(Number(c.amountCents), Math.round((returnedNetCents * c.rateBp) / 10000));
  const left = Number(c.amountCents) - take;
  await tx.businessStaffCommission.update({ where: { id: c.id }, data: left > 0 ? { amountCents: left } : { amountCents: 0, status: "VOID" } });
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

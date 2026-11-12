import crypto from "crypto";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { decryptJson, encryptJson } from "./crypto.service";

/** The largest single accounting entry, in minor units. Far below 2^53, so sums of many entries stay exact as JSON numbers. */
export const MAX_ENTRY_CENTS = 9_000_000_000_000;

const CODE_TTL_MINUTES = 30;
const KEY_PREFIX = "hr-payroll:";
const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
const maxSkewSeconds = () => (Number(process.env.HR_SYNC_MAX_SKEW_SECONDS) > 0 ? Number(process.env.HR_SYNC_MAX_SKEW_SECONDS) : 300);

/** The account's live link with the HR system, if it has one. */
export function activeHrLink(userId: string) {
  return prisma.hrLink.findFirst({ where: { userId, connectedAt: { not: null }, revokedAt: null }, select: { id: true, companyName: true, connectedAt: true } });
}

/** A payroll entry follows its payroll run for as long as the link that wrote it is alive. */
export async function payrollEntryIsLocked(sourceKey: string | null): Promise<boolean> {
  const linkId = sourceKey?.startsWith(KEY_PREFIX) ? sourceKey.slice(KEY_PREFIX.length).split(":")[0] : null;
  if (!linkId) return true;
  const link = await prisma.hrLink.findUnique({ where: { id: linkId }, select: { connectedAt: true, revokedAt: true } });
  return !!link?.connectedAt && !link.revokedAt;
}

export async function hrLinkStatus(userId: string) {
  const active = await activeHrLink(userId);
  if (active) return { status: "CONNECTED" as const, companyName: active.companyName, connectedAt: active.connectedAt };
  const pending = await prisma.hrLink.findFirst({ where: { userId, connectedAt: null, codeExpiresAt: { gt: new Date() } }, select: { codeExpiresAt: true } });
  return pending ? { status: "PENDING" as const, expiresAt: pending.codeExpiresAt } : { status: "NONE" as const };
}

/** A fresh one-time code. Only its hash is stored, so it can be shown exactly once; an earlier unused code stops working. */
export async function createHrLinkCode(userId: string) {
  if (await activeHrLink(userId)) throw new ApiError(409, "HR_LINK_EXISTS", "الحساب مربوط بنظام الموارد البشرية من قبل. ألغِ الربط أولاً");
  const code = `dlk_${crypto.randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.hrLink.deleteMany({ where: { userId, connectedAt: null } }),
    prisma.hrLink.create({ data: { userId, codeHash: sha256(code), codeExpiresAt: expiresAt } }),
  ]);
  return { code, expiresAt };
}

/** Cancels the link from this side. Entries already booked stay; the HR server learns of it on its next call. */
export async function revokeHrLink(userId: string) {
  const [revoked] = await prisma.$transaction([
    prisma.hrLink.updateMany({ where: { userId, connectedAt: { not: null }, revokedAt: null }, data: { revokedAt: new Date(), secretEnc: null } }),
    prisma.hrLink.deleteMany({ where: { userId, connectedAt: null } }),
  ]);
  return revoked.count > 0;
}

/** The HR server swaps the one-time code for a signing secret. The code works once, and only before it expires. */
export async function connectHrLink(code: string, companyName: string) {
  const invalid = () => new ApiError(400, "HR_LINK_CODE_INVALID", "رمز الربط غير صحيح أو انتهت صلاحيته");
  const codeHash = sha256(code);
  const link = await prisma.hrLink.findUnique({ where: { codeHash }, select: { id: true, userId: true, codeExpiresAt: true, connectedAt: true } });
  if (!link || link.connectedAt || !link.codeExpiresAt || link.codeExpiresAt < new Date()) throw invalid();
  if (await activeHrLink(link.userId)) throw invalid();
  const secret = crypto.randomBytes(32).toString("hex");
  // claimed only while the code is still there: two requests with the same code cannot both get a secret
  const claimed = await prisma.hrLink.updateMany({
    where: { id: link.id, codeHash, connectedAt: null },
    data: { codeHash: null, codeExpiresAt: null, secretEnc: encryptJson({ secret }), companyName, connectedAt: new Date() },
  });
  if (claimed.count !== 1) throw invalid();
  return { linkId: link.id, secret };
}

/** The signature the HR server puts on every call: HMAC-SHA256 over "<unix seconds>.<raw body>". */
export function signHrRequest(secret: string, timestamp: string, rawBody: Buffer | string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
}

/**
 * Checks who is calling: the link named in the header, a fresh timestamp and a signature made with that link's
 * secret over the exact bytes received. The link (and through it the one account it may write to) comes from here
 * only — nothing in the body can point at another account.
 */
export async function verifyHrRequest(req: Request) {
  const linkId = req.get("X-HR-Link-Id") ?? "";
  const timestamp = req.get("X-HR-Timestamp") ?? "";
  const signature = req.get("X-HR-Signature") ?? "";
  const bad = () => new ApiError(401, "HR_SIGNATURE_INVALID", "توقيع الطلب غير صحيح");
  if (!/^[0-9a-f-]{36}$/.test(linkId) || !/^\d{9,11}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) throw bad();
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > maxSkewSeconds()) throw new ApiError(401, "HR_REQUEST_STALE", "الطلب قديم. تحقق من ساعة الخادم");
  const link = await prisma.hrLink.findUnique({ where: { id: linkId }, select: { id: true, userId: true, secretEnc: true, connectedAt: true, revokedAt: true } });
  if (!link || !link.connectedAt) throw bad();
  if (link.revokedAt || !link.secretEnc) throw new ApiError(410, "HR_LINK_GONE", "تم إلغاء هذا الربط");
  const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
  const expected = Buffer.from(signHrRequest(decryptJson<{ secret: string }>(link.secretEnc).secret, timestamp, rawBody), "hex");
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw bad();
  return { id: link.id, userId: link.userId };
}

export type PayrollState = {
  runId: string;
  revision: number;
  state: "PAID" | "REVERTED";
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  currency: string;
  totalCents: number;
  employeeCount: number;
};

/**
 * Brings the one expense entry of a payroll run in line with the state the HR server reports: there while the run
 * is paid, gone when the payment was taken back. Each run has a revision that only grows, so a repeated or late
 * message changes nothing.
 */
export async function applyPayrollState(link: { id: string; userId: string }, data: PayrollState) {
  const sourceKey = `${KEY_PREFIX}${link.id}:${data.runId}`;
  const where = { userId_sourceKey: { userId: link.userId, sourceKey } };
  try {
    return await prisma.$transaction(async (tx) => {
      const seen = await tx.hrPayrollSync.findUnique({ where: { linkId_runId: { linkId: link.id, runId: data.runId } } });
      if (seen && data.revision <= seen.revision) return { applied: false, revision: seen.revision };
      let entryId: string | null = null;
      if (data.state === "PAID" && data.totalCents > 0) {
        const fields = {
          amountCents: data.totalCents,
          currency: data.currency,
          // the salaries belong to the month that was worked, whenever they were paid out
          occurredAt: new Date(`${data.periodEnd}T12:00:00.000Z`),
          description: `رواتب الفترة من ${data.periodStart} إلى ${data.periodEnd} · عدد الموظفين ${data.employeeCount}`,
        };
        entryId = (await tx.accountingEntry.upsert({ where, create: { ...fields, userId: link.userId, type: "EXPENSE", category: "رواتب", source: "PAYROLL", sourceKey }, update: fields, select: { id: true } })).id;
      } else {
        await tx.accountingEntry.deleteMany({ where: { userId: link.userId, sourceKey, source: "PAYROLL" } });
      }
      await tx.hrPayrollSync.upsert({
        where: { linkId_runId: { linkId: link.id, runId: data.runId } },
        create: { linkId: link.id, runId: data.runId, revision: data.revision, entryId },
        update: { revision: data.revision, entryId },
      });
      return { applied: true, revision: data.revision };
    });
  } catch (err) {
    // two messages for the same run at the same moment: one wins, the other is asked to come back
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "HR_SYNC_BUSY", "طلب آخر لنفس دورة الرواتب قيد المعالجة. أعد المحاولة");
    throw err;
  }
}

/** The HR side cancelled the link. */
export async function revokeHrLinkById(linkId: string) {
  await prisma.hrLink.updateMany({ where: { id: linkId, revokedAt: null }, data: { revokedAt: new Date(), secretEnc: null } });
}

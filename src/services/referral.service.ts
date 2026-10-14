import crypto from "crypto";
import { Prisma, WalletTxType } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { getSettings } from "./settings.service";
import { notify } from "./notification.service";

/**
 * Marketing: people (marketers, and marketing managers over them) bring others to Dalilacom through a referral link or code.
 * They earn wallet credits: a fixed amount for each person who signs up and verifies the account, and a percent of what
 * that person spends on plans, ads, AI and announcements. A marketing manager earns for everyone his team brings.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I: easy to read out loud
const SPENT: WalletTxType[] = ["SUBSCRIPTION", "MEMBERSHIP", "BROADCAST", "AD", "AI"];

function newCode(): string {
  return Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
}

export const referralLink = (code: string) => `${(process.env.PUBLIC_BASE_URL ?? "https://dalilacom.com").replace(/\/$/, "")}/app/?join=${code}`;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    if (!(await prisma.marketer.findUnique({ where: { code } }))) return code;
  }
  throw new ApiError(500, "INTERNAL", "Could not make a referral code");
}

/** Credits a marketer's wallet and writes the earning down, inside the same transaction. */
async function earn(tx: Prisma.TransactionClient, marketerId: string, amount: number, kind: "SIGNUP" | "PAYMENT", fromUserId: string, viaMarketerId: string | null, ref: string) {
  if (amount <= 0) return;
  const marketer = await tx.marketer.findUniqueOrThrow({ where: { id: marketerId }, select: { userId: true } });
  await tx.wallet.upsert({ where: { userId: marketer.userId }, update: { balance: { increment: amount } }, create: { userId: marketer.userId, balance: amount } });
  await tx.walletTransaction.create({ data: { userId: marketer.userId, type: "COMMISSION", amount, ref } });
  await tx.marketerEarning.create({ data: { marketerId, kind, amount, fromUserId, viaMarketerId, ref } });
}

/** The marketer who brought a person, and the manager above him (if any), with their numbers. */
async function chainOf(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referredBy: { include: { parent: true } } } });
  const marketer = user?.referredBy;
  if (!marketer || !marketer.isActive) return null;
  const manager = marketer.kind === "MARKETER" && marketer.parent && marketer.parent.isActive ? marketer.parent : null;
  return { marketer, manager };
}

/** A new account claims the code it came with, once. Returns false when there is nothing to claim. */
export async function attachReferral(userId: string, code: string | undefined | null): Promise<boolean> {
  const clean = (code ?? "").trim().toUpperCase();
  if (!clean) return false;
  const marketer = await prisma.marketer.findFirst({ where: { code: clean, isActive: true } });
  if (!marketer || marketer.userId === userId) return false;
  const claimed = await prisma.user.updateMany({ where: { id: userId, referredById: null }, data: { referredById: marketer.id, referredAt: new Date() } });
  if (claimed.count === 0) return false;
  // a social sign-up is verified already, and with no mail provider nobody can verify an address: the sign-up counts at once
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isEmailVerified: true } });
  if (user?.isEmailVerified || !process.env.SMTP_HOST) await payForSignup(userId);
  return true;
}

/** The fixed amount for a person who signed up and verified the account (once per person). */
export async function payForSignup(userId: string): Promise<void> {
  const chain = await chainOf(userId);
  if (!chain) return;
  if (await prisma.marketerEarning.findFirst({ where: { kind: "SIGNUP", fromUserId: userId }, select: { id: true } })) return;
  const settings = (await getSettings()).referral;
  const own = chain.marketer.signupCredits ?? settings.marketerSignupCredits;
  const team = chain.manager ? chain.manager.teamSignupCredits ?? settings.managerSignupCredits : 0;
  await prisma.$transaction(async (tx) => {
    await earn(tx, chain.marketer.id, own, "SIGNUP", userId, null, "signup");
    if (chain.manager) await earn(tx, chain.manager.id, team, "SIGNUP", userId, chain.marketer.id, "signup");
  });
}

/** What someone spent from the wallet: the marketer who brought him gets his percent, and the manager above him his own. */
export async function commissionOnSpending(tx: Prisma.TransactionClient, userId: string, spent: number, type: WalletTxType, ref?: string): Promise<void> {
  if (spent <= 0 || !SPENT.includes(type)) return;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { referredBy: { include: { parent: true } } } });
  const marketer = user?.referredBy;
  if (!marketer || !marketer.isActive) return;
  const manager = marketer.kind === "MARKETER" && marketer.parent && marketer.parent.isActive ? marketer.parent : null;
  const settings = (await getSettings()).referral;
  const label = `${type.toLowerCase()}${ref ? ":" + ref : ""}`;
  await earn(tx, marketer.id, Math.floor((spent * (marketer.percent ?? settings.marketerPercent)) / 100), "PAYMENT", userId, null, label);
  if (manager) await earn(tx, manager.id, Math.floor((spent * (manager.teamPercent ?? settings.managerPercent)) / 100), "PAYMENT", userId, marketer.id, label);
}

/* ---------------- what a marketer sees ---------------- */

async function statsOf(marketerIds: string[]) {
  const [brought, earned] = await Promise.all([
    prisma.user.groupBy({ by: ["referredById"], where: { referredById: { in: marketerIds } }, _count: { _all: true } }),
    prisma.marketerEarning.groupBy({ by: ["marketerId"], where: { marketerId: { in: marketerIds } }, _sum: { amount: true } }),
  ]);
  return (id: string) => ({ people: brought.find((b) => b.referredById === id)?._count._all ?? 0, earned: earned.find((e) => e.marketerId === id)?._sum.amount ?? 0 });
}

export async function referralMe(userId: string) {
  const me = await prisma.marketer.findUnique({ where: { userId }, include: { members: { include: { user: { select: { fullName: true } } } } } });
  if (!me || !me.isActive) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { referredById: true } });
    const request = await prisma.marketerRequest.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { channel: true, status: true } });
    return { isMarketer: false as const, referred: !!user?.referredById, request };
  }
  const stats = await statsOf([me.id, ...me.members.map((m) => m.id)]);
  const mine = stats(me.id);
  const team = me.members.map((m) => ({ id: m.id, name: m.user.fullName, active: m.isActive, ...stats(m.id) }));
  const viaTeam = await prisma.marketerEarning.aggregate({ where: { marketerId: me.id, viaMarketerId: { not: null } }, _sum: { amount: true } });
  return {
    isMarketer: true as const,
    kind: me.kind,
    channel: me.channel,
    code: me.code,
    link: referralLink(me.code),
    people: mine.people,
    earned: mine.earned,
    team: me.kind === "MANAGER" ? team : [],
    teamPeople: team.reduce((n, m) => n + m.people, 0),
    earnedFromTeam: viaTeam._sum.amount ?? 0,
  };
}

/* ---------------- the admin's side ---------------- */

export interface MarketerInput {
  email: string;
  kind: "MANAGER" | "MARKETER";
  channel?: "ELECTRONIC" | "FIELD";
  parentId?: string | null;
  percent?: number | null;
  signupCredits?: number | null;
  teamPercent?: number | null;
  teamSignupCredits?: number | null;
}

export async function listMarketers() {
  const rows = await prisma.marketer.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }], include: { user: { select: { fullName: true, email: true } }, parent: { include: { user: { select: { fullName: true } } } } } });
  const stats = await statsOf(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id, kind: r.kind, channel: r.channel, name: r.user.fullName, email: r.user.email, code: r.code, link: referralLink(r.code), isActive: r.isActive,
    parentId: r.parentId, parentName: r.parent?.user.fullName ?? null,
    percent: r.percent, signupCredits: r.signupCredits, teamPercent: r.teamPercent, teamSignupCredits: r.teamSignupCredits,
    ...stats(r.id),
  }));
}

async function checkParent(kind: string, parentId: string | null | undefined) {
  if (kind === "MANAGER") {
    if (parentId) throw new ApiError(400, "BAD_REQUEST", "A marketing manager has no manager above him");
    return;
  }
  if (parentId) {
    const parent = await prisma.marketer.findUnique({ where: { id: parentId } });
    if (!parent || parent.kind !== "MANAGER") throw new ApiError(400, "BAD_REQUEST", "Choose a marketing manager");
  }
}

export async function createMarketer(input: MarketerInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() }, select: { id: true } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "No user with that email");
  if (await prisma.marketer.findUnique({ where: { userId: user.id } })) throw new ApiError(409, "CONFLICT", "This user is already a marketer");
  await checkParent(input.kind, input.parentId);
  return prisma.marketer.create({
    data: { userId: user.id, kind: input.kind, channel: input.channel ?? "ELECTRONIC", parentId: input.parentId ?? null, code: await uniqueCode(), percent: input.percent ?? null, signupCredits: input.signupCredits ?? null, teamPercent: input.teamPercent ?? null, teamSignupCredits: input.teamSignupCredits ?? null },
  });
}

export async function updateMarketer(id: string, patch: Partial<Omit<MarketerInput, "email">> & { isActive?: boolean }) {
  const row = await prisma.marketer.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Marketer not found");
  const kind = patch.kind ?? row.kind;
  await checkParent(kind, patch.parentId !== undefined ? patch.parentId : kind === "MANAGER" ? null : row.parentId);
  const data: Prisma.MarketerUncheckedUpdateInput = {};
  if (patch.kind) data.kind = patch.kind;
  if (patch.channel) data.channel = patch.channel;
  if (patch.parentId !== undefined) data.parentId = patch.parentId;
  if (kind === "MANAGER") data.parentId = null;
  for (const key of ["percent", "signupCredits", "teamPercent", "teamSignupCredits", "isActive"] as const) if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  return prisma.marketer.update({ where: { id }, data });
}

/* ---------------- asking to become a marketer ---------------- */

/** A person asks to become an online or a field marketer. One open request at a time. */
export async function requestMarketer(userId: string, channel: "ELECTRONIC" | "FIELD", phone?: string, note?: string) {
  if (await prisma.marketer.findUnique({ where: { userId } })) throw new ApiError(409, "CONFLICT", "You are already a marketer");
  if (await prisma.marketerRequest.findFirst({ where: { userId, status: "PENDING" } })) throw new ApiError(409, "CONFLICT", "You already have a request waiting");
  return prisma.marketerRequest.create({ data: { userId, channel, phone: phone?.trim() || null, note: note?.trim() || null } });
}

export async function listMarketerRequests(status: string) {
  const rows = await prisma.marketerRequest.findMany({ where: { status }, orderBy: { createdAt: "asc" }, include: { user: { select: { fullName: true, email: true, phone: true } } } });
  return rows.map((r) => ({ id: r.id, channel: r.channel, phone: r.phone ?? r.user.phone, note: r.note, status: r.status, createdAt: r.createdAt, name: r.user.fullName, email: r.user.email }));
}

/** Accepting makes the person a marketer of the kind he asked for (or a marketing manager / under a manager, as the admin chooses). */
export async function decideMarketerRequest(id: string, approve: boolean, options: { kind?: "MANAGER" | "MARKETER"; parentId?: string | null } = {}) {
  const request = await prisma.marketerRequest.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
  if (!request || request.status !== "PENDING") throw new ApiError(404, "NOT_FOUND", "Request not found");
  if (approve) {
    await createMarketer({ email: request.user.email, kind: options.kind ?? "MARKETER", channel: request.channel, parentId: options.parentId ?? null });
  }
  await prisma.marketerRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedAt: new Date() } });
  await notify({
    userId: request.userId, type: "SYSTEM",
    title: approve ? "تمت الموافقة على طلبك لتصبح مسوقًا" : "لم تتم الموافقة على طلبك لتصبح مسوقًا",
    body: approve ? "افتح التسويق لدليلكم من حسابك لتجد رابطك" : undefined,
    data: { kind: approve ? "MARKETER_APPROVED" : "MARKETER_REJECTED" }, email: false,
  });
}

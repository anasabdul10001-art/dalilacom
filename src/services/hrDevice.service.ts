import crypto from "crypto";
import { HrAttendanceSource, HrCompany, HrDeviceKind, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { HrActor, assertCompanyActive, hrAudit } from "./hrAccess.service";

/** Two punches of the same person closer than this are one (a double scan on the reader). */
export const DOUBLE_SCAN_SECONDS = 60;
/** A reader clock a little ahead of ours is fine; further than this the punch is refused. */
const FUTURE_SLACK_MS = 10 * 60_000;
export const MAX_PUNCHES = 500;

const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
const notFound = (what: string) => new ApiError(404, "NOT_FOUND", what);

// ---------------------------------------------------------------- devices (the owner / HR side)

const deviceSelect = { id: true, name: true, kind: true, keyHint: true, active: true, lastSeenAt: true, createdAt: true } as const;

export const listDevices = (companyId: string) => prisma.hrDevice.findMany({ where: { companyId }, select: deviceSelect, orderBy: { createdAt: "asc" } });

function newKey() {
  const key = `hrd_${crypto.randomBytes(24).toString("base64url")}`;
  return { key, keyHash: sha256(key), keyHint: key.slice(-4) };
}

/** The key comes back once, here; only its hash is kept. */
export async function createDevice(actor: HrActor, input: { name: string; kind: HrDeviceKind }) {
  const { key, keyHash, keyHint } = newKey();
  const device = await prisma.hrDevice.create({ data: { companyId: actor.company.id, name: input.name, kind: input.kind, keyHash, keyHint }, select: deviceSelect });
  await hrAudit(actor.company.id, actor.userId, "device.create", "HrDevice", device.id);
  return { ...device, key };
}

export async function updateDevice(actor: HrActor, id: string, input: { name?: string; active?: boolean; rotateKey?: boolean }) {
  const existing = await prisma.hrDevice.findFirst({ where: { id, companyId: actor.company.id } });
  if (!existing) throw notFound("الجهاز غير موجود");
  const fresh = input.rotateKey ? newKey() : null;
  const device = await prisma.hrDevice.update({
    where: { id },
    data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}), ...(fresh ? { keyHash: fresh.keyHash, keyHint: fresh.keyHint } : {}) },
    select: deviceSelect,
  });
  await hrAudit(actor.company.id, actor.userId, "device.update", "HrDevice", id, { name: input.name, active: input.active, rotated: !!fresh });
  return fresh ? { ...device, key: fresh.key } : device;
}

export async function deleteDevice(actor: HrActor, id: string) {
  const gone = await prisma.hrDevice.deleteMany({ where: { id, companyId: actor.company.id } });
  if (gone.count !== 1) throw notFound("الجهاز غير موجود");
  await hrAudit(actor.company.id, actor.userId, "device.delete", "HrDevice", id);
}

/** Who a reader is: its key, while the device is on. Marks it seen. */
export async function authenticateDevice(key: string | undefined) {
  if (!key || key.length < 20 || key.length > 200) return null;
  const device = await prisma.hrDevice.findFirst({ where: { keyHash: sha256(key), active: true }, include: { company: true } });
  if (!device) return null;
  await prisma.hrDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return device;
}

// ---------------------------------------------------------------- time

/** The offset of a zone at an instant, in ms (Intl knows daylight saving). Falls back to UTC for an unknown zone. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(instant / 1000) * 1000;
  } catch {
    return 0;
  }
}

/** A time with an offset (…Z or …+03:00) is exact; a time without one is read in the company time zone, as readers print local time. */
export function parseWhen(text: string, timeZone: string): Date | null {
  const s = text.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = "0", zone] = m;
  if (zone) {
    const d2 = new Date(s.replace(" ", "T").replace(/\s+/g, "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  const first = guess - zoneOffsetMs(guess, timeZone);
  const result = new Date(guess - zoneOffsetMs(first, timeZone));
  return Number.isNaN(result.getTime()) ? null : result;
}

// ---------------------------------------------------------------- punches

export type PunchInput = { code: string; at: string; direction?: "IN" | "OUT" };
export type PunchResult = { code: string; at: string; result: "CHECKED_IN" | "CHECKED_OUT" | "DUPLICATE" | "UNKNOWN_CODE" | "TERMINATED" | "BAD_TIME" | "FUTURE" | "ALREADY_IN" | "NO_OPEN_CHECK_IN" | "OUT_OF_ORDER"; employeeId?: string };

/**
 * Turns the punches into attendance, oldest first. With no direction a punch toggles: the first one of a person opens
 * the day and the next closes it. A punch repeated by the reader (same moment, or a double scan) changes nothing.
 */
export async function processPunches(company: HrCompany, punches: PunchInput[], source: HrAttendanceSource, deviceId: string | null): Promise<PunchResult[]> {
  await assertCompanyActive(company);
  const parsed = punches.map((p, index) => ({ p, index, when: parseWhen(p.at, company.timezone) }));
  const order = [...parsed].sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0) || a.index - b.index);
  const out: PunchResult[] = new Array(punches.length);
  const employees = new Map<string, { id: string; employmentStatus: string } | null>();
  const now = Date.now();

  for (const { p, index, when } of order) {
    const base = { code: p.code, at: p.at };
    if (!when) { out[index] = { ...base, result: "BAD_TIME" }; continue; }
    if (when.getTime() > now + FUTURE_SLACK_MS) { out[index] = { ...base, result: "FUTURE" }; continue; }
    if (!employees.has(p.code)) employees.set(p.code, await prisma.hrEmployee.findFirst({ where: { companyId: company.id, deviceCode: p.code }, select: { id: true, employmentStatus: true } }));
    const employee = employees.get(p.code);
    if (!employee) { out[index] = { ...base, result: "UNKNOWN_CODE" }; continue; }
    if (employee.employmentStatus === "TERMINATED") { out[index] = { ...base, result: "TERMINATED", employeeId: employee.id }; continue; }
    const result = await applyPunch(company.id, employee.id, when, p.direction, source, deviceId);
    out[index] = { ...base, result, employeeId: employee.id };
  }
  return out;
}

async function applyPunch(companyId: string, employeeId: string, when: Date, direction: "IN" | "OUT" | undefined, source: HrAttendanceSource, deviceId: string | null): Promise<PunchResult["result"]> {
  const t = when.getTime();
  // the same moment again, or a double scan right after the last event of this person
  const near = await prisma.hrAttendance.findFirst({
    where: { employeeId, OR: [{ checkIn: { gte: new Date(t - DOUBLE_SCAN_SECONDS * 1000), lte: new Date(t + DOUBLE_SCAN_SECONDS * 1000) } }, { checkOut: { gte: new Date(t - DOUBLE_SCAN_SECONDS * 1000), lte: new Date(t + DOUBLE_SCAN_SECONDS * 1000) } }] },
    select: { id: true },
  });
  if (near) return "DUPLICATE";
  const open = await prisma.hrAttendance.findFirst({ where: { employeeId, checkOut: null }, orderBy: { checkIn: "desc" } });
  const wantsOut = direction === "OUT" || (direction === undefined && !!open);
  if (wantsOut) {
    if (!open) return "NO_OPEN_CHECK_IN";
    if (t <= open.checkIn.getTime()) return "OUT_OF_ORDER";
    const closed = await prisma.hrAttendance.updateMany({ where: { id: open.id, checkOut: null }, data: { checkOut: when } });
    return closed.count === 1 ? "CHECKED_OUT" : "NO_OPEN_CHECK_IN";
  }
  if (open) return "ALREADY_IN";
  try {
    await prisma.hrAttendance.create({ data: { companyId, employeeId, checkIn: when, source, deviceId } });
    return "CHECKED_IN";
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "ALREADY_IN";
    throw err;
  }
}

/**
 * A file from a reader (or a spreadsheet): one punch per line, "code, date time, IN|OUT" with the direction optional.
 * The separator is a comma, a semicolon or a tab; a first line that is not a punch (a header) is skipped.
 */
export function parseCsv(text: string): { punches: PunchInput[]; skipped: number } {
  const punches: PunchInput[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const [code, at, dir] = cells;
    const direction = dir ? (/^(in|i|check.?in|دخول|حضور)$/i.test(dir) ? "IN" : /^(out|o|check.?out|خروج|انصراف)$/i.test(dir) ? "OUT" : undefined) : undefined;
    if (!code || !at || !/^\d{4}-\d{2}-\d{2}/.test(at)) { skipped++; continue; }
    punches.push({ code, at, ...(direction ? { direction } : {}) });
  }
  return { punches, skipped };
}

export async function importCsv(actor: HrActor, text: string) {
  const { punches, skipped } = parseCsv(text);
  if (punches.length === 0) throw new ApiError(400, "BAD_REQUEST", "لم نجد أي سطر حضور في الملف");
  if (punches.length > 2000) throw new ApiError(400, "BAD_REQUEST", "الملف كبير، قسّمه إلى ملفات أصغر (2000 سطر في المرة)");
  const results: PunchResult[] = [];
  for (let i = 0; i < punches.length; i += MAX_PUNCHES) results.push(...(await processPunches(actor.company, punches.slice(i, i + MAX_PUNCHES), "IMPORT", null)));
  const summary = tally(results);
  await hrAudit(actor.company.id, actor.userId, "attendance.import", "HrAttendance", actor.company.id, { lines: punches.length, skipped, ...summary });
  return { lines: punches.length, skipped, summary, problems: results.filter((r) => !["CHECKED_IN", "CHECKED_OUT", "DUPLICATE"].includes(r.result)).slice(0, 50) };
}

export function tally(results: PunchResult[]) {
  const out: Record<string, number> = {};
  for (const r of results) out[r.result] = (out[r.result] ?? 0) + 1;
  return out;
}

import { HrActor, HrMe, assertCompanyActive } from "./hrAccess.service";
import { PhoneInfo, assertOwnPhone } from "./hrDeviceLock.service";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";

export const MAX_POINTS = 50;
const KEEP_DAYS = 30;
export type PointInput = { latitude: number; longitude: number; accuracy?: number; speed?: number; at: string };

/**
 * The phone of a tracked employee (a driver or distributor) reports where it is. Accepted only while the employee is
 * checked in, so nothing is recorded off the clock, and only from their registered phone when the company locks phones.
 */
export async function reportPoints(me: HrMe, points: PointInput[], phone: PhoneInfo) {
  await assertCompanyActive(me.company);
  if (!me.employee.tracksLocation) throw new ApiError(403, "TRACKING_OFF", "تتبّع الموقع مو مفعّل لحسابك");
  await assertOwnPhone(me, phone);
  const open = await prisma.hrAttendance.findFirst({ where: { employeeId: me.employee.id, checkOut: null }, select: { id: true } });
  if (!open) throw new ApiError(409, "NOT_CHECKED_IN", "سجّل حضورك أول، التتبّع بيشتغل وقت الدوام بس");
  const now = Date.now();
  const rows = points
    .map((p) => ({ ...p, t: new Date(p.at).getTime() }))
    .filter((p) => Number.isFinite(p.t) && p.t <= now + 5 * 60_000 && p.t >= now - 24 * 3_600_000)
    .map((p) => ({ companyId: me.company.id, employeeId: me.employee.id, latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy ?? null, speed: p.speed ?? null, recordedAt: new Date(p.t) }));
  if (rows.length) await prisma.hrLocationPoint.createMany({ data: rows });
  // nothing is kept longer than 30 days
  await prisma.hrLocationPoint.deleteMany({ where: { employeeId: me.employee.id, recordedAt: { lt: new Date(now - KEEP_DAYS * 86_400_000) } } });
  return { saved: rows.length };
}

const toRad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(pts: { latitude: number; longitude: number }[]) {
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return Math.round(km * 100) / 100;
}

/** Where each tracked employee is now: the latest point, and whether they are checked in. */
export async function currentLocations(actor: HrActor) {
  const emps = await prisma.hrEmployee.findMany({
    where: { companyId: actor.company.id, tracksLocation: true, employmentStatus: { not: "TERMINATED" } },
    select: { id: true, firstName: true, lastName: true, position: true },
    orderBy: { firstName: "asc" },
  });
  const out = [];
  for (const e of emps) {
    const [latest, open] = await Promise.all([
      prisma.hrLocationPoint.findFirst({ where: { employeeId: e.id }, orderBy: { recordedAt: "desc" }, select: { latitude: true, longitude: true, accuracy: true, recordedAt: true } }),
      prisma.hrAttendance.findFirst({ where: { employeeId: e.id, checkOut: null }, select: { checkIn: true } }),
    ]);
    out.push({ employee: e, onShift: !!open, checkedInAt: open?.checkIn ?? null, latest });
  }
  return out;
}

/** One employee's path between two moments (default: today so far), oldest first, with the distance covered. */
export async function route(actor: HrActor, employeeId: string, from?: string, to?: string) {
  const emp = await prisma.hrEmployee.findFirst({ where: { id: employeeId, companyId: actor.company.id }, select: { id: true, firstName: true, lastName: true, tracksLocation: true } });
  if (!emp) throw new ApiError(404, "NOT_FOUND", "الموظف غير موجود");
  const start = from ? new Date(from) : new Date(new Date().setUTCHours(0, 0, 0, 0));
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new ApiError(400, "BAD_REQUEST", "الفترة غير صحيحة");
  const points = await prisma.hrLocationPoint.findMany({ where: { employeeId, recordedAt: { gte: start, lte: end } }, orderBy: { recordedAt: "asc" }, take: 5000, select: { latitude: true, longitude: true, speed: true, recordedAt: true } });
  return { employee: emp, from: start.toISOString(), to: end.toISOString(), points, distanceKm: distanceKm(points) };
}

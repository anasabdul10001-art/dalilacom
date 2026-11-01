import { DoctorAppointmentStatus, DoctorPatientRecordKind, DoctorPatientStatus, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { notify } from "../services/notification.service";
import { openingHoursSchema, DAY_KEYS } from "../services/hours.service";
import { decryptJson, encryptJson } from "../services/crypto.service";
import { isFitnessProviderCategory } from "../services/fitnessProfile.service";

export const doctorAppointmentsRouter = Router();

const slotSizes = [10, 15, 20, 30, 45, 60] as const;
const settingSchema = z.object({ enabled: z.boolean(), slotMinutes: z.enum(["10", "15", "20", "30", "45", "60"]).or(z.number().refine((n) => slotSizes.includes(n as (typeof slotSizes)[number]))).transform(Number), advanceDays: z.number().int().min(7).max(90) });

type Doctor = {
  id: string; userId: string; businessName: string; address: string | null; phone: string | null; openingHours: unknown;
  user: { countryCode: string | null };
  category: { id: string; slug: string; parentId: string | null };
};

async function findDoctor(id: string): Promise<Doctor | null> {
  const doctor = await prisma.merchantProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, businessName: true, address: true, phone: true, openingHours: true, user: { select: { countryCode: true } }, category: { select: { id: true, slug: true, parentId: true } } },
  }) as Doctor | null;
  if (!doctor) return null;
  let category: { id: string; slug: string; parentId: string | null } | null = doctor.category;
  let isDoctor = false;
  while (category) {
    if (category.slug === "health-doctors") { isDoctor = true; break; }
    category = category.parentId ? await prisma.category.findUnique({ where: { id: category.parentId }, select: { id: true, slug: true, parentId: true } }) : null;
  }
  if (!isDoctor && !(await isFitnessProviderCategory(doctor.category.id))) return null;
  const approved = await prisma.merchantProfile.findUnique({ where: { id }, select: { approvalStatus: true } });
  return approved?.approvalStatus === "APPROVED" ? doctor : null;
}

async function doctorTimezone(doctor: Doctor) {
  if (doctor.user.countryCode) {
    const country = await prisma.country.findUnique({ where: { isoCode2: doctor.user.countryCode }, select: { timezone: true } });
    if (country?.timezone) return country.timezone;
  }
  return (await prisma.country.findFirst({ orderBy: { createdAt: "asc" }, select: { timezone: true } }))?.timezone || "UTC";
}

function dateKeyParts(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
}

function addDate(key: string, offset: number) {
  const p = dateKeyParts(key)!;
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localToUtc(date: string, minuteOfDay: number, timezone: string): Date {
  const p = dateKeyParts(date)!;
  const hour = Math.floor(minuteOfDay / 60); const minute = minuteOfDay % 60;
  const target = Date.UTC(p.year, p.month - 1, p.day, hour, minute);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const delta = represented - target;
    if (!delta) break;
    guess -= delta;
  }
  return new Date(guess);
}

function dayOfWeek(key: string) { const p = dateKeyParts(key)!; return DAY_KEYS[new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).getUTCDay()]; }

function hasOfficeHours(raw: unknown) {
  const parsed = openingHoursSchema.safeParse(raw);
  return parsed.success && DAY_KEYS.some((day) => (parsed.data[day] || []).some((range) => range.open !== range.close));
}

async function scheduleSlots(doctor: Doctor, key: string, setting: { enabled: boolean; slotMinutes: number; advanceDays: number }, timezone: string) {
  if (!setting.enabled) return [];
  const parsedHours = openingHoursSchema.safeParse(doctor.openingHours);
  if (!parsedHours.success) return [];
  const ranges = parsedHours.data[dayOfWeek(key)] || [];
  const from = localToUtc(key, 0, timezone);
  const until = localToUtc(addDate(key, 1), 0, timezone);
  const existing = await prisma.doctorAppointment.findMany({ where: { doctorMerchantId: doctor.id, status: DoctorAppointmentStatus.CONFIRMED, startsAt: { lt: until }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } });
  const now = Date.now();
  const minimum = now + 2 * 60 * 60 * 1000;
  const slots: { startsAt: string; endsAt: string; time: string }[] = [];
  for (const range of ranges) {
    const [openH, openM] = range.open.split(":").map(Number); const [closeH, closeM] = range.close.split(":").map(Number);
    const open = openH * 60 + openM; const close = closeH * 60 + closeM;
    // Overnight ranges are shown as unavailable rather than offering appointments past midnight.
    if (close <= open) continue;
    for (let minute = open; minute + setting.slotMinutes <= close; minute += setting.slotMinutes) {
      const startsAt = localToUtc(key, minute, timezone);
      const endsAt = localToUtc(key, minute + setting.slotMinutes, timezone);
      if (startsAt.getTime() < minimum || endsAt <= startsAt || endsAt.getTime() <= now) continue;
      if (existing.some((booking) => booking.startsAt < endsAt && booking.endsAt > startsAt)) continue;
      slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` });
    }
  }
  return slots;
}

function dateTimeText(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("ar", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(value);
}

doctorAppointmentsRouter.get("/doctors/:doctorId/slots", route(async (req, res) => {
  const doctor = await findDoctor(req.params.doctorId);
  if (!doctor) return sendError(res, 404, "NOT_FOUND", "المدرب أو الطبيب غير متوفر للحجز");
  const timezone = await doctorTimezone(doctor);
  const setting = await prisma.doctorAppointmentSetting.findUnique({ where: { doctorMerchantId: doctor.id } });
  if (!setting?.enabled) return res.json({ doctor: { id: doctor.id, name: doctor.businessName, address: doctor.address, phone: doctor.phone }, timezone, days: [] });
  const from = typeof req.query.from === "string" && dateKeyParts(req.query.from) ? req.query.from : localDate(new Date(), timezone);
  const requested = Number(req.query.days || 14);
  const count = Number.isInteger(requested) ? Math.max(1, Math.min(31, requested)) : 14;
  const today = localDate(new Date(), timezone);
  if (from < today || from > addDate(today, setting.advanceDays)) return sendError(res, 400, "BAD_DATE", "اختر تاريخًا ضمن الفترة المتاحة للحجز");
  const last = [addDate(from, count - 1), addDate(today, setting.advanceDays)].sort()[0];
  const days = [];
  for (let key = from; key <= last; key = addDate(key, 1)) {
    days.push({ date: key, slots: await scheduleSlots(doctor, key, setting, timezone) });
  }
  res.json({ doctor: { id: doctor.id, name: doctor.businessName, address: doctor.address, phone: doctor.phone }, timezone, slotMinutes: setting.slotMinutes, days });
}));

doctorAppointmentsRouter.use(requireAuth);

doctorAppointmentsRouter.get("/settings", route(async (req, res) => {
  if (req.user!.role !== Role.MERCHANT) return sendError(res, 403, "FORBIDDEN", "هذه الإعدادات للطبيب فقط");
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const doctor = merchant ? await findDoctor(merchant.id) : null;
  if (!doctor) return sendError(res, 403, "DOCTOR_NOT_APPROVED", "تحتاج صفحة مدرب أو طبيب معتمدة لإعداد الحجز");
  const setting = await prisma.doctorAppointmentSetting.findUnique({ where: { doctorMerchantId: doctor.id } });
  res.json({ enabled: setting?.enabled ?? false, slotMinutes: setting?.slotMinutes ?? 30, advanceDays: setting?.advanceDays ?? 30, hasHours: hasOfficeHours(doctor.openingHours) });
}));

doctorAppointmentsRouter.put("/settings", route(async (req, res) => {
  if (req.user!.role !== Role.MERCHANT) return sendError(res, 403, "FORBIDDEN", "هذه الإعدادات للطبيب فقط");
  const parsed = settingSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const doctor = merchant ? await findDoctor(merchant.id) : null;
  if (!doctor) return sendError(res, 403, "DOCTOR_NOT_APPROVED", "تحتاج صفحة مدرب أو طبيب معتمدة لإعداد الحجز");
  if (parsed.data.enabled && !hasOfficeHours(doctor.openingHours)) return sendError(res, 400, "OFFICE_HOURS_REQUIRED", "حدد ساعات عمل العيادة أولًا");
  const currentSetting = await prisma.doctorAppointmentSetting.findUnique({ where: { doctorMerchantId: doctor.id } });
  if (currentSetting && currentSetting.slotMinutes !== parsed.data.slotMinutes) {
    const hasUpcoming = await prisma.doctorAppointment.count({ where: { doctorMerchantId: doctor.id, status: DoctorAppointmentStatus.CONFIRMED, startsAt: { gt: new Date() } } });
    if (hasUpcoming) return sendError(res, 409, "UPCOMING_APPOINTMENTS", "لا يمكن تغيير مدة الموعد مع وجود حجوزات قادمة. ألغِ الحجوزات أولًا أو غيّر المدة بعد انتهائها.");
  }
  const setting = await prisma.doctorAppointmentSetting.upsert({ where: { doctorMerchantId: doctor.id }, create: { doctorMerchantId: doctor.id, ...parsed.data }, update: parsed.data });
  res.json({ enabled: setting.enabled, slotMinutes: setting.slotMinutes, advanceDays: setting.advanceDays });
}));

doctorAppointmentsRouter.post("/doctors/:doctorId/book", route(async (req, res) => {
  const parsed = z.object({ startsAt: z.string().datetime({ offset: true }), kind: z.enum(["VISIT", "FOLLOW_UP"]).default("VISIT"), shareMedicalFile: z.boolean().default(false), visitReason: z.string().trim().max(1000).default("") }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const doctor = await findDoctor(req.params.doctorId);
  if (!doctor) return sendError(res, 404, "NOT_FOUND", "الطبيب غير متوفر للحجز");
  if (doctor.userId === req.user!.id) return sendError(res, 400, "BAD_REQUEST", "لا يمكنك حجز موعد عند حسابك");
  const setting = await prisma.doctorAppointmentSetting.findUnique({ where: { doctorMerchantId: doctor.id } });
  if (!setting?.enabled) return sendError(res, 409, "BOOKING_DISABLED", "الحجز غير متاح حاليًا");
  const timezone = await doctorTimezone(doctor);
  const startsAt = new Date(parsed.data.startsAt);
  const key = localDate(startsAt, timezone);
  if (key > addDate(localDate(new Date(), timezone), setting.advanceDays)) return sendError(res, 400, "BAD_DATE", "هذا الموعد خارج فترة الحجز المتاحة");
  const available = await scheduleSlots(doctor, key, setting, timezone);
  const slot = available.find((item) => item.startsAt === startsAt.toISOString());
  if (!slot) return sendError(res, 409, "SLOT_UNAVAILABLE", "هذا الوقت لم يعد متاحًا. حدّث الأوقات واختر موعدًا آخر.");
  let appointment;
  try {
    appointment = await prisma.doctorAppointment.create({ data: { doctorMerchantId: doctor.id, patientUserId: req.user!.id, startsAt, endsAt: new Date(slot.endsAt), kind: parsed.data.kind }, select: { id: true, startsAt: true, endsAt: true, status: true, kind: true } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return sendError(res, 409, "SLOT_UNAVAILABLE", "حجز شخص آخر هذا الموعد للتو. حدّث الأوقات واختر موعدًا آخر.");
    throw error;
  }
  if (parsed.data.shareMedicalFile) {
    await prisma.doctorPatientConnection.upsert({
      where: { doctorMerchantId_patientUserId: { doctorMerchantId: doctor.id, patientUserId: req.user!.id } },
      create: { doctorMerchantId: doctor.id, patientUserId: req.user!.id, status: DoctorPatientStatus.ACTIVE, requestedAt: new Date(), consentedAt: new Date() },
      update: { status: DoctorPatientStatus.ACTIVE, consentedAt: new Date(), revokedAt: null },
    });
    if (parsed.data.visitReason) {
      await prisma.doctorAppointment.update({ where: { id: appointment.id }, data: { complaintEnc: encryptJson({ text: parsed.data.visitReason }) } });
    }
  }
  const patient = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { fullName: true } });
  const time = dateTimeText(startsAt, timezone);
  await Promise.all([
    notify({ userId: doctor.userId, type: "SYSTEM", title: "حجز موعد جديد", body: `${patient?.fullName || "مستخدم"} حجز موعدًا بتاريخ ${time}.`, data: { type: "doctor_appointment", appointmentId: appointment.id }, email: false }),
    notify({ userId: req.user!.id, type: "SYSTEM", title: `تم تثبيت موعدك لدى ${doctor.businessName}`, body: `موعدك بتاريخ ${time}.`, data: { type: "doctor_appointment", appointmentId: appointment.id }, email: false }),
  ]);
  res.status(201).json({ ...appointment, doctor: { id: doctor.id, name: doctor.businessName, address: doctor.address, phone: doctor.phone }, timezone });
}));

doctorAppointmentsRouter.get("/mine", route(async (req, res) => {
  const items = await prisma.doctorAppointment.findMany({ where: { patientUserId: req.user!.id, startsAt: { gte: new Date() } }, select: { id: true, startsAt: true, endsAt: true, kind: true, status: true, doctor: { select: { id: true, businessName: true, address: true, phone: true } } }, orderBy: { startsAt: "asc" }, take: 200 });
  res.json({ items });
}));

doctorAppointmentsRouter.get("/doctor/mine", route(async (req, res) => {
  if (req.user!.role !== Role.MERCHANT) return sendError(res, 403, "FORBIDDEN", "هذه القائمة للطبيب فقط");
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const doctor = merchant ? await findDoctor(merchant.id) : null;
  if (!doctor) return sendError(res, 403, "DOCTOR_NOT_APPROVED", "تحتاج صفحة مدرب أو طبيب معتمدة");
  const items = await prisma.doctorAppointment.findMany({ where: { doctorMerchantId: doctor.id, startsAt: { gte: new Date() } }, select: { id: true, startsAt: true, endsAt: true, kind: true, complaintEnc: true, status: true, patient: { select: { id: true, fullName: true, email: true, phone: true } } }, orderBy: { startsAt: "asc" }, take: 500 });
  const connections = await prisma.doctorPatientConnection.findMany({ where: { doctorMerchantId: doctor.id, status: DoctorPatientStatus.ACTIVE, patientUserId: { in: [...new Set(items.map((item) => item.patient.id))] } }, select: { patientUserId: true, records: { where: { kind: DoctorPatientRecordKind.DIAGNOSIS }, orderBy: { createdAt: "desc" }, take: 1, select: { contentEnc: true, createdAt: true } } } });
  const byPatient = new Map(connections.map((connection) => [connection.patientUserId, connection.records[0] ?? null]));
  const sharingPatients = new Set(connections.map((connection) => connection.patientUserId));
  res.json({ items: items.map((item) => {
    const record = byPatient.get(item.patient.id);
    let diagnosis: { title?: string; body?: string } | null = null;
    if (record) { try { diagnosis = decryptJson(record.contentEnc); } catch { diagnosis = null; } }
    let visitReason: string | null = null;
    if (sharingPatients.has(item.patient.id) && item.complaintEnc) { try { visitReason = decryptJson<{ text?: string }>(item.complaintEnc).text || null; } catch { visitReason = null; } }
    return { ...item, medicalFileShared: sharingPatients.has(item.patient.id), visitReason, latestDiagnosis: diagnosis ? { ...diagnosis, createdAt: record?.createdAt } : null };
  }) });
}));

doctorAppointmentsRouter.post("/:id/cancel", route(async (req, res) => {
  const appointment = await prisma.doctorAppointment.findUnique({ where: { id: req.params.id }, select: { id: true, doctorMerchantId: true, patientUserId: true, startsAt: true, status: true, doctor: { select: { userId: true, businessName: true } }, patient: { select: { fullName: true } } } });
  if (!appointment || (appointment.patientUserId !== req.user!.id && appointment.doctor.userId !== req.user!.id)) return sendError(res, 404, "NOT_FOUND", "الموعد غير موجود");
  if (appointment.status !== DoctorAppointmentStatus.CONFIRMED) return sendError(res, 409, "APPOINTMENT_NOT_ACTIVE", "هذا الموعد لم يعد قائمًا");
  if (appointment.startsAt <= new Date()) return sendError(res, 400, "APPOINTMENT_STARTED", "لا يمكن إلغاء موعد بدأ أو انتهى");
  await prisma.doctorAppointment.update({ where: { id: appointment.id }, data: { status: DoctorAppointmentStatus.CANCELLED } });
  const cancelledByDoctor = appointment.doctor.userId === req.user!.id;
  const recipient = cancelledByDoctor ? appointment.patientUserId : appointment.doctor.userId;
  const text = cancelledByDoctor ? `ألغى الطبيب ${appointment.doctor.businessName} موعدك.` : `ألغى ${appointment.patient.fullName} الموعد.`;
  await notify({ userId: recipient, type: "SYSTEM", title: "تم إلغاء الموعد", body: text, data: { type: "doctor_appointment_cancelled", appointmentId: appointment.id }, email: false });
  res.json({ ok: true });
}));

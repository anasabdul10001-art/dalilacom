import { DoctorAppointmentStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { notify } from "./notification.service";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function timeForDoctor(date: Date, countryCode: string | null) {
  const country = countryCode ? await prisma.country.findUnique({ where: { isoCode2: countryCode }, select: { timezone: true } }) : null;
  const timezone = country?.timezone || "UTC";
  try {
    return new Intl.DateTimeFormat("ar", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("ar", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(date);
  }
}

/**
 * Reminders are claimed with a conditional update, so concurrent API instances cannot notify twice.
 * The 24-hour reminder may be delivered any time from 75 minutes to 24.5 hours before the visit if
 * a sleeping server wakes late. The one-hour reminder has its own shorter window.
 */
export async function sendDueDoctorAppointmentReminders(now = new Date()) {
  const windows = [
    { kind: "24h" as const, from: new Date(now.getTime() + 75 * MINUTE), until: new Date(now.getTime() + 24.5 * HOUR) },
    { kind: "1h" as const, from: now, until: new Date(now.getTime() + 75 * MINUTE) },
  ];
  for (const window of windows) {
    const candidates = await prisma.doctorAppointment.findMany({
      where: {
        status: DoctorAppointmentStatus.CONFIRMED,
        startsAt: { gt: window.from, lte: window.until },
        ...(window.kind === "24h" ? { reminder24hSentAt: null } : { reminder1hSentAt: null }),
      },
      select: {
        id: true, startsAt: true, doctorMerchantId: true, patientUserId: true,
        doctor: { select: { userId: true, businessName: true, user: { select: { countryCode: true } } } },
        patient: { select: { fullName: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    for (const appointment of candidates) {
      const claimed = await prisma.doctorAppointment.updateMany({
        where: { id: appointment.id, status: DoctorAppointmentStatus.CONFIRMED, ...(window.kind === "24h" ? { reminder24hSentAt: null } : { reminder1hSentAt: null }) },
        data: window.kind === "24h" ? { reminder24hSentAt: now } : { reminder1hSentAt: now },
      });
      if (!claimed.count) continue;
      const time = await timeForDoctor(appointment.startsAt, appointment.doctor.user.countryCode);
      const isDay = window.kind === "24h";
      await Promise.all([
        notify({
          userId: appointment.doctor.userId,
          type: "SYSTEM",
          title: isDay ? "تذكير: لديك موعد غدًا" : "تذكير: لديك موعد بعد أقل من ساعة",
          body: `موعدك مع ${appointment.patient.fullName} في ${time}.`,
          data: { type: "doctor_appointment", appointmentId: appointment.id, reminder: window.kind },
          email: false,
        }),
        notify({
          userId: appointment.patientUserId,
          type: "SYSTEM",
          title: isDay ? "تذكير بموعدك غدًا" : "تذكير: موعدك بعد أقل من ساعة",
          body: `موعدك لدى ${appointment.doctor.businessName} في ${time}.`,
          data: { type: "doctor_appointment", appointmentId: appointment.id, reminder: window.kind },
          email: false,
        }),
      ]);
    }
  }
}

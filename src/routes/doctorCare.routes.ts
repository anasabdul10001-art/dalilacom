import { DoctorPatientRecordKind, DoctorPatientStatus, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { decryptJson, encryptJson } from "../services/crypto.service";
import { notify } from "../services/notification.service";

export const doctorCareRouter = Router();
doctorCareRouter.use(requireAuth);

async function doctorProfileFor(userId: string) {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      approvalStatus: true,
      category: { select: { id: true, slug: true, parentId: true } },
    },
  });
  if (!merchant) return null;

  let category: { id: string; slug: string; parentId: string | null } | null = merchant.category;
  let isDoctor = false;
  while (category) {
    if (category.slug === "health-doctors") { isDoctor = true; break; }
    category = category.parentId
      ? await prisma.category.findUnique({ where: { id: category.parentId }, select: { id: true, slug: true, parentId: true } })
      : null;
  }
  return isDoctor ? merchant : null;
}

async function requireApprovedDoctor(userId: string) {
  const doctor = await doctorProfileFor(userId);
  if (!doctor) return { doctor: null, status: 403 as const };
  if (doctor.approvalStatus !== "APPROVED") return { doctor: null, status: 403 as const };
  return { doctor, status: 200 as const };
}

const recordSelect = { id: true, kind: true, contentEnc: true, createdAt: true, author: { select: { fullName: true } } } as const;

function revealRecord(record: { id: string; kind: DoctorPatientRecordKind; contentEnc: string; createdAt: Date; author: { fullName: string } }) {
  const content = decryptJson<{ title: string; body: string }>(record.contentEnc);
  return { id: record.id, kind: record.kind, title: content.title, body: content.body, createdAt: record.createdAt, authorName: record.author.fullName };
}

doctorCareRouter.get("/", route(async (req, res) => {
  const doctor = req.user!.role === Role.MERCHANT ? await doctorProfileFor(req.user!.id) : null;
  if (doctor) {
    if (doctor.approvalStatus !== "APPROVED") return res.json({ mode: "DOCTOR", doctor: { id: doctor.id, name: doctor.businessName, approved: false }, patients: [] });
    const connections = await prisma.doctorPatientConnection.findMany({
      where: { doctorMerchantId: doctor.id, status: { in: [DoctorPatientStatus.PENDING, DoctorPatientStatus.ACTIVE] } },
      select: {
        id: true, status: true, requestedAt: true, consentedAt: true,
        patient: { select: { id: true, fullName: true, email: true } },
        records: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return res.json({ mode: "DOCTOR", doctor: { id: doctor.id, name: doctor.businessName, approved: doctor.approvalStatus === "APPROVED" }, patients: connections.map((c) => ({ id: c.id, status: c.status, requestedAt: c.requestedAt, consentedAt: c.consentedAt, patient: c.patient, lastRecordAt: c.records[0]?.createdAt ?? null })) });
  }

  const [requests, doctors] = await Promise.all([
    prisma.doctorPatientConnection.findMany({
      where: { patientUserId: req.user!.id, status: DoctorPatientStatus.PENDING },
      select: { id: true, requestedAt: true, doctor: { select: { id: true, businessName: true, category: { select: { name: true } }, address: true } } },
      orderBy: { requestedAt: "desc" }, take: 100,
    }),
    prisma.doctorPatientConnection.findMany({
      where: { patientUserId: req.user!.id, status: { in: [DoctorPatientStatus.ACTIVE, DoctorPatientStatus.REVOKED] } },
      select: { id: true, status: true, consentedAt: true, revokedAt: true, doctor: { select: { id: true, businessName: true, category: { select: { name: true } }, address: true } } },
      orderBy: { updatedAt: "desc" }, take: 200,
    }),
  ]);
  return res.json({ mode: "PATIENT", requests, doctors });
}));

const requestSchema = z.object({ email: z.string().trim().email().max(254) });
doctorCareRouter.post("/requests", route(async (req, res) => {
  if (req.user!.role !== Role.MERCHANT) return sendError(res, 403, "FORBIDDEN", "هذه الميزة متاحة لحساب الطبيب فقط");
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { doctor, status } = await requireApprovedDoctor(req.user!.id);
  if (!doctor) return sendError(res, status, "DOCTOR_NOT_APPROVED", "يجب اعتماد صفحة الطبيب أولًا");
  const patient = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true, fullName: true, isDisabled: true } });
  if (!patient || patient.isDisabled) return sendError(res, 404, "PATIENT_NOT_FOUND", "لا يوجد حساب نشط بهذا البريد؛ اطلب من المريض إنشاء حساب أولًا");
  if (patient.id === req.user!.id) return sendError(res, 400, "BAD_REQUEST", "لا يمكن إضافة حسابك كمريض لنفسك");

  const existing = await prisma.doctorPatientConnection.findUnique({ where: { doctorMerchantId_patientUserId: { doctorMerchantId: doctor.id, patientUserId: patient.id } } });
  if (existing?.status === DoctorPatientStatus.ACTIVE) return sendError(res, 409, "ALREADY_CONNECTED", "هذا المريض مرتبط بعيادتك بالفعل");
  const connection = existing
    ? await prisma.doctorPatientConnection.update({ where: { id: existing.id }, data: { status: DoctorPatientStatus.PENDING, requestedAt: new Date(), consentedAt: null, revokedAt: null } })
    : await prisma.doctorPatientConnection.create({ data: { doctorMerchantId: doctor.id, patientUserId: patient.id } });
  await notify({ userId: patient.id, type: "SYSTEM", title: `طلب ربط من ${doctor.businessName}`, body: "طبيب يطلب ربط حسابك بملفه الخاص لمتابعة مواعيدك وتعليماتك. وافق فقط إذا كنت تعرف هذا الطبيب.", data: { type: "doctor_patient_request", connectionId: connection.id }, email: false });
  res.status(201).json({ id: connection.id, status: connection.status, patient: { id: patient.id, fullName: patient.fullName } });
}));

const responseSchema = z.object({ accept: z.boolean() });
doctorCareRouter.post("/requests/:id/respond", route(async (req, res) => {
  const parsed = responseSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const connection = await prisma.doctorPatientConnection.findFirst({ where: { id: req.params.id, patientUserId: req.user!.id, status: DoctorPatientStatus.PENDING }, select: { id: true } });
  if (!connection) return sendError(res, 404, "NOT_FOUND", "الطلب غير موجود أو تمت الإجابة عنه");
  const changed = await prisma.doctorPatientConnection.updateMany({
    where: { id: connection.id, patientUserId: req.user!.id, status: DoctorPatientStatus.PENDING },
    data: parsed.data.accept ? { status: DoctorPatientStatus.ACTIVE, consentedAt: new Date() } : { status: DoctorPatientStatus.DECLINED },
  });
  if (!changed.count) return sendError(res, 409, "REQUEST_ALREADY_HANDLED", "تمت الإجابة عن الطلب مسبقًا");
  if (parsed.data.accept) {
    const doctor = await prisma.doctorPatientConnection.findUnique({ where: { id: connection.id }, select: { doctor: { select: { userId: true, businessName: true } } } });
    if (doctor) await notify({ userId: doctor.doctor.userId, type: "SYSTEM", title: "وافق المريض على الربط", body: "وافق المريض على ربط حسابه بملف عيادتك.", data: { type: "doctor_patient_consent", connectionId: connection.id }, email: false });
  }
  res.json({ ok: true, status: parsed.data.accept ? DoctorPatientStatus.ACTIVE : DoctorPatientStatus.DECLINED });
}));

doctorCareRouter.post("/connections/:id/revoke", route(async (req, res) => {
  const connection = await prisma.doctorPatientConnection.findUnique({ where: { id: req.params.id }, select: { id: true, patientUserId: true, doctorMerchantId: true, status: true } });
  if (!connection) return sendError(res, 404, "NOT_FOUND", "الربط غير موجود");
  const isPatient = connection.patientUserId === req.user!.id;
  const doctor = !isPatient && req.user!.role === Role.MERCHANT ? await doctorProfileFor(req.user!.id) : null;
  if (!isPatient && doctor?.id !== connection.doctorMerchantId) return sendError(res, 404, "NOT_FOUND", "الربط غير موجود");
  if (connection.status === DoctorPatientStatus.REVOKED || connection.status === DoctorPatientStatus.DECLINED) return res.json({ ok: true });
  await prisma.doctorPatientConnection.update({ where: { id: connection.id }, data: { status: DoctorPatientStatus.REVOKED, revokedAt: new Date() } });
  res.json({ ok: true });
}));

doctorCareRouter.get("/connections/:id/records", route(async (req, res) => {
  const connection = await prisma.doctorPatientConnection.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, patientUserId: true, doctorMerchantId: true } });
  if (!connection) return sendError(res, 404, "NOT_FOUND", "الملف غير موجود");
  const isPatient = connection.patientUserId === req.user!.id;
  if (isPatient) {
    if (connection.status === DoctorPatientStatus.PENDING || connection.status === DoctorPatientStatus.DECLINED) return sendError(res, 403, "CONSENT_REQUIRED", "وافق على طلب الطبيب أولًا");
  } else {
    if (req.user!.role !== Role.MERCHANT) return sendError(res, 404, "NOT_FOUND", "الملف غير موجود");
    const { doctor } = await requireApprovedDoctor(req.user!.id);
    if (!doctor || doctor.id !== connection.doctorMerchantId || connection.status !== DoctorPatientStatus.ACTIVE) return sendError(res, 404, "NOT_FOUND", "الملف غير موجود");
  }
  const records = await prisma.doctorPatientRecord.findMany({ where: { connectionId: connection.id }, select: recordSelect, orderBy: { createdAt: "desc" }, take: 300 });
  res.json({ items: records.map(revealRecord) });
}));

const recordSchema = z.object({
  kind: z.nativeEnum(DoctorPatientRecordKind),
  title: z.string().trim().min(2).max(100),
  body: z.string().trim().min(2).max(4000),
});
doctorCareRouter.post("/connections/:id/records", route(async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (req.user!.role !== Role.MERCHANT) return sendError(res, 403, "FORBIDDEN", "إضافة الملاحظات للطبيب فقط");
  const { doctor } = await requireApprovedDoctor(req.user!.id);
  if (!doctor) return sendError(res, 403, "DOCTOR_NOT_APPROVED", "يجب اعتماد صفحة الطبيب أولًا");
  const connection = await prisma.doctorPatientConnection.findFirst({ where: { id: req.params.id, doctorMerchantId: doctor.id, status: DoctorPatientStatus.ACTIVE }, select: { id: true } });
  if (!connection) return sendError(res, 404, "NOT_FOUND", "المريض غير مرتبط أو لم يمنح الموافقة");
  const record = await prisma.doctorPatientRecord.create({ data: { connectionId: connection.id, authorUserId: req.user!.id, kind: parsed.data.kind, contentEnc: encryptJson({ title: parsed.data.title, body: parsed.data.body }) }, select: recordSelect });
  const patient = await prisma.doctorPatientConnection.findUnique({ where: { id: connection.id }, select: { patientUserId: true } });
  if (patient) await notify({ userId: patient.patientUserId, type: "SYSTEM", title: `تحديث جديد من ${doctor.businessName}`, body: "أضاف طبيبك تحديثًا خاصًا إلى ملفك. افتح قسم الرعاية الطبية لمراجعته.", data: { type: "doctor_patient_record", connectionId: connection.id }, email: false });
  res.status(201).json(revealRecord(record));
}));

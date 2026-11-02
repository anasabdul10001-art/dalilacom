import { FitnessEnrollmentStatus, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../prisma";
import { isFitnessProviderCategory } from "../services/fitnessProfile.service";
import { notify } from "../services/notification.service";

export const fitnessEnrollmentsRouter = Router();
const offerView = { include: { merchant: { select: { userId: true, businessName: true, categoryId: true, fitnessProfile: { select: { displayName: true } } } } } } as const;

fitnessEnrollmentsRouter.get("/mine", requireAuth, requireRole(Role.CUSTOMER), route(async (req, res) => {
  const items = await prisma.fitnessEnrollment.findMany({ where: { userId: req.user!.id }, include: { offer: offerView, merchant: { select: { businessName: true, fitnessProfile: { select: { displayName: true } } } } }, orderBy: { updatedAt: "desc" } });
  res.json({ items });
}));

fitnessEnrollmentsRouter.post("/offers/:offerId/request", requireAuth, requireRole(Role.CUSTOMER), route(async (req, res) => {
  const offer = await prisma.fitnessOffer.findFirst({ where: { id: req.params.offerId, isActive: true }, include: offerView.include });
  if (!offer || !(await isFitnessProviderCategory(offer.merchant.categoryId))) return sendError(res, 404, "OFFER_NOT_FOUND", "الباقة غير متاحة حاليًا");
  if (offer.merchant.userId === req.user!.id) return sendError(res, 400, "OWN_OFFER", "ما فيك تطلب باقتك أنت");
  const prior = await prisma.fitnessEnrollment.findUnique({ where: { offerId_userId: { offerId: offer.id, userId: req.user!.id } } });
  if (prior && (prior.status === FitnessEnrollmentStatus.REQUESTED || prior.status === FitnessEnrollmentStatus.ACCEPTED)) return sendError(res, 409, "REQUEST_EXISTS", "عندك طلب قائم لهذه الباقة بالفعل");
  const item = await prisma.fitnessEnrollment.upsert({
    where: { offerId_userId: { offerId: offer.id, userId: req.user!.id } },
    create: { offerId: offer.id, merchantId: offer.merchantId, userId: req.user!.id },
    update: { status: FitnessEnrollmentStatus.REQUESTED, startsAt: null, endsAt: null, createdAt: new Date() },
    include: { offer: true },
  });
  await notify({ userId: offer.merchant.userId, type: "SYSTEM", title: "طلب انضمام جديد لباقتك", body: item.offer.title, data: { type: "fitness_enrollment", enrollmentId: item.id }, email: false });
  res.status(201).json(item);
}));

fitnessEnrollmentsRouter.post("/mine/:id/cancel", requireAuth, requireRole(Role.CUSTOMER), route(async (req, res) => {
  const item = await prisma.fitnessEnrollment.findFirst({ where: { id: req.params.id, userId: req.user!.id, status: FitnessEnrollmentStatus.REQUESTED }, include: { merchant: { select: { userId: true } }, offer: { select: { title: true } } } });
  if (!item) return sendError(res, 404, "REQUEST_NOT_FOUND", "طلب الانضمام غير موجود أو لم يعد بانتظار الرد");
  await prisma.fitnessEnrollment.update({ where: { id: item.id }, data: { status: FitnessEnrollmentStatus.CANCELLED } });
  await notify({ userId: item.merchant.userId, type: "SYSTEM", title: "أُلغي طلب الانضمام", body: item.offer.title, data: { type: "fitness_enrollment", enrollmentId: item.id }, email: false });
  res.json({ ok: true });
}));

fitnessEnrollmentsRouter.get("/coach", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, categoryId: true } });
  if (!merchant || !(await isFitnessProviderCategory(merchant.categoryId))) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  const items = await prisma.fitnessEnrollment.findMany({ where: { merchantId: merchant.id }, include: { user: { select: { id: true, fullName: true, email: true, phone: true } }, offer: true }, orderBy: { createdAt: "desc" }, take: 300 });
  res.json({ items });
}));

fitnessEnrollmentsRouter.patch("/coach/:id", requireAuth, requireRole(Role.MERCHANT), route(async (req, res) => {
  const parsed = z.object({ status: z.enum([FitnessEnrollmentStatus.ACCEPTED, FitnessEnrollmentStatus.REJECTED, FitnessEnrollmentStatus.COMPLETED]) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, categoryId: true } });
  if (!merchant || !(await isFitnessProviderCategory(merchant.categoryId))) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  const item = await prisma.fitnessEnrollment.findFirst({ where: { id: req.params.id, merchantId: merchant.id }, include: { offer: true, user: { select: { fullName: true } } } });
  if (!item) return sendError(res, 404, "REQUEST_NOT_FOUND", "طلب الانضمام غير موجود");
  if (parsed.data.status === FitnessEnrollmentStatus.COMPLETED && item.status !== FitnessEnrollmentStatus.ACCEPTED) return sendError(res, 409, "NOT_ACTIVE", "لا يمكن إنهاء اشتراك غير مقبول");
  if (parsed.data.status !== FitnessEnrollmentStatus.COMPLETED && item.status !== FitnessEnrollmentStatus.REQUESTED) return sendError(res, 409, "NOT_PENDING", "هذا الطلب لم يعد بانتظار الرد");
  const startsAt = parsed.data.status === FitnessEnrollmentStatus.ACCEPTED ? new Date() : null;
  const endsAt = startsAt ? new Date(startsAt) : null;
  endsAt?.setMonth(endsAt.getMonth() + item.offer.durationMonths);
  const updated = await prisma.fitnessEnrollment.update({ where: { id: item.id }, data: { status: parsed.data.status, ...(parsed.data.status === FitnessEnrollmentStatus.ACCEPTED ? { startsAt, endsAt } : {}) }, include: { offer: true } });
  const title = parsed.data.status === FitnessEnrollmentStatus.ACCEPTED ? "وافق المدرب على طلب انضمامك" : parsed.data.status === FitnessEnrollmentStatus.REJECTED ? "لم يتم قبول طلب الباقة" : "انتهى اشتراكك التدريبي";
  await notify({ userId: item.userId, type: "SYSTEM", title, body: item.offer.title, data: { type: "fitness_enrollment", enrollmentId: item.id }, email: false });
  res.json(updated);
}));

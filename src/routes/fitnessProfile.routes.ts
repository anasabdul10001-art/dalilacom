import express, { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../prisma";
import { isFitnessProviderCategory } from "../services/fitnessProfile.service";
import { sniffImageMime } from "../lib/image";

export const fitnessProfileRouter = Router();
const textList = z.array(z.string().trim().min(2).max(120)).max(15);
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).nullable(),
  headline: z.string().trim().max(160).nullable(),
  yearsExperience: z.number().int().min(0).max(70).nullable(),
  specialties: textList,
  achievements: textList,
  certifications: textList,
  certificationPhotoIds: z.array(z.string().uuid()).max(12).default([]),
  paymentAccountName: z.string().trim().max(100).nullable().optional(),
  syriatelCash: z.string().trim().max(80).nullable().optional(),
  mtnCash: z.string().trim().max(80).nullable().optional(),
  shamCash: z.string().trim().max(80).nullable().optional(),
});

fitnessProfileRouter.use(requireAuth, requireRole(Role.MERCHANT));

fitnessProfileRouter.post("/photos", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: 1_500_000 }), route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, categoryId: true } });
  if (!merchant || !(await isFitnessProviderCategory(merchant.categoryId))) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل صورة JPEG أو PNG أو WebP");
  const mime = sniffImageMime(body);
  if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الصورة غير صالحة");
  const photo = await prisma.productPhoto.create({ data: { merchantId: merchant.id, mime, data: body }, select: { id: true } });
  res.status(201).json({ id: photo.id, url: "/store/photos/" + photo.id });
}));

fitnessProfileRouter.get("/me", route(async (req, res) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, categoryId: true } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "صفحة النشاط غير موجودة");
  if (!(await isFitnessProviderCategory(merchant.categoryId))) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذا الملف مخصص للمدربين والنوادي الرياضية");
  const profile = await prisma.fitnessProfile.findUnique({ where: { merchantId: merchant.id } });
  res.json(profile ?? { merchantId: merchant.id, displayName: null, headline: null, yearsExperience: null, specialties: [], achievements: [], certifications: [], certificationPhotoIds: [], paymentAccountName: null, syriatelCash: null, mtnCash: null, shamCash: null });
}));

fitnessProfileRouter.put("/me", route(async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, categoryId: true } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "صفحة النشاط غير موجودة");
  if (!(await isFitnessProviderCategory(merchant.categoryId))) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذا الملف مخصص للمدربين والنوادي الرياضية");
  const photoIds = [...new Set(parsed.data.certificationPhotoIds)];
  if (photoIds.length && await prisma.productPhoto.count({ where: { id: { in: photoIds }, merchantId: merchant.id } }) !== photoIds.length) return sendError(res, 403, "INVALID_CERTIFICATE_PHOTO", "إحدى الصور ليست مرفوعة من حسابك");
  const dedupe = (items: string[]) => [...new Set(items.map((x) => x.trim()).filter(Boolean))];
  const cleanPaymentValue = (value: string | null | undefined) => value === undefined ? undefined : value?.trim() || null;
  const data = { ...parsed.data, paymentAccountName: cleanPaymentValue(parsed.data.paymentAccountName), syriatelCash: cleanPaymentValue(parsed.data.syriatelCash), mtnCash: cleanPaymentValue(parsed.data.mtnCash), shamCash: cleanPaymentValue(parsed.data.shamCash), certificationPhotoIds: photoIds, specialties: dedupe(parsed.data.specialties), achievements: dedupe(parsed.data.achievements), certifications: dedupe(parsed.data.certifications) };
  const profile = await prisma.fitnessProfile.upsert({ where: { merchantId: merchant.id }, create: { merchantId: merchant.id, ...data }, update: data });
  res.json(profile);
}));

const offerSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMonths: z.number().int().min(1).max(24),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.enum(["USD", "SYP", "EUR", "TRY"]).default("USD"),
});
async function ownFitnessMerchant(userId: string) {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId }, select: { id: true, categoryId: true } });
  return merchant && await isFitnessProviderCategory(merchant.categoryId) ? merchant : null;
}
fitnessProfileRouter.get("/offers/me", route(async (req, res) => {
  const merchant = await ownFitnessMerchant(req.user!.id);
  if (!merchant) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  res.json({ items: await prisma.fitnessOffer.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" } }) });
}));
fitnessProfileRouter.post("/offers", route(async (req, res) => {
  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await ownFitnessMerchant(req.user!.id);
  if (!merchant) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  res.status(201).json(await prisma.fitnessOffer.create({ data: { merchantId: merchant.id, ...parsed.data } }));
}));
fitnessProfileRouter.patch("/offers/:id", route(async (req, res) => {
  const parsed = offerSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await ownFitnessMerchant(req.user!.id);
  if (!merchant) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  const updated = await prisma.fitnessOffer.updateMany({ where: { id: req.params.id, merchantId: merchant.id }, data: parsed.data });
  if (!updated.count) return sendError(res, 404, "NOT_FOUND", "العرض غير موجود");
  res.json(await prisma.fitnessOffer.findUnique({ where: { id: req.params.id } }));
}));
fitnessProfileRouter.delete("/offers/:id", route(async (req, res) => {
  const merchant = await ownFitnessMerchant(req.user!.id);
  if (!merchant) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  const deleted = await prisma.fitnessOffer.deleteMany({ where: { id: req.params.id, merchantId: merchant.id } });
  if (!deleted.count) return sendError(res, 404, "NOT_FOUND", "العرض غير موجود");
  res.status(204).end();
}));

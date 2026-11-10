import { FitnessPlanKind, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { route } from "../lib/asyncRoute";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../prisma";
import { isFitnessProviderCategory } from "../services/fitnessProfile.service";
import { notify } from "../services/notification.service";

export const fitnessPlansRouter = Router();
const dayItemsSchema = z.array(z.string().trim().min(1).max(240)).max(20).optional();
const weeklyScheduleSchema = z.object({ MONDAY: dayItemsSchema, TUESDAY: dayItemsSchema, WEDNESDAY: dayItemsSchema, THURSDAY: dayItemsSchema, FRIDAY: dayItemsSchema, SATURDAY: dayItemsSchema, SUNDAY: dayItemsSchema }).partial().optional();
const hasScheduleItems = (schedule: unknown) => !!schedule && typeof schedule === "object" && Object.values(schedule as Record<string, unknown>).some((items) => Array.isArray(items) && items.length > 0);
const coach = Router();
coach.use(requireRole(Role.MERCHANT));
coach.use(route(async (req, res, next) => {
  const merchant = await prisma.merchantProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, categoryId: true } });
  if (!merchant || !(await isFitnessProviderCategory(merchant.categoryId))) return sendError(res, 403, "NOT_FITNESS_PROVIDER", "هذه الخدمة مخصصة للمدربين والنوادي الرياضية");
  res.locals.merchant = merchant;
  next();
}));
const bodySchema = z.object({
  traineeEmail: z.string().trim().email().max(254), kind: z.nativeEnum(FitnessPlanKind),
  title: z.string().trim().min(2).max(100), details: z.array(z.string().trim().min(1).max(240)).max(80).default([]),
  notes: z.string().trim().max(2000).nullable().optional(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(),
  weeklySchedule: weeklyScheduleSchema,
}).refine((value) => value.details.length > 0 || hasScheduleItems(value.weeklySchedule), { message: "أضف تفاصيل للخطة أو اكتب محتوى لأحد أيام الأسبوع", path: ["details"] }).refine((value) => !value.startsAt || !value.endsAt || new Date(value.endsAt) >= new Date(value.startsAt), { message: "تاريخ نهاية الخطة يجب أن يكون بعد بدايتها", path: ["endsAt"] });
const updateSchema = z.object({
  kind: z.nativeEnum(FitnessPlanKind).optional(),
  title: z.string().trim().min(2).max(100).optional(),
  details: z.array(z.string().trim().min(1).max(240)).min(1).max(80).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  weeklySchedule: weeklyScheduleSchema,
});

coach.get("/", route(async (_req, res) => {
  const items = await prisma.fitnessPlan.findMany({ where: { coachMerchantId: res.locals.merchant.id }, include: { trainee: { select: { id: true, fullName: true, email: true } }, progress: { orderBy: { completedAt: "desc" }, take: 20 } }, orderBy: { updatedAt: "desc" }, take: 100 });
  res.json({ items });
}));
coach.get("/trainees", route(async (_req, res) => {
  const plans = await prisma.fitnessPlan.findMany({
    where: { coachMerchantId: res.locals.merchant.id },
    select: { traineeUserId: true, updatedAt: true, trainee: { select: { id: true, fullName: true, email: true } } },
    orderBy: { updatedAt: "desc" }, take: 1000,
  });
  const trainees = new Map<string, { trainee: typeof plans[number]["trainee"]; planCount: number; latestPlanAt: Date }>();
  for (const plan of plans) {
    const current = trainees.get(plan.traineeUserId);
    if (current) current.planCount++;
    else trainees.set(plan.traineeUserId, { trainee: plan.trainee, planCount: 1, latestPlanAt: plan.updatedAt });
  }
  res.json({ items: [...trainees.values()] });
}));
coach.post("/", route(async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const trainee = await prisma.user.findFirst({ where: { email: { equals: parsed.data.traineeEmail, mode: "insensitive" } }, select: { id: true } });
  if (!trainee) return sendError(res, 404, "TRAINEE_NOT_FOUND", "ما لقينا حساب بهذا البريد الإلكتروني");
  const { traineeEmail, startsAt, endsAt, ...data } = parsed.data;
  const item = await prisma.fitnessPlan.create({ data: { ...data, coachMerchantId: res.locals.merchant.id, traineeUserId: trainee.id, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null }, include: { trainee: { select: { id: true, fullName: true, email: true } } } });
  await notify({ userId: trainee.id, type: "SYSTEM", title: "أرسل لك مدربك خطة جديدة", body: data.title, data: { fitnessPlanId: item.id }, email: false });
  res.status(201).json(item);
}));
coach.patch("/:id", route(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (!Object.keys(parsed.data).length) return sendError(res, 400, "EMPTY_UPDATE", "عدّل معلومة واحدة على الأقل");
  const existing = await prisma.fitnessPlan.findFirst({ where: { id: req.params.id, coachMerchantId: res.locals.merchant.id }, select: { id: true, traineeUserId: true, startsAt: true, endsAt: true } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "الخطة غير موجودة");
  const nextStart = parsed.data.startsAt === undefined ? existing.startsAt : parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  const nextEnd = parsed.data.endsAt === undefined ? existing.endsAt : parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (nextStart && nextEnd && nextEnd < nextStart) return sendError(res, 400, "INVALID_PLAN_DATES", "تاريخ نهاية الخطة يجب أن يكون بعد بدايتها");
  const updateData = { ...parsed.data, startsAt: parsed.data.startsAt === undefined ? undefined : parsed.data.startsAt ? new Date(parsed.data.startsAt) : null, endsAt: parsed.data.endsAt === undefined ? undefined : parsed.data.endsAt ? new Date(parsed.data.endsAt) : null };
  const updated = await prisma.fitnessPlan.update({
    where: { id: existing.id }, data: updateData,
    include: { trainee: { select: { id: true, fullName: true, email: true } }, progress: { orderBy: { completedAt: "desc" }, take: 20 } },
  });
  await notify({ userId: existing.traineeUserId, type: "SYSTEM", title: "حدّث مدربك خطتك", body: updated.title, data: { fitnessPlanId: updated.id }, email: false });
  res.json(updated);
}));
coach.delete("/:id", route(async (req, res) => {
  const result = await prisma.fitnessPlan.deleteMany({ where: { id: req.params.id, coachMerchantId: res.locals.merchant.id } });
  if (!result.count) return sendError(res, 404, "NOT_FOUND", "الخطة غير موجودة");
  res.status(204).end();
}));
fitnessPlansRouter.use(requireAuth);
fitnessPlansRouter.use("/coach", coach);

fitnessPlansRouter.get("/mine", route(async (req, res) => {
  const items = await prisma.fitnessPlan.findMany({ where: { traineeUserId: req.user!.id }, include: { coach: { select: { businessName: true, fitnessProfile: { select: { displayName: true } }, user: { select: { id: true, avatarUpdatedAt: true } } } }, progress: { where: { userId: req.user!.id }, orderBy: { completedAt: "desc" }, take: 30 } }, orderBy: { updatedAt: "desc" } });
  res.json({ items });
}));
fitnessPlansRouter.post("/:id/progress", route(async (req, res) => {
  const parsed = z.object({ weightKg: z.number().positive().max(500).nullable().optional(), note: z.string().trim().max(1000).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const plan = await prisma.fitnessPlan.findFirst({ where: { id: req.params.id, traineeUserId: req.user!.id }, select: { id: true } });
  if (!plan) return sendError(res, 404, "NOT_FOUND", "الخطة غير موجودة");
  res.status(201).json(await prisma.fitnessProgress.create({ data: { planId: plan.id, userId: req.user!.id, ...parsed.data } }));
}));

fitnessPlansRouter.get("/:id/print", route(async (req, res) => {
  const plan = await prisma.fitnessPlan.findFirst({
    where: { id: req.params.id, OR: [{ traineeUserId: req.user!.id }, { coach: { userId: req.user!.id } }] },
    include: {
      trainee: { select: { fullName: true } },
      coach: { select: { userId: true, businessName: true, fitnessProfile: { select: { displayName: true } }, user: { select: { avatarUpdatedAt: true } } } },
    },
  });
  if (!plan) return sendError(res, 404, "NOT_FOUND", "الخطة غير موجودة");
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);
  const lang = req.query.lang === "en" ? "en" : "ar";
  const ar = lang === "ar";
  const coachName = plan.coach.fitnessProfile?.displayName || plan.coach.businessName;
  const image = plan.coach.user.avatarUpdatedAt ? "/profile/avatar/" + plan.coach.userId + "?v=" + plan.coach.user.avatarUpdatedAt.getTime() : "";
  const lines = Array.isArray(plan.details) ? plan.details.map(x => "<li>" + esc(String(x)) + "</li>").join("") : "";
  const dayLabels: Record<string, string> = ar ? { MONDAY: "الاثنين", TUESDAY: "الثلاثاء", WEDNESDAY: "الأربعاء", THURSDAY: "الخميس", FRIDAY: "الجمعة", SATURDAY: "السبت", SUNDAY: "الأحد" } : { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };
  const schedule = plan.weeklySchedule && typeof plan.weeklySchedule === "object" && !Array.isArray(plan.weeklySchedule) ? plan.weeklySchedule as Record<string, unknown> : null;
  const scheduleHtml = schedule ? Object.entries(dayLabels).filter(([key]) => Array.isArray(schedule[key]) && (schedule[key] as unknown[]).length).map(([key, label]) => "<h2>" + label + "</h2><ol>" + (schedule[key] as unknown[]).map(item => "<li>" + esc(String(item)) + "</li>").join("") + "</ol>").join("") : "";
  const planContent = scheduleHtml || "<ol>" + lines + "</ol>";
  const type = plan.kind === "WORKOUT" ? (ar ? "خطة التمرين" : "Workout plan") : (ar ? "الخطة الغذائية" : "Nutrition plan");
  res.type("html").send("<!doctype html><html lang=\"" + lang + "\" dir=\"" + (ar ? "rtl" : "ltr") + "\"><meta charset=\"utf-8\"><title>" + esc(plan.title) + "</title><style>body{font:17px Arial;max-width:780px;margin:35px auto;padding:20px;color:#222}header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #b32332;padding-bottom:16px}header img{width:72px;height:72px;border-radius:50%;object-fit:cover}h1{color:#a21f2d}li{padding:8px 0;white-space:pre-wrap}.muted{color:#666}@media print{button{display:none}}</style><button onclick=\"window.print()\">" + (ar ? "طباعة أو حفظ PDF" : "Print or save PDF") + "</button><header>" + (image ? "<img src=\"" + esc(image) + "\">" : "") + "<b>" + esc(coachName) + "</b></header><h1>" + esc(type + ": " + plan.title) + "</h1><h3>" + esc(plan.trainee.fullName) + "</h3>" + planContent + (plan.notes ? "<h2>" + (ar ? "ملاحظات" : "Notes") + "</h2><p>" + esc(plan.notes).replace(/\n/g, "<br>") + "</p>" : "") + "<footer class=\"muted\">Dalilacom</footer></html>");
}));

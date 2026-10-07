import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { approveBroadcast, BroadcastError, BroadcastTarget, previewBroadcast, rejectBroadcast, submitBroadcast } from "../services/broadcast.service";

/**
 * Announcements to people in a place. The super admin can reach any country, city or area; a merchant can reach an
 * area or a distance around their shop and attach one of their own products or offers — and nothing a merchant
 * writes reaches anyone before it has been screened and approved by an admin (see broadcast.service).
 */
export const broadcastRouter = Router();
broadcastRouter.use(requireAuth, requireRole(Role.ADMIN, Role.MERCHANT));

const targetShape = {
  countryId: z.string().uuid().optional(),
  geoUnitId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(20000).optional(),
  role: z.enum([Role.CUSTOMER, Role.MERCHANT]).optional(),
};

const previewSchema = z.object(targetShape);
const sendSchema = z.object({
  ...targetShape,
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
  productId: z.string().uuid().optional(),
  discountId: z.string().uuid().optional(),
});

function fail(res: Parameters<typeof sendError>[0], err: unknown) {
  if (err instanceof BroadcastError) return sendError(res, err.status, err.code, err.message);
  throw err;
}

function targetOf(data: z.infer<typeof previewSchema>): BroadcastTarget {
  const { countryId, geoUnitId, latitude, longitude, radiusKm, role } = data;
  return { countryId, geoUnitId, latitude, longitude, radiusKm, role };
}

broadcastRouter.post("/preview", async (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await previewBroadcast({ id: req.user!.id, role: req.user!.role }, targetOf(parsed.data)));
  } catch (err) {
    return fail(res, err);
  }
});

broadcastRouter.post("/", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { title, body, productId, discountId } = parsed.data;
  try {
    const result = await submitBroadcast({ id: req.user!.id, role: req.user!.role }, targetOf(parsed.data), { title, body, productId, discountId });
    res.status(201).json(result);
  } catch (err) {
    return fail(res, err);
  }
});

const statusSchema = z.object({ status: z.enum(["PENDING_REVIEW", "SENT", "REJECTED"]).optional() });

/** What this account has sent, newest first (the admin sees everything, optionally only what waits for review). */
broadcastRouter.get("/", async (req, res) => {
  const parsed = statusSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const admin = req.user!.role === Role.ADMIN;
  const rows = await prisma.broadcast.findMany({
    where: { ...(admin ? {} : { senderId: req.user!.id }), ...(parsed.data.status ? { status: parsed.data.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    // the admin needs to know whose announcement it is
    include: admin ? { sender: { select: { fullName: true, email: true, merchantProfile: { select: { businessName: true } } } } } : undefined,
  });
  res.json(rows);
});

broadcastRouter.post("/:id/approve", requireRole(Role.ADMIN), async (req, res) => {
  try {
    res.json(await approveBroadcast(req.params.id, { id: req.user!.id, role: req.user!.role }));
  } catch (err) {
    return fail(res, err);
  }
});

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(300) });
broadcastRouter.post("/:id/reject", requireRole(Role.ADMIN), async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await rejectBroadcast(req.params.id, { id: req.user!.id, role: req.user!.role }, parsed.data.reason));
  } catch (err) {
    return fail(res, err);
  }
});

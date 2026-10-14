import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { route } from "../lib/asyncRoute";
import { sendValidationError } from "../lib/apiError";
import { attachReferral, referralMe, requestMarketer } from "../services/referral.service";
import { getSettings } from "../services/settings.service";
import { prisma } from "../prisma";

export const referralRouter = Router();

// A marketer's own page: the link and code to share, how many people came, what was earned (a manager also sees his team).
referralRouter.get("/me", requireAuth, route(async (req, res) => {
  res.json({ ...(await referralMe(req.user!.id)), creditName: (await getSettings()).creditName });
}));

// A person who signed up without a code (for example with Google or Facebook) enters the one he was given. Once only.
referralRouter.post("/use", requireAuth, route(async (req, res) => {
  const parsed = z.object({ code: z.string().trim().min(3).max(20) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { referredById: true } });
  if (me?.referredById) return res.json({ ok: false, reason: "ALREADY" });
  res.json({ ok: await attachReferral(req.user!.id, parsed.data.code), reason: "INVALID" });
}));

// A person asks to become a marketer: online (links) or in the field (meeting people). The admin decides.
referralRouter.post("/request", requireAuth, route(async (req, res) => {
  const parsed = z.object({ channel: z.enum(["ELECTRONIC", "FIELD"]), phone: z.string().trim().max(30).optional(), note: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await requestMarketer(req.user!.id, parsed.data.channel, parsed.data.phone, parsed.data.note);
  res.status(201).json({ ok: true });
}));

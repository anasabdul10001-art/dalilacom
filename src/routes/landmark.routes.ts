import { Router } from "express";
import { z } from "zod";
import { sendValidationError } from "../lib/apiError";
import { resolveLanguage } from "../lib/languages";
import { route } from "../lib/asyncRoute";
import express from "express";
import { sendError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { LandmarkError, listKinds, publicLandmark, publicLandmarks } from "../services/landmark.service";
import { addClaimFile, CLAIM_ROLES, MAX_CLAIM_FILE_BYTES, myClaimFor, myClaims, resubmitClaim, similarClaimable, submitClaim, withdrawClaim } from "../services/landmarkClaim.service";

export const landmarkRouter = Router();

const listSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  kinds: z.string().max(200).optional(), // "mosque,hospital"
  zoom: z.coerce.number().min(0).max(25).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300),
});

function claimFail(res: import("express").Response, err: unknown) {
  if (err instanceof LandmarkError) {
    const code = err.status === 409 ? "CONFLICT" : err.status === 404 ? "NOT_FOUND" : err.status === 403 ? "FORBIDDEN" : err.status === 401 ? "UNAUTHORIZED" : err.status === 429 ? "RATE_LIMITED" : err.status === 415 ? "UNSUPPORTED_MEDIA" : "BAD_REQUEST";
    return res.status(err.status).json({ error: { code, message: err.message } });
  }
  throw err;
}

// Public: the kinds that are on (icon, colour, name), for the map's filter
landmarkRouter.get("/kinds", route(async (req, res) => {
  const lang = resolveLanguage(req);
  const kinds = await listKinds(true);
  res.json(kinds.map((k) => ({ slug: k.slug, name: lang === "ar" ? k.nameAr : k.nameEn, icon: k.icon, color: k.color, geometry: k.geometry })));
}));

// Public: the places inside the visible map (or matching a word)
landmarkRouter.get("/", route(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { kinds, ...rest } = parsed.data;
  const items = await publicLandmarks({ ...rest, kinds: kinds ? kinds.split(",").map((k) => k.trim()).filter(Boolean) : undefined, lang: resolveLanguage(req) });
  res.set("Cache-Control", "public, max-age=60");
  res.json({ items });
}));

// "Is the shop I am about to register already on the map as a landmark?" — then it can be claimed instead of duplicated
landmarkRouter.get("/similar", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json({ items: await similarClaimable({ name: parsed.data.name, latitude: parsed.data.lat, longitude: parsed.data.lng }) });
}));

landmarkRouter.get("/claims/mine", requireAuth, route(async (req, res) => {
  res.json({ items: await myClaims(req.user!.id) });
}));

landmarkRouter.post("/claims/:claimId/withdraw", requireAuth, route(async (req, res) => {
  try { await withdrawClaim(req.user!.id, req.params.claimId); res.json({ ok: true }); } catch (err) { claimFail(res, err); }
}));

landmarkRouter.post("/claims/:claimId/resubmit", requireAuth, route(async (req, res) => {
  const parsed = z.object({ note: z.string().trim().max(600).nullable().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try { await resubmitClaim(req.user!.id, req.params.claimId, parsed.data.note); res.json({ ok: true }); } catch (err) { claimFail(res, err); }
}));

// a proof photo as raw image bytes (like the profile photo)
landmarkRouter.put("/claims/:claimId/files", requireAuth, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_CLAIM_FILE_BYTES }), route(async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return sendError(res, 415, "UNSUPPORTED_MEDIA", "Send the photo as JPEG, PNG or WebP");
  try {
    res.status(201).json(await addClaimFile(req.user!.id, req.params.claimId, body, typeof req.query.name === "string" ? req.query.name : ""));
  } catch (err) { claimFail(res, err); }
}));

landmarkRouter.get("/:id/my-claim", requireAuth, route(async (req, res) => {
  res.json({ claim: await myClaimFor(req.user!.id, req.params.id) });
}));

landmarkRouter.post("/:id/claims", requireAuth, route(async (req, res) => {
  const parsed = z.object({ role: z.enum(CLAIM_ROLES), phone: z.string().trim().min(6).max(40), note: z.string().trim().max(600).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    const claim = await submitClaim(req.user!.id, req.params.id, parsed.data);
    res.status(201).json({ id: claim.id, status: claim.status });
  } catch (err) { claimFail(res, err); }
}));

landmarkRouter.get("/:id", route(async (req, res) => {
  const item = await publicLandmark(req.params.id, resolveLanguage(req));
  if (!item) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Place not found" } });
  res.json(item);
}));

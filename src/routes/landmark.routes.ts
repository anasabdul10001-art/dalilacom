import { Router } from "express";
import { z } from "zod";
import { sendValidationError } from "../lib/apiError";
import { resolveLanguage } from "../lib/languages";
import { route } from "../lib/asyncRoute";
import { listKinds, publicLandmark, publicLandmarks } from "../services/landmark.service";

export const landmarkRouter = Router();

const listSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  kinds: z.string().max(200).optional(), // "mosque,hospital"
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300),
});

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

landmarkRouter.get("/:id", route(async (req, res) => {
  const item = await publicLandmark(req.params.id, resolveLanguage(req));
  if (!item) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Place not found" } });
  res.json(item);
}));

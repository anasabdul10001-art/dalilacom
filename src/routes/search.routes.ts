import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendValidationError } from "../lib/apiError";
import { resolveLanguage } from "../lib/languages";
import { route } from "../lib/asyncRoute";
import { unifiedSearch } from "../services/search.service";

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().min(1).max(80),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

// Public: shops and public places in one list, nearest-and-best first. The reference point is the person's place (or the map's centre);
// without one it is the centre of the city they chose.
searchRouter.get("/", route(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  let { lat, lng } = parsed.data;
  let source: "point" | "city" | null = lat !== undefined && lng !== undefined ? "point" : null;
  if (!source && parsed.data.cityId) {
    const city = await prisma.geoUnit.findUnique({ where: { id: parsed.data.cityId }, select: { latitude: true, longitude: true } });
    if (city?.latitude != null && city.longitude != null) { lat = city.latitude; lng = city.longitude; source = "city"; }
  }
  const out = await unifiedSearch({ q: parsed.data.q, lat, lng, limit: parsed.data.limit, lang: resolveLanguage(req) });
  res.json({ ...out, reference: source });
}));

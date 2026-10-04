import { Router } from "express";
import { z } from "zod";
import { sendError, sendValidationError } from "../lib/apiError";
import { routeRateLimiter } from "../middleware/rateLimit";
import { getRoute, NoRouteError, RouteUnavailableError } from "../services/routing.service";

export const routeRouter = Router();

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const routeQuery = z.object({
  fromLat: lat,
  fromLng: lng,
  toLat: lat,
  toLng: lng,
  mode: z.enum(["driving", "walking"]).default("driving"),
});

// Public (the map works for guests): the real road route, distance and time between two points.
// Proxied through us so the routing provider can change without shipping new apps, and so it's rate limited.
routeRouter.get("/", routeRateLimiter, async (req, res) => {
  const parsed = routeQuery.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { fromLat, fromLng, toLat, toLng, mode } = parsed.data;
  try {
    res.json({ mode, ...(await getRoute(mode, { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng })) });
  } catch (err) {
    if (err instanceof NoRouteError) return sendError(res, 404, "NO_ROUTE", "ما لقينا طريق بين النقطتين");
    if (err instanceof RouteUnavailableError) return sendError(res, 502, "ROUTE_UNAVAILABLE", "خدمة المسارات غير متاحة حاليًا");
    throw err;
  }
});

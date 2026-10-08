export type TravelMode = "driving" | "walking";

/** One manoeuvre of the route, in OSRM's terms (the clients write the sentence in the person's language). */
export interface RouteStep {
  /** turn, new name, depart, arrive, merge, on ramp, off ramp, fork, end of road, continue, roundabout, rotary, exit roundabout... */
  type: string;
  /** left, right, slight left, sharp right, straight, uturn (may be empty) */
  modifier: string;
  /** Roundabout exit number, when it is one. */
  exit: number | null;
  /** The road this step goes along (may be empty). */
  name: string;
  /** Where the manoeuvre happens, [lat, lng]. */
  location: [number, number];
  /** Length of this step: from this manoeuvre to the next. */
  distanceMeters: number;
  durationSeconds: number;
}

export interface Route {
  distanceMeters: number;
  durationSeconds: number;
  /** [lat, lng] pairs along the road. */
  geometry: [number, number][];
  steps: RouteStep[];
}

export class RouteUnavailableError extends Error {}
export class NoRouteError extends Error {}

// Public OSRM instances (FOSSGIS). Both are overridable so a paid/self-hosted engine can replace them
// without touching any client — the apps only ever talk to our own /route endpoint.
const BASE: Record<TravelMode, () => string> = {
  driving: () => process.env.ROUTING_CAR_URL ?? "https://routing.openstreetmap.de/routed-car",
  walking: () => process.env.ROUTING_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot",
};

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; route: Route }>();

const round = (n: number) => n.toFixed(4); // ~11 m — close enough to reuse a route, coarse enough to hit the cache

export async function getRoute(mode: TravelMode, from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Route> {
  const key = `${mode}:${round(from.lat)},${round(from.lng)}:${round(to.lat)},${round(to.lng)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.route;

  // OSRM wants lng,lat. The foot instance only answers under the "driving" profile name.
  const url = `${BASE[mode]()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=true`;
  let body: any;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "dalilacom-api/1.0" } });
    if (!res.ok) throw new RouteUnavailableError(`routing service answered ${res.status}`);
    body = await res.json();
  } catch (err) {
    if (err instanceof RouteUnavailableError) throw err;
    throw new RouteUnavailableError("routing service unreachable");
  }
  const found = body?.routes?.[0];
  if (body?.code !== "Ok" || !found) throw new NoRouteError("no route between these points");

  const route: Route = {
    distanceMeters: Math.round(found.distance),
    durationSeconds: Math.round(found.duration),
    geometry: (found.geometry?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng]),
    steps: ((found.legs ?? []).flatMap((leg: any) => leg.steps ?? []) as any[]).map((s) => ({
      type: String(s.maneuver?.type ?? ""),
      modifier: String(s.maneuver?.modifier ?? ""),
      exit: typeof s.maneuver?.exit === "number" ? s.maneuver.exit : null,
      name: typeof s.name === "string" ? s.name : "",
      location: [s.maneuver?.location?.[1] ?? 0, s.maneuver?.location?.[0] ?? 0] as [number, number],
      distanceMeters: Math.round(s.distance ?? 0),
      durationSeconds: Math.round(s.duration ?? 0),
    })),
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), route });
  return route;
}

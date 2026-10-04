export type TravelMode = "driving" | "walking";

export interface Route {
  distanceMeters: number;
  durationSeconds: number;
  /** [lat, lng] pairs along the road, simplified for drawing. */
  geometry: [number, number][];
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
  const url = `${BASE[mode]()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
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
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), route });
  return route;
}

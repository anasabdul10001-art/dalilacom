/** Search-as-you-type address suggestions from OpenStreetMap through Photon. */
export interface AddressSuggestion {
  id: string;
  label: string;
  address: string;
  city: string | null;
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  properties?: {
    osm_type?: string; osm_id?: number; name?: string; street?: string; locality?: string; district?: string;
    city?: string; county?: string; state?: string; country?: string; countrycode?: string; type?: string; osm_value?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

const cache = new Map<string, { at: number; items: AddressSuggestion[] }>();
const CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_CACHE = 1000;
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

const uniqueParts = (...parts: Array<string | undefined | null>) => parts.map((x) => x?.trim()).filter((x): x is string => !!x).filter((x, i, all) => all.findIndex((y) => y.toLocaleLowerCase() === x.toLocaleLowerCase()) === i);

function shape(feature: PhotonFeature): AddressSuggestion | null {
  const p = feature.properties;
  const coordinates = feature.geometry?.coordinates;
  if (!p || !coordinates || coordinates.length < 2 || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null;
  const latitude = coordinates[1], longitude = coordinates[0];
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const labelParts = uniqueParts(p.name, p.street, p.locality, p.district, p.city, p.state, p.country);
  const addressParts = uniqueParts(p.name, p.street, p.locality, p.district, p.city, p.state);
  if (!labelParts.length) return null;
  return {
    id: `${p.osm_type ?? "place"}/${p.osm_id ?? `${latitude},${longitude}`}`,
    label: labelParts.join("، "),
    address: addressParts.join("، "),
    city: p.city ?? (p.type === "city" || p.osm_value === "city" ? p.name ?? null : null),
    latitude,
    longitude,
  };
}

/** Debounced clients call this only after a few characters; caching and a shared queue keep Photon usage polite. */
export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) return [];
  const key = q.toLocaleLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;

  const run = async (): Promise<AddressSuggestion[]> => {
    const wait = lastCall + 600 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`;
      const response = await fetch(url, {
        headers: { "user-agent": "Dalilacom/1.0 (https://dalilacom.com)", accept: "application/json" },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return [];
      const json = (await response.json()) as { features?: PhotonFeature[] };
      const items = (json.features ?? []).map(shape).filter((x): x is AddressSuggestion => !!x);
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), items });
      return items;
    } catch {
      return [];
    }
  };

  const pending = queue.then(run, run);
  queue = pending.catch(() => undefined);
  return pending;
}

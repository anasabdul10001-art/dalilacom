/**
 * A place on the map in words: when a shop pins its place, the address field fills itself in. Uses OpenStreetMap's free
 * Nominatim service, politely: one request at a time, at most one per second, answers kept, and a User-Agent that says who asks.
 */
export interface PlaceInWords {
  address: string | null;
  city: string | null;
}

const gapMs = () => Number(process.env.GEOCODE_MIN_GAP_MS ?? 1100);
const cache = new Map<string, { at: number; value: PlaceInWords }>();
const KEEP_MS = 24 * 60 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function words(data: { address?: Record<string, string>; display_name?: string }): PlaceInWords {
  const a = data.address ?? {};
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(" ");
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.hamlet;
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
  const parts = [street, area, city, a.state].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
  return { address: parts.length ? parts.join("، ") : data.display_name ?? null, city };
}

export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<PlaceInWords> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${lang}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;

  const run = async (): Promise<PlaceInWords> => {
    const wait = lastCall + gapMs() - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}&accept-language=${encodeURIComponent(lang)}`;
      const res = await fetch(url, { headers: { "user-agent": "Dalilacom/1.0 (https://dalilacom.com)", accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { address: null, city: null };
      const value = words((await res.json()) as { address?: Record<string, string>; display_name?: string });
      if (value.address) cache.set(key, { at: Date.now(), value });
      return value;
    } catch {
      return { address: null, city: null };
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

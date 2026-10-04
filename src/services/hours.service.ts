import { z } from "zod";

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const; // same order as JS getDay()
export type DayKey = (typeof DAY_KEYS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الوقت لازم يكون بصيغة HH:mm");
const ranges = z.array(z.object({ open: hhmm, close: hhmm })).max(3);

/** Weekly opening hours; a day that's missing or empty means closed that day. */
export const openingHoursSchema = z
  .object({ sun: ranges, mon: ranges, tue: ranges, wed: ranges, thu: ranges, fri: ranges, sat: ranges })
  .partial()
  .strict();

export type OpeningHours = z.infer<typeof openingHoursSchema>;

export interface OpenStatus {
  hasHours: boolean;
  isOpen: boolean;
  closesAt?: string; // HH:mm, when open now
  opensAt?: string; // HH:mm of the next opening, when closed
  opensDay?: "today" | "tomorrow" | DayKey;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toClock = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = DAY_KEYS.findIndex((k) => k === get("weekday").toLowerCase().slice(0, 3));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** A range whose close is not after its open runs past midnight; open === close means open around the clock. */
function intervalsOf(hours: OpeningHours, day: number) {
  return (hours[DAY_KEYS[day]] ?? [])
    .map((r) => {
      const start = toMinutes(r.open);
      let end = toMinutes(r.close);
      if (end <= start) end += 1440;
      return { start, end };
    })
    .sort((a, b) => a.start - b.start);
}

export function computeOpenStatus(raw: unknown, timeZone: string, now: Date = new Date()): OpenStatus {
  const parsed = openingHoursSchema.safeParse(raw);
  const hours = parsed.success ? parsed.data : null;
  if (!hours || DAY_KEYS.every((k) => (hours[k] ?? []).length === 0)) return { hasHours: false, isOpen: false };

  const { day, minutes } = localClock(now, timeZone);

  for (const { start, end } of intervalsOf(hours, day)) {
    if (minutes >= start && minutes < end) return { hasHours: true, isOpen: true, closesAt: toClock(end) };
  }
  // Still inside a range that started yesterday and crosses midnight.
  for (const { start, end } of intervalsOf(hours, (day + 6) % 7)) {
    if (end > 1440 && minutes + 1440 >= start && minutes + 1440 < end) return { hasHours: true, isOpen: true, closesAt: toClock(end) };
  }

  for (let offset = 0; offset <= 7; offset++) {
    const d = (day + offset) % 7;
    const next = intervalsOf(hours, d).find((i) => offset > 0 || i.start > minutes);
    if (next) {
      return { hasHours: true, isOpen: false, opensAt: toClock(next.start), opensDay: offset === 0 ? "today" : offset === 1 ? "tomorrow" : DAY_KEYS[d] };
    }
  }
  return { hasHours: true, isOpen: false };
}

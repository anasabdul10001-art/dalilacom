import { allSettings } from '../db.js';

const tz = () => allSettings().timezone || 'Asia/Riyadh';
const fmtCache = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts) + tz();
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('ar-u-nu-latn-ca-gregory', { timeZone: tz(), ...opts }));
  return fmtCache.get(key);
}
export const fmtDate = (iso) => (iso ? fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '');
export const fmtDateTime = (iso) => (iso ? fmt({ day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '');
export const fmtToday = () => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
export const fmtTime = (iso) => fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const monthName = (m) => fmt({ month: 'long' }).format(new Date(Date.UTC(2024, m - 1, 15)));

const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);
/** «منذ 5 دقائق» */
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return 'منذ ' + plural(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  const h = Math.floor(m / 60);
  if (h < 24) return 'منذ ' + plural(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const d = Math.floor(h / 24);
  if (d < 7) return 'منذ ' + plural(d, 'يوم', 'يومين', 'أيام', 'يوماً');
  return fmtDate(iso);
}
export const num = (n) => new Intl.NumberFormat('ar-u-nu-latn').format(n || 0);

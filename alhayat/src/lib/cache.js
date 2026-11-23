// ذاكرة مؤقتة للصفحات المُولَّدة. تُبطَل كلها عند أي تغيير في المحتوى (إصدار المحتوى).
let version = 1;
export const bumpVersion = () => { version++; };
export const contentVersion = () => version;

const pages = new Map();
const MAX = 600;
export function pageGet(key) {
  const hit = pages.get(key);
  if (hit && hit.version === version && hit.expires > Date.now()) return hit;
  if (hit) pages.delete(key);
  return null;
}
export function pageSet(key, entry, ttlMs = 60_000) {
  if (pages.size >= MAX) pages.delete(pages.keys().next().value);
  pages.set(key, { ...entry, version, expires: Date.now() + ttlMs });
}

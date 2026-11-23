import { db, nowIso, allSettings } from '../db.js';
import { plain, safeUrl, cleanBody } from '../lib/sanitize.js';
import { httpError } from './categories.js';

export const PLACEMENTS = {
  header: 'أعلى الصفحة (بانر عريض)',
  sidebar: 'الشريط الجانبي',
  in_article: 'داخل الخبر',
  footer: 'أسفل الصفحة',
  app_banner: 'تطبيق الأندرويد (بانر)',
};

const ACTIVE = `active=1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)`;

/** إعلان نشط لموضع معيّن (تدوير عشوائي بين الإعلانات المتاحة) */
export function pick(placement) {
  if (allSettings().ads_enabled !== '1') return null;
  const now = nowIso();
  const rows = db.prepare(`SELECT id,name,kind,image_url,link_url,html FROM ads WHERE placement=? AND ${ACTIVE}`).all(placement, now, now);
  if (!rows.length) return null;
  const ad = rows[Math.floor(Math.random() * rows.length)];
  db.prepare('UPDATE ads SET impressions=impressions+1 WHERE id=?').run(ad.id);
  return { id: ad.id, kind: ad.kind, imageUrl: ad.image_url, linkUrl: ad.link_url ? `/go/${ad.id}` : '', html: ad.html, name: ad.name };
}
export function click(id) {
  const ad = db.prepare('SELECT link_url FROM ads WHERE id=?').get(id);
  if (!ad || !ad.link_url) return null;
  db.prepare('UPDATE ads SET clicks=clicks+1 WHERE id=?').run(id);
  return ad.link_url;
}

export const listAds = () => db.prepare('SELECT * FROM ads ORDER BY active DESC, id DESC').all();

export function saveAd(input, id = null) {
  const name = plain(input.name, 100);
  if (!name) throw httpError(400, 'اسم الإعلان مطلوب');
  if (!(input.placement in PLACEMENTS)) throw httpError(400, 'موضع الإعلان غير صالح');
  const kind = input.kind === 'html' ? 'html' : 'image';
  const iso = (v) => (v && !isNaN(new Date(v)) ? new Date(v).toISOString() : null);
  const vals = [name, input.placement, kind, safeUrl(input.imageUrl), safeUrl(input.linkUrl),
    kind === 'html' ? cleanBody(input.html) : '', iso(input.startsAt), iso(input.endsAt), input.active === false ? 0 : 1];
  if (id) {
    db.prepare('UPDATE ads SET name=?,placement=?,kind=?,image_url=?,link_url=?,html=?,starts_at=?,ends_at=?,active=? WHERE id=?').run(...vals, id);
    return db.prepare('SELECT * FROM ads WHERE id=?').get(id);
  }
  const r = db.prepare('INSERT INTO ads(name,placement,kind,image_url,link_url,html,starts_at,ends_at,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(...vals, nowIso());
  return db.prepare('SELECT * FROM ads WHERE id=?').get(Number(r.lastInsertRowid));
}
export const deleteAd = (id) => db.prepare('DELETE FROM ads WHERE id=?').run(id);

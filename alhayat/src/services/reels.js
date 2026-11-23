import fs from 'node:fs';
import path from 'node:path';
import { db, nowIso } from '../db.js';
import { config } from '../config.js';
import { plain } from '../lib/sanitize.js';
import { httpError } from './categories.js';
import { ingest } from './media.js';

const shape = (r) => ({ id: r.id, title: r.title, url: r.video_url, views: r.views, active: !!r.active, createdAt: r.created_at });

export function listReels({ limit = 12, page = 1, all = false } = {}) {
  limit = Math.min(Math.max(+limit || 12, 1), 50); page = Math.max(+page || 1, 1);
  const w = all ? '1=1' : 'active=1';
  const total = db.prepare(`SELECT COUNT(*) n FROM reels WHERE ${w}`).get().n;
  const items = db.prepare(`SELECT * FROM reels WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, (page - 1) * limit).map(shape);
  return { items, total, page, pages: Math.ceil(total / limit) || 1, limit };
}

/** يرفع فيديو قصيراً (MP4/WebM) ويسجّله كريل */
export async function addReel(tmpPath, { title, originalName, userId }) {
  const t = plain(title, 120);
  if (!t) { fs.rm(tmpPath, { force: true }, () => {}); throw httpError(400, 'عنوان الريل مطلوب'); }
  const m = await ingest(tmpPath, { originalName, alt: t, userId });
  if (m.kind !== 'video') {
    db.prepare('DELETE FROM media WHERE id=?').run(m.id);
    for (const u of [m.url, m.thumb_url]) if (u) fs.rm(path.join(config.uploadDir, u.replace('/uploads/', '')), { force: true }, () => {});
    throw httpError(415, 'الريلز فيديو MP4 أو WebM فقط');
  }
  const r = db.prepare('INSERT INTO reels(title,video_url,media_id,created_by,created_at) VALUES(?,?,?,?,?)').run(t, m.url, m.id, userId, nowIso());
  return shape(db.prepare('SELECT * FROM reels WHERE id=?').get(Number(r.lastInsertRowid)));
}

export function setActive(id, active) {
  if (!db.prepare('UPDATE reels SET active=? WHERE id=?').run(active ? 1 : 0, id).changes) throw httpError(404, 'الريل غير موجود');
}

export function deleteReel(id) {
  const r = db.prepare('SELECT * FROM reels WHERE id=?').get(id);
  if (!r) throw httpError(404, 'الريل غير موجود');
  db.prepare('DELETE FROM reels WHERE id=?').run(id);
  if (r.media_id) {
    db.prepare('DELETE FROM media WHERE id=?').run(r.media_id);
    if (r.video_url.startsWith('/uploads/')) fs.rm(path.join(config.uploadDir, r.video_url.replace('/uploads/', '')), { force: true }, () => {});
  }
}

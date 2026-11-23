import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, nowIso } from '../db.js';
import { config } from '../config.js';
import { plain } from '../lib/sanitize.js';
import { httpError } from './categories.js';

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* المعالجة اختيارية */ }

function sniff(buf) {
  const h = buf.subarray(0, 16);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (h.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { kind: 'image', mime: 'image/png' };
  if (h.subarray(0, 4).toString() === 'GIF8') return { kind: 'image', mime: 'image/gif' };
  if (h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (h.subarray(4, 8).toString() === 'ftyp') return { kind: 'video', mime: 'video/mp4' };
  if (h.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { kind: 'video', mime: 'video/webm' };
  return null;
}

const rand = () => crypto.randomBytes(9).toString('hex');

/** يعالج ملفاً مرفوعاً (مسار مؤقت) ويسجّله في مكتبة الوسائط */
export async function ingest(tmpPath, { originalName = '', alt = '', caption = '', userId = null } = {}) {
  try {
    const fd = fs.openSync(tmpPath, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const type = sniff(head);
    if (!type) throw httpError(415, 'نوع الملف غير مدعوم (صور JPG/PNG/WebP/GIF أو فيديو MP4/WebM فقط)');

    const d = new Date();
    const sub = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    fs.mkdirSync(path.join(config.uploadDir, sub), { recursive: true });
    const base = rand();
    let url, thumb = null, width = null, height = null, mime = type.mime, size;

    if (type.kind === 'image' && sharp) {
      const animated = type.mime === 'image/gif';
      const img = sharp(tmpPath, { animated }).rotate();
      const meta = await sharp(tmpPath).metadata();
      const main = `${sub}/${base}.webp`, th = `${sub}/${base}-t.webp`;
      const out = await img.resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(config.uploadDir, main));
      await sharp(tmpPath).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(config.uploadDir, th));
      url = `/uploads/${main}`; thumb = `/uploads/${th}`; width = out.width; height = out.height; mime = 'image/webp'; size = out.size;
      void meta;
    } else {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }[type.mime];
      const rel = `${sub}/${base}.${ext}`;
      fs.copyFileSync(tmpPath, path.join(config.uploadDir, rel));
      url = `/uploads/${rel}`; size = fs.statSync(tmpPath).size;
    }
    const r = db.prepare(`INSERT INTO media(filename,url,thumb_url,kind,mime,size,width,height,alt,caption,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(plain(originalName, 120), url, thumb, type.kind, mime, size, width, height, plain(alt, 200), plain(caption, 250), userId, nowIso());
    return getMedia(Number(r.lastInsertRowid));
  } finally {
    fs.rm(tmpPath, { force: true }, () => {});
  }
}

export const getMedia = (id) => db.prepare('SELECT * FROM media WHERE id=?').get(id);

export function listMedia({ kind, q, page = 1, limit = 30 } = {}) {
  const where = ['1=1'], args = [];
  if (kind) { where.push('kind=?'); args.push(kind); }
  if (q) { where.push('(filename LIKE ? OR alt LIKE ? OR caption LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM media WHERE ${w}`).get(...args).n;
  const items = db.prepare(`SELECT * FROM media WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export function updateMedia(id, { alt, caption }) {
  db.prepare('UPDATE media SET alt=?, caption=? WHERE id=?').run(plain(alt, 200), plain(caption, 250), id);
  return getMedia(id);
}

export function deleteMedia(id) {
  const m = getMedia(id);
  if (!m) throw httpError(404, 'الملف غير موجود');
  const used = db.prepare('SELECT COUNT(*) n FROM articles WHERE cover_media_id=?').get(id).n;
  if (used) throw httpError(409, 'الملف مستخدم كصورة رئيسية لخبر');
  db.prepare('DELETE FROM media WHERE id=?').run(id);
  if (m.url.startsWith('/uploads/')) {
    for (const u of [m.url, m.thumb_url]) if (u) fs.rm(path.join(config.uploadDir, u.replace('/uploads/', '')), { force: true }, () => {});
  }
}

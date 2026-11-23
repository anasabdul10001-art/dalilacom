import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, nowIso } from '../db.js';
import { config } from '../config.js';
import { plain } from '../lib/sanitize.js';
import { httpError } from './categories.js';

/**
 * الإشعارات الفورية عبر FCM HTTP v1 إلى «مواضيع» (topics).
 * التطبيق يشترك بموضوع `breaking` وبمواضيع التصنيفات `cat_<slug>`، فلا يحتاج الخادم لتخزين كل رمز.
 * بدون FCM_SERVICE_ACCOUNT يعمل النظام بوضع التجربة: يُسجَّل الإشعار ولا يُرسَل.
 */
function loadAccount() {
  const v = config.fcm.trim();
  if (!v) return null;
  try { return JSON.parse(v.startsWith('{') ? v : fs.readFileSync(v, 'utf8')); } catch { return null; }
}
let tokenCache = { value: null, exp: 0 };

async function accessToken(acc) {
  if (tokenCache.value && tokenCache.exp > Date.now() + 60_000) return tokenCache.value;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: acc.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(acc.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description || 'تعذّر الحصول على رمز FCM');
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

export const pushConfigured = () => !!loadAccount();

export async function dispatch(id) {
  const n = db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
  const acc = loadAccount();
  if (!acc) {
    db.prepare("UPDATE notifications SET status='dry_run', detail=?, sent_at=? WHERE id=?").run('وضع التجربة: لم يُضبط FCM_SERVICE_ACCOUNT', nowIso(), id);
    return;
  }
  try {
    const token = await accessToken(acc);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        topic: n.topic,
        notification: { title: n.title, body: n.body },
        data: { articleId: String(n.article_id || ''), notificationId: String(n.id), type: n.topic === 'breaking' ? 'breaking' : 'news' },
        android: { priority: 'HIGH', notification: { channel_id: n.topic === 'breaking' ? 'breaking' : 'news', sound: 'default' } },
      } }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error?.message || `FCM ${res.status}`);
    db.prepare("UPDATE notifications SET status='sent', detail=?, sent_at=? WHERE id=?").run(j.name || '', nowIso(), id);
  } catch (e) {
    db.prepare("UPDATE notifications SET status='failed', detail=? WHERE id=?").run(String(e.message).slice(0, 300), id);
  }
}

export async function notify({ title, body = '', articleId = null, topic = 'breaking', userId = null }) {
  title = plain(title, 100);
  if (!title) throw httpError(400, 'عنوان الإشعار مطلوب');
  if (!/^(breaking|news|cat_[\p{L}\p{N}-]{1,40})$/u.test(topic)) throw httpError(400, 'موضوع الإشعار غير صالح');
  const r = db.prepare('INSERT INTO notifications(title,body,article_id,topic,status,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(title, plain(body, 200), articleId, topic, 'pending', userId, nowIso());
  const id = Number(r.lastInsertRowid);
  await dispatch(id);
  return db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
}

export const listNotifications = (limit = 50) => db.prepare(`SELECT n.*, a.title AS article_title FROM notifications n
  LEFT JOIN articles a ON a.id=n.article_id ORDER BY n.id DESC LIMIT ?`).all(limit);

export function registerDevice({ token, platform = 'android' }) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 400) throw httpError(400, 'رمز الجهاز غير صالح');
  const now = nowIso();
  db.prepare(`INSERT INTO devices(token,platform,created_at,last_seen_at) VALUES(?,?,?,?)
    ON CONFLICT(token) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(token, platform === 'ios' ? 'ios' : 'android', now, now);
}
export const deviceCount = () => db.prepare('SELECT COUNT(*) n FROM devices').get().n;

import crypto from 'node:crypto';
import { db, nowIso } from '../db.js';

const SESSION_DAYS = 7;
export const COOKIE = 'np_sid';

// ---- كلمات المرور (scrypt) ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const exp = Buffer.from(keyHex, 'hex');
  return exp.length === key.length && crypto.timingSafeEqual(exp, key);
}
// لتسوية زمن الاستجابة عند عدم وجود المستخدم
const DUMMY = hashPassword('dummy-password');
export const dummyVerify = (pw) => verifyPassword(pw, DUMMY);

export function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 10 && pw.length <= 200;
}

// ---- الجلسات: الرمز العشوائي في كوكي HttpOnly، ويُخزَّن مُجزَّأً فقط ----
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,ip,ua) VALUES(?,?,?,?,?,?)')
    .run(sha(token), userId, nowIso(), exp, req.ip, String(req.get('user-agent') || '').slice(0, 200));
  return { token, expires: new Date(exp) };
}
export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}
export function purgeSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', expires, path: '/' });
}
export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function loadUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.id,u.name,u.email,u.role,u.active,r.permissions,r.label AS role_label
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.name=u.role
    WHERE s.token_hash=? AND s.expires_at > ?`).get(sha(token), nowIso());
  if (!row || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, roleLabel: row.role_label, permissions: JSON.parse(row.permissions), token };
}

/** وسيط: يتطلب تسجيل الدخول + حماية CSRF (ترويسة مخصّصة + فحص Origin) للطلبات المغيِّرة */
export function requireAuth(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.get('x-requested-with') !== 'np-admin') return res.status(403).json({ error: 'طلب غير مصرّح به' });
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'مصدر الطلب غير مسموح' });
  }
  const user = loadUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  req.user = user;
  next();
}
export const can = (user, perm) => !!user && user.permissions.includes(perm);
export const requirePerm = (perm) => (req, res, next) =>
  can(req.user, perm) ? next() : res.status(403).json({ error: 'لا تملك صلاحية لهذا الإجراء' });

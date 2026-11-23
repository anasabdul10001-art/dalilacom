import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { db, PERMISSIONS, allSettings, setSettings, audit, nowIso } from '../db.js';
import { config } from '../config.js';
import { verifyPassword, dummyVerify, createSession, destroySession, setSessionCookie, clearSessionCookie, requireAuth, requirePerm, can, parseCookies, COOKIE, validPassword } from '../lib/auth.js';
import * as A from '../services/articles.js';
import * as C from '../services/categories.js';
import * as M from '../services/media.js';
import * as U from '../services/users.js';
import * as AD from '../services/ads.js';
import * as R from '../services/reels.js';
import * as P from '../services/push.js';
import * as B from '../services/backup.js';
import { overview } from '../services/stats.js';
import { setPassword } from '../services/users.js';
import { bumpVersion } from '../lib/cache.js';

export const admin = Router();

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const id = (req) => { const n = +req.params.id; if (!Number.isInteger(n) || n < 1) throw C.httpError(400, 'معرّف غير صالح'); return n; };
admin.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---------- الدخول ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة. حاول بعد قليل.' } });

admin.post('/login', loginLimiter, wrap(async (req, res) => {
  if (req.get('x-requested-with') !== 'np-admin') return res.status(403).json({ error: 'طلب غير مصرّح به' });
  const { email = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).trim());
  const ok = u ? verifyPassword(String(password), u.password_hash) : (dummyVerify(String(password)), false);
  if (!ok || !u.active) return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
  const s = createSession(u.id, req);
  setSessionCookie(res, s.token, s.expires);
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(nowIso(), u.id);
  audit(u.id, 'login');
  res.json({ ok: true });
}));

admin.post('/logout', (req, res) => {
  destroySession(parseCookies(req)[COOKIE]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

admin.use(requireAuth);

admin.get('/me', (req, res) => {
  const { id, name, email, role, roleLabel, permissions } = req.user;
  res.json({ id, name, email, role, roleLabel, permissions, allPermissions: PERMISSIONS });
});

admin.post('/me/password', wrap(async (req, res) => {
  const { current = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(String(current), u.password_hash)) throw C.httpError(400, 'كلمة المرور الحالية غير صحيحة');
  if (!validPassword(password)) throw C.httpError(400, 'كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف');
  setPassword(req.user.id, password);
  res.json({ ok: true, relogin: true });
}));

// ---------- لوحة المعلومات ----------
admin.get('/dashboard', requirePerm('stats.view'), (req, res) => {
  res.json({ ...overview(Math.min(+req.query.days || 30, 90)), articles: A.counts(), devices: P.deviceCount() });
});

// ---------- الأخبار ----------
const canEditAll = (u) => can(u, 'articles.edit_all');
function assertCanEdit(user, articleId) {
  if (canEditAll(user)) return;
  if (A.rawAuthor(articleId) !== user.id) throw C.httpError(403, 'لا يمكنك تعديل أخبار الآخرين');
}

admin.get('/articles', requirePerm('articles.create'), (req, res) => {
  const q = req.query;
  res.json(A.adminList({
    status: q.status || undefined, categoryId: +q.category || undefined, q: q.q ? String(q.q).slice(0, 100) : undefined,
    authorId: canEditAll(req.user) ? (+q.author || undefined) : req.user.id, page: +q.page || 1, limit: +q.limit || 20,
  }));
});
admin.get('/articles/:id', requirePerm('articles.create'), (req, res) => {
  const a = A.adminGet(id(req));
  if (!a) throw C.httpError(404, 'الخبر غير موجود');
  assertCanEdit(req.user, a.id);
  res.json(a);
});
admin.post('/articles', requirePerm('articles.create'), wrap(async (req, res) => {
  const r = A.saveArticle(req.body || {}, { userId: req.user.id, canPublish: can(req.user, 'articles.publish') });
  audit(req.user.id, 'article.create', r.id);
  await afterPublish(r, req.body, req.user);
  res.status(201).json(A.adminGet(r.id));
}));
admin.put('/articles/:id', requirePerm('articles.create'), wrap(async (req, res) => {
  const aid = id(req);
  assertCanEdit(req.user, aid);
  const r = A.saveArticle(req.body || {}, { id: aid, userId: req.user.id, canPublish: can(req.user, 'articles.publish') });
  audit(req.user.id, 'article.update', aid);
  await afterPublish(r, req.body, req.user);
  res.json(A.adminGet(aid));
}));
admin.post('/articles/:id/status', requirePerm('articles.publish'), (req, res) => {
  const st = req.body?.status;
  if (!['draft', 'review', 'published', 'archived'].includes(st)) throw C.httpError(400, 'حالة غير صالحة');
  A.setStatus(id(req), st);
  audit(req.user.id, `article.${st}`, req.params.id);
  res.json(A.adminGet(id(req)));
});
admin.delete('/articles/:id', requirePerm('articles.delete'), (req, res) => {
  A.deleteArticle(id(req));
  audit(req.user.id, 'article.delete', req.params.id);
  res.json({ ok: true });
});

/** عند نشر خبر عاجل جديد يُرسل إشعار فوري إن طلب المحرر ذلك */
async function afterPublish(r, body, user) {
  if (r.becamePublished && body?.sendPush && can(user, 'notifications.send')) {
    const a = A.adminGet(r.id);
    await P.notify({ title: a.isBreaking ? `عاجل: ${a.title}` : a.title, body: a.summary, articleId: a.id, topic: a.isBreaking ? 'breaking' : 'news', userId: user.id });
  }
}

// ---------- التصنيفات ----------
admin.get('/categories', requirePerm('articles.create'), (req, res) => res.json({ items: C.listCategories({ all: true }) }));
admin.post('/categories', requirePerm('categories.manage'), (req, res) => res.status(201).json(C.saveCategory(req.body || {})));
admin.put('/categories/:id', requirePerm('categories.manage'), (req, res) => res.json(C.saveCategory(req.body || {}, id(req))));
admin.delete('/categories/:id', requirePerm('categories.manage'), (req, res) => { C.deleteCategory(id(req)); res.json({ ok: true }); });

// ---------- الوسائط ----------
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 } });
admin.get('/media', requirePerm('media.manage'), (req, res) => res.json(M.listMedia({ kind: req.query.kind, q: req.query.q, page: +req.query.page || 1 })));
admin.post('/media', requirePerm('media.manage'), upload.array('files', 10), wrap(async (req, res) => {
  const out = [], errors = [];
  for (const f of req.files || []) {
    try { out.push(await M.ingest(f.path, { originalName: f.originalname, alt: req.body.alt, userId: req.user.id })); }
    catch (e) { errors.push({ name: f.originalname, error: e.message }); fs.rm(f.path, { force: true }, () => {}); }
  }
  res.status(out.length ? 201 : 400).json({ items: out, errors });
}));
admin.put('/media/:id', requirePerm('media.manage'), (req, res) => res.json(M.updateMedia(id(req), req.body || {})));
admin.delete('/media/:id', requirePerm('media.manage'), (req, res) => { M.deleteMedia(id(req)); bumpVersion(); res.json({ ok: true }); });

// ---------- المستخدمون والأدوار ----------
admin.get('/users', requirePerm('users.manage'), (req, res) => res.json({ items: U.listUsers(), roles: U.listRoles() }));
admin.post('/users', requirePerm('users.manage'), (req, res) => { const uid = U.saveUser(req.body || {}); audit(req.user.id, 'user.create', uid); res.status(201).json({ id: uid }); });
admin.put('/users/:id', requirePerm('users.manage'), (req, res) => { U.saveUser(req.body || {}, id(req)); audit(req.user.id, 'user.update', req.params.id); res.json({ ok: true }); });
admin.delete('/users/:id', requirePerm('users.manage'), (req, res) => {
  if (id(req) === req.user.id) throw C.httpError(409, 'لا يمكنك حذف حسابك');
  U.deleteUser(id(req)); audit(req.user.id, 'user.delete', req.params.id); res.json({ ok: true });
});
admin.put('/roles/:name', requirePerm('users.manage'), (req, res) => { U.saveRole(req.params.name, req.body || {}); audit(req.user.id, 'role.save', req.params.name); res.json({ ok: true }); });
admin.delete('/roles/:name', requirePerm('users.manage'), (req, res) => { U.deleteRole(req.params.name); res.json({ ok: true }); });

// ---------- الإعلانات ----------
admin.get('/reels', requirePerm('media.manage'), (req, res) => res.json(R.listReels({ all: true, limit: 50, page: +req.query.page || 1 })));
admin.post('/reels', requirePerm('media.manage'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw C.httpError(400, 'اختر ملف فيديو');
  const r = await R.addReel(req.file.path, { title: req.body.title, originalName: req.file.originalname, userId: req.user.id });
  bumpVersion(); res.status(201).json(r);
}));
admin.put('/reels/:id', requirePerm('media.manage'), (req, res) => { R.setActive(id(req), !!(req.body || {}).active); bumpVersion(); res.json({ ok: true }); });
admin.delete('/reels/:id', requirePerm('media.manage'), (req, res) => { R.deleteReel(id(req)); bumpVersion(); res.json({ ok: true }); });
admin.get('/ads', requirePerm('ads.manage'), (req, res) => res.json({ items: AD.listAds(), placements: AD.PLACEMENTS }));
admin.post('/ads', requirePerm('ads.manage'), (req, res) => res.status(201).json(AD.saveAd(req.body || {})));
admin.put('/ads/:id', requirePerm('ads.manage'), (req, res) => res.json(AD.saveAd(req.body || {}, id(req))));
admin.delete('/ads/:id', requirePerm('ads.manage'), (req, res) => { AD.deleteAd(id(req)); res.json({ ok: true }); });

// ---------- الإشعارات ----------
admin.get('/notifications', requirePerm('notifications.send'), (req, res) =>
  res.json({ items: P.listNotifications(), configured: P.pushConfigured(), devices: P.deviceCount() }));
admin.post('/notifications', requirePerm('notifications.send'), wrap(async (req, res) => {
  const b = req.body || {};
  const n = await P.notify({ title: b.title, body: b.body, articleId: +b.articleId || null, topic: b.topic || 'breaking', userId: req.user.id });
  audit(req.user.id, 'notify', n.id);
  res.status(201).json(n);
}));

// ---------- الإعدادات والنسخ الاحتياطي ----------
admin.get('/settings', requirePerm('settings.manage'), (req, res) => res.json(allSettings()));
admin.put('/settings', requirePerm('settings.manage'), (req, res) => { setSettings(req.body || {}); bumpVersion(); res.json(allSettings()); });
admin.get('/backups', requirePerm('settings.manage'), (req, res) => res.json({ items: B.listBackups() }));
admin.post('/backups', requirePerm('settings.manage'), (req, res) => { const n = B.createBackup(); audit(req.user.id, 'backup', n); res.status(201).json({ name: n }); });
admin.get('/backups/:name', requirePerm('settings.manage'), (req, res) => {
  const p = B.backupPath(req.params.name);
  if (!p || !fs.existsSync(p)) throw C.httpError(404, 'غير موجود');
  res.download(p);
});

admin.use((req, res) => res.status(404).json({ error: 'غير موجود' }));

import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { db } from './db.js';
import { api } from './routes/api.js';
import { admin } from './routes/admin.js';
import { web, notFound } from './routes/web.js';
import { startJobs } from './services/jobs.js';
import { hashPassword } from './lib/auth.js';
import { ensureCoreSections } from './services/categories.js';
import { nowIso } from './db.js';
import { toStr } from './lib/html.js';
import { errorPage } from './views/pages.js';
import crypto from 'node:crypto';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.set('etag', 'strong');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'https:'],
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://www.youtube.com'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));
  app.use(compression());

  // حد عام للطلبات على كل عنوان IP
  app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: (r) => r.path.startsWith('/uploads') || r.path.startsWith('/css') || r.path.startsWith('/js') }));

  // ملفات ثابتة
  const longCache = { maxAge: '365d', immutable: true };
  app.use('/uploads', express.static(config.uploadDir, { ...longCache, index: false, dotfiles: 'deny', fallthrough: false }));
  app.use(express.static(config.publicDir, { maxAge: '7d', index: false, redirect: false, dotfiles: 'deny', setHeaders: (res, p) => { if (p.includes(`${path.sep}admin${path.sep}`) || p.endsWith('theme.js')) res.set('Cache-Control', 'no-cache'); } }));

  app.use('/api/v1', (req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); }, express.json({ limit: '50kb' }), api);
  app.use('/api/admin', express.json({ limit: '3mb' }), admin);
  app.get(['/admin', '/admin/'], (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(config.publicDir, 'admin/index.html')));
  app.use(web);

  app.use((req, res) => notFound(res));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let msg = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') { status = 413; msg = `حجم الملف أكبر من ${config.maxUploadMb} ميغابايت`; }
    if (err.type === 'entity.parse.failed') { status = 400; msg = 'صيغة الطلب غير صحيحة'; }
    if (err.code === 'ENOENT' && req.path.startsWith('/uploads')) status = 404;
    if (status >= 500) { console.error(err); msg = 'حدث خطأ في الخادم'; }
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: msg });
    res.status(status).type('html').send(toStr(status === 404 ? errorPage() : errorPage()));
  });
  return app;
}

function bootstrapAdmin() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return;
  const email = config.adminEmail || 'admin@example.com';
  let pw = config.adminPassword;
  let generated = false;
  if (!pw || pw.length < 10) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
  db.prepare("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,'admin',?)").run('مدير النظام', email, hashPassword(pw), nowIso());
  console.log(`\n[setup] تم إنشاء مدير النظام: ${email}${generated ? `  كلمة المرور المؤقتة: ${pw}` : ''}\n`);
}

/** قاعدة جاهزة منسوخة (demo-data): نضبط دخول مدير النظام من المتغيرات، وإلا كلمة مرور عشوائية تُكتب مرة واحدة في السجل. */
function setAdminLogin() {
  let pw = config.adminPassword;
  let generated = false;
  if (!pw || pw.length < 10) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
  const row = db.prepare("SELECT id, email FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  if (!row) return;
  const email = config.adminEmail || row.email;
  db.prepare('UPDATE users SET password_hash=?, email=? WHERE id=?').run(hashPassword(pw), email, row.id);
  console.log(`\n[setup] مدير النظام: ${email}${generated ? `  كلمة المرور المؤقتة: ${pw}` : ''}\n`);
}

/** تجهيز قاعدة البيانات والمهام الدورية (يُستدعى مرة واحدة، من هنا أو من خادم دليلكم الذي يستضيف هذا الموقع). */
export async function initNews({ resetAdmin = false } = {}) {
  bootstrapAdmin();
  if (resetAdmin) setAdminLogin();
  if (!db.prepare('SELECT COUNT(*) n FROM categories').get().n && (process.env.SEED_DEMO === '1' || (process.env.SEED_DEMO !== '0' && !config.isProd))) {
    const { seedDemo } = await import('./seed/demo.js');
    await seedDemo();
    console.log('[setup] تمت إضافة محتوى تجريبي عربي (عطّله بـ SEED_DEMO=0)');
  }
  ensureCoreSections();
  fs.mkdirSync(config.uploadDir, { recursive: true });
  startJobs();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await initNews();
  createApp().listen(config.port, () => console.log(`الموقع يعمل على ${config.siteUrl}  |  لوحة الإدارة: ${config.siteUrl}/admin`));
}

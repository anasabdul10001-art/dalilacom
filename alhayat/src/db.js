import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');

// ---- الصلاحيات والأدوار ----
export const PERMISSIONS = {
  'articles.create': 'كتابة الأخبار وتعديل أخباره',
  'articles.edit_all': 'تعديل أخبار الآخرين',
  'articles.publish': 'نشر الأخبار وجدولتها',
  'articles.delete': 'حذف الأخبار',
  'categories.manage': 'إدارة التصنيفات',
  'media.manage': 'رفع الوسائط وإدارتها',
  'ads.manage': 'إدارة الإعلانات',
  'notifications.send': 'إرسال الإشعارات',
  'stats.view': 'عرض الإحصائيات',
  'users.manage': 'إدارة المستخدمين والصلاحيات',
  'settings.manage': 'إعدادات الموقع والنسخ الاحتياطي',
};
const ALL = Object.keys(PERMISSIONS);
export const DEFAULT_ROLES = [
  { name: 'admin', label: 'مدير النظام', permissions: ALL },
  { name: 'gm', label: 'المدير العام', permissions: ALL.filter((p) => !['users.manage', 'settings.manage'].includes(p)) },
  { name: 'chief', label: 'رئيس التحرير', permissions: ALL.filter((p) => !['users.manage', 'settings.manage'].includes(p)) },
  { name: 'editor', label: 'محرّر', permissions: ['articles.create', 'articles.edit_all', 'articles.publish', 'media.manage', 'stats.view'] },
  { name: 'author', label: 'مراسل', permissions: ['articles.create', 'media.manage'] },
  { name: 'ads', label: 'مدير إعلانات', permissions: ['ads.manage', 'stats.view'] },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY, label TEXT NOT NULL, permissions TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL REFERENCES roles(name), bio TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#c62828', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY, filename TEXT NOT NULL, url TEXT NOT NULL, thumb_url TEXT, kind TEXT NOT NULL,
  mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, width INTEGER, height INTEGER,
  alt TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id), author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL, cover_caption TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','scheduled','published','archived')),
  is_breaking INTEGER NOT NULL DEFAULT 0, is_featured INTEGER NOT NULL DEFAULT 0,
  publish_at TEXT, published_at TEXT, views INTEGER NOT NULL DEFAULT 0, reading_minutes INTEGER NOT NULL DEFAULT 1,
  seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cat ON articles(category_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_sched ON articles(status, publish_at);
CREATE INDEX IF NOT EXISTS idx_articles_flags ON articles(status, is_breaking, is_featured);
CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, video_url TEXT NOT NULL, media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1, views INTEGER NOT NULL DEFAULT 0, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id);
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(title, summary, body, tags, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, placement TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'image',
  image_url TEXT NOT NULL DEFAULT '', link_url TEXT NOT NULL DEFAULT '', html TEXT NOT NULL DEFAULT '',
  starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1,
  impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, platform TEXT NOT NULL DEFAULT 'android',
  topics TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL, topic TEXT NOT NULL DEFAULT 'breaking',
  status TEXT NOT NULL DEFAULT 'pending', detail TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS daily_stats (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0,
  web_views INTEGER NOT NULL DEFAULT 0, app_views INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS article_daily (
  day TEXT NOT NULL, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, article_id)
);
CREATE TABLE IF NOT EXISTS visitor_day (day TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (day, hash)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, target TEXT, at TEXT NOT NULL
);
`;
db.exec(SCHEMA);

const upRole = db.prepare(`INSERT INTO roles(name,label,permissions,builtin) VALUES(?,?,?,1)
  ON CONFLICT(name) DO NOTHING`);
for (const r of DEFAULT_ROLES) upRole.run(r.name, r.label, JSON.stringify(r.permissions));

// ---- أدوات مساعدة ----
export const nowIso = () => new Date().toISOString();

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---- الإعدادات ----
export const SETTING_DEFAULTS = {
  site_name: 'جريدة الحياة',
  tagline: 'أخبار عاجلة وتغطية موثوقة على مدار الساعة',
  description: 'جريدة الحياة: جريدة عربية تقدّم الأخبار العاجلة والتقارير والتحليلات في السياسة والاقتصاد والرياضة والتقنية والثقافة.',
  timezone: 'Asia/Riyadh',
  contact_email: 'info@example.com',
  twitter: '', facebook: '', youtube: '', instagram: '', telegram: '',
  app_android_url: '',
  ticker_enabled: '1', ads_enabled: '1',
};
let settingsCache = null;
export function allSettings() {
  if (!settingsCache) {
    settingsCache = { ...SETTING_DEFAULTS };
    for (const r of db.prepare('SELECT key,value FROM settings').all()) settingsCache[r.key] = r.value;
  }
  return settingsCache;
}
export function setSettings(obj) {
  const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  tx(() => {
    for (const [k, v] of Object.entries(obj)) if (k in SETTING_DEFAULTS) up.run(k, String(v ?? ''));
  });
  settingsCache = null;
}

export function audit(userId, action, target = '') {
  db.prepare('INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)').run(userId ?? null, action, String(target), nowIso());
}

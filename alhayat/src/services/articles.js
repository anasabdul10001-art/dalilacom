import { db, tx, nowIso } from '../db.js';
import { slugify, readingMinutes, stripHtml, normalizeAr, ftsQuery, truncate } from '../lib/text.js';
import { cleanBody, plain, safeUrl } from '../lib/sanitize.js';
import { bumpVersion } from '../lib/cache.js';
import { httpError, categoryById } from './categories.js';

const BASE = `SELECT a.*, c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color, u.name AS author_name,
  m.url AS cover_url, m.thumb_url AS cover_thumb, m.width AS cover_w, m.height AS cover_h, m.alt AS cover_alt
  FROM articles a JOIN categories c ON c.id=a.category_id
  LEFT JOIN users u ON u.id=a.author_id LEFT JOIN media m ON m.id=a.cover_media_id`;
const LIVE = `a.status='published' AND a.published_at <= ?`;

export const articleUrl = (a) => `/news/${a.id}/${a.slug}`;

function tagsFor(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = db.prepare(`SELECT at.article_id aid, t.slug, t.name FROM article_tags at JOIN tags t ON t.id=at.tag_id
    WHERE at.article_id IN (${ids.map(() => '?').join(',')}) ORDER BY t.name`).all(...ids);
  for (const r of rows) {
    if (!map.has(r.aid)) map.set(r.aid, []);
    map.get(r.aid).push({ slug: r.slug, name: r.name });
  }
  return map;
}

/** تحويل صف قاعدة البيانات إلى كائن موحّد يستخدمه الموقع والتطبيق ولوحة الإدارة */
function shape(r, tags, { full = false } = {}) {
  const o = {
    id: r.id, slug: r.slug, url: articleUrl(r), title: r.title, subtitle: r.subtitle, summary: r.summary,
    category: { id: r.category_id, slug: r.cat_slug, name: r.cat_name, color: r.cat_color },
    author: r.author_name || null,
    cover: r.cover_url ? { url: r.cover_url, thumb: r.cover_thumb || r.cover_url, caption: r.cover_caption, alt: r.cover_alt || r.title, width: r.cover_w, height: r.cover_h } : null,
    videoUrl: r.video_url || null,
    isBreaking: !!r.is_breaking, isFeatured: !!r.is_featured,
    publishedAt: r.published_at, updatedAt: r.updated_at, views: r.views, readingMinutes: r.reading_minutes,
    tags: tags.get(r.id) || [],
  };
  if (full) {
    o.body = r.body; o.source = r.source; o.seoTitle = r.seo_title; o.seoDescription = r.seo_description;
  }
  return o;
}
const shapeMany = (rows, opts) => {
  const tags = tagsFor(rows.map((r) => r.id));
  return rows.map((r) => shape(r, tags, opts));
};

// ---------- القراءة العامة ----------
export function listPublished({ categoryId, tag, page = 1, limit = 12, excludeIds = [], ids, breaking, year, month } = {}) {
  const where = [LIVE], args = [nowIso()];
  if (categoryId) { where.push('a.category_id=?'); args.push(categoryId); }
  if (breaking) where.push('a.is_breaking=1');
  if (ids?.length) { where.push(`a.id IN (${ids.map(() => '?').join(',')})`); args.push(...ids); }
  if (excludeIds.length) { where.push(`a.id NOT IN (${excludeIds.map(() => '?').join(',')})`); args.push(...excludeIds); }
  if (tag) { where.push('a.id IN (SELECT at.article_id FROM article_tags at JOIN tags t ON t.id=at.tag_id WHERE t.slug=?)'); args.push(tag); }
  if (year) {
    const from = new Date(Date.UTC(year, (month || 1) - 1, 1)).toISOString();
    const to = new Date(Date.UTC(month ? year : year + 1, month ? month : 0, 1)).toISOString();
    where.push('a.published_at >= ? AND a.published_at < ?'); args.push(from, to);
  }
  limit = Math.min(Math.max(+limit || 12, 1), 50); page = Math.max(+page || 1, 1);
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM articles a WHERE ${w}`).get(...args).n;
  const rows = db.prepare(`${BASE} WHERE ${w} ORDER BY a.published_at DESC, a.id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { items: shapeMany(rows), total, page, pages: Math.ceil(total / limit) || 1, limit };
}

export function getPublished(id) {
  const r = db.prepare(`${BASE} WHERE a.id=? AND ${LIVE}`).get(id, nowIso());
  return r ? shapeMany([r], { full: true })[0] : null;
}

export function breakingNews(limit = 8) {
  const since = new Date(Date.now() - 36 * 36e5).toISOString();
  const rows = db.prepare(`${BASE} WHERE ${LIVE} AND a.is_breaking=1 AND a.published_at >= ? ORDER BY a.published_at DESC LIMIT ?`).all(nowIso(), since, limit);
  return shapeMany(rows);
}

export function featuredArticle() {
  const now = nowIso();
  const r = db.prepare(`${BASE} WHERE ${LIVE} AND a.is_featured=1 ORDER BY a.published_at DESC LIMIT 1`).get(now)
    || db.prepare(`${BASE} WHERE ${LIVE} ORDER BY a.published_at DESC LIMIT 1`).get(now);
  return r ? shapeMany([r])[0] : null;
}

export function mostRead({ days = 7, limit = 6 } = {}) {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const ids = db.prepare(`SELECT article_id id, SUM(views) v FROM article_daily WHERE day >= ?
    GROUP BY article_id ORDER BY v DESC LIMIT ?`).all(from, limit * 2).map((r) => r.id);
  let rows = ids.length
    ? db.prepare(`${BASE} WHERE ${LIVE} AND a.id IN (${ids.map(() => '?').join(',')})`).all(nowIso(), ...ids)
    : [];
  rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  rows = rows.slice(0, limit);
  if (rows.length < limit) { // احتياطي عند قلة البيانات
    const have = new Set(rows.map((r) => r.id));
    const more = db.prepare(`${BASE} WHERE ${LIVE} ORDER BY a.views DESC LIMIT ?`).all(nowIso(), limit + have.size)
      .filter((r) => !have.has(r.id)).slice(0, limit - rows.length);
    rows = rows.concat(more);
  }
  return shapeMany(rows);
}

export function related(article, limit = 4) {
  const rows = db.prepare(`${BASE} WHERE ${LIVE} AND a.id != ? AND (a.category_id=? OR a.id IN
      (SELECT at2.article_id FROM article_tags at2 WHERE at2.tag_id IN (SELECT tag_id FROM article_tags WHERE article_id=?)))
    ORDER BY (a.category_id=?) DESC, a.published_at DESC LIMIT ?`).all(nowIso(), article.id, article.category.id, article.id, article.category.id, limit);
  return shapeMany(rows);
}

export function search(q, { page = 1, limit = 12 } = {}) {
  const fq = ftsQuery(q);
  if (!fq) return { items: [], total: 0, page: 1, pages: 1, limit };
  limit = Math.min(Math.max(+limit || 12, 1), 50); page = Math.max(+page || 1, 1);
  const now = nowIso();
  const total = db.prepare(`SELECT COUNT(*) n FROM articles_fts f JOIN articles a ON a.id=f.rowid WHERE articles_fts MATCH ? AND ${LIVE}`).get(fq, now).n;
  const rows = db.prepare(`${BASE.replace('FROM articles a', 'FROM articles_fts f JOIN articles a ON a.id=f.rowid')}
    WHERE articles_fts MATCH ? AND ${LIVE} ORDER BY bm25(articles_fts, 10, 4, 1, 3), a.published_at DESC LIMIT ? OFFSET ?`)
    .all(fq, now, limit, (page - 1) * limit);
  return { items: shapeMany(rows), total, page, pages: Math.ceil(total / limit) || 1, limit };
}

export function archiveMonths() {
  return db.prepare(`SELECT substr(published_at,1,4) AS year, substr(published_at,6,2) AS month, COUNT(*) AS count
    FROM articles WHERE status='published' AND published_at <= ? GROUP BY 1,2 ORDER BY 1 DESC, 2 DESC`).all(nowIso())
    .map((r) => ({ year: +r.year, month: +r.month, count: r.count }));
}

export function popularTags(limit = 12) {
  return db.prepare(`SELECT t.slug, t.name, COUNT(*) n FROM tags t JOIN article_tags at ON at.tag_id=t.id
    JOIN articles a ON a.id=at.article_id WHERE a.status='published' GROUP BY t.id ORDER BY n DESC, t.name LIMIT ?`).all(limit);
}
export const tagBySlug = (slug) => db.prepare('SELECT * FROM tags WHERE slug=?').get(slug);

/** مقالات الوسائط (فيديو/صور) */
export function videos(limit = 12, page = 1) {
  const now = nowIso();
  const w = `${LIVE} AND a.video_url != ''`;
  const total = db.prepare(`SELECT COUNT(*) n FROM articles a WHERE ${w}`).get(now).n;
  const rows = db.prepare(`${BASE} WHERE ${w} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`).all(now, limit, (page - 1) * limit);
  return { items: shapeMany(rows), total, page, pages: Math.ceil(total / limit) || 1, limit };
}

// ---------- لوحة الإدارة ----------
export function adminList({ status, categoryId, q, authorId, page = 1, limit = 20 } = {}) {
  const where = ['1=1'], args = [];
  if (status) { where.push('a.status=?'); args.push(status); }
  if (categoryId) { where.push('a.category_id=?'); args.push(categoryId); }
  if (authorId) { where.push('a.author_id=?'); args.push(authorId); }
  if (q) { where.push('a.title LIKE ?'); args.push(`%${q}%`); }
  limit = Math.min(Math.max(+limit || 20, 1), 100); page = Math.max(+page || 1, 1);
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM articles a WHERE ${w}`).get(...args).n;
  const rows = db.prepare(`${BASE} WHERE ${w} ORDER BY COALESCE(a.published_at, a.publish_at, a.updated_at) DESC, a.id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  const items = shapeMany(rows).map((it, i) => ({ ...it, status: rows[i].status, publishAt: rows[i].publish_at, authorId: rows[i].author_id, createdAt: rows[i].created_at }));
  return { items, total, page, pages: Math.ceil(total / limit) || 1, limit };
}

export function adminGet(id) {
  const r = db.prepare(`${BASE} WHERE a.id=?`).get(id);
  if (!r) return null;
  const o = shapeMany([r], { full: true })[0];
  return { ...o, status: r.status, publishAt: r.publish_at, authorId: r.author_id, coverMediaId: r.cover_media_id, coverCaption: r.cover_caption };
}
export const rawAuthor = (id) => db.prepare('SELECT author_id FROM articles WHERE id=?').get(id)?.author_id;

function upsertTags(articleId, names) {
  db.prepare('DELETE FROM article_tags WHERE article_id=?').run(articleId);
  const out = [];
  for (const raw of [...new Set((names || []).map((n) => plain(n, 40)).filter(Boolean))].slice(0, 10)) {
    const slug = slugify(raw, 40);
    db.prepare('INSERT INTO tags(slug,name) VALUES(?,?) ON CONFLICT(slug) DO NOTHING').run(slug, raw);
    const t = db.prepare('SELECT id,name FROM tags WHERE slug=?').get(slug);
    db.prepare('INSERT OR IGNORE INTO article_tags(article_id,tag_id) VALUES(?,?)').run(articleId, t.id);
    out.push(t.name);
  }
  return out;
}

function reindex(id, tagNames) {
  const a = db.prepare('SELECT title,summary,body FROM articles WHERE id=?').get(id);
  db.prepare('DELETE FROM articles_fts WHERE rowid=?').run(id);
  db.prepare('INSERT INTO articles_fts(rowid,title,summary,body,tags) VALUES(?,?,?,?,?)')
    .run(id, normalizeAr(a.title), normalizeAr(a.summary), normalizeAr(stripHtml(a.body)), normalizeAr(tagNames.join(' ')));
}

/**
 * إنشاء/تعديل خبر. `canPublish` يحدد ما إذا كان المستخدم يملك صلاحية النشر والجدولة.
 */
export function saveArticle(input, { id = null, userId, canPublish }) {
  const title = plain(input.title, 200);
  if (!title) throw httpError(400, 'عنوان الخبر مطلوب');
  const category = categoryById(+input.categoryId);
  if (!category) throw httpError(400, 'التصنيف غير صالح');
  const body = cleanBody(input.body || '');
  const summary = plain(input.summary, 400) || truncate(stripHtml(body), 200);

  const prev = id ? db.prepare('SELECT * FROM articles WHERE id=?').get(id) : null;
  if (id && !prev) throw httpError(404, 'الخبر غير موجود');

  let status = ['draft', 'review', 'scheduled', 'published', 'archived'].includes(input.status) ? input.status : (prev?.status || 'draft');
  if (!canPublish && ['scheduled', 'published', 'archived'].includes(status)) {
    // المراسل لا ينشر: يبقى كما كان إن كان منشوراً سابقاً، وإلا يُحوَّل للمراجعة
    status = prev?.status === status ? status : 'review';
  }
  let publishAt = null, publishedAt = prev?.published_at || null;
  if (status === 'scheduled') {
    const d = new Date(input.publishAt);
    if (isNaN(d)) throw httpError(400, 'تاريخ الجدولة غير صالح');
    if (d.getTime() <= Date.now() + 5000) { status = 'published'; } else publishAt = d.toISOString();
  }
  if (status === 'published') {
    publishedAt = (input.publishedAt && canPublish && !isNaN(new Date(input.publishedAt)))
      ? new Date(input.publishedAt).toISOString()
      : (prev?.status === 'published' ? prev.published_at : nowIso());
  }
  if (status !== 'published' && status !== 'archived') publishedAt = prev?.status === 'published' ? null : publishedAt;

  const isBreaking = canPublish && input.isBreaking ? 1 : (canPublish ? 0 : prev?.is_breaking || 0);
  const isFeatured = canPublish && input.isFeatured ? 1 : (canPublish ? 0 : prev?.is_featured || 0);
  const now = nowIso();
  const vals = {
    subtitle: plain(input.subtitle, 250), source: plain(input.source, 120), coverCaption: plain(input.coverCaption, 250),
    video: safeUrl(input.videoUrl), seoTitle: plain(input.seoTitle, 120), seoDesc: plain(input.seoDescription, 200),
    cover: input.coverMediaId ? +input.coverMediaId : null,
  };

  const resultId = tx(() => {
    let aid = id;
    if (id) {
      db.prepare(`UPDATE articles SET title=?,subtitle=?,summary=?,body=?,category_id=?,cover_media_id=?,cover_caption=?,video_url=?,source=?,
        status=?,is_breaking=?,is_featured=?,publish_at=?,published_at=?,reading_minutes=?,seo_title=?,seo_description=?,updated_at=? WHERE id=?`)
        .run(title, vals.subtitle, summary, body, category.id, vals.cover, vals.coverCaption, vals.video, vals.source, status, isBreaking, isFeatured,
          publishAt, publishedAt, readingMinutes(body), vals.seoTitle, vals.seoDesc, now, id);
      if (title !== prev.title && prev.status !== 'published') db.prepare('UPDATE articles SET slug=? WHERE id=?').run(slugify(title), id);
    } else {
      aid = Number(db.prepare(`INSERT INTO articles(slug,title,subtitle,summary,body,category_id,author_id,cover_media_id,cover_caption,video_url,source,
        status,is_breaking,is_featured,publish_at,published_at,reading_minutes,seo_title,seo_description,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(slugify(title), title, vals.subtitle, summary, body, category.id, userId, vals.cover, vals.coverCaption, vals.video, vals.source, status,
          isBreaking, isFeatured, publishAt, publishedAt, readingMinutes(body), vals.seoTitle, vals.seoDesc, now, now).lastInsertRowid);
    }
    if (isFeatured && status === 'published') db.prepare('UPDATE articles SET is_featured=0 WHERE id != ?').run(aid);
    const tagNames = upsertTags(aid, input.tags);
    reindex(aid, tagNames);
    return aid;
  });
  bumpVersion();
  return { id: resultId, becamePublished: status === 'published' && prev?.status !== 'published' };
}

export function setStatus(id, status) {
  db.prepare('UPDATE articles SET status=?, published_at = CASE WHEN ?=\'published\' AND published_at IS NULL THEN ? ELSE published_at END, updated_at=? WHERE id=?')
    .run(status, status, nowIso(), nowIso(), id);
  bumpVersion();
}

export function deleteArticle(id) {
  tx(() => {
    db.prepare('DELETE FROM articles_fts WHERE rowid=?').run(id);
    db.prepare('DELETE FROM articles WHERE id=?').run(id);
  });
  bumpVersion();
}

/** ينشر الأخبار المجدولة التي حان وقتها. يُرجع الأخبار التي نُشرت للتو. */
export function publishDue() {
  const now = nowIso();
  const due = db.prepare("SELECT id,is_breaking FROM articles WHERE status='scheduled' AND publish_at <= ?").all(now);
  if (!due.length) return [];
  tx(() => {
    for (const d of due) db.prepare("UPDATE articles SET status='published', published_at=publish_at, publish_at=NULL, updated_at=? WHERE id=?").run(now, d.id);
  });
  bumpVersion();
  return due;
}

export function counts() {
  return Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM articles GROUP BY status').all().map((r) => [r.status, r.n]));
}

import { Router } from 'express';
import crypto from 'node:crypto';
import { allSettings, db } from '../db.js';
import { config } from '../config.js';
import * as A from '../services/articles.js';
import { listCategories, categoryBySlug } from '../services/categories.js';
import * as ads from '../services/ads.js';
import * as R from '../services/reels.js';
import { recordVisit } from '../services/stats.js';
import { pageGet, pageSet } from '../lib/cache.js';
import { toStr } from '../lib/html.js';
import { monthName } from '../lib/time.js';
import * as V from '../views/pages.js';
import { seo } from './seo.js';

export const web = Router();
web.use(seo);

const pageNum = (req) => Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 500);

/** يخدم صفحة مُولَّدة مع ذاكرة مؤقتة + ETag + تسجيل الزيارة */
function serve(req, res, build, { ttl = 60_000, article = null } = {}) {
  recordVisit({ ip: req.ip, ua: req.get('user-agent'), articleId: article, source: 'web' });
  const key = req.originalUrl;
  let hit = pageGet(key);
  if (!hit) {
    const out = build();
    if (out == null) return null;
    const body = toStr(out);
    hit = { body, etag: '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"' };
    pageSet(key, hit, ttl);
  }
  res.set({ 'Content-Type': 'text/html; charset=utf-8', ETag: hit.etag, 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' });
  if (req.get('if-none-match') === hit.etag) return res.status(304).end();
  return res.send(hit.body);
}
const notFound = (res) => res.status(404).type('html').send(toStr(V.notFoundPage()));
const nabdId = () => db.prepare("SELECT id FROM categories WHERE slug='nabd' AND active=1").get()?.id;
const sideData = () => {
  const n = nabdId();
  return { mostRead: A.mostRead({ limit: 6 }), tags: A.popularTags(12), nabd: n ? A.listPublished({ categoryId: n, limit: 3 }).items : [], reels: R.listReels({ limit: 3 }).items };
};
/** يضيف مسمّى كاتب المقال الوظيفي (مدير عام / رئيس تحرير ...) */
function withAuthorRole(result) {
  if (!result.items.length) return result;
  const q = db.prepare(`SELECT a.id, r.label FROM articles a JOIN users u ON u.id=a.author_id JOIN roles r ON r.name=u.role WHERE a.id IN (${result.items.map(() => '?').join(',')})`).all(...result.items.map((a) => a.id));
  const m = new Map(q.map((r) => [r.id, r.label]));
  return { ...result, items: result.items.map((a) => ({ ...a, authorRole: m.get(a.id) || '' })) };
}

web.get('/', (req, res) => serve(req, res, () => {
  const featured = A.featuredArticle();
  const latest = A.listPublished({ limit: 14, excludeIds: featured ? [featured.id] : [] }).items;
  const sections = listCategories().filter((c) => c.slug !== 'nabd').map((c) => ({ category: c, items: A.listPublished({ categoryId: c.id, limit: 4 }).items })).filter((s) => s.items.length);
  return V.homePage({ featured, latest, sections, ...sideData() });
}, { ttl: 30_000 }));

web.get('/news/:id{/:slug}', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const a = id > 0 ? A.getPublished(id) : null;
  if (!a) return notFound(res);
  if (req.params.slug !== a.slug) return res.redirect(301, a.url);
  return serve(req, res, () => V.articlePage(a, { related: A.related(a, 4), ...sideData() }), { article: a.id, ttl: 120_000 });
});

web.get('/latest', (req, res) => serve(req, res, () => {
  const result = A.listPublished({ page: pageNum(req), limit: 15 });
  return V.listPage({ title: 'آخر الأخبار', heading: 'آخر الأخبار', description: 'أحدث ما نُشر في جميع الأقسام.', path: '/latest', result, hrefFor: (n) => `/latest?page=${n}`, ...sideData() });
}));

web.get('/nabd', (req, res) => serve(req, res, () => {
  const n = nabdId();
  return V.nabdPage(withAuthorRole(n ? A.listPublished({ categoryId: n, page: pageNum(req), limit: 12 }) : { items: [], page: 1, pages: 1, total: 0 }));
}));
web.get('/reels', (req, res) => serve(req, res, () => V.reelsPage(R.listReels({ page: pageNum(req), limit: 12 }))));

web.get('/category/:slug', (req, res) => {
  if (req.params.slug === 'nabd') return res.redirect(301, '/nabd');
  const c = categoryBySlug(req.params.slug);
  if (!c) return notFound(res);
  return serve(req, res, () => {
    const result = A.listPublished({ categoryId: c.id, page: pageNum(req), limit: 15 });
    const path = `/category/${encodeURIComponent(c.slug)}`;
    return V.listPage({ title: c.name, heading: c.name, description: c.description || `آخر أخبار ${c.name}`, color: c.color, path, result, hrefFor: (n) => `${path}?page=${n}`, activeCat: c.slug, ...sideData() });
  });
});

web.get('/tag/:slug', (req, res) => {
  const t = A.tagBySlug(req.params.slug);
  if (!t) return notFound(res);
  return serve(req, res, () => {
    const result = A.listPublished({ tag: t.slug, page: pageNum(req), limit: 15 });
    const path = `/tag/${encodeURIComponent(t.slug)}`;
    return V.listPage({ title: t.name, heading: `# ${t.name}`, description: `كل الأخبار المتعلقة بـ ${t.name}`, path, result, hrefFor: (n) => `${path}?page=${n}`, ...sideData() });
  });
});

web.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  return serve(req, res, () => {
    const result = A.search(q, { page: pageNum(req), limit: 12 });
    return V.listPage({
      title: q ? `نتائج البحث: ${q}` : 'البحث', heading: q ? `نتائج البحث عن «${q}»` : 'البحث',
      description: q ? `${result.total} نتيجة` : 'اكتب كلمة للبحث في الأخبار.', path: '/search', result,
      hrefFor: (n) => `/search?q=${encodeURIComponent(q)}&page=${n}`, noindex: true, ...sideData(),
    });
  }, { ttl: 20_000 });
});

web.get('/archive', (req, res) => serve(req, res, () => V.archivePage(A.archiveMonths())));
web.get('/archive/:y/:m', (req, res) => {
  const y = parseInt(req.params.y, 10), m = parseInt(req.params.m, 10);
  if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12)) return notFound(res);
  return serve(req, res, () => {
    const result = A.listPublished({ year: y, month: m, page: pageNum(req), limit: 20 });
    const path = `/archive/${y}/${m}`;
    return V.listPage({ title: `أرشيف ${monthName(m)} ${y}`, heading: `أرشيف ${monthName(m)} ${y}`, description: `${result.total} خبراً`, path, result, hrefFor: (n) => `${path}?page=${n}`, ...sideData() });
  });
});

web.get('/videos', (req, res) => serve(req, res, () => V.videosPage(A.videos(12, pageNum(req)))));
web.get('/photos', (req, res) => serve(req, res, () => V.photosPage(A.listPublished({ page: pageNum(req), limit: 18 }))));

web.get('/page/:slug', (req, res) => {
  const p = V.staticPage(req.params.slug);
  if (!p) return notFound(res);
  res.type('html').send(toStr(p));
});

web.get('/go/:id', (req, res) => {
  const url = ads.click(parseInt(req.params.id, 10));
  if (!url) return notFound(res);
  res.set('Cache-Control', 'no-store').redirect(302, url);
});

export { notFound, allSettings };

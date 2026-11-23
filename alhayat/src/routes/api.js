import { Router } from 'express';
import { allSettings } from '../db.js';
import * as R from '../services/reels.js';
import * as A from '../services/articles.js';
import { listCategories, categoryBySlug } from '../services/categories.js';
import * as ads from '../services/ads.js';
import { recordVisit } from '../services/stats.js';
import { registerDevice } from '../services/push.js';

/** API العام المشترك بين الموقع وتطبيق الأندرويد: /api/v1 */
export const api = Router();

api.use((req, res, next) => {
  res.set('Cache-Control', req.method === 'GET' ? 'public, max-age=30, stale-while-revalidate=120' : 'no-store');
  next();
});

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const int = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : d);

api.get('/settings', (req, res) => {
  const s = allSettings();
  res.json({ siteName: s.site_name, tagline: s.tagline, description: s.description, social: { twitter: s.twitter, facebook: s.facebook, youtube: s.youtube, instagram: s.instagram, telegram: s.telegram } });
});

api.get('/categories', (req, res) => res.json({ items: listCategories() }));

/** الصفحة الرئيسية في طلب واحد: عاجل + الخبر الرئيسي + آخر الأخبار + الأكثر قراءة + أقسام التصنيفات */
api.get('/home', (req, res) => {
  const breaking = A.breakingNews(6);
  const featured = A.featuredArticle();
  const exclude = featured ? [featured.id] : [];
  const latest = A.listPublished({ limit: 10, excludeIds: exclude }).items;
  const sections = listCategories().map((c) => ({ category: c, items: A.listPublished({ categoryId: c.id, limit: 4 }).items })).filter((s) => s.items.length);
  res.json({ breaking, featured, latest, mostRead: A.mostRead({ limit: 6 }), sections });
});

api.get('/articles', (req, res) => {
  const { category, tag, page, limit, ids, breaking, year, month } = req.query;
  let categoryId;
  if (category) {
    const c = categoryBySlug(String(category));
    if (!c) return res.json({ items: [], total: 0, page: 1, pages: 1, limit: 12 });
    categoryId = c.id;
  }
  const idList = ids ? String(ids).split(',').map(Number).filter(Number.isInteger).slice(0, 100) : undefined;
  res.json(A.listPublished({ categoryId, tag: tag ? String(tag) : undefined, page, limit: int(limit, 12), ids: idList, breaking: breaking === '1', year: int(year, 0) || undefined, month: int(month, 0) || undefined }));
});

api.get('/articles/:id', (req, res) => {
  const a = A.getPublished(int(req.params.id, 0));
  if (!a) return res.status(404).json({ error: 'الخبر غير موجود' });
  res.json({ ...a, related: A.related(a, 4) });
});

/** تسجيل قراءة من التطبيق (الموقع يسجّلها عند عرض الصفحة) */
api.post('/articles/:id/view', (req, res) => {
  const id = int(req.params.id, 0);
  if (A.getPublished(id)) recordVisit({ ip: req.ip, ua: req.get('user-agent'), articleId: id, source: 'app' });
  res.status(204).end();
});

api.get('/breaking', (req, res) => res.json({ items: A.breakingNews(10) }));
api.get('/most-read', (req, res) => res.json({ items: A.mostRead({ days: int(req.query.days, 7), limit: int(req.query.limit, 10) }) }));
api.get('/search', (req, res) => res.json(A.search(String(req.query.q || '').slice(0, 100), { page: int(req.query.page, 1), limit: int(req.query.limit, 12) })));
api.get('/archive', (req, res) => res.json({ months: A.archiveMonths() }));
api.get('/tags', (req, res) => res.json({ items: A.popularTags(30) }));
api.get('/reels', (req, res) => res.json(R.listReels({ limit: int(req.query.limit, 12), page: int(req.query.page, 1) })));
api.get('/videos', (req, res) => res.json(A.videos(int(req.query.limit, 12), int(req.query.page, 1))));

api.get('/ads', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ad = ads.pick(String(req.query.placement || ''));
  res.json({ ad });
});

api.post('/devices', wrap(async (req, res) => {
  registerDevice(req.body || {});
  res.status(204).end();
}));

api.use((req, res) => res.status(404).json({ error: 'غير موجود' }));

import { Router } from 'express';
import { config } from '../config.js';
import { allSettings, db, nowIso } from '../db.js';
import { listCategories } from '../services/categories.js';
import * as A from '../services/articles.js';
import { abs } from '../views/layout.js';
import { esc } from '../lib/html.js';

export const seo = Router();
const xml = (res, body, type = 'application/xml') => res.set({ 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=300' }).send(body);

seo.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nDisallow: /search\nDisallow: /go/\n\nSitemap: ${config.siteUrl}/sitemap.xml\nSitemap: ${config.siteUrl}/news-sitemap.xml\n`);
});

seo.get('/sitemap.xml', (req, res) => {
  const urls = [{ loc: '/', pr: '1.0', cf: 'always' }, { loc: '/videos', cf: 'daily' }, { loc: '/archive', cf: 'daily' }, { loc: '/photos', cf: 'daily' }];
  for (const c of listCategories()) urls.push({ loc: `/category/${encodeURIComponent(c.slug)}`, pr: '0.8', cf: 'hourly' });
  const arts = db.prepare("SELECT id,slug,updated_at,published_at FROM articles WHERE status='published' AND published_at <= ? ORDER BY published_at DESC LIMIT 5000").all(nowIso());
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>${esc(config.siteUrl + u.loc)}</loc><changefreq>${u.cf}</changefreq>${u.pr ? `<priority>${u.pr}</priority>` : ''}</url>`).join('\n') + '\n' +
    arts.map((a) => `<url><loc>${esc(`${config.siteUrl}/news/${a.id}/${encodeURI(a.slug)}`)}</loc><lastmod>${a.updated_at}</lastmod></url>`).join('\n') + '\n</urlset>';
  xml(res, body);
});

/** خريطة أخبار جوجل: آخر 48 ساعة */
seo.get('/news-sitemap.xml', (req, res) => {
  const s = allSettings();
  const since = new Date(Date.now() - 48 * 36e5).toISOString();
  const arts = db.prepare("SELECT id,slug,title,published_at FROM articles WHERE status='published' AND published_at BETWEEN ? AND ? ORDER BY published_at DESC LIMIT 1000").all(since, nowIso());
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n` +
    arts.map((a) => `<url><loc>${esc(`${config.siteUrl}/news/${a.id}/${encodeURI(a.slug)}`)}</loc><news:news><news:publication><news:name>${esc(s.site_name)}</news:name><news:language>ar</news:language></news:publication><news:publication_date>${a.published_at}</news:publication_date><news:title>${esc(a.title)}</news:title></news:news></url>`).join('\n') + '\n</urlset>';
  xml(res, body);
});

seo.get('/rss.xml', (req, res) => {
  const s = allSettings();
  const items = A.listPublished({ limit: 30 }).items;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<title>${esc(s.site_name)}</title><link>${config.siteUrl}</link><description>${esc(s.description)}</description><language>ar</language>
<atom:link href="${config.siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items.map((a) => `<item><title>${esc(a.title)}</title><link>${esc(config.siteUrl + encodeURI(a.url))}</link><guid isPermaLink="true">${esc(config.siteUrl + encodeURI(a.url))}</guid><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate><category>${esc(a.category.name)}</category><description>${esc(a.summary)}</description>${a.cover ? `<media:content url="${esc(abs(a.cover.url))}" medium="image"/>` : ''}</item>`).join('\n')}
</channel></rss>`;
  xml(res, body, 'application/rss+xml');
});

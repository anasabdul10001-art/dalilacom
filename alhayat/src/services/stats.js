import crypto from 'node:crypto';
import { db, tx } from '../db.js';

const secret = crypto.randomBytes(16).toString('hex'); // يتغيّر مع كل تشغيل: لا تُخزَّن هوية الزائر
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|go-http|headless/i;
const seen = new Set();

export const isBot = (ua = '') => BOT.test(ua);
const visitorHash = (ip, ua) => crypto.createHash('sha256').update(`${day()}|${secret}|${ip}|${ua}`).digest('hex').slice(0, 24);

/** تسجيل زيارة صفحة. إن مُرّر articleId تُحسب قراءة للخبر (مرة لكل زائر/يوم). */
export function recordVisit({ ip, ua, articleId = null, source = 'web' }) {
  if (isBot(ua)) return;
  const d = day(), vh = visitorHash(ip, ua);
  let countArticle = false;
  if (articleId) {
    const key = `${d}|${vh}|${articleId}`;
    if (!seen.has(key)) { seen.add(key); countArticle = true; }
    if (seen.size > 200_000) seen.clear();
  }
  tx(() => {
    const newVisitor = db.prepare('INSERT OR IGNORE INTO visitor_day(day,hash) VALUES(?,?)').run(d, vh).changes;
    const col = source === 'app' ? 'app_views' : 'web_views';
    db.prepare(`INSERT INTO daily_stats(day,views,visitors,${col}) VALUES(?,1,?,1)
      ON CONFLICT(day) DO UPDATE SET views=views+1, visitors=visitors+?, ${col}=${col}+1`).run(d, newVisitor, newVisitor);
    if (countArticle) {
      db.prepare('INSERT INTO article_daily(day,article_id,views) VALUES(?,?,1) ON CONFLICT(day,article_id) DO UPDATE SET views=views+1').run(d, articleId);
      db.prepare('UPDATE articles SET views=views+1 WHERE id=?').run(articleId);
    }
  });
}

export function purgeOld() {
  db.prepare('DELETE FROM visitor_day WHERE day < ?').run(day(new Date(Date.now() - 3 * 864e5)));
}

export function overview(days = 30) {
  const from = day(new Date(Date.now() - (days - 1) * 864e5));
  const rows = db.prepare('SELECT * FROM daily_stats WHERE day >= ? ORDER BY day').all(from);
  const map = new Map(rows.map((r) => [r.day, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = day(new Date(Date.now() - i * 864e5));
    const r = map.get(d);
    series.push({ day: d, views: r?.views || 0, visitors: r?.visitors || 0, web: r?.web_views || 0, app: r?.app_views || 0 });
  }
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  const last7 = series.slice(-7);
  const topArticles = db.prepare(`SELECT a.id,a.title,a.slug,c.name AS category, SUM(d.views) AS views FROM article_daily d
    JOIN articles a ON a.id=d.article_id JOIN categories c ON c.id=a.category_id WHERE d.day >= ?
    GROUP BY a.id ORDER BY views DESC LIMIT 10`).all(from);
  const byCategory = db.prepare(`SELECT c.name, c.color, SUM(d.views) AS views FROM article_daily d
    JOIN articles a ON a.id=d.article_id JOIN categories c ON c.id=a.category_id WHERE d.day >= ?
    GROUP BY c.id ORDER BY views DESC`).all(from);
  return {
    series,
    totals: { today: series.at(-1), views7: sum(last7, 'views'), visitors7: sum(last7, 'visitors'), viewsPeriod: sum(series, 'views'), appPeriod: sum(series, 'app'), webPeriod: sum(series, 'web') },
    topArticles, byCategory,
  };
}

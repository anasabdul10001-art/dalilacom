import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { db, tx, nowIso } from '../db.js';
import { hashPassword } from '../lib/auth.js';
import { CATEGORIES, STAFF, ARTICLES } from './data.js';
import { coverSvg } from './covers.js';
import { ingest } from '../services/media.js';
import { saveCategory } from '../services/categories.js';
import { saveArticle } from '../services/articles.js';

function makeVideo(file, color) {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:d=6:r=25`,
      '-vf', "geq=r='r(X,Y)+40*sin(2*PI*(X/300+T/2))':g='g(X,Y)+30*sin(2*PI*(Y/200+T/3))':b='b(X,Y)+50*sin(2*PI*((X+Y)/400+T/2))'",
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', '6', file], { stdio: 'pipe', timeout: 60_000 });
    return true;
  } catch { return false; }
}

/** يملأ قاعدة البيانات بتصنيفات وكتّاب وأخبار تجريبية وصور وفيديو وإعلانات وإحصائيات */
export async function seedDemo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'np-seed-'));
  const catIds = {};
  for (const [i, c] of CATEGORIES.entries()) catIds[c.slug] = saveCategory({ ...c, sortOrder: i }).id;

  const staffIds = [];
  for (const s of STAFF) {
    const r = db.prepare('INSERT INTO users(name,email,password_hash,role,bio,created_at) VALUES(?,?,?,?,?,?)')
      .run(s.name, s.email, hashPassword(crypto.randomBytes(18).toString('base64url')), s.role, s.bio, nowIso());
    staffIds.push(Number(r.lastInsertRowid));
  }

  // فيديو تجريبي
  const videos = [];
  for (const [i, color] of ['0x1b3a6b', '0x6b1b3a'].entries()) {
    const f = path.join(tmp, `v${i}.mp4`);
    if (makeVideo(f, color)) videos.push((await ingest(f, { originalName: `demo-video-${i + 1}.mp4`, alt: 'فيديو تجريبي' })).url);
  }

  for (const [i, a] of ARTICLES.entries()) {
    const png = path.join(tmp, `c${i}.png`);
    await sharp(Buffer.from(coverSvg(a.cover || a.c, i))).png().toFile(png);
    const alt = `صورة توضيحية لخبر: ${a.t}`;
    const media = await ingest(png, { originalName: `cover-${i + 1}.png`, alt, userId: staffIds[a.a] });
    const publishedAt = new Date(Date.now() - a.h * 36e5).toISOString();
    const body = a.p.map((p) => `<p>${p}</p>`).join('\n') + (i % 5 === 0 ? `\n<blockquote>«نعمل على أن تصل الخدمة إلى كل مواطن بسهولة وسرعة.»</blockquote>\n<p>وأضاف المتحدث أن الجهات المختصة ستنشر تقارير دورية لمتابعة التنفيذ وقياس الأثر.</p>` : '');
    const r = saveArticle({
      title: a.t, subtitle: a.sub || '', summary: a.s, body, categoryId: catIds[a.c], coverMediaId: media.id,
      coverCaption: 'صورة تعبيرية — محتوى تجريبي', status: 'published', publishedAt, tags: a.tags,
      isBreaking: !!a.breaking, isFeatured: !!a.featured, videoUrl: a.video ? videos[a.video - 1] || '' : '',
    }, { userId: staffIds[a.a], canPublish: true });
    db.prepare('UPDATE articles SET views=?, created_at=?, updated_at=? WHERE id=?').run(a.v, publishedAt, publishedAt, r.id);
  }

  // مسودات ومجدول لعرض سير العمل
  saveArticle({ title: 'مسودة: تقرير عن أسعار العقارات (قيد الكتابة)', summary: 'مسودة غير منشورة.', body: '<p>نص مبدئي...</p>', categoryId: catIds.economy, status: 'draft' }, { userId: staffIds[1], canPublish: true });
  saveArticle({ title: 'خبر بانتظار مراجعة رئيس التحرير', summary: 'أرسله المراسل للمراجعة.', body: '<p>تفاصيل الخبر...</p>', categoryId: catIds.local, status: 'review' }, { userId: staffIds[2], canPublish: false });
  saveArticle({ title: 'خبر مجدول للنشر غداً صباحاً', summary: 'سيُنشر تلقائياً في الموعد.', body: '<p>سيُنشر تلقائياً.</p>', categoryId: catIds.sports, status: 'scheduled', publishAt: new Date(Date.now() + 18 * 36e5).toISOString() }, { userId: staffIds[3], canPublish: true });

  // لا إعلانات تجريبية: تظهر مساحات «أعلن هنا» حتى تُضاف إعلانات حقيقية من لوحة الإدارة

  // إحصائيات زيارات تاريخية لـ 30 يوماً
  const up = db.prepare('INSERT OR REPLACE INTO daily_stats(day,views,visitors,web_views,app_views) VALUES(?,?,?,?,?)');
  const adaily = db.prepare('INSERT OR IGNORE INTO article_daily(day,article_id,views) VALUES(?,?,?)');
  const ids = db.prepare("SELECT id, views FROM articles WHERE status='published'").all();
  tx(() => {
    for (let d = 29; d >= 0; d--) {
      const day = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
      const base = 9000 + Math.round(Math.sin(d / 3) * 1800 + (30 - d) * 140 + Math.random() * 900);
      const app = Math.round(base * (0.22 + Math.random() * 0.06));
      up.run(day, base, Math.round(base * 0.58), base - app, app);
      for (const a of ids) if (Math.random() < 0.55) adaily.run(day, a.id, Math.max(1, Math.round((a.views / 30) * (0.4 + Math.random() * 1.2) * (d < 3 ? 2.5 : 1))));
    }
  });
  fs.rmSync(tmp, { recursive: true, force: true });
}

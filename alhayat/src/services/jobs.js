import { publishDue } from './articles.js';
import { notify } from './push.js';
import { purgeOld } from './stats.js';
import { purgeSessions } from '../lib/auth.js';
import { backupIfDue } from './backup.js';
import { db } from '../db.js';

/** المهام الدورية: نشر المجدول، إشعار العاجل، تنظيف، نسخ احتياطي يومي */
export function startJobs() {
  const tick = async () => {
    try {
      for (const d of publishDue()) {
        if (d.is_breaking) {
          const a = db.prepare('SELECT id,title,summary FROM articles WHERE id=?').get(d.id);
          await notify({ title: `عاجل: ${a.title}`, body: a.summary, articleId: a.id, topic: 'breaking' });
        }
      }
    } catch (e) { console.error('[jobs] publishDue', e); }
  };
  const hourly = () => {
    try { purgeSessions(); purgeOld(); const b = backupIfDue(); if (b) console.log('[jobs] backup', b); } catch (e) { console.error('[jobs] hourly', e); }
  };
  setInterval(tick, 20_000).unref();
  setInterval(hourly, 3_600_000).unref();
  tick(); hourly();
}

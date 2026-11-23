import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

/** نسخة احتياطية متسقة من قاعدة البيانات أثناء عمل الموقع (VACUUM INTO) */
export function createBackup() {
  const file = path.join(config.backupDir, `news-${stamp()}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  prune();
  return path.basename(file);
}
export function listBackups() {
  return fs.readdirSync(config.backupDir).filter((f) => /^news-[\d-]+\.db$/.test(f)).sort().reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(config.backupDir, f)).size }));
}
export const backupPath = (name) => (/^news-[\d-]+\.db$/.test(name) ? path.join(config.backupDir, name) : null);
function prune() {
  for (const b of listBackups().slice(config.backupKeep)) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
}
export function backupIfDue() {
  const last = listBackups()[0];
  if (!last || Date.now() - fs.statSync(path.join(config.backupDir, last.name)).mtimeMs > 23 * 36e5) return createBackup();
  return null;
}

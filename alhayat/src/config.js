import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// تحميل .env بسيط بدون اعتماديات
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const dataDir = path.resolve(root, process.env.DATA_DIR || './data');

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  siteUrl: (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  isProd: process.env.NODE_ENV === 'production',
  dataDir,
  dbFile: process.env.DB_FILE || path.join(dataDir, 'news.db'),
  uploadDir: path.join(dataDir, 'uploads'),
  backupDir: path.join(dataDir, 'backups'),
  publicDir: path.join(root, 'public'),
  backupKeep: Number(process.env.BACKUP_KEEP || 14),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  fcm: process.env.FCM_SERVICE_ACCOUNT || '',
  maxUploadMb: 50,
};

for (const d of [config.dataDir, config.uploadDir, config.backupDir]) fs.mkdirSync(d, { recursive: true });

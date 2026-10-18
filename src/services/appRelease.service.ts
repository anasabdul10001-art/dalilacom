import crypto from "crypto";
import { prisma } from "../prisma";

/**
 * The Android app as a file on the website. The owner uploads each new version in the admin panel (and switches the link on or
 * off there); people download it from /download.html. Only the newest upload is offered; the two before it are kept, the rest deleted.
 */
const VISIBLE_KEY = "appDownloadVisible";
export const MAX_APK_BYTES = 80 * 1024 * 1024;
const KEEP = 3;

export class AppReleaseError extends Error {}

export interface AppDownloadInfo {
  hasFile: boolean;
  visible: boolean;
  version?: string;
  sizeBytes?: number;
  sha256?: string;
  uploadedAt?: Date;
}

async function isVisible(): Promise<boolean> {
  const row = await prisma.platformSetting.findUnique({ where: { key: VISIBLE_KEY } }).catch(() => null);
  return !!(row?.value as { visible?: boolean } | null)?.visible;
}

export async function getAppDownloadInfo(): Promise<AppDownloadInfo> {
  const [latest, visible] = await Promise.all([
    prisma.appRelease.findFirst({ orderBy: { createdAt: "desc" }, select: { version: true, sizeBytes: true, sha256: true, createdAt: true } }).catch(() => null),
    isVisible(),
  ]);
  if (!latest) return { hasFile: false, visible };
  return { hasFile: true, visible, version: latest.version, sizeBytes: latest.sizeBytes, sha256: latest.sha256, uploadedAt: latest.createdAt };
}

export async function setAppDownloadVisible(visible: boolean) {
  const info = await getAppDownloadInfo();
  if (visible && !info.hasFile) throw new AppReleaseError("NO_FILE");
  await prisma.platformSetting.upsert({ where: { key: VISIBLE_KEY }, update: { value: { visible } }, create: { key: VISIBLE_KEY, value: { visible } } });
}

/** A real Android package: a zip that holds the manifest. (This does not prove who signed it; the owner uploads his own build.) */
export function looksLikeApk(buf: Buffer): boolean {
  if (buf.length < 1024 || buf.readUInt32LE(0) !== 0x04034b50) return false;
  return buf.includes(Buffer.from("AndroidManifest.xml"));
}

export async function saveAppRelease(buf: Buffer, version: string) {
  if (!buf.length || buf.length > MAX_APK_BYTES) throw new AppReleaseError("BAD_SIZE");
  if (!looksLikeApk(buf)) throw new AppReleaseError("NOT_APK");
  const clean = version.trim().slice(0, 40);
  if (!/^[0-9A-Za-z][0-9A-Za-z._ -]*$/.test(clean)) throw new AppReleaseError("BAD_VERSION");
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const row = await prisma.appRelease.create({
    data: { version: clean, fileName: "Dalilacom.apk", sizeBytes: buf.length, sha256, data: buf },
    select: { id: true },
  });
  const old = await prisma.appRelease.findMany({ orderBy: { createdAt: "desc" }, skip: KEEP, select: { id: true } });
  if (old.length) await prisma.appRelease.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { id: row.id, sha256, sizeBytes: buf.length, version: clean };
}

/** The file people download: the newest upload, only while the link is switched on. */
export async function getDownloadableApk() {
  if (!(await isVisible())) return null;
  return prisma.appRelease.findFirst({ orderBy: { createdAt: "desc" }, select: { data: true, fileName: true, sizeBytes: true, sha256: true } });
}

/**
 * "A new version is out": the message inside the app. The owner writes the newest version and switches the message on in the admin panel
 * (after Google has approved it, so nobody is sent to Play before the update is there). The app shows it to everyone who has an older one.
 */
const UPDATE_KEY = "appUpdate";

export interface AppUpdateInfo {
  version: string | null;
  notify: boolean;
}

export async function getAppUpdate(): Promise<AppUpdateInfo> {
  const row = await prisma.platformSetting.findUnique({ where: { key: UPDATE_KEY } }).catch(() => null);
  const v = (row?.value ?? {}) as { version?: unknown; notify?: unknown };
  const version = typeof v.version === "string" && v.version.trim() ? v.version.trim() : null;
  return { version, notify: !!v.notify && version !== null };
}

export async function setAppUpdate(input: { version: string; notify: boolean }): Promise<AppUpdateInfo> {
  const version = input.version.trim();
  if (version && !/^\d+(\.\d+){0,3}$/.test(version)) throw new AppReleaseError("BAD_VERSION");
  const value = { version: version || null, notify: input.notify && version !== "" };
  await prisma.platformSetting.upsert({ where: { key: UPDATE_KEY }, update: { value }, create: { key: UPDATE_KEY, value } });
  return getAppUpdate();
}

import fs from "fs";
import path from "path";
import { NextFunction, Request, Response } from "express";

// The Al-Hayat newspaper demo (folder alhayat/, a separate Express app with its own SQLite file) is hosted inside this service and
// answers only on its own subdomain. Everything else is untouched. It is loaded lazily and any failure (for example a Node version
// without node:sqlite) is caught here, so it can never take the main site down.
//
// Cloudflare sends the subdomain to this service with the Host header rewritten to the main domain and adds the header
// X-Alhayat-Host: 1 (see docs/ALHAYAT.md), so the match is the host name OR that header.

type Handler = (req: Request, res: Response, next: NextFunction) => void;

let loading: Promise<Handler | null> | null = null;

// A real dynamic import: TypeScript (module commonjs) would turn a plain import() into require(), which cannot load ES modules.
const importEsm = new Function("p", "return import(p)") as (p: string) => Promise<any>;

function load(): Promise<Handler | null> {
  if (!loading) {
    loading = (async () => {
      try {
        process.env.SITE_URL ||= process.env.ALHAYAT_SITE_URL || "https://alhayat.dalilacom.com";
        process.env.NODE_ENV ||= "production";
        process.env.TRUST_PROXY ||= "2"; // Cloudflare + Render
        process.env.SEED_DEMO ||= "1"; // demo content on an empty database
        // Optional: a fixed sign-in for the demo's admin panel (otherwise a random password is printed once in the server log).
        if (process.env.ALHAYAT_ADMIN_EMAIL) process.env.ADMIN_EMAIL = process.env.ALHAYAT_ADMIN_EMAIL;
        if (process.env.ALHAYAT_ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = process.env.ALHAYAT_ADMIN_PASSWORD;
        // The demo content is shipped ready-made (alhayat/demo-data): generating it at start-up (sharp, 30+ images) ran the
        // 512 MB instance out of memory. The copy happens once per start because the disk is ephemeral.
        const root = path.join(__dirname, "..", "..", "alhayat");
        const dataDir = path.resolve(root, process.env.DATA_DIR || "./data");
        let fresh = false;
        if (!fs.existsSync(path.join(dataDir, "news.db"))) {
          fs.cpSync(path.join(root, "demo-data"), dataDir, { recursive: true });
          fresh = true;
        }
        const mod = await importEsm(pathToFileUrl(path.join(root, "src", "index.js")));
        await mod.initNews({ resetAdmin: fresh });
        return mod.createApp() as Handler;
      } catch (err) {
        console.error("[alhayat] could not start:", err);
        return null;
      }
    })();
  }
  return loading;
}

function pathToFileUrl(p: string): string {
  return require("url").pathToFileURL(p).href;
}

export function isAlhayatRequest(req: Request): boolean {
  if (req.headers["x-alhayat-host"] === "1") return true;
  const host = (req.headers.host ?? "").toLowerCase().split(":")[0];
  return host === "alhayat.dalilacom.com" || host.startsWith("alhayat.localhost");
}

export function alhayatMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isAlhayatRequest(req)) return next();
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive"); // a private demo for a client
  load().then((handler) => {
    if (!handler) return res.status(503).type("text/plain").send("The site is starting or unavailable. Please try again shortly.");
    handler(req, res, next);
  }).catch(next);
}

import "dotenv/config";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { authRouter } from "./routes/auth.routes";
import { membershipRouter } from "./routes/membership.routes";
import { merchantRouter } from "./routes/merchant.routes";
import { qrRouter } from "./routes/qr.routes";
import { categoryRouter } from "./routes/category.routes";
import { productCategoryRouter } from "./routes/productCategory.routes";
import { productRouter } from "./routes/product.routes";
import { cartRouter } from "./routes/cart.routes";
import { orderRouter } from "./routes/order.routes";
import { affiliateRouter } from "./routes/affiliate.routes";
import { walletRouter } from "./routes/wallet.routes";
import { responderRouter } from "./routes/responder.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { adminRouter } from "./routes/admin.routes";
import { adminPagePath } from "./lib/adminPath";
import { geoRouter } from "./routes/geo.routes";
import { addressRouter } from "./routes/address.routes";
import { businessRouter, branchRouter } from "./routes/business.routes";
import { catalogRouter } from "./routes/catalog.routes";
import { storeRouter } from "./routes/store.routes";
import { adsRouter } from "./routes/ads.routes";
import { reviewsRouter } from "./routes/reviews.routes";
import { favoritesRouter } from "./routes/favorites.routes";
import { renderSharePage, renderSitemap, searchIndexingOn } from "./lib/shareMeta";
import { routeRouter } from "./routes/route.routes";
import { profileRouter } from "./routes/profile.routes";
import { invoiceRouter } from "./routes/invoice.routes";
import { notificationRouter } from "./routes/notification.routes";
import { planRouter } from "./routes/plan.routes";
import { broadcastRouter } from "./routes/broadcast.routes";
import { socialRouter } from "./routes/social.routes";
import { referralRouter } from "./routes/referral.routes";
import { legalRouter } from "./routes/legal.routes";
import { getVisibleSocialLinks } from "./services/socialLinks.service";
import { landmarkRouter } from "./routes/landmark.routes";
import { searchRouter } from "./routes/search.routes";
import { getAppDownloadInfo, getDownloadableApk, getAppUpdate } from "./services/appRelease.service";
import { securityHeaders } from "./lib/securityHeaders";
import { corsMiddleware } from "./lib/corsConfig";
import { localizeResponses } from "./lib/localize";
import { ApiError, sendError, sendValidationError } from "./lib/apiError";
import { renewAllDueAiPackages } from "./services/aiQuota.service";

const app = express();
app.set("trust proxy", 1); // Render sits behind a proxy — needed for correct req.ip / X-Forwarded-For
// One address for the website: a visit to the old Render address (the pages, and the "continue with Facebook/Google" starts, whose
// cookie must live on the same address the provider sends the person back to) moves to PUBLIC_BASE_URL. The API itself keeps
// answering on the old address, so apps that were built before the new domain keep working.
app.use((req, res, next) => {
  const base = process.env.PUBLIC_BASE_URL;
  const host = (req.headers.host ?? "").toLowerCase();
  if (!base || req.method !== "GET" || !host.endsWith(".onrender.com")) return next();
  let wanted = "";
  try { wanted = new URL(base).host.toLowerCase(); } catch { return next(); }
  if (!wanted || wanted === host) return next();
  const isPage = /^\/(app(\/.*)?|privacy\.html|terms\.html|refund\.html|shipping\.html|about\.html|download\.html|data-deletion\.html|reset-password\.html|index\.html)?$/.test(req.path) || req.path === adminPagePath();
  const isSocialStart = /^\/auth\/social\/[a-z]+\/start$/.test(req.path);
  if (!isPage && !isSocialStart) return next();
  return res.redirect(302, base.replace(/\/+$/, "") + req.originalUrl);
});
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(localizeResponses);
// rawBody is kept only so Meta webhook signatures can be verified against the exact bytes sent.
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));

app.get("/health", (_req, res) => res.json({ ok: true }));
// Our social media links that the owner switched on (the website, the Android app and the e-mails show them).
app.get("/social-links", async (_req, res) => res.json({ links: await getVisibleSocialLinks() }));

// The developer test console (public/console.html) is for the owner only: the live service sets HIDE_DEV_CONSOLE=true so it exists
// only on the testing address.
app.use((req, res, next) => {
  if (process.env.HIDE_DEV_CONSOLE === "true" && req.method === "GET" && req.path === "/console.html") return res.status(404).send("Not found");
  next();
});

// The admin panel page is not at /admin (the first place anyone tries) but at adminPagePath(); its sign-in still protects it, and the
// /admin/... API paths below are unchanged. /admin and the old /admin.html answer "not found".
app.get(/^\/admin\/?$/, (_req, res) => res.status(404).send("Not found"));
app.get("/admin.html", (_req, res) => res.status(404).send("Not found"));
app.get(/^\/[^/]+\/?$/, (req, res, next) => {
  const panel = adminPagePath();
  if (req.path !== panel && req.path !== panel + "/") return next();
  if (req.path.endsWith("/")) return res.redirect(301, panel);
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

// Every answer carries the noindex header too, so even a page found through a link is not kept (images, scripts, API replies).
app.use((_req, res, next) => {
  if (!searchIndexingOn()) res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

// The main website: the app is served at the root of the domain (dalilacom.com/), and also at /app/.
// It goes through renderSharePage so a shared link shows a proper preview card (a shop link: that shop's name and details).
app.get(["/", "/app/"], async (req, res, next) => {
  try {
    res.type("html").send(await renderSharePage(req.query.merchant));
  } catch (err) {
    next(err);
  }
});
// robots.txt and llms.txt come before the static files: while indexing is off (the default) every crawler is told to stay out.
const CLOSED_ROBOTS = "# The site is not open to search engines yet.\nUser-agent: *\nDisallow: /\n";
app.get("/robots.txt", (_req, res, next) => {
  if (searchIndexingOn()) return next(); // the open version is the file in public/
  res.type("text/plain").set("X-Robots-Tag", "noindex, nofollow").send(CLOSED_ROBOTS);
});
app.get("/llms.txt", (_req, res, next) => {
  if (searchIndexingOn()) return next();
  res.status(404).type("text/plain").send("Not available yet.\n");
});

// The list of pages for Google and other search engines (the home page and every approved shop).
app.get("/sitemap.xml", async (_req, res, next) => {
  try {
    res.type("application/xml").send(await renderSitemap());
  } catch (err) {
    next(err);
  }
});
// The Android app as a file, for people whose phones cannot use Google Play (Syria). The owner uploads each version in the admin panel
// (it lives in the database); these answer only while the link is switched on there.
app.get("/app-download", async (_req, res) => {
  const info = await getAppDownloadInfo();
  res.json({ available: info.hasFile && info.visible, version: info.version ?? null, sizeBytes: info.sizeBytes ?? null, sha256: info.sha256 ?? null, uploadedAt: info.uploadedAt ?? null });
});
// What the app asks at start: is there a newer version, and has the owner switched the message on. Also where Google Play's page is, when the owner added it.
app.get("/app-update", async (_req, res) => {
  const [update, links] = await Promise.all([getAppUpdate(), getVisibleSocialLinks()]);
  res.json({ version: update.version, notify: update.notify, playUrl: links.find((l) => l.platform === "googleplay")?.url ?? null });
});
app.get("/download/dalilacom.apk", async (_req, res) => {
  const file = await getDownloadableApk();
  if (!file) return res.status(404).type("text/plain").send("Not available");
  res.set({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${file.fileName}"`,
    "Content-Length": String(file.data.length),
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  });
  res.end(Buffer.from(file.data));
});
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/auth/social", socialRouter);
app.use("/legal", legalRouter);
app.use("/auth", authRouter);
app.use("/membership", membershipRouter);
app.use("/landmarks", landmarkRouter);
app.use("/search", searchRouter);
app.use("/merchant", merchantRouter);
app.use("/qr", qrRouter);
app.use("/categories", categoryRouter);
app.use("/product-categories", productCategoryRouter);
app.use("/products", productRouter);
app.use("/cart", cartRouter);
app.use("/orders", orderRouter);
app.use("/affiliates", affiliateRouter);
app.use("/wallet", walletRouter);
app.use("/responder", responderRouter);
app.use("/hooks", webhookRouter);
app.use("/admin", adminRouter);
app.use("/geo", geoRouter);
app.use("/addresses", addressRouter);
app.use("/businesses", businessRouter);
app.use("/branches", branchRouter);
app.use("/catalog", catalogRouter);
app.use("/store", storeRouter);
app.use("/ads", adsRouter);
app.use("/reviews", reviewsRouter);
app.use("/favorites", favoritesRouter);
app.use("/route", routeRouter);
app.use("/profile", profileRouter);
app.use("/invoices", invoiceRouter);
app.use("/notifications", notificationRouter);
app.use("/plans", planRouter);
app.use("/referral", referralRouter);
app.use("/broadcasts", broadcastRouter);

app.use((_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Not found");
});

// Unified error envelope for anything a route handler throws or forwards via next(err)
// (section: Unified API Error Format). Never leaks a stack trace to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    return sendValidationError(res, err);
  }
  // body-parser errors carry their own 4xx status (too large, malformed...) — don't report those as 500s.
  const parserErr = err as { status?: number; type?: string } | null;
  if (parserErr && parserErr.type && typeof parserErr.status === "number" && parserErr.status >= 400 && parserErr.status < 500) {
    const tooLarge = parserErr.status === 413;
    return sendError(res, parserErr.status, tooLarge ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", tooLarge ? "الملف كبير جداً" : "طلب غير صالح");
  }
  console.error("Unhandled error:", err);
  return sendError(res, 500, "INTERNAL_ERROR", "حدث خطأ غير متوقع");
});

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`DALILACOM API listening on :${port}`);
  });
  // AI packages that ended are renewed from the shop's wallet (also done at the moment a shop looks, for a service that slept)
  const sweep = () => renewAllDueAiPackages().catch((err) => console.error("AI package renewal failed:", err instanceof Error ? err.message : err));
  setTimeout(sweep, 30_000).unref();
  setInterval(sweep, 60 * 60 * 1000).unref();
}

export { app };

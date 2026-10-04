import "dotenv/config";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { authRouter } from "./routes/auth.routes";
import { membershipRouter } from "./routes/membership.routes";
import { merchantRouter } from "./routes/merchant.routes";
import { qrRouter } from "./routes/qr.routes";
import { categoryRouter } from "./routes/category.routes";
import { productRouter } from "./routes/product.routes";
import { cartRouter } from "./routes/cart.routes";
import { orderRouter } from "./routes/order.routes";
import { affiliateRouter } from "./routes/affiliate.routes";
import { walletRouter } from "./routes/wallet.routes";
import { responderRouter } from "./routes/responder.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { adminRouter } from "./routes/admin.routes";
import { geoRouter } from "./routes/geo.routes";
import { addressRouter } from "./routes/address.routes";
import { businessRouter, branchRouter } from "./routes/business.routes";
import { catalogRouter } from "./routes/catalog.routes";
import { favoritesRouter } from "./routes/favorites.routes";
import { securityHeaders } from "./lib/securityHeaders";
import { corsOptions } from "./lib/corsConfig";
import { ApiError, sendError, sendValidationError } from "./lib/apiError";

const app = express();
app.set("trust proxy", 1); // Render sits behind a proxy — needed for correct req.ip / X-Forwarded-For
app.use(securityHeaders);
app.use(cors(corsOptions));
// rawBody is kept only so Meta webhook signatures can be verified against the exact bytes sent.
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Developer test console (public/index.html) — a plain HTML/JS page to click through the
// API by hand; not the final Android/product UI (section 18).
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/auth", authRouter);
app.use("/membership", membershipRouter);
app.use("/merchant", merchantRouter);
app.use("/qr", qrRouter);
app.use("/categories", categoryRouter);
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
app.use("/favorites", favoritesRouter);

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
  console.error("Unhandled error:", err);
  return sendError(res, 500, "INTERNAL_ERROR", "حدث خطأ غير متوقع");
});

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`DALILACOM API listening on :${port}`);
  });
}

export { app };

import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { membershipRouter } from "./routes/membership.routes";
import { merchantRouter } from "./routes/merchant.routes";
import { qrRouter } from "./routes/qr.routes";
import { categoryRouter } from "./routes/category.routes";
import { productRouter } from "./routes/product.routes";
import { cartRouter } from "./routes/cart.routes";
import { orderRouter } from "./routes/order.routes";
import { affiliateRouter } from "./routes/affiliate.routes";

const app = express();
app.use(cors());
app.use(express.json());

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

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`DALILACOM API listening on :${port}`);
});

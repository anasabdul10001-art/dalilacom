import "dotenv/config";
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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/membership", membershipRouter);
app.use("/merchant", merchantRouter);
app.use("/qr", qrRouter);
app.use("/categories", categoryRouter);
app.use("/products", productRouter);
app.use("/cart", cartRouter);
app.use("/orders", orderRouter);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`DALILACOM API listening on :${port}`);
});

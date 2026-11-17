-- How an order reaches the customer: the shop's driver, a pickup at the shop, or an outside courier; plus where to bring it.
CREATE TYPE "ShippingKind" AS ENUM ('DELIVERY', 'PICKUP', 'COURIER');

ALTER TABLE "ShippingMethod" ADD COLUMN "kind" "ShippingKind" NOT NULL DEFAULT 'DELIVERY';

ALTER TABLE "Order"
  ADD COLUMN "shippingKind" "ShippingKind" NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "deliveryPhone" TEXT,
  ADD COLUMN "courierCompany" TEXT,
  ADD COLUMN "trackingNumber" TEXT;

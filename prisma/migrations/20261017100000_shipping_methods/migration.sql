-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingName" TEXT,
ADD COLUMN "shippingCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingMethod_merchantId_idx" ON "ShippingMethod"("merchantId");

-- AddForeignKey
ALTER TABLE "ShippingMethod" ADD CONSTRAINT "ShippingMethod_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

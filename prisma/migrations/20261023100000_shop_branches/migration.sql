-- CreateTable
CREATE TABLE "ShopBranch" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopBranch_merchantId_idx" ON "ShopBranch"("merchantId");

-- AddForeignKey
ALTER TABLE "ShopBranch" ADD CONSTRAINT "ShopBranch_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

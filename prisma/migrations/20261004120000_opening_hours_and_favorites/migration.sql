-- AlterTable
ALTER TABLE "MerchantProfile" ADD COLUMN     "openingHours" JSONB;

-- CreateTable
CREATE TABLE "FavoriteMerchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteMerchant_userId_createdAt_idx" ON "FavoriteMerchant"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteMerchant_userId_merchantId_key" ON "FavoriteMerchant"("userId", "merchantId");

-- AddForeignKey
ALTER TABLE "FavoriteMerchant" ADD CONSTRAINT "FavoriteMerchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteMerchant" ADD CONSTRAINT "FavoriteMerchant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


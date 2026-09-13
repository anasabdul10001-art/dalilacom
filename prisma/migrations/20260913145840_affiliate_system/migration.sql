-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "AffiliateSourceType" AS ENUM ('ORDER', 'DISCOUNT_TRANSACTION');

-- CreateTable
CREATE TABLE "MerchantAffiliate" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commissionType" "CommissionType" NOT NULL,
    "commissionValue" INTEGER NOT NULL,
    "referralCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantAffiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "merchantAffiliateId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "merchantAffiliateId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "sourceType" "AffiliateSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAffiliate_referralCode_key" ON "MerchantAffiliate"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAffiliate_merchantId_userId_key" ON "MerchantAffiliate"("merchantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReferral_merchantId_customerId_key" ON "AffiliateReferral"("merchantId", "customerId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_merchantAffiliateId_idx" ON "AffiliateCommission"("merchantAffiliateId");

-- AddForeignKey
ALTER TABLE "MerchantAffiliate" ADD CONSTRAINT "MerchantAffiliate_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAffiliate" ADD CONSTRAINT "MerchantAffiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_merchantAffiliateId_fkey" FOREIGN KEY ("merchantAffiliateId") REFERENCES "MerchantAffiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_merchantAffiliateId_fkey" FOREIGN KEY ("merchantAffiliateId") REFERENCES "MerchantAffiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "AffiliateReferral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

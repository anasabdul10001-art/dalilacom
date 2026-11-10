ALTER TABLE "FitnessProfile" ADD COLUMN "certificationPhotoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "FitnessOffer" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "durationMonths" INTEGER NOT NULL DEFAULT 1,
  "priceCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitnessOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FitnessOffer_merchantId_isActive_idx" ON "FitnessOffer"("merchantId", "isActive");
ALTER TABLE "FitnessOffer" ADD CONSTRAINT "FitnessOffer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

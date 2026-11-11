ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_ALSHAM';
ALTER TYPE "PaymentMethod" ADD VALUE 'SYRIATEL';
ALTER TYPE "PaymentMethod" ADD VALUE 'MTN';

CREATE TYPE "SellerPaymentProvider" AS ENUM ('BANK_ALSHAM', 'SYRIATEL', 'MTN');

ALTER TABLE "Payment"
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "recipientAccount" TEXT;

CREATE TABLE "SellerPaymentMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "SellerPaymentProvider" NOT NULL,
  "recipientName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerPaymentMethod_userId_provider_key" ON "SellerPaymentMethod"("userId", "provider");
CREATE INDEX "SellerPaymentMethod_userId_isEnabled_idx" ON "SellerPaymentMethod"("userId", "isEnabled");
ALTER TABLE "SellerPaymentMethod" ADD CONSTRAINT "SellerPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

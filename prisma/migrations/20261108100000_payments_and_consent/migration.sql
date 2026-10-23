-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID_CASH', 'PAID_ONLINE', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationConsentAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Orders placed before payments existed were all pay-on-delivery: delivered ones count as settled, cancelled ones as failed.
INSERT INTO "Payment" ("id", "orderId", "method", "status", "amountCents", "paidAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 'COD',
  CASE o."status" WHEN 'DELIVERED' THEN 'PAID_CASH'::"PaymentStatus" WHEN 'CANCELLED' THEN 'FAILED'::"PaymentStatus" ELSE 'PENDING'::"PaymentStatus" END,
  o."totalCents",
  CASE o."status" WHEN 'DELIVERED' THEN o."updatedAt" END,
  CURRENT_TIMESTAMP
FROM "Order" o;

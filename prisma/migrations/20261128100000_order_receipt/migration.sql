CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "receiptStatus" "ReceiptStatus",
ADD COLUMN "receiptRespondedAt" TIMESTAMP(3),
ADD COLUMN "receiptAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "receiptNote" TEXT;

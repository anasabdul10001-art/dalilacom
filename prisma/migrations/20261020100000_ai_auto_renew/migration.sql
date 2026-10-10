-- AlterTable
ALTER TABLE "AiSubscription" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "renewedAt" TIMESTAMP(3),
ADD COLUMN "renewFailedAt" TIMESTAMP(3);

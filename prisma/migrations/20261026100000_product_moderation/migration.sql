-- CreateEnum
CREATE TYPE "ProductModeration" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- AlterTable: the products that exist already stay shown
ALTER TABLE "Product" ADD COLUMN "moderation" "ProductModeration" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "moderationNote" TEXT,
ADD COLUMN "moderatedAt" TIMESTAMP(3);

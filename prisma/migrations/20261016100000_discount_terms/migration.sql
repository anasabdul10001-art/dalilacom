-- CreateEnum
CREATE TYPE "DiscountApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: the discounts that already exist keep working (approved); new ones wait for the admin
ALTER TABLE "Discount" ADD COLUMN "description" TEXT,
ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN "scopeSection" TEXT,
ADD COLUMN "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "maxCustomers" INTEGER,
ADD COLUMN "perCustomerLimit" INTEGER,
ADD COLUMN "status" "DiscountApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "rejectionReason" TEXT;

ALTER TABLE "Discount" ALTER COLUMN "status" SET DEFAULT 'PENDING';

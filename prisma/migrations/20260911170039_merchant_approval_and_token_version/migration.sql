/*
  Warnings:

  - You are about to drop the column `isApproved` on the `MerchantProfile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MerchantApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "MerchantProfile" DROP COLUMN "isApproved",
ADD COLUMN     "approvalStatus" "MerchantApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE 'MEMBERSHIP';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "creditsPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidTransactionId" TEXT;

-- AlterTable
ALTER TABLE "MembershipPlan" ADD COLUMN     "priceCredits" INTEGER;


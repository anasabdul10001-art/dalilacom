-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE 'BROADCAST';

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "creditsCharged" INTEGER NOT NULL DEFAULT 0;

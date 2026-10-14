-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE 'COMMISSION';

-- CreateEnum
CREATE TYPE "MarketerKind" AS ENUM ('MANAGER', 'MARKETER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "referredById" TEXT,
ADD COLUMN "referredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Marketer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MarketerKind" NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "percent" DOUBLE PRECISION,
    "signupCredits" INTEGER,
    "teamPercent" DOUBLE PRECISION,
    "teamSignupCredits" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marketer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketerEarning" (
    "id" TEXT NOT NULL,
    "marketerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fromUserId" TEXT,
    "viaMarketerId" TEXT,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketerEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Marketer_userId_key" ON "Marketer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Marketer_code_key" ON "Marketer"("code");

-- CreateIndex
CREATE INDEX "Marketer_parentId_idx" ON "Marketer"("parentId");

-- CreateIndex
CREATE INDEX "MarketerEarning_marketerId_idx" ON "MarketerEarning"("marketerId");

-- CreateIndex
CREATE INDEX "MarketerEarning_fromUserId_idx" ON "MarketerEarning"("fromUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Marketer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marketer" ADD CONSTRAINT "Marketer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marketer" ADD CONSTRAINT "Marketer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Marketer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketerEarning" ADD CONSTRAINT "MarketerEarning_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "Marketer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

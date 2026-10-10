-- AlterTable
ALTER TABLE "AiUse" ADD COLUMN "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "AiSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uses" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSubscription_userId_endDate_idx" ON "AiSubscription"("userId", "endDate");

-- CreateEnum
CREATE TYPE "CategorySuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'MERGED', 'REJECTED');

-- CreateTable
CREATE TABLE "CategorySuggestion" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nearestId" TEXT,
    "status" "CategorySuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "categoryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CategorySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorySuggestion_status_createdAt_idx" ON "CategorySuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CategorySuggestion_merchantId_idx" ON "CategorySuggestion"("merchantId");

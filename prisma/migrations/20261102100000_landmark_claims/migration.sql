-- CreateEnum
CREATE TYPE "LandmarkClaimStatus" AS ENUM ('PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "LandmarkClaim" (
    "id" TEXT NOT NULL,
    "landmarkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LandmarkClaimStatus" NOT NULL DEFAULT 'PENDING',
    "claimantRole" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "note" TEXT,
    "adminMessage" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resultMerchantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandmarkClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandmarkClaimFile" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandmarkClaimFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandmarkClaim_landmarkId_status_idx" ON "LandmarkClaim"("landmarkId", "status");

-- CreateIndex
CREATE INDEX "LandmarkClaim_userId_idx" ON "LandmarkClaim"("userId");

-- CreateIndex
CREATE INDEX "LandmarkClaim_status_createdAt_idx" ON "LandmarkClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LandmarkClaimFile_claimId_idx" ON "LandmarkClaimFile"("claimId");

-- AddForeignKey
ALTER TABLE "LandmarkClaim" ADD CONSTRAINT "LandmarkClaim_landmarkId_fkey" FOREIGN KEY ("landmarkId") REFERENCES "Landmark"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandmarkClaim" ADD CONSTRAINT "LandmarkClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandmarkClaimFile" ADD CONSTRAINT "LandmarkClaimFile_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "LandmarkClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

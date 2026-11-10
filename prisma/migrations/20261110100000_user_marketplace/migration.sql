CREATE TYPE "MarketplaceListingStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'SOLD', 'HIDDEN', 'REJECTED');

CREATE TABLE "MarketplaceStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceStore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceStore_userId_key" ON "MarketplaceStore"("userId");

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "category" TEXT,
    "condition" "ProductCondition" NOT NULL DEFAULT 'USED',
    "imageUrl" TEXT,
    "cityId" TEXT,
    "contactPhone" TEXT,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceSubscription" (
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceSubscription_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "MarketplacePhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplacePhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceListing_userId_createdAt_idx" ON "MarketplaceListing"("userId", "createdAt");
CREATE INDEX "MarketplaceListing_storeId_status_createdAt_idx" ON "MarketplaceListing"("storeId", "status", "createdAt");
CREATE INDEX "MarketplaceListing_status_createdAt_idx" ON "MarketplaceListing"("status", "createdAt");
CREATE INDEX "MarketplaceListing_condition_status_createdAt_idx" ON "MarketplaceListing"("condition", "status", "createdAt");
CREATE INDEX "MarketplaceSubscription_planId_idx" ON "MarketplaceSubscription"("planId");
CREATE INDEX "MarketplacePhoto_userId_createdAt_idx" ON "MarketplacePhoto"("userId", "createdAt");

ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceStore" ADD CONSTRAINT "MarketplaceStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MarketplaceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceSubscription" ADD CONSTRAINT "MarketplaceSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceSubscription" ADD CONSTRAINT "MarketplaceSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplacePhoto" ADD CONSTRAINT "MarketplacePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

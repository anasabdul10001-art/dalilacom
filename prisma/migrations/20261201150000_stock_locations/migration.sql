ALTER TYPE "AccountingSaleChannel" ADD VALUE IF NOT EXISTS 'WHOLESALE';
ALTER TABLE "AccountingSale" ADD COLUMN "locationId" TEXT;
CREATE TYPE "AccountingLocationKind" AS ENUM ('BRANCH', 'DISTRIBUTOR');
CREATE TYPE "AccountingLocationMoveKind" AS ENUM ('GIVE', 'RETURN', 'SOLD', 'SOLD_BACK');
CREATE TABLE "AccountingLocation" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" "AccountingLocationKind" NOT NULL, "staffId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingLocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountingLocationStock" (
  "id" TEXT NOT NULL, "locationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "onHand" INTEGER NOT NULL DEFAULT 0, "given" INTEGER NOT NULL DEFAULT 0,
  "sold" INTEGER NOT NULL DEFAULT 0, "returned" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingLocationStock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountingLocationMove" (
  "id" TEXT NOT NULL, "locationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "kind" "AccountingLocationMoveKind" NOT NULL, "quantity" INTEGER NOT NULL,
  "saleId" TEXT, "recordedById" TEXT, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingLocationMove_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingLocation_userId_idx" ON "AccountingLocation"("userId");
CREATE INDEX "AccountingLocation_staffId_idx" ON "AccountingLocation"("staffId");
CREATE UNIQUE INDEX "AccountingLocationStock_locationId_productId_key" ON "AccountingLocationStock"("locationId", "productId");
CREATE INDEX "AccountingLocationStock_productId_idx" ON "AccountingLocationStock"("productId");
CREATE INDEX "AccountingLocationMove_locationId_createdAt_idx" ON "AccountingLocationMove"("locationId", "createdAt");
ALTER TABLE "AccountingLocation" ADD CONSTRAINT "AccountingLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingLocationStock" ADD CONSTRAINT "AccountingLocationStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AccountingLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingLocationStock" ADD CONSTRAINT "AccountingLocationStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AccountingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingLocationMove" ADD CONSTRAINT "AccountingLocationMove_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AccountingLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

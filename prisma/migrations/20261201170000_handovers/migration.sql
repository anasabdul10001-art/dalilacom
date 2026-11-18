CREATE TABLE "AccountingHandover" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingHandover_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingHandover_locationId_createdAt_idx" ON "AccountingHandover"("locationId", "createdAt");
CREATE INDEX "AccountingHandover_userId_createdAt_idx" ON "AccountingHandover"("userId", "createdAt");
ALTER TABLE "AccountingHandover" ADD CONSTRAINT "AccountingHandover_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AccountingLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

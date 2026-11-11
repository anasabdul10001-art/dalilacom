CREATE TYPE "AccountingEntryType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "AccountingStockAction" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT');

ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;

CREATE TABLE "AccountingProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'قطعة',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "salePriceCents" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockAt" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountingEntryType" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceKey" TEXT,
    "receiptName" TEXT,
    "receiptMime" TEXT,
    "receiptData" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingStockMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "storeProductId" TEXT,
    "action" "AccountingStockAction" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingInvoiceDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "extracted" JSONB,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    CONSTRAINT "AccountingInvoiceDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingProduct_userId_barcode_key" ON "AccountingProduct"("userId", "barcode");
CREATE INDEX "AccountingProduct_userId_name_idx" ON "AccountingProduct"("userId", "name");
CREATE INDEX "AccountingProduct_userId_sku_idx" ON "AccountingProduct"("userId", "sku");
CREATE UNIQUE INDEX "AccountingEntry_userId_sourceKey_key" ON "AccountingEntry"("userId", "sourceKey");
CREATE INDEX "AccountingEntry_userId_occurredAt_idx" ON "AccountingEntry"("userId", "occurredAt");
CREATE INDEX "AccountingEntry_userId_type_occurredAt_idx" ON "AccountingEntry"("userId", "type", "occurredAt");
CREATE INDEX "AccountingStockMovement_userId_occurredAt_idx" ON "AccountingStockMovement"("userId", "occurredAt");
CREATE INDEX "AccountingStockMovement_productId_occurredAt_idx" ON "AccountingStockMovement"("productId", "occurredAt");
CREATE INDEX "AccountingStockMovement_storeProductId_occurredAt_idx" ON "AccountingStockMovement"("storeProductId", "occurredAt");
CREATE UNIQUE INDEX "AccountingInvoiceDraft_entryId_key" ON "AccountingInvoiceDraft"("entryId");
CREATE INDEX "AccountingInvoiceDraft_userId_createdAt_idx" ON "AccountingInvoiceDraft"("userId", "createdAt");

ALTER TABLE "AccountingProduct" ADD CONSTRAINT "AccountingProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingStockMovement" ADD CONSTRAINT "AccountingStockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingStockMovement" ADD CONSTRAINT "AccountingStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AccountingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingStockMovement" ADD CONSTRAINT "AccountingStockMovement_storeProductId_fkey" FOREIGN KEY ("storeProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingInvoiceDraft" ADD CONSTRAINT "AccountingInvoiceDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingInvoiceDraft" ADD CONSTRAINT "AccountingInvoiceDraft_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

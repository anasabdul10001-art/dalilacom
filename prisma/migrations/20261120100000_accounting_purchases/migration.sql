-- A purchase from a supplier: stock comes in at its cost, the money paid goes out (not an expense: the cost reaches the profit when the goods are sold), the rest is owed to the supplier.
CREATE TABLE "AccountingPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "partyId" TEXT,
    "supplierName" TEXT,
    "note" TEXT,
    "currency" TEXT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "paidCents" BIGINT NOT NULL DEFAULT 0,
    "payMethod" "AccountingPayMethod" NOT NULL DEFAULT 'CASH',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" BIGINT NOT NULL,
    "lineTotalCents" BIGINT NOT NULL,

    CONSTRAINT "AccountingPurchaseLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingPurchase_userId_number_key" ON "AccountingPurchase"("userId", "number");
CREATE INDEX "AccountingPurchase_userId_occurredAt_idx" ON "AccountingPurchase"("userId", "occurredAt");
CREATE INDEX "AccountingPurchaseLine_purchaseId_idx" ON "AccountingPurchaseLine"("purchaseId");

ALTER TABLE "AccountingPurchase" ADD CONSTRAINT "AccountingPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPurchaseLine" ADD CONSTRAINT "AccountingPurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "AccountingPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingPartyEntry" ADD COLUMN "purchaseId" TEXT;

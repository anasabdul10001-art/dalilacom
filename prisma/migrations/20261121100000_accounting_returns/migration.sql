-- Returns: goods that come back from a customer (a sales return) or go back to a supplier (a purchase return).
CREATE TABLE "AccountingSaleReturn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "refundCents" BIGINT NOT NULL DEFAULT 0,
    "debtCents" BIGINT NOT NULL DEFAULT 0,
    "payMethod" "AccountingPayMethod",
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSaleReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingSaleReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "unitCostCents" BIGINT NOT NULL DEFAULT 0,
    "lineTotalCents" BIGINT NOT NULL,

    CONSTRAINT "AccountingSaleReturnLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPurchaseReturn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "refundCents" BIGINT NOT NULL DEFAULT 0,
    "debtCents" BIGINT NOT NULL DEFAULT 0,
    "payMethod" "AccountingPayMethod",
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPurchaseReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPurchaseReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" BIGINT NOT NULL,
    "lineTotalCents" BIGINT NOT NULL,

    CONSTRAINT "AccountingPurchaseReturnLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountingSaleReturn_userId_occurredAt_idx" ON "AccountingSaleReturn"("userId", "occurredAt");
CREATE INDEX "AccountingSaleReturn_saleId_idx" ON "AccountingSaleReturn"("saleId");
CREATE INDEX "AccountingSaleReturnLine_returnId_idx" ON "AccountingSaleReturnLine"("returnId");
CREATE INDEX "AccountingSaleReturnLine_saleLineId_idx" ON "AccountingSaleReturnLine"("saleLineId");
CREATE INDEX "AccountingPurchaseReturn_userId_occurredAt_idx" ON "AccountingPurchaseReturn"("userId", "occurredAt");
CREATE INDEX "AccountingPurchaseReturn_purchaseId_idx" ON "AccountingPurchaseReturn"("purchaseId");
CREATE INDEX "AccountingPurchaseReturnLine_returnId_idx" ON "AccountingPurchaseReturnLine"("returnId");
CREATE INDEX "AccountingPurchaseReturnLine_purchaseLineId_idx" ON "AccountingPurchaseReturnLine"("purchaseLineId");

ALTER TABLE "AccountingSaleReturn" ADD CONSTRAINT "AccountingSaleReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSaleReturnLine" ADD CONSTRAINT "AccountingSaleReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "AccountingSaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPurchaseReturn" ADD CONSTRAINT "AccountingPurchaseReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPurchaseReturnLine" ADD CONSTRAINT "AccountingPurchaseReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "AccountingPurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

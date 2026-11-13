-- A sales invoice: several products in one sale, with a discount, a customer name and a number of its own.
CREATE TABLE "AccountingSale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerName" TEXT,
    "note" TEXT,
    "currency" TEXT NOT NULL,
    "subtotalCents" BIGINT NOT NULL,
    "discountCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL,
    "payMethod" "AccountingPayMethod" NOT NULL DEFAULT 'CASH',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "unitCostCents" BIGINT NOT NULL DEFAULT 0,
    "lineTotalCents" BIGINT NOT NULL,

    CONSTRAINT "AccountingSaleLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingSale_userId_number_key" ON "AccountingSale"("userId", "number");
CREATE INDEX "AccountingSale_userId_occurredAt_idx" ON "AccountingSale"("userId", "occurredAt");
CREATE INDEX "AccountingSaleLine_saleId_idx" ON "AccountingSaleLine"("saleId");

ALTER TABLE "AccountingSale" ADD CONSTRAINT "AccountingSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSaleLine" ADD CONSTRAINT "AccountingSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AccountingSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

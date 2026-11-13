-- Tax (experimental, to be checked with an accountant): rates, the way prices are written (with or without tax), the tax of each invoice line, and what a return takes back.
CREATE TABLE "AccountingTaxRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingTaxRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingSettings" (
    "userId" TEXT NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
    "defaultTaxRateId" TEXT,
    "taxNumber" TEXT,
    "businessName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "AccountingTaxRate_userId_idx" ON "AccountingTaxRate"("userId");
ALTER TABLE "AccountingTaxRate" ADD CONSTRAINT "AccountingTaxRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingProduct" ADD COLUMN "taxRateId" TEXT;

ALTER TABLE "AccountingSale" ADD COLUMN "taxCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingSale" ADD COLUMN "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AccountingSaleLine" ADD COLUMN "discountCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingSaleLine" ADD COLUMN "taxRateBp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountingSaleLine" ADD COLUMN "taxCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingSaleReturnLine" ADD COLUMN "taxRateBp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountingSaleReturnLine" ADD COLUMN "taxCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingSaleReturnLine" ADD COLUMN "baseCents" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "AccountingPurchase" ADD COLUMN "taxCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingPurchaseLine" ADD COLUMN "taxRateBp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountingPurchaseLine" ADD COLUMN "taxCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingPurchaseReturnLine" ADD COLUMN "taxRateBp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountingPurchaseReturnLine" ADD COLUMN "taxCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AccountingPurchaseReturnLine" ADD COLUMN "baseCents" BIGINT NOT NULL DEFAULT 0;

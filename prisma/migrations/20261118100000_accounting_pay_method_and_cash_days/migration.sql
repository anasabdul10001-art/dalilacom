-- How each entry was paid (cash, bank, wallet), who recorded it, and the cash box of each day (opening, counted at closing).
CREATE TYPE "AccountingPayMethod" AS ENUM ('CASH', 'BANK', 'WALLET');

ALTER TABLE "AccountingEntry" ADD COLUMN "payMethod" "AccountingPayMethod";
ALTER TABLE "AccountingEntry" ADD COLUMN "recordedById" TEXT;
CREATE INDEX "AccountingEntry_userId_payMethod_occurredAt_idx" ON "AccountingEntry"("userId", "payMethod", "occurredAt");

CREATE TABLE "AccountingCashDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "openingCents" BIGINT NOT NULL DEFAULT 0,
    "openingSetByHand" BOOLEAN NOT NULL DEFAULT false,
    "countedCents" BIGINT,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingCashDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingCashDay_userId_day_currency_key" ON "AccountingCashDay"("userId", "day", "currency");
CREATE INDEX "AccountingCashDay_userId_currency_day_idx" ON "AccountingCashDay"("userId", "currency", "day");

ALTER TABLE "AccountingCashDay" ADD CONSTRAINT "AccountingCashDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

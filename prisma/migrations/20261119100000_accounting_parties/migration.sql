-- Customers and suppliers with a ledger (what they owe us, what we owe them), credit sales, and the two kinds of entry that move money without being profit.
ALTER TYPE "AccountingEntryType" ADD VALUE IF NOT EXISTS 'RECEIPT';
ALTER TYPE "AccountingEntryType" ADD VALUE IF NOT EXISTS 'PAYOUT';

CREATE TYPE "AccountingPartyKind" AS ENUM ('CUSTOMER', 'SUPPLIER');
CREATE TYPE "AccountingPartyEntryKind" AS ENUM ('CHARGE', 'PAYMENT');

CREATE TABLE "AccountingParty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AccountingPartyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPartyEntry" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AccountingPartyEntryKind" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "payMethod" "AccountingPayMethod",
    "saleId" TEXT,
    "entryId" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPartyEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingParty_userId_kind_name_key" ON "AccountingParty"("userId", "kind", "name");
CREATE INDEX "AccountingParty_userId_kind_idx" ON "AccountingParty"("userId", "kind");
CREATE INDEX "AccountingPartyEntry_partyId_occurredAt_idx" ON "AccountingPartyEntry"("partyId", "occurredAt");
CREATE INDEX "AccountingPartyEntry_userId_idx" ON "AccountingPartyEntry"("userId");

ALTER TABLE "AccountingParty" ADD CONSTRAINT "AccountingParty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPartyEntry" ADD CONSTRAINT "AccountingPartyEntry_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "AccountingParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingSale" ADD COLUMN "partyId" TEXT;
ALTER TABLE "AccountingSale" ADD COLUMN "paidCents" BIGINT NOT NULL DEFAULT 0;
UPDATE "AccountingSale" SET "paidCents" = "totalCents";

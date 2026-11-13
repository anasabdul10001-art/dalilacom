-- Entries that repeat by themselves: rent, electricity, a salary that is not in HR, a subscription... (weekly, monthly or yearly).
CREATE TYPE "AccountingRecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE "AccountingRecurring" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountingEntryType" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "payMethod" "AccountingPayMethod",
    "frequency" "AccountingRecurringFrequency" NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "nextDue" TEXT NOT NULL,
    "endDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingRecurring_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountingRecurring_userId_active_nextDue_idx" ON "AccountingRecurring"("userId", "active", "nextDue");

ALTER TABLE "AccountingRecurring" ADD CONSTRAINT "AccountingRecurring_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

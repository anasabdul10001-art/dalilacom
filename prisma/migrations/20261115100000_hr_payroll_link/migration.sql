-- Payroll totals from the HR system arrive as accounting expenses. A month of salaries in a low-value
-- currency does not fit a 32-bit amount, so the entry amount becomes 64-bit (existing values are kept).
ALTER TABLE "AccountingEntry" ALTER COLUMN "amountCents" SET DATA TYPE BIGINT;

CREATE TABLE "HrLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "secretEnc" TEXT,
    "companyName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrPayrollSync" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "entryId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrPayrollSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrLink_codeHash_key" ON "HrLink"("codeHash");
CREATE INDEX "HrLink_userId_idx" ON "HrLink"("userId");
CREATE UNIQUE INDEX "HrPayrollSync_linkId_runId_key" ON "HrPayrollSync"("linkId", "runId");

ALTER TABLE "HrLink" ADD CONSTRAINT "HrLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrPayrollSync" ADD CONSTRAINT "HrPayrollSync_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "HrLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

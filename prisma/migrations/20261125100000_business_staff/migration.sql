CREATE TYPE "BusinessStaffRole" AS ENUM ('CASHIER', 'STOCK', 'ASSISTANT', 'MANAGER');
CREATE TYPE "BusinessStaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');
CREATE TYPE "BusinessCommissionStatus" AS ENUM ('ACCRUED', 'PAID', 'VOID');

CREATE TABLE "BusinessStaff" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "role" "BusinessStaffRole" NOT NULL,
  "status" "BusinessStaffStatus" NOT NULL DEFAULT 'INVITED',
  "salesRateBp" INTEGER NOT NULL DEFAULT 0,
  "fixedPayCents" BIGINT NOT NULL DEFAULT 0,
  "hrEmployeeId" TEXT,
  "codeHash" TEXT,
  "codeExpiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessStaff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessStaff_codeHash_key" ON "BusinessStaff"("codeHash");
CREATE UNIQUE INDEX "BusinessStaff_ownerId_userId_key" ON "BusinessStaff"("ownerId", "userId");
CREATE INDEX "BusinessStaff_ownerId_idx" ON "BusinessStaff"("ownerId");
CREATE INDEX "BusinessStaff_userId_idx" ON "BusinessStaff"("userId");
ALTER TABLE "BusinessStaff" ADD CONSTRAINT "BusinessStaff_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessStaff" ADD CONSTRAINT "BusinessStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BusinessStaffCommission" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "baseCents" BIGINT NOT NULL,
  "rateBp" INTEGER NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "BusinessCommissionStatus" NOT NULL DEFAULT 'ACCRUED',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessStaffCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessStaffCommission_saleId_key" ON "BusinessStaffCommission"("saleId");
CREATE INDEX "BusinessStaffCommission_ownerId_status_idx" ON "BusinessStaffCommission"("ownerId", "status");
CREATE INDEX "BusinessStaffCommission_staffId_status_idx" ON "BusinessStaffCommission"("staffId", "status");
ALTER TABLE "BusinessStaffCommission" ADD CONSTRAINT "BusinessStaffCommission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "BusinessStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

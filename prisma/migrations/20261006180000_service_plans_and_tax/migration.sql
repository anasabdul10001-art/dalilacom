-- The catalogue replaces the membership-only plan table. Renaming (instead of copy + drop) keeps every
-- existing Membership row pointing at its plan: the foreign key follows the table rename, so no row is
-- copied, dropped or re-pointed.
ALTER TABLE "MembershipPlan" RENAME TO "ServicePlan";
ALTER INDEX "MembershipPlan_pkey" RENAME TO "ServicePlan_pkey";

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('MEMBERSHIP', 'RESPONDER_CUSTOMER', 'RESPONDER_MERCHANT', 'MERCHANT_ACCOUNT');

-- AlterTable — existing rows are all memberships, hence the default
ALTER TABLE "ServicePlan"
    ADD COLUMN     "service" "ServiceKind" NOT NULL DEFAULT 'MEMBERSHIP',
    ADD COLUMN     "description" TEXT,
    ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN     "monthlyBroadcastLimit" INTEGER,
    ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ServicePlan_service_isActive_idx" ON "ServicePlan"("service", "isActive");

-- AlterTable — per-country pricing and tax need the account's own country (and its VAT id for B2B)
ALTER TABLE "User"
    ADD COLUMN     "countryCode" TEXT,
    ADD COLUMN     "cityId" TEXT,
    ADD COLUMN     "vatNumber" TEXT;
ALTER TABLE "Business" ADD COLUMN     "vatNumber" TEXT;

-- CreateTable
CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "priceCredits" INTEGER NOT NULL,
    "cashAmountCents" INTEGER,
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "countryId" TEXT,
    "name" TEXT NOT NULL,
    "percentBps" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanFeature_planId_idx" ON "PlanFeature"("planId");
CREATE INDEX "PlanPrice_countryId_idx" ON "PlanPrice"("countryId");
CREATE UNIQUE INDEX "PlanPrice_planId_countryId_key" ON "PlanPrice"("planId", "countryId");
CREATE UNIQUE INDEX "TaxRate_countryId_key" ON "TaxRate"("countryId");

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

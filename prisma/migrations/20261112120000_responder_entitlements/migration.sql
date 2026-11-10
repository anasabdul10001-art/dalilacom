CREATE TYPE "ResponderEntitlementStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED');
CREATE TYPE "ResponderEntitlementSource" AS ENUM ('TRIAL', 'PAID', 'GRANT');

ALTER TABLE "ServicePlan"
  ADD COLUMN "includesAi" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiReplyLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "removesBadge" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ResponderSubscription"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "basicPlanNoticeAt" TIMESTAMP(3);

CREATE TABLE "ResponderEntitlement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "ResponderEntitlementStatus" NOT NULL,
  "source" "ResponderEntitlementSource" NOT NULL,
  "trialEndsAt" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResponderEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResponderEntitlement_userId_planId_key" ON "ResponderEntitlement"("userId", "planId");
CREATE INDEX "ResponderEntitlement_userId_status_periodEnd_idx" ON "ResponderEntitlement"("userId", "status", "periodEnd");
CREATE INDEX "ResponderEntitlement_planId_status_idx" ON "ResponderEntitlement"("planId", "status");

ALTER TABLE "ResponderEntitlement"
  ADD CONSTRAINT "ResponderEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ResponderEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

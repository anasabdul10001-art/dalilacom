ALTER TYPE "ServiceKind" ADD VALUE IF NOT EXISTS 'ACCOUNTING';
ALTER TABLE "ServicePlan" ADD COLUMN "paypalPlanId" TEXT;
ALTER TABLE "PlanPrice" ADD COLUMN "paypalPlanId" TEXT;
CREATE TYPE "ExternalSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'FAILED');

CREATE TABLE "PlatformSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerSubscriptionId" TEXT,
    "latestInvoiceId" TEXT,
    "status" "ExternalSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSubscription_providerCheckoutId_key" ON "PlatformSubscription"("providerCheckoutId");
CREATE UNIQUE INDEX "PlatformSubscription_providerSubscriptionId_key" ON "PlatformSubscription"("providerSubscriptionId");
CREATE UNIQUE INDEX "PlatformSubscription_latestInvoiceId_key" ON "PlatformSubscription"("latestInvoiceId");
CREATE INDEX "PlatformSubscription_userId_status_idx" ON "PlatformSubscription"("userId", "status");
CREATE INDEX "PlatformSubscription_planId_status_idx" ON "PlatformSubscription"("planId", "status");

ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

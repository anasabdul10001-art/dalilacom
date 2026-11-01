CREATE TYPE "FitnessPlanKind" AS ENUM ('WORKOUT', 'NUTRITION');
CREATE TABLE "FitnessPlan" (
  "id" TEXT NOT NULL,
  "coachMerchantId" TEXT NOT NULL,
  "traineeUserId" TEXT NOT NULL,
  "kind" "FitnessPlanKind" NOT NULL,
  "title" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "notes" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitnessPlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FitnessProgress" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weightKg" DOUBLE PRECISION,
  "note" TEXT,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FitnessProgress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FitnessPlan_coachMerchantId_createdAt_idx" ON "FitnessPlan"("coachMerchantId", "createdAt");
CREATE INDEX "FitnessPlan_traineeUserId_createdAt_idx" ON "FitnessPlan"("traineeUserId", "createdAt");
CREATE INDEX "FitnessProgress_planId_completedAt_idx" ON "FitnessProgress"("planId", "completedAt");
ALTER TABLE "FitnessPlan" ADD CONSTRAINT "FitnessPlan_coachMerchantId_fkey" FOREIGN KEY ("coachMerchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitnessPlan" ADD CONSTRAINT "FitnessPlan_traineeUserId_fkey" FOREIGN KEY ("traineeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitnessProgress" ADD CONSTRAINT "FitnessProgress_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FitnessPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitnessProgress" ADD CONSTRAINT "FitnessProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

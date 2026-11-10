CREATE TYPE "FitnessEnrollmentStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');

ALTER TABLE "FitnessPlan" ADD COLUMN "weeklySchedule" JSONB;

CREATE TABLE "FitnessEnrollment" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "FitnessEnrollmentStatus" NOT NULL DEFAULT 'REQUESTED',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitnessEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FitnessEnrollment_offerId_userId_key" ON "FitnessEnrollment"("offerId", "userId");
CREATE INDEX "FitnessEnrollment_merchantId_status_createdAt_idx" ON "FitnessEnrollment"("merchantId", "status", "createdAt");
CREATE INDEX "FitnessEnrollment_userId_status_createdAt_idx" ON "FitnessEnrollment"("userId", "status", "createdAt");

ALTER TABLE "FitnessEnrollment" ADD CONSTRAINT "FitnessEnrollment_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "FitnessOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitnessEnrollment" ADD CONSTRAINT "FitnessEnrollment_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitnessEnrollment" ADD CONSTRAINT "FitnessEnrollment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

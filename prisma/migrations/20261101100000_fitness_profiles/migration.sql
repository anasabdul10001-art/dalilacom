CREATE TABLE "FitnessProfile" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "displayName" TEXT,
  "headline" TEXT,
  "yearsExperience" INTEGER,
  "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "achievements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitnessProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FitnessProfile_merchantId_key" ON "FitnessProfile"("merchantId");

ALTER TABLE "FitnessProfile"
  ADD CONSTRAINT "FitnessProfile_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

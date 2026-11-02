CREATE TYPE "DoctorPatientStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'REVOKED');
CREATE TYPE "DoctorPatientRecordKind" AS ENUM ('VISIT', 'DIAGNOSIS', 'MEDICATION', 'INSTRUCTIONS', 'FOLLOW_UP');

CREATE TABLE "DoctorPatientConnection" (
  "id" TEXT NOT NULL,
  "doctorMerchantId" TEXT NOT NULL,
  "patientUserId" TEXT NOT NULL,
  "status" "DoctorPatientStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consentedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorPatientConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorPatientRecord" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "kind" "DoctorPatientRecordKind" NOT NULL,
  "contentEnc" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoctorPatientRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DoctorPatientConnection_doctorMerchantId_patientUserId_key"
  ON "DoctorPatientConnection"("doctorMerchantId", "patientUserId");
CREATE INDEX "DoctorPatientConnection_patientUserId_status_idx"
  ON "DoctorPatientConnection"("patientUserId", "status");
CREATE INDEX "DoctorPatientConnection_doctorMerchantId_status_idx"
  ON "DoctorPatientConnection"("doctorMerchantId", "status");
CREATE INDEX "DoctorPatientRecord_connectionId_createdAt_idx"
  ON "DoctorPatientRecord"("connectionId", "createdAt");

ALTER TABLE "DoctorPatientConnection"
  ADD CONSTRAINT "DoctorPatientConnection_doctorMerchantId_fkey"
  FOREIGN KEY ("doctorMerchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorPatientConnection"
  ADD CONSTRAINT "DoctorPatientConnection_patientUserId_fkey"
  FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorPatientRecord"
  ADD CONSTRAINT "DoctorPatientRecord_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "DoctorPatientConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorPatientRecord"
  ADD CONSTRAINT "DoctorPatientRecord_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

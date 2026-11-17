-- Fingerprint and card readers send their punches to the company's attendance.
CREATE TYPE "HrDeviceKind" AS ENUM ('FINGERPRINT', 'CARD', 'FACE', 'OTHER');
ALTER TYPE "HrAttendanceSource" ADD VALUE 'DEVICE';
ALTER TYPE "HrAttendanceSource" ADD VALUE 'IMPORT';

ALTER TABLE "HrEmployee" ADD COLUMN "deviceCode" TEXT;
CREATE UNIQUE INDEX "HrEmployee_companyId_deviceCode_key" ON "HrEmployee"("companyId", "deviceCode");

ALTER TABLE "HrAttendance" ADD COLUMN "deviceId" TEXT;

CREATE TABLE "HrDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "HrDeviceKind" NOT NULL DEFAULT 'FINGERPRINT',
    "keyHash" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrDevice_keyHash_key" ON "HrDevice"("keyHash");
CREATE INDEX "HrDevice_companyId_idx" ON "HrDevice"("companyId");
ALTER TABLE "HrDevice" ADD CONSTRAINT "HrDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "HrDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

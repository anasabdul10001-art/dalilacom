-- One registered phone per employee; a new phone needs an approval from the owner or an HR person.
ALTER TABLE "HrCompany" ADD COLUMN "deviceLockRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HrEmployee" ADD COLUMN "boundDeviceId" TEXT, ADD COLUMN "boundDeviceName" TEXT, ADD COLUMN "boundAt" TIMESTAMP(3);
CREATE TYPE "HrDeviceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "HrDeviceRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "status" "HrDeviceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    CONSTRAINT "HrDeviceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrDeviceRequest_employeeId_deviceId_key" ON "HrDeviceRequest"("employeeId", "deviceId");
CREATE INDEX "HrDeviceRequest_companyId_status_idx" ON "HrDeviceRequest"("companyId", "status");
ALTER TABLE "HrDeviceRequest" ADD CONSTRAINT "HrDeviceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrDeviceRequest" ADD CONSTRAINT "HrDeviceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

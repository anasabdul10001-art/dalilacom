-- Drivers and distributors: their phone reports its position while they are checked in; the owner and HR people see where they are and where they went.
ALTER TABLE "HrEmployee" ADD COLUMN "tracksLocation" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "HrLocationPoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrLocationPoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrLocationPoint_employeeId_recordedAt_idx" ON "HrLocationPoint"("employeeId", "recordedAt");
CREATE INDEX "HrLocationPoint_companyId_recordedAt_idx" ON "HrLocationPoint"("companyId", "recordedAt");
ALTER TABLE "HrLocationPoint" ADD CONSTRAINT "HrLocationPoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrLocationPoint" ADD CONSTRAINT "HrLocationPoint_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

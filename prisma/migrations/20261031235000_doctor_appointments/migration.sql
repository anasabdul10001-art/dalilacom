CREATE TYPE "DoctorAppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "DoctorAppointmentKind" AS ENUM ('VISIT', 'FOLLOW_UP');

CREATE TABLE "DoctorAppointmentSetting" (
  "id" TEXT NOT NULL,
  "doctorMerchantId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "slotMinutes" INTEGER NOT NULL DEFAULT 30,
  "advanceDays" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorAppointmentSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorAppointment" (
  "id" TEXT NOT NULL,
  "doctorMerchantId" TEXT NOT NULL,
  "patientUserId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "kind" "DoctorAppointmentKind" NOT NULL DEFAULT 'VISIT',
  "complaintEnc" TEXT,
  "status" "DoctorAppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  "reminder24hSentAt" TIMESTAMP(3),
  "reminder1hSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DoctorAppointmentSetting_doctorMerchantId_key" ON "DoctorAppointmentSetting"("doctorMerchantId");
CREATE INDEX "DoctorAppointment_doctorMerchantId_startsAt_idx" ON "DoctorAppointment"("doctorMerchantId", "startsAt");
CREATE INDEX "DoctorAppointment_patientUserId_startsAt_idx" ON "DoctorAppointment"("patientUserId", "startsAt");
-- Only a confirmed appointment occupies a slot; a cancelled time can be booked again.
CREATE UNIQUE INDEX "DoctorAppointment_active_slot_key"
  ON "DoctorAppointment"("doctorMerchantId", "startsAt") WHERE "status" = 'CONFIRMED';

ALTER TABLE "DoctorAppointmentSetting"
  ADD CONSTRAINT "DoctorAppointmentSetting_doctorMerchantId_fkey"
  FOREIGN KEY ("doctorMerchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorAppointment"
  ADD CONSTRAINT "DoctorAppointment_doctorMerchantId_fkey"
  FOREIGN KEY ("doctorMerchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DoctorAppointment_patientUserId_fkey"
  FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check-in/out with a rotating code read from a screen at the shop (no fingerprint device needed).
ALTER TABLE "HrCompany" ADD COLUMN "attendanceCodeRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HrCompany" ADD COLUMN "attendanceSecret" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);
-- each existing company gets its own secret (the default above would give them all the same one)
UPDATE "HrCompany" SET "attendanceSecret" = md5(random()::text || clock_timestamp()::text || "id");

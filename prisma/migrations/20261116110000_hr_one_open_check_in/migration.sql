-- An employee has at most one open attendance record (checked in, not yet out), even when two check-ins arrive together.
CREATE UNIQUE INDEX "HrAttendance_one_open_per_employee" ON "HrAttendance"("employeeId") WHERE "checkOut" IS NULL;

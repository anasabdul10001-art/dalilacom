ALTER TYPE "BusinessStaffRole" ADD VALUE 'DRIVER';
ALTER TABLE "Order" ADD COLUMN "driverStaffId" TEXT;
CREATE INDEX "Order_driverStaffId_idx" ON "Order"("driverStaffId");

-- CreateEnum
CREATE TYPE "BannerBookingStatus" AS ENUM ('PENDING', 'CONTACTED', 'SCHEDULED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "StoreBanner" ADD COLUMN "bookingId" TEXT;

-- CreateTable
CREATE TABLE "BannerBooking" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "requestedStart" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "note" TEXT,
    "status" "BannerBookingStatus" NOT NULL DEFAULT 'PENDING',
    "bannerId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BannerBooking_merchantId_idx" ON "BannerBooking"("merchantId");

-- CreateIndex
CREATE INDEX "BannerBooking_status_idx" ON "BannerBooking"("status");

-- AddForeignKey
ALTER TABLE "BannerBooking" ADD CONSTRAINT "BannerBooking_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

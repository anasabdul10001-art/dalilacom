-- CreateEnum
CREATE TYPE "LandmarkGeometry" AS ENUM ('POINT', 'LINE');

-- CreateEnum
CREATE TYPE "LandmarkSector" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "LandmarkStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'HIDDEN', 'CLAIMED');

-- CreateTable
CREATE TABLE "LandmarkKind" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "geometry" "LandmarkGeometry" NOT NULL DEFAULT 'POINT',
    "claimable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandmarkKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Landmark" (
    "id" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "sector" "LandmarkSector",
    "status" "LandmarkStatus" NOT NULL DEFAULT 'ACTIVE',
    "cityId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "path" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "sourceRef" TEXT,
    "claimedMerchantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Landmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandmarkKind_slug_key" ON "LandmarkKind"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Landmark_sourceRef_key" ON "Landmark"("sourceRef");

-- CreateIndex
CREATE INDEX "Landmark_status_latitude_longitude_idx" ON "Landmark"("status", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "Landmark_kindId_idx" ON "Landmark"("kindId");

-- CreateIndex
CREATE INDEX "Landmark_cityId_idx" ON "Landmark"("cityId");

-- AddForeignKey
ALTER TABLE "Landmark" ADD CONSTRAINT "Landmark_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "LandmarkKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The four kinds the owner asked for (more can be added in the admin panel)
INSERT INTO "LandmarkKind" ("id", "slug", "nameAr", "nameEn", "icon", "color", "geometry", "claimable", "sortOrder") VALUES
  (gen_random_uuid()::text, 'mosque', 'جامع', 'Mosque', '🕌', '#1e7e34', 'POINT', false, 1),
  (gen_random_uuid()::text, 'hospital', 'مشفى', 'Hospital', '🏥', '#1b5fa6', 'POINT', true, 2),
  (gen_random_uuid()::text, 'park', 'حديقة', 'Park', '🌳', '#2e8b57', 'POINT', false, 3),
  (gen_random_uuid()::text, 'main_street', 'شارع رئيسي', 'Main street', '🛣️', '#8e44ad', 'LINE', false, 4);

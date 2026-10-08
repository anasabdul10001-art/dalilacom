-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "icon" TEXT,
ADD COLUMN "storeSection" TEXT,
ADD COLUMN "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "soldCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_storeSection_idx" ON "Product"("storeSection");

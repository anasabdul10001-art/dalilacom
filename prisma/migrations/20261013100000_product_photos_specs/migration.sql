-- AlterTable
ALTER TABLE "Product" ADD COLUMN "specs" JSONB,
ADD COLUMN "condition" TEXT;

-- CreateTable
CREATE TABLE "ProductPhoto" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPhoto_merchantId_idx" ON "ProductPhoto"("merchantId");

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdCreative_kind_bookingId_key" ON "AdCreative"("kind", "bookingId");

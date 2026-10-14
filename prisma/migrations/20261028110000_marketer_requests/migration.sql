-- CreateEnum
CREATE TYPE "MarketerChannel" AS ENUM ('ELECTRONIC', 'FIELD');

-- AlterTable
ALTER TABLE "Marketer" ADD COLUMN "channel" "MarketerChannel" NOT NULL DEFAULT 'ELECTRONIC';

-- CreateTable
CREATE TABLE "MarketerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "MarketerChannel" NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "MarketerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketerRequest_userId_idx" ON "MarketerRequest"("userId");

-- CreateIndex
CREATE INDEX "MarketerRequest_status_idx" ON "MarketerRequest"("status");

-- AddForeignKey
ALTER TABLE "MarketerRequest" ADD CONSTRAINT "MarketerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

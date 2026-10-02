-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChannelDriver" ADD VALUE 'FACEBOOK';
ALTER TYPE "ChannelDriver" ADD VALUE 'INSTAGRAM';

-- AlterTable
ALTER TABLE "ResponderInteraction" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "postId" TEXT;

-- AlterTable
ALTER TABLE "ResponderRule" ADD COLUMN     "postIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "ResponderInteraction_connectionId_externalId_key" ON "ResponderInteraction"("connectionId", "externalId");


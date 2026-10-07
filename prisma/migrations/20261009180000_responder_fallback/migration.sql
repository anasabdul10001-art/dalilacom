-- AlterTable
ALTER TABLE "ResponderSubscription" ADD COLUMN     "expiryNoticeFor" TIMESTAMP(3),
ADD COLUMN     "fallbackMode" TEXT NOT NULL DEFAULT 'OFF',
ADD COLUMN     "fallbackReply" TEXT;

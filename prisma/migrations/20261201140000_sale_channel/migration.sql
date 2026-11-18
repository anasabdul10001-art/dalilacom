CREATE TYPE "AccountingSaleChannel" AS ENUM ('SHOP', 'STREET', 'DISTRIBUTOR', 'ONLINE');
ALTER TABLE "AccountingSale" ADD COLUMN "channel" "AccountingSaleChannel" NOT NULL DEFAULT 'SHOP';
CREATE INDEX "AccountingSale_userId_channel_idx" ON "AccountingSale"("userId", "channel");

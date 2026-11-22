-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'NO_BIDS', 'WON', 'PAID', 'UNCLAIMED');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "startPriceCents" INTEGER NOT NULL,
    "currentBidCents" INTEGER NOT NULL,
    "bidCount" INTEGER NOT NULL DEFAULT 0,
    "highBidderId" TEXT,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
    "claimDeadline" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_productId_key" ON "Auction"("productId");

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Auction_highBidderId_idx" ON "Auction"("highBidderId");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionId_amountCents_idx" ON "AuctionBid"("auctionId", "amountCents");

-- CreateIndex
CREATE INDEX "AuctionBid_userId_idx" ON "AuctionBid"("userId");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


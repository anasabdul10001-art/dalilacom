-- AlterTable
ALTER TABLE "MerchantProfile" ADD COLUMN     "priceCurrency" TEXT,
ADD COLUMN     "showBothCurrencies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usdRateSyp" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "enteredMemberPriceCents" INTEGER,
ADD COLUMN     "enteredPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "MerchantProfile" ADD COLUMN     "planId" TEXT;

-- AddForeignKey
ALTER TABLE "MerchantProfile" ADD CONSTRAINT "MerchantProfile_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

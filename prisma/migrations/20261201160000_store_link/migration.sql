-- A store listing can draw its stock from an accounting product's warehouse.
ALTER TABLE "Product" ADD COLUMN "accountingProductId" TEXT;
CREATE INDEX "Product_accountingProductId_idx" ON "Product"("accountingProductId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_accountingProductId_fkey" FOREIGN KEY ("accountingProductId") REFERENCES "AccountingProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

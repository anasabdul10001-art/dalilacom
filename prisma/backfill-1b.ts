/**
 * One-time (but safely re-runnable) backfill for Phase 1B: converts every existing
 * MerchantProfile into a Business (+ BusinessMember + Main Branch when it has a location) and
 * every existing Product into a ProductMaster + MerchantOffer, without touching the old rows at
 * all (section: Backfill). Idempotent — already-migrated rows are skipped via their legacy
 * pointer, so running this twice is harmless.
 *
 * Usage: npm run backfill:1b
 */
import { PrismaClient } from "@prisma/client";
import { createBusinessFromMerchantProfile } from "../src/services/business.service";

const DEFAULT_COUNTRY = {
  name: "Syria",
  nameArabic: "سوريا",
  nameEnglish: "Syria",
  isoCode2: "SY",
  isoCode3: "SYR",
  currencyCode: "SYP",
  phoneCode: "+963",
  defaultLanguage: "ar",
  timezone: "Asia/Damascus",
};

export async function runBackfill(prisma: PrismaClient, log: (...args: unknown[]) => void = console.log) {
  log("=== Phase 1B backfill starting ===");

  const countBefore = async () => ({
    users: await prisma.user.count(),
    merchantProfiles: await prisma.merchantProfile.count(),
    products: await prisma.product.count(),
    orders: await prisma.order.count(),
    cartItems: await prisma.cartItem.count(),
    affiliateReferrals: await prisma.affiliateReferral.count(),
    wallets: await prisma.wallet.count(),
  });
  const beforeCounts = await countBefore();
  log("Before:", beforeCounts);

  const country = await prisma.country.upsert({
    where: { isoCode2: DEFAULT_COUNTRY.isoCode2 },
    update: {},
    create: DEFAULT_COUNTRY,
  });
  log(`Default country: ${country.name} (${country.id})`);

  const merchants = await prisma.merchantProfile.findMany();
  let businessesCreated = 0;
  for (const merchant of merchants) {
    const existing = await prisma.business.findUnique({ where: { legacyMerchantProfileId: merchant.id } });
    if (existing) continue;
    await prisma.$transaction(async (tx) => {
      await createBusinessFromMerchantProfile(tx, merchant, country.id);
    });
    businessesCreated++;
  }
  log(`Businesses created: ${businessesCreated} (of ${merchants.length} merchant profiles)`);

  const products = await prisma.product.findMany();
  let offersCreated = 0;
  for (const product of products) {
    const existingOffer = await prisma.merchantOffer.findUnique({ where: { legacyProductId: product.id } });
    if (existingOffer) continue;

    const business = await prisma.business.findUnique({ where: { legacyMerchantProfileId: product.merchantId } });
    if (!business) {
      log(`  Skipping product ${product.id}: no backfilled Business found for merchant ${product.merchantId}`);
      continue;
    }
    const mainBranch = await prisma.branch.findFirst({ where: { businessId: business.id, isMain: true } });

    await prisma.$transaction(async (tx) => {
      const master = await tx.productMaster.create({
        data: {
          name: product.name,
          sku: product.sku,
          categoryId: product.categoryId,
          description: product.description,
          legacyProductId: product.id,
        },
      });
      await tx.merchantOffer.create({
        data: {
          productMasterId: master.id,
          businessId: business.id,
          branchId: mainBranch?.id,
          sku: product.sku,
          priceCents: product.priceCents,
          currency: country.currencyCode,
          memberDiscountEnabled: product.memberDiscountEnabled,
          memberPriceCents: product.memberPriceCents,
          stock: product.stock,
          status: product.isActive ? "ACTIVE" : "PAUSED",
          legacyProductId: product.id,
        },
      });
    });
    offersCreated++;
  }
  log(`Product masters + offers created: ${offersCreated} (of ${products.length} products)`);

  const afterCounts = {
    ...(await countBefore()),
    businesses: await prisma.business.count(),
    businessMembers: await prisma.businessMember.count(),
    branches: await prisma.branch.count(),
    productMasters: await prisma.productMaster.count(),
    merchantOffers: await prisma.merchantOffer.count(),
  };
  log("After:", afterCounts);

  const unchanged =
    beforeCounts.users === afterCounts.users &&
    beforeCounts.merchantProfiles === afterCounts.merchantProfiles &&
    beforeCounts.products === afterCounts.products &&
    beforeCounts.orders === afterCounts.orders &&
    beforeCounts.cartItems === afterCounts.cartItems &&
    beforeCounts.affiliateReferrals === afterCounts.affiliateReferrals &&
    beforeCounts.wallets === afterCounts.wallets;

  if (!unchanged) {
    throw new Error("Backfill touched pre-existing tables it should never modify — stopping. Investigate before re-running.");
  }
  log("=== Phase 1B backfill complete — every pre-existing table row count is unchanged ===");

  return { beforeCounts, afterCounts, businessesCreated, offersCreated, country };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  runBackfill(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

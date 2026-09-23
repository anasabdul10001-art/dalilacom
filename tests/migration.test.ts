import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { runBackfill } from "../prisma/backfill-1b";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Migration: existing MerchantProfile/Product data survives Phase 1B backfill", () => {
  it("backfills a real merchant+product+order+cart+affiliate flow without losing or altering any pre-existing row, and old endpoints keep working", async () => {
    // ---- 1) Build the world exactly as it existed before Phase 1B, via the OLD endpoints only ----
    const category = await prisma.category.create({ data: { name: "Migration Cat", slug: `migration-cat-${Date.now()}` } });

    const merchantEmail = uniqueEmail("migmerchant");
    const merchantPassword = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email: merchantEmail, password: merchantPassword, fullName: "Merchant Owner" });
    const merchantLogin = await request(app).post("/auth/login").send({ email: merchantEmail, password: merchantPassword });
    const merchantToken = merchantLogin.body.token as string;
    const merchantUser = await prisma.user.findUniqueOrThrow({ where: { email: merchantEmail } });

    // Created via a direct Prisma call, NOT via POST /merchant/register — that route now
    // dual-writes a Business at registration time (see merchant.routes.ts), which would make
    // this row indistinguishable from a brand-new one. Going straight to Prisma faithfully
    // simulates a MerchantProfile that predates Phase 1B and has never been touched by it,
    // which is exactly what the backfill script needs to prove itself against.
    const merchantProfile = await prisma.merchantProfile.create({
      data: {
        userId: merchantUser.id,
        businessName: "Legacy Shop",
        categoryId: category.id,
        address: "123 Old St",
        latitude: 33.5,
        longitude: 36.3,
        phone: "0999999999",
        approvalStatus: "APPROVED",
      },
    });
    await prisma.user.update({ where: { id: merchantUser.id }, data: { role: "MERCHANT" } });
    const merchantProfileId = merchantProfile.id;

    await request(app).post("/merchant/discounts").set("Authorization", `Bearer ${merchantToken}`).send({ title: "Legacy Discount", percent: 15 });

    const productRes = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ name: "Legacy Product", priceCents: 5000, stock: 20, categoryId: category.id });
    expect(productRes.status).toBe(201);
    const productId = productRes.body.id as string;

    const customerEmail = uniqueEmail("migcustomer");
    const customerPassword = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email: customerEmail, password: customerPassword, fullName: "Customer" });
    const customerLogin = await request(app).post("/auth/login").send({ email: customerEmail, password: customerPassword });
    const customerToken = customerLogin.body.token as string;

    await request(app).post("/cart/items").set("Authorization", `Bearer ${customerToken}`).send({ productId, quantity: 2 });
    const checkout = await request(app).post("/cart/checkout").set("Authorization", `Bearer ${customerToken}`);
    expect(checkout.status).toBe(201);
    const orderId = checkout.body[0].id as string;

    // a second cart item left un-checked-out, to prove Cart itself (not just Orders) survives
    await request(app).post("/cart/items").set("Authorization", `Bearer ${customerToken}`).send({ productId, quantity: 1 });

    // ---- 2) Snapshot every pre-existing table's row count and content before backfill ----
    const before = {
      merchantProfile: await prisma.merchantProfile.findUniqueOrThrow({ where: { id: merchantProfileId } }),
      product: await prisma.product.findUniqueOrThrow({ where: { id: productId } }),
      order: await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }),
      cartItemCount: (await prisma.cartItem.findMany()).length,
      counts: {
        users: await prisma.user.count(),
        merchantProfiles: await prisma.merchantProfile.count(),
        products: await prisma.product.count(),
        orders: await prisma.order.count(),
        discounts: await prisma.discount.count(),
      },
    };

    // ---- 3) Run the Phase 1B backfill ----
    const result = await runBackfill(prisma, () => {});
    expect(result.businessesCreated).toBeGreaterThanOrEqual(1);
    expect(result.offersCreated).toBeGreaterThanOrEqual(1);

    // ---- 4) Not a single pre-existing row changed ----
    const after = {
      merchantProfile: await prisma.merchantProfile.findUniqueOrThrow({ where: { id: merchantProfileId } }),
      product: await prisma.product.findUniqueOrThrow({ where: { id: productId } }),
      order: await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }),
      cartItemCount: (await prisma.cartItem.findMany()).length,
      counts: {
        users: await prisma.user.count(),
        merchantProfiles: await prisma.merchantProfile.count(),
        products: await prisma.product.count(),
        orders: await prisma.order.count(),
        discounts: await prisma.discount.count(),
      },
    };
    expect(after.merchantProfile).toEqual(before.merchantProfile);
    expect(after.product).toEqual(before.product);
    expect(after.order).toEqual(before.order);
    expect(after.cartItemCount).toBe(before.cartItemCount);
    expect(after.counts).toEqual(before.counts);

    // ---- 5) The new Business/Branch/ProductMaster/MerchantOffer are correct ----
    const business = await prisma.business.findUnique({ where: { legacyMerchantProfileId: merchantProfileId } });
    expect(business).not.toBeNull();
    expect(business!.name).toBe("Legacy Shop");
    expect(business!.status).toBe("ACTIVE"); // backfilled from approvalStatus=APPROVED
    expect(business!.latitude).toBe(33.5);

    const member = await prisma.businessMember.findFirst({ where: { businessId: business!.id } });
    expect(member?.role).toBe("OWNER");

    const branch = await prisma.branch.findFirst({ where: { businessId: business!.id, isMain: true } });
    expect(branch).not.toBeNull();
    expect(branch!.latitude).toBe(33.5);

    const offer = await prisma.merchantOffer.findUnique({ where: { legacyProductId: productId } });
    expect(offer).not.toBeNull();
    expect(offer!.priceCents).toBe(5000);
    // Stock reflects the *current* live Product row, not the original 20 — the checkout above
    // already decremented it by 2 (the cart item's quantity), exactly as it should.
    expect(offer!.stock).toBe(18);
    expect(offer!.businessId).toBe(business!.id);
    const master = await prisma.productMaster.findUnique({ where: { id: offer!.productMasterId } });
    expect(master?.name).toBe("Legacy Product");

    // ---- 6) Every OLD endpoint still works exactly as before, post-backfill ----
    const merchantGet = await request(app).get(`/merchant/${merchantProfileId}`);
    expect(merchantGet.status).toBe(200);
    expect(merchantGet.body.businessName).toBe("Legacy Shop");

    const productGet = await request(app).get(`/products/${productId}`);
    expect(productGet.status).toBe(200);
    expect(productGet.body.priceCents).toBe(5000);

    const ordersMine = await request(app).get("/orders/mine").set("Authorization", `Bearer ${customerToken}`);
    expect(ordersMine.status).toBe(200);
    expect(ordersMine.body.find((o: any) => o.id === orderId)).toBeTruthy();

    const cartGet = await request(app).get("/cart").set("Authorization", `Bearer ${customerToken}`);
    expect(cartGet.status).toBe(200);
    expect(cartGet.body.items.length).toBeGreaterThan(0);

    // ---- 7) Backfill is idempotent: running it again creates nothing new ----
    const second = await runBackfill(prisma, () => {});
    expect(second.businessesCreated).toBe(0);
    expect(second.offersCreated).toBe(0);
  });
});

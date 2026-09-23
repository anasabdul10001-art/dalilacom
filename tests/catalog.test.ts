import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { ensureTestCountry, uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

async function businessOwner(prefix: string) {
  const country = await ensureTestCountry(prisma);
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Owner" });
  const login = await request(app).post("/auth/login").send({ email, password });
  const token = login.body.token as string;
  const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${token}`).send({ name: `Shop-${Date.now()}`, countryId: country.id });
  return { token, businessId: biz.body.id as string };
}

describe("Product Master / Merchant Offer", () => {
  it("creates a ProductMaster directly", async () => {
    const { token } = await businessOwner("masterowner");
    const res = await request(app).post("/catalog/products").set("Authorization", `Bearer ${token}`).send({ name: "Generic Widget" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
  });

  it("creates an offer that also creates its ProductMaster inline", async () => {
    const { token, businessId } = await businessOwner("inlineowner");
    const res = await request(app)
      .post("/catalog/offers")
      .set("Authorization", `Bearer ${token}`)
      .send({ businessId, productMaster: { name: "New Phone" }, priceCents: 50000, stock: 10 });
    expect(res.status).toBe(201);
    expect(res.body.businessId).toBe(businessId);
    expect(res.body.priceCents).toBe(50000);
  });

  it("lets two different businesses create offers for the SAME ProductMaster, each with its own price/stock/condition", async () => {
    const seller1 = await businessOwner("seller1");
    const seller2 = await businessOwner("seller2");

    const master = await request(app)
      .post("/catalog/products")
      .set("Authorization", `Bearer ${seller1.token}`)
      .send({ name: "Samsung Galaxy S25" });
    const masterId = master.body.id;

    const offer1 = await request(app)
      .post("/catalog/offers")
      .set("Authorization", `Bearer ${seller1.token}`)
      .send({ businessId: seller1.businessId, productMasterId: masterId, priceCents: 90000, stock: 5, condition: "NEW" });
    const offer2 = await request(app)
      .post("/catalog/offers")
      .set("Authorization", `Bearer ${seller2.token}`)
      .send({ businessId: seller2.businessId, productMasterId: masterId, priceCents: 75000, stock: 2, condition: "USED" });

    expect(offer1.status).toBe(201);
    expect(offer2.status).toBe(201);
    expect(offer1.body.productMasterId).toBe(masterId);
    expect(offer2.body.productMasterId).toBe(masterId);
    expect(offer1.body.priceCents).not.toBe(offer2.body.priceCents);
    expect(offer1.body.condition).toBe("NEW");
    expect(offer2.body.condition).toBe("USED");

    // Public product page must show both offers, from both businesses, for comparison.
    const productPage = await request(app).get(`/catalog/products/${masterId}`);
    expect(productPage.status).toBe(200);
    expect(productPage.body.offers).toHaveLength(2);
    const businessIds = productPage.body.offers.map((o: any) => o.business.id);
    expect(businessIds).toContain(seller1.businessId);
    expect(businessIds).toContain(seller2.businessId);
  });

  it("rejects an offer for a business the caller doesn't belong to", async () => {
    const { businessId } = await businessOwner("victim");
    const outsider = await businessOwner("outsider");

    const res = await request(app)
      .post("/catalog/offers")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ businessId, productMaster: { name: "Stolen Listing" }, priceCents: 1000 });
    expect(res.status).toBe(403);
  });

  it("updates price/stock/status on an offer without touching the ProductMaster", async () => {
    const { token, businessId } = await businessOwner("updater");
    const offer = await request(app)
      .post("/catalog/offers")
      .set("Authorization", `Bearer ${token}`)
      .send({ businessId, productMaster: { name: "Adjustable Item" }, priceCents: 2000, stock: 3 });

    const updated = await request(app)
      .patch(`/catalog/offers/${offer.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ priceCents: 1800, stock: 1, status: "PAUSED" });
    expect(updated.status).toBe(200);
    expect(updated.body.priceCents).toBe(1800);
    expect(updated.body.status).toBe("PAUSED");

    const master = await prisma.productMaster.findUnique({ where: { id: offer.body.productMasterId } });
    expect(master?.name).toBe("Adjustable Item"); // untouched
  });
});

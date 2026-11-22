import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { settleDueAuctions } from "../src/services/auction.service";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Auction ${prefix}` })).status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

async function auctionShop(auctionHours: number | null = 24) {
  const cat = await prisma.category.upsert({ where: { slug: "auction-test-cat" }, update: {}, create: { name: "Auction Test", slug: "auction-test-cat" } });
  const owner = await account("auctionshop");
  const reg = await request(app).post("/merchant/register").set(owner.auth).send({ businessName: `Auction Shop ${crypto.randomUUID().slice(0, 6)}`, categoryId: cat.id, address: "Test address" });
  expect(reg.status).toBe(201);
  await prisma.merchantProfile.update({ where: { id: reg.body.id }, data: { approvalStatus: "APPROVED" } });
  await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
  const product = await request(app).post("/products").set(owner.auth).send({ name: "Old clock", priceCents: 10000, stock: 5, categoryId: cat.id, ...(auctionHours ? { auctionHours } : {}) });
  expect(product.status).toBe(201);
  await prisma.product.update({ where: { id: product.body.id }, data: { moderation: "APPROVED" } }); // the AI review is not under test here
  return { owner, merchantId: reg.body.id as string, productId: product.body.id as string };
}

describe("an auction on the store", () => {
  it("is created with the product: one piece, the price is the start, and the store shows it", async () => {
    const s = await auctionShop();
    const row = await prisma.product.findUniqueOrThrow({ where: { id: s.productId }, include: { auction: true } });
    expect(row.stock).toBe(1);
    expect(row.auction?.startPriceCents).toBe(10000);
    expect(row.auction?.status).toBe("OPEN");
    const detail = await request(app).get(`/store/products/${s.productId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.auction.minNextBidCents).toBe(10000);
    const list = await request(app).get("/store/products?auctions=1&limit=60");
    expect(list.body.items.some((p: { id: string }) => p.id === s.productId)).toBe(true);
    expect((await request(app).get(`/auctions/${s.productId}`)).body.bids).toEqual([]);
  });

  it("cannot be bought through the cart, and its price, piece and place stay locked", async () => {
    const s = await auctionShop();
    const buyer = await account("auctionbuyer");
    const add = await request(app).post("/cart/items").set(buyer.auth).send({ productId: s.productId, quantity: 1 });
    expect(add.status).toBe(409);
    expect(add.body.error.code).toBe("AUCTION_ONLY");
    const edit = await request(app).patch(`/products/${s.productId}`).set(s.owner.auth).send({ priceCents: 1 });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("AUCTION_LOCKED");
    expect((await request(app).patch(`/products/${s.productId}`).set(s.owner.auth).send({ isActive: false })).status).toBe(409);
  });

  it("takes bids: at least the start, then 5% more; not by the seller, not twice in a row, not without an account", async () => {
    const s = await auctionShop();
    const a = await account("bidderA");
    const b = await account("bidderB");
    const bid = (who: { auth: Record<string, string> }, amountCents: number) => request(app).post(`/auctions/${s.productId}/bids`).set(who.auth).send({ amountCents });

    expect((await request(app).post(`/auctions/${s.productId}/bids`).send({ amountCents: 10000 })).status).toBe(401);
    expect((await bid(s.owner, 10000)).status).toBe(403);
    expect((await bid(a, 9999)).body.error.code).toBe("BID_TOO_LOW");
    const first = await bid(a, 10000);
    expect(first.status).toBe(201);
    expect(first.body.youLead).toBe(true);
    expect(first.body.minNextBidCents).toBe(10500);
    expect((await bid(a, 20000)).body.error.code).toBe("ALREADY_HIGHEST");
    expect((await bid(b, 10499)).body.error.code).toBe("BID_TOO_LOW");
    const second = await bid(b, 10500);
    expect(second.status).toBe(201);

    const state = await request(app).get(`/auctions/${s.productId}`).set(a.auth);
    expect(state.body.bidCount).toBe(2);
    expect(state.body.currentBidCents).toBe(10500);
    expect(state.body.youLead).toBe(false);
    expect(state.body.bids.map((x: { amountCents: number }) => x.amountCents)).toEqual([10500, 10000]);
    expect(JSON.stringify(state.body.bids)).not.toContain(b.id); // the bidders are never named
    // the one who was beaten is told
    expect(await prisma.notification.count({ where: { userId: a.id, title: "تفوّق عليك أحدهم في المزاد" } })).toBe(1);
  });

  it("moves its end later when a bid arrives in the last minutes", async () => {
    const s = await auctionShop();
    const a = await account("sniper");
    await prisma.auction.update({ where: { productId: s.productId }, data: { endsAt: new Date(Date.now() + 30_000) } });
    expect((await request(app).post(`/auctions/${s.productId}/bids`).set(a.auth).send({ amountCents: 10000 })).status).toBe(201);
    const row = await prisma.auction.findUniqueOrThrow({ where: { productId: s.productId } });
    expect(row.endsAt.getTime() - Date.now()).toBeGreaterThan(100_000);
  });

  it("ends with the highest bidder, who pays the winning bid as an ordinary order", async () => {
    const s = await auctionShop();
    const a = await account("winner");
    const b = await account("loser");
    await request(app).post(`/auctions/${s.productId}/bids`).set(b.auth).send({ amountCents: 10000 });
    await request(app).post(`/auctions/${s.productId}/bids`).set(a.auth).send({ amountCents: 12000 });
    // not ended yet: nobody can check out
    expect((await request(app).post(`/auctions/${s.productId}/checkout`).set(a.auth).send({ address: "Some street 1" })).status).toBe(404);

    await prisma.auction.update({ where: { productId: s.productId }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await settleDueAuctions()).toBeGreaterThanOrEqual(1);
    expect(await settleDueAuctions()).toBe(0 + (await prisma.auction.count({ where: { status: "OPEN", endsAt: { lte: new Date() } } }))); // settling twice does nothing more
    const ended = await request(app).get(`/auctions/${s.productId}`).set(a.auth);
    expect(ended.body.status).toBe("WON");
    expect(ended.body.youWon).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: s.productId } })).stock).toBe(0);
    expect((await request(app).post(`/auctions/${s.productId}/bids`).set(b.auth).send({ amountCents: 99999 })).body.error.code).toBe("AUCTION_ENDED");
    expect(await prisma.notification.count({ where: { userId: a.id, title: "فزت بالمزاد 🎉" } })).toBe(1);

    const won = await request(app).get("/auctions/won/list").set(a.auth);
    expect(won.body).toHaveLength(1);
    // the one who lost cannot buy it
    expect((await request(app).post(`/auctions/${s.productId}/checkout`).set(b.auth).send({ address: "Some street 1" })).status).toBe(404);
    // an address is needed
    expect((await request(app).post(`/auctions/${s.productId}/checkout`).set(a.auth).send({})).status).toBe(400);

    const order = await request(app).post(`/auctions/${s.productId}/checkout`).set(a.auth).send({ address: "Some street 1", phone: "0999999999" });
    expect(order.status).toBe(201);
    expect(order.body.totalCents).toBe(12000);
    expect(order.body.items[0].unitPriceCents).toBe(12000);
    expect(order.body.payment.method).toBe("COD");
    expect((await prisma.auction.findUniqueOrThrow({ where: { productId: s.productId } })).status).toBe("PAID");
    expect((await request(app).post(`/auctions/${s.productId}/checkout`).set(a.auth).send({ address: "Some street 1" })).status).toBe(404); // only once
  });

  it("ends with no winner when nobody bid, and a winner who does not pay in time loses the claim", async () => {
    const quiet = await auctionShop();
    await prisma.auction.update({ where: { productId: quiet.productId }, data: { endsAt: new Date(Date.now() - 1000) } });
    await settleDueAuctions();
    expect((await prisma.auction.findUniqueOrThrow({ where: { productId: quiet.productId } })).status).toBe("NO_BIDS");

    const s = await auctionShop();
    const a = await account("slowpay");
    await request(app).post(`/auctions/${s.productId}/bids`).set(a.auth).send({ amountCents: 10000 });
    await prisma.auction.update({ where: { productId: s.productId }, data: { endsAt: new Date(Date.now() - 1000) } });
    await settleDueAuctions();
    await prisma.auction.update({ where: { productId: s.productId }, data: { claimDeadline: new Date(Date.now() - 1000) } });
    expect((await request(app).post(`/auctions/${s.productId}/checkout`).set(a.auth).send({ address: "Some street 1" })).body.error.code).toBe("CLAIM_EXPIRED");
    await settleDueAuctions();
    expect((await prisma.auction.findUniqueOrThrow({ where: { productId: s.productId } })).status).toBe("UNCLAIMED");
  });

  it("only two bids at the same moment cannot both win: the second is refused", async () => {
    const s = await auctionShop();
    const a = await account("raceA");
    const b = await account("raceB");
    const results = await Promise.all([
      request(app).post(`/auctions/${s.productId}/bids`).set(a.auth).send({ amountCents: 10000 }),
      request(app).post(`/auctions/${s.productId}/bids`).set(b.auth).send({ amountCents: 10000 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await prisma.auction.findUniqueOrThrow({ where: { productId: s.productId } })).bidCount).toBe(1);
  });
});

describe("a product without an auction", () => {
  it("is not affected", async () => {
    const s = await auctionShop(null);
    expect((await request(app).get(`/store/products/${s.productId}`)).body.auction).toBeNull();
    expect((await request(app).get(`/auctions/${s.productId}`)).status).toBe(404);
  });
});

describe("any account can sell by auction", () => {
  it("a plain account becomes a personal seller in one call and lists an auction without a store", async () => {
    const cat = await prisma.category.upsert({ where: { slug: "auction-test-cat" }, update: {}, create: { name: "Auction Test", slug: "auction-test-cat" } });
    void cat;
    const person = await account("privateseller");
    expect((await request(app).post("/products").set(person.auth).send({ name: "My old bike", priceCents: 5000, stock: 1, auctionHours: 24 })).status).toBe(403); // not a seller yet
    const first = await request(app).post("/merchant/personal-seller").set(person.auth);
    expect(first.status).toBe(201);
    expect(first.body.approvalStatus).toBe("APPROVED");
    const again = await request(app).post("/merchant/personal-seller").set(person.auth);
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    const login = await request(app).post("/auth/login").send({ email: (await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).email, password });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const product = await request(app).post("/products").set(auth).send({ name: "My old bike", priceCents: 5000, stock: 1, auctionHours: 24 });
    expect(product.status).toBe(201);
    expect((await prisma.auction.count({ where: { productId: product.body.id } }))).toBe(1);
    expect((await request(app).post("/merchant/personal-seller")).status).toBe(401);
  });
});

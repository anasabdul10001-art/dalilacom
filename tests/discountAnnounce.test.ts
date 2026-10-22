import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";
const tag = Math.random().toString(36).slice(2, 7);
const made: { users: string[]; discounts: string[]; memberships: string[] } = { users: [], discounts: [], memberships: [] };

async function person(label: string, extra: Record<string, unknown> = {}) {
  const email = uniqueEmail(label);
  await request(app).post("/auth/register").send({ email, password, fullName: `Da ${label}` });
  await prisma.user.update({ where: { email }, data: { isEmailVerified: true, ...extra } });
  const login = await request(app).post("/auth/login").send({ email, password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  made.users.push(user.id);
  return { id: user.id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { id: { in: made.memberships } } });
  await prisma.favoriteMerchant.deleteMany({ where: { userId: { in: made.users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: made.users } } });
  await prisma.discount.deleteMany({ where: { id: { in: made.discounts } } });
  await prisma.merchantProfile.deleteMany({ where: { userId: { in: made.users } } });
  await prisma.$disconnect();
});

const told = async (userId: string, discountId: string) =>
  (await prisma.notification.count({ where: { userId, type: "NEW_OFFER", data: { path: ["discountId"], equals: discountId } } })) > 0;

describe("who is told when a shop's new discount is approved", () => {
  it("follows the choice made in the admin panel: city, card holders of the city, nobody", async () => {
    const [cityA, cityB] = await prisma.geoUnit.findMany({ where: { level: "CITY", isActive: true }, take: 2, orderBy: { name: "asc" } });
    const admin = await person("da-admin", { role: "ADMIN" });
    const owner = await person("da-owner", { role: "MERCHANT", cityId: cityA.id });
    const category = await prisma.category.findFirstOrThrow();
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: `محل الحسم ${tag}`, categoryId: category.id, latitude: 33.5, longitude: 36.3, approvalStatus: "APPROVED" } });

    const inCity = await person("da-in", { cityId: cityA.id });
    const member = await person("da-member", { cityId: cityA.id });
    const elsewhere = await person("da-else", { cityId: cityB.id });
    const follower = await person("da-follow", { cityId: cityB.id });
    await prisma.favoriteMerchant.create({ data: { userId: follower.id, merchantId: shop.id } });
    const plan = await prisma.servicePlan.findFirst() ?? (await prisma.servicePlan.create({ data: { name: `خطة ${tag}`, durationDays: 30, priceCents: 0 } }));
    const membership = await prisma.membership.create({ data: { memberNumber: `DA${tag}${Date.now()}`, userId: member.id, planId: plan.id, endDate: new Date(Date.now() + 30 * 86400_000), qrSecret: "s" } });
    made.memberships.push(membership.id);

    const approve = async () => {
      const d = await prisma.discount.create({ data: { merchantId: shop.id, title: `حسم ${tag}`, percent: 10 } });
      made.discounts.push(d.id);
      expect((await request(app).post(`/admin/discounts/${d.id}/approve`).set(admin.auth)).status).toBe(200);
      return d.id;
    };
    const setMode = (discountNotify: Record<string, unknown>) => request(app).put("/admin/settings").set(admin.auth).send({ discountNotify }).expect(200);

    // the people of the shop's city, and the shop's followers
    await setMode({ mode: "CITY", alsoFollowers: true });
    const one = await approve();
    expect(await told(inCity.id, one)).toBe(true);
    expect(await told(member.id, one)).toBe(true);
    expect(await told(follower.id, one)).toBe(true);
    expect(await told(elsewhere.id, one)).toBe(false);
    expect(await told(owner.id, one)).toBe(false); // never the shop itself

    // only the card holders of that city, followers off
    await setMode({ mode: "CITY_MEMBERS", alsoFollowers: false });
    const two = await approve();
    expect(await told(member.id, two)).toBe(true);
    expect(await told(inCity.id, two)).toBe(false);
    expect(await told(follower.id, two)).toBe(false);

    // nobody
    await setMode({ mode: "OFF", alsoFollowers: false });
    const three = await approve();
    expect(await told(member.id, three)).toBe(false);

    // the preview says how many a shop would reach
    await setMode({ mode: "CITY", alsoFollowers: false });
    const preview = await request(app).get(`/admin/discount-notify/preview/${shop.id}`).set(admin.auth);
    expect(preview.body.mode).toBe("CITY");
    expect(preview.body.people).toBeGreaterThanOrEqual(2);

    // approving the same discount again (an edit sent back to the team) does not tell anyone twice
    const before = await prisma.notification.count({ where: { userId: inCity.id, type: "NEW_OFFER" } });
    await request(app).post(`/admin/discounts/${one}/approve`).set(admin.auth).expect(200);
    expect(await prisma.notification.count({ where: { userId: inCity.id, type: "NEW_OFFER" } })).toBe(before);

    await setMode({ mode: "CITY", alsoFollowers: true }); // back to the default
  });
});

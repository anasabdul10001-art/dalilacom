import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, role: "CUSTOMER" | "MERCHANT" | "ADMIN" = "CUSTOMER") {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Settings ${prefix}` });
  if (role !== "CUSTOMER") await prisma.user.update({ where: { email }, data: { role } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: registered.body.user.id as string, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const uniquePhone = () => `+49${Math.floor(1e9 + Math.random() * 9e9)}`;

describe("What the account settings screen reads and writes", () => {
  it("shows the email, phone, country, city and tax number, and saves them (a phone can only belong to one account)", async () => {
    const me = await account("settingsme");
    const first = (await request(app).get("/profile/me").set(me.auth)).body;
    expect(first).toMatchObject({ email: me.email, emailVerified: false, phone: null, countryCode: null, cityId: null, vatNumber: null });

    const phone = uniquePhone();
    const saved = await request(app).patch("/profile/me").set(me.auth).send({ phone: ` ${phone.slice(0, 3)} ${phone.slice(3)} `, countryCode: "de", vatNumber: "DE123456789" });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ phone, countryCode: "DE", vatNumber: "DE123456789" }); // spaces dropped, country upper-cased

    const other = await account("settingsother");
    const taken = await request(app).patch("/profile/me").set(other.auth).send({ phone });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("PHONE_IN_USE");

    expect((await request(app).patch("/profile/me").set(me.auth).send({ phone: "12ab" })).status).toBe(400);
    const cleared = await request(app).patch("/profile/me").set(me.auth).send({ phone: "" });
    expect(cleared.body.phone).toBeNull();
    // and now the number is free for the other account
    expect((await request(app).patch("/profile/me").set(other.auth).send({ phone })).status).toBe(200);
  });

  it("changes the password with the current one, ends the old sessions, and keeps this device signed in", async () => {
    const me = await account("settingspw");
    const wrong = await request(app).post("/auth/change-password").set(me.auth).send({ currentPassword: "not-it-at-all", newPassword: "a-brand-new-password-1" });
    expect(wrong.status).toBe(401);
    const same = await request(app).post("/auth/change-password").set(me.auth).send({ currentPassword: password, newPassword: password });
    expect(same.status).toBe(400);
    const changed = await request(app).post("/auth/change-password").set(me.auth).send({ currentPassword: password, newPassword: "a-brand-new-password-1" });
    expect(changed.status).toBe(200);
    expect((await request(app).get("/auth/me").set(me.auth)).status).toBe(401); // the old token is dead
    expect((await request(app).post("/auth/login").send({ email: me.email, password })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: me.email, password: "a-brand-new-password-1" })).status).toBe(200);
  });

  it("keeps saved addresses per person, with the place picked from the geography", async () => {
    const me = await account("settingsaddr");
    const country = await prisma.country.upsert({ where: { isoCode2: "SY" }, update: {}, create: { name: "Syria", nameArabic: "سوريا", isoCode2: "SY", currencyCode: "SYP" } });
    const region = await prisma.geoUnit.create({ data: { countryId: country.id, level: "REGION", name: `R-${crypto.randomUUID().slice(0, 6)}` } });
    const city = await prisma.geoUnit.create({ data: { countryId: country.id, level: "CITY", parentId: region.id, name: `C-${crypto.randomUUID().slice(0, 6)}` } });

    const made = await request(app).post("/addresses").set(me.auth).send({ countryId: country.id, regionId: region.id, cityId: city.id, street: "شارع الاختبار", buildingNumber: "5", label: "HOME", isDefault: true });
    expect(made.status).toBe(201);
    const second = await request(app).post("/addresses").set(me.auth).send({ countryId: country.id, label: "WORK", isDefault: true });
    expect(second.status).toBe(201);
    const list = (await request(app).get("/addresses").set(me.auth)).body;
    expect(list).toHaveLength(2);
    expect(list.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1); // only the newest default
    const stranger = await account("settingsstranger");
    expect((await request(app).get("/addresses").set(stranger.auth)).body).toHaveLength(0);
    expect((await request(app).delete(`/addresses/${made.body.id}`).set(stranger.auth)).status).toBe(404);
    expect((await request(app).delete(`/addresses/${made.body.id}`).set(me.auth)).status).toBe(200);
  });
});

describe("The admin's list of accounts", () => {
  it("is admin-only, searchable by name, email and phone, filterable by role", async () => {
    const boss = await account("usersboss", "ADMIN");
    const shop = await account("usersshop", "MERCHANT");
    const customer = await account("userscustomer");
    const phone = uniquePhone();
    await request(app).patch("/profile/me").set(customer.auth).send({ phone });

    expect((await request(app).get("/admin/users")).status).toBe(401);
    expect((await request(app).get("/admin/users").set(customer.auth)).status).toBe(403);

    const byEmail = (await request(app).get("/admin/users").set(boss.auth).query({ q: shop.email })).body;
    expect(byEmail).toHaveLength(1);
    expect(byEmail[0]).toMatchObject({ id: shop.id, role: "MERCHANT", isDisabled: false });
    expect(JSON.stringify(byEmail)).not.toContain("passwordHash");
    expect((await request(app).get("/admin/users").set(boss.auth).query({ q: phone })).body.map((u: { id: string }) => u.id)).toEqual([customer.id]);
    const admins = (await request(app).get("/admin/users").set(boss.auth).query({ role: "ADMIN" })).body;
    expect(admins.every((u: { role: string }) => u.role === "ADMIN")).toBe(true);
    expect(admins.some((u: { id: string }) => u.id === boss.id)).toBe(true);
  });

  it("switches an account off (ending its sessions) and back on, but never your own", async () => {
    const boss = await account("disableboss", "ADMIN");
    const victim = await account("disablevictim");

    expect((await request(app).patch(`/admin/users/${victim.id}`).set(victim.auth).send({ isDisabled: true })).status).toBe(403); // not an admin
    expect((await request(app).patch(`/admin/users/${boss.id}`).set(boss.auth).send({ isDisabled: true })).status).toBe(409); // not yourself
    expect((await request(app).patch(`/admin/users/${crypto.randomUUID()}`).set(boss.auth).send({ isDisabled: true })).status).toBe(404);

    expect((await request(app).patch(`/admin/users/${victim.id}`).set(boss.auth).send({ isDisabled: true })).body).toEqual({ id: victim.id, isDisabled: true });
    expect((await request(app).get("/auth/me").set(victim.auth)).status).toBe(401); // the open session ended
    const refused = await request(app).post("/auth/login").send({ email: victim.email, password });
    expect(refused.status).toBe(403);
    expect((await request(app).patch(`/admin/users/${victim.id}`).set(boss.auth).send({ isDisabled: false })).body.isDisabled).toBe(false);
    expect((await request(app).post("/auth/login").send({ email: victim.email, password })).status).toBe(200);
  });
});

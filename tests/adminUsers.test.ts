import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  expect((await request(app).post("/auth/register").send({ email, password, fullName: `Adm ${prefix}` })).status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}

describe("the admin edits and deletes accounts", () => {
  it("opens one account with all its details; only an admin may", async () => {
    const boss = await account("uboss", { role: "ADMIN" });
    const person = await account("uperson", { bio: "نبذة", phone: `+9639${Math.floor(10000000 + Math.random() * 89999999)}` });
    const one = await request(app).get(`/admin/users/${person.id}`).set(boss.auth);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: person.id, email: person.email, bio: "نبذة", walletBalance: 0, ordersCount: 0, role: "CUSTOMER" });
    expect((await request(app).get(`/admin/users/${person.id}`).set(person.auth)).status).toBe(403);
  });

  it("edits the details, ends the old sessions when the email or password changes, and refuses a taken email or phone", async () => {
    const boss = await account("uboss2", { role: "ADMIN" });
    const person = await account("uedit");
    const other = await account("uother", { phone: `+9639${Math.floor(10000000 + Math.random() * 89999999)}` });
    const newEmail = uniqueEmail("renamed");
    const phone = `+9639${Math.floor(10000000 + Math.random() * 89999999)}`;

    const res = await request(app).patch(`/admin/users/${person.id}`).set(boss.auth).send({ fullName: "اسم جديد", email: newEmail, phone, role: "MERCHANT", isEmailVerified: true, newPassword: "a-brand-new-password" });
    expect(res.status).toBe(200);
    expect((await request(app).get(`/admin/users/${person.id}`).set(boss.auth)).body).toMatchObject({ fullName: "اسم جديد", email: newEmail, phone, role: "MERCHANT", isEmailVerified: true });

    // the old session is over, the new password works
    expect((await request(app).get("/profile/me").set(person.auth)).status).toBe(401);
    const login = await request(app).post("/auth/login").send({ email: newEmail, password: "a-brand-new-password" });
    expect(login.status).toBe(200);

    const taken = await request(app).patch(`/admin/users/${person.id}`).set(boss.auth).send({ email: other.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.message).toMatch(/[؀-ۿ]/);
    expect((await request(app).patch(`/admin/users/${person.id}`).set(boss.auth).send({ phone: other.email })).status).toBe(400);
    const dupPhone = (await prisma.user.findUnique({ where: { id: other.id } }))!.phone!;
    expect((await request(app).patch(`/admin/users/${person.id}`).set(boss.auth).send({ phone: dupPhone })).status).toBe(409);

    // an admin's role is not changed from here, nor can anyone be made admin
    expect((await request(app).patch(`/admin/users/${boss.id}`).set(boss.auth).send({ role: "CUSTOMER" })).status).toBe(409);
    expect((await request(app).patch(`/admin/users/${person.id}`).set(boss.auth).send({ role: "ADMIN" })).status).toBe(400);
    // and disabling still works as before
    expect((await request(app).patch(`/admin/users/${person.id}`).set(boss.auth).send({ isDisabled: true })).status).toBe(200);
    expect((await request(app).patch(`/admin/users/${boss.id}`).set(boss.auth).send({ isDisabled: true })).status).toBe(409);
  });

  it("protects an admin account: no other admin can change its role or details, switch it off or delete it", async () => {
    const a = await account("uprotA", { role: "ADMIN" });
    const b = await account("uprotB", { role: "ADMIN" });
    for (const body of [{ role: "CUSTOMER" }, { fullName: "اسم مسروق" }, { email: uniqueEmail("hijack") }, { newPassword: "hijacked-password-1" }, { isDisabled: true }]) {
      const res = await request(app).patch(`/admin/users/${a.id}`).set(b.auth).send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/[؀-ۿ]/);
    }
    expect((await request(app).delete(`/admin/users/${a.id}`).set(b.auth)).status).toBe(403);
    const still = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(still).toMatchObject({ role: "ADMIN", email: a.email, isDisabled: false });
    expect((await request(app).post("/auth/login").send({ email: a.email, password })).status).toBe(200);
    // the owner may edit their own details
    expect((await request(app).patch(`/admin/users/${a.id}`).set(a.auth).send({ fullName: "اسمي الجديد" })).status).toBe(200);
  });

  it("deletes an account for good when nothing depends on it", async () => {
    const boss = await account("uboss3", { role: "ADMIN" });
    const person = await account("udelete");
    const res = await request(app).delete(`/admin/users/${person.id}`).set(boss.auth);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("deleted");
    expect(await prisma.user.findUnique({ where: { id: person.id } })).toBeNull();
    expect((await request(app).get(`/admin/users/${person.id}`).set(boss.auth)).status).toBe(404);
  });

  it("anonymises instead when the books still need the account, and never deletes an admin or oneself", async () => {
    const boss = await account("uboss4", { role: "ADMIN" });
    const person = await account("ubooks");
    await prisma.wallet.upsert({ where: { userId: person.id }, update: {}, create: { userId: person.id } });
    await prisma.walletTransaction.create({ data: { userId: person.id, type: "TOPUP", amount: 5 } });
    const res = await request(app).delete(`/admin/users/${person.id}`).set(boss.auth);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("anonymized");
    expect(await prisma.user.findUnique({ where: { id: person.id } })).toMatchObject({ isDisabled: true, fullName: "حساب محذوف", phone: null });

    expect((await request(app).delete(`/admin/users/${boss.id}`).set(boss.auth)).status).toBe(403);
    const other = await account("uboss5", { role: "ADMIN" });
    expect((await request(app).delete(`/admin/users/${other.id}`).set(boss.auth)).status).toBe(403);
    const customer = await account("ucust");
    expect((await request(app).delete(`/admin/users/${customer.id}`).set(customer.auth)).status).toBe(403);
  });
});

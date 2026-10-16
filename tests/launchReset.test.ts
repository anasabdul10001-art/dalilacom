import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { adjustBalance } from "../src/services/wallet.service";
import { RESET_PHRASE } from "../src/services/launchReset.service";

const password = "correct-horse-battery-staple";
const saved = { allow: process.env.ALLOW_DATA_RESET, email: process.env.SUPER_ADMIN_EMAIL };

beforeAll(() => { delete process.env.ALLOW_DATA_RESET; });
afterAll(async () => {
  process.env.ALLOW_DATA_RESET = saved.allow;
  if (saved.allow === undefined) delete process.env.ALLOW_DATA_RESET;
  if (saved.email === undefined) delete process.env.SUPER_ADMIN_EMAIL; else process.env.SUPER_ADMIN_EMAIL = saved.email;
  await prisma.$disconnect();
});

async function account(prefix: string, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  const res = await request(app).post("/auth/register").send({ email, password, fullName: `Reset ${prefix}` });
  expect(res.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}

describe("launch reset: everything from zero, except the super admin and the platform's own setup", () => {
  it("is closed unless the server allows it, and needs the right phrase and password", async () => {
    const boss = await account("lrboss", { role: "ADMIN" });
    process.env.SUPER_ADMIN_EMAIL = boss.email;
    const person = await account("lrperson");
    expect((await request(app).get("/admin/launch-reset").set(person.auth)).status).toBe(403); // an admin only

    const closed = await request(app).post("/admin/launch-reset").set(boss.auth).send({ phrase: RESET_PHRASE, password });
    expect(closed.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: person.id } })).not.toBeNull();

    process.env.ALLOW_DATA_RESET = "yes";
    expect((await request(app).post("/admin/launch-reset").set(boss.auth).send({ phrase: "no", password })).status).toBe(400);
    expect((await request(app).post("/admin/launch-reset").set(boss.auth).send({ phrase: RESET_PHRASE, password: "wrong-password-here" })).status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: person.id } })).not.toBeNull();

    // the preview shows who stays and what goes, and changes nothing
    const preview = await request(app).get("/admin/launch-reset").set(boss.auth);
    expect(preview.status).toBe(200);
    expect(preview.body.keptAdmins.map((a: { email: string }) => a.email)).toEqual([boss.email]);
    expect(preview.body.willBeRemoved.find((x: { table: string }) => x.table === "User").rows).toBeGreaterThan(1);
  });

  it("wipes the people and what they made, keeps the super admin, the places, the categories and the settings", async () => {
    const boss = await account("lrboss2", { role: "ADMIN" });
    process.env.SUPER_ADMIN_EMAIL = boss.email;
    process.env.ALLOW_DATA_RESET = "yes";
    const shop = await account("lrshop", { role: "MERCHANT" });
    await prisma.$transaction((tx) => adjustBalance(tx, shop.id, 500, "TOPUP", "x"));

    const countries = await prisma.country.count();
    const categories = await prisma.category.count();
    const settings = await prisma.platformSetting.count();
    const plans = await prisma.servicePlan.count();
    expect(countries).toBeGreaterThan(0);

    const res = await request(app).post("/admin/launch-reset").set(boss.auth).send({ phrase: RESET_PHRASE, password });
    expect(res.status).toBe(200);
    expect(res.body.usersLeft).toBe(1);

    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, isDisabled: true } });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: boss.id, role: "ADMIN" });
    expect(await prisma.merchantProfile.count()).toBe(0);
    expect(await prisma.wallet.count()).toBe(0);
    expect(await prisma.country.count()).toBe(countries);
    expect(await prisma.category.count()).toBe(categories);
    expect(await prisma.platformSetting.count()).toBe(settings);
    expect(await prisma.servicePlan.count()).toBe(plans);

    // the super admin still signs in with the same password, and the app still works for a new sign-up
    const login = await request(app).post("/auth/login").send({ email: boss.email, password });
    expect(login.status).toBe(200);
    const fresh = await request(app).post("/auth/register").send({ email: uniqueEmail("lrnew"), password, fullName: "Fresh start" });
    expect(fresh.status).toBe(201);
  });
});

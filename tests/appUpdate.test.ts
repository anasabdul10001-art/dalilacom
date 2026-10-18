import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";

async function admin() {
  const email = uniqueEmail("upd");
  await request(app).post("/auth/register").send({ email, password, fullName: "Update Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

afterAll(async () => {
  await prisma.platformSetting.deleteMany({ where: { key: "appUpdate" } });
  await prisma.$disconnect();
});

describe("the 'new version' message inside the app", () => {
  it("is off until the admin writes a version and switches it on", async () => {
    await prisma.platformSetting.deleteMany({ where: { key: "appUpdate" } });
    expect((await request(app).get("/app-update")).body).toMatchObject({ version: null, notify: false });
    await request(app).put("/admin/app-update").send({ version: "0.1.6", notify: true }).expect(401);

    const auth = await admin();
    expect((await request(app).put("/admin/app-update").set(auth).send({ version: "new!", notify: true })).status).toBe(400);
    // switched on without a version stays off
    expect((await request(app).put("/admin/app-update").set(auth).send({ version: "", notify: true })).body.notify).toBe(false);

    await request(app).put("/admin/app-update").set(auth).send({ version: "0.1.6", notify: false }).expect(200);
    expect((await request(app).get("/app-update")).body).toMatchObject({ version: "0.1.6", notify: false });
    await request(app).put("/admin/app-update").set(auth).send({ version: "0.1.6", notify: true }).expect(200);
    const pub = (await request(app).get("/app-update")).body;
    expect(pub).toMatchObject({ version: "0.1.6", notify: true });
    expect("playUrl" in pub).toBe(true);
  });
});

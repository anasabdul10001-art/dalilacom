import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { ensureTestCountry, uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerAndLogin(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery-staple";
  await request(app).post("/auth/register").send({ email, password, fullName: "Test User" });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { token: login.body.token as string, userId: login.body.user.id as string, email };
}

describe("Business", () => {
  it("creates a business owned by the caller", async () => {
    const country = await ensureTestCountry(prisma);
    const { token } = await registerAndLogin("bizowner");

    const res = await request(app)
      .post("/businesses")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "My Shop", countryId: country.id });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");

    const mine = await request(app).get("/businesses/mine").set("Authorization", `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.some((m: any) => m.business.id === res.body.id && m.role === "OWNER")).toBe(true);
  });

  it("lets one user own multiple businesses", async () => {
    const country = await ensureTestCountry(prisma);
    const { token } = await registerAndLogin("multibiz");

    const a = await request(app).post("/businesses").set("Authorization", `Bearer ${token}`).send({ name: "Shop A", countryId: country.id });
    const b = await request(app).post("/businesses").set("Authorization", `Bearer ${token}`).send({ name: "Shop B", countryId: country.id });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const mine = await request(app).get("/businesses/mine").set("Authorization", `Bearer ${token}`);
    const ids = mine.body.map((m: any) => m.business.id);
    expect(ids).toContain(a.body.id);
    expect(ids).toContain(b.body.id);
  });

  it("lets an owner add another member, giving that business multiple members", async () => {
    const country = await ensureTestCountry(prisma);
    const owner = await registerAndLogin("owner");
    const staff = await registerAndLogin("staff");

    const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${owner.token}`).send({ name: "Team Shop", countryId: country.id });

    const addMember = await request(app)
      .post(`/businesses/${biz.body.id}/members`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userEmail: staff.email, role: "STAFF" });
    expect(addMember.status).toBe(201);

    const members = await request(app).get(`/businesses/${biz.body.id}/members`).set("Authorization", `Bearer ${owner.token}`);
    expect(members.body).toHaveLength(2);

    // the new STAFF member should now see this business under /mine too
    const staffMine = await request(app).get("/businesses/mine").set("Authorization", `Bearer ${staff.token}`);
    expect(staffMine.body.some((m: any) => m.business.id === biz.body.id && m.role === "STAFF")).toBe(true);
  });

  it("a non-member cannot manage the business", async () => {
    const country = await ensureTestCountry(prisma);
    const owner = await registerAndLogin("owner2");
    const stranger = await registerAndLogin("stranger");

    const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${owner.token}`).send({ name: "Private Shop", countryId: country.id });

    const res = await request(app)
      .patch(`/businesses/${biz.body.id}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ name: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("a business can exist with zero branches", async () => {
    const country = await ensureTestCountry(prisma);
    const { token } = await registerAndLogin("nobranch");
    const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${token}`).send({ name: "Online Only", countryId: country.id });

    const branches = await request(app).get(`/businesses/${biz.body.id}/branches`);
    expect(branches.status).toBe(200);
    expect(branches.body).toHaveLength(0);
  });

  it("a business can have multiple branches", async () => {
    const country = await ensureTestCountry(prisma);
    const { token } = await registerAndLogin("multibranch");
    const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${token}`).send({ name: "Chain Shop", countryId: country.id });

    const b1 = await request(app)
      .post(`/businesses/${biz.body.id}/branches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Branch 1", countryId: country.id });
    const b2 = await request(app)
      .post(`/businesses/${biz.body.id}/branches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Branch 2", countryId: country.id });
    expect(b1.status).toBe(201);
    expect(b2.status).toBe(201);

    const branches = await request(app).get(`/businesses/${biz.body.id}/branches`);
    expect(branches.body).toHaveLength(2);
  });

  it("rejects a branch created against someone else's business", async () => {
    const country = await ensureTestCountry(prisma);
    const owner = await registerAndLogin("branchowner");
    const stranger = await registerAndLogin("branchstranger");
    const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${owner.token}`).send({ name: "Guarded Shop", countryId: country.id });

    const res = await request(app)
      .post(`/businesses/${biz.body.id}/branches`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ name: "Intruder Branch", countryId: country.id });
    expect(res.status).toBe(403);
  });

  it("moves a business through its status lifecycle correctly, rejecting invalid transitions", async () => {
    const country = await ensureTestCountry(prisma);
    const { token } = await registerAndLogin("lifecycle");
    const biz = await request(app).post("/businesses").set("Authorization", `Bearer ${token}`).send({ name: "Lifecycle Shop", countryId: country.id });
    expect(biz.body.status).toBe("DRAFT");

    const activate = await request(app).patch(`/businesses/${biz.body.id}/status`).set("Authorization", `Bearer ${token}`).send({ status: "ACTIVE" });
    expect(activate.status).toBe(200);
    expect(activate.body.status).toBe("ACTIVE");

    // DRAFT -> CLOSED directly is not an allowed transition once already ACTIVE -> ACTIVE
    const invalid = await request(app).patch(`/businesses/${biz.body.id}/status`).set("Authorization", `Bearer ${token}`).send({ status: "ARCHIVED" });
    expect(invalid.status).toBe(409);
  });
});

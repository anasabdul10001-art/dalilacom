import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { ensureSuperAdmin } from "../prisma/admin.seed";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const login = (email: string, password: string) => request(app).post("/auth/login").send({ email, password });

describe("Owner bootstrap from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD", () => {
  it("creates the admin, and leaves it alone on the next deploy", async () => {
    const email = uniqueEmail("bootadmin");
    expect(await ensureSuperAdmin(prisma, email, "first-owner-password-1")).toBe("created");
    const res = await login(email, "first-owner-password-1");
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ADMIN");
    expect(await ensureSuperAdmin(prisma, email, "first-owner-password-1")).toBe("unchanged");
  });

  it("promotes an account that already exists as a normal user and sets the owner's password", async () => {
    const email = uniqueEmail("bootpromote");
    const registered = await request(app).post("/auth/register").send({ email, password: "old-user-password-123", fullName: "Was A User" });
    expect(registered.status).toBe(201);
    expect(registered.body.user.role).not.toBe("ADMIN");

    expect(await ensureSuperAdmin(prisma, email, "owner-chosen-password-1")).toBe("promoted");
    expect((await login(email, "old-user-password-123")).status).toBe(401);
    const res = await login(email, "owner-chosen-password-1");
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ADMIN");
    // sessions opened with the old password stop working
    expect((await request(app).get("/auth/me").set("Authorization", `Bearer ${registered.body.token}`)).status).toBe(401);
  });

  it("re-keys an existing admin whose password differs from the one set on the host, and re-enables a disabled one", async () => {
    const email = uniqueEmail("bootrekey");
    await ensureSuperAdmin(prisma, email, "original-admin-password-1");
    expect(await ensureSuperAdmin(prisma, email, "replacement-admin-password-1")).toBe("password-synced");
    expect((await login(email, "original-admin-password-1")).status).toBe(401);
    expect((await login(email, "replacement-admin-password-1")).status).toBe(200);

    await prisma.user.update({ where: { email }, data: { isDisabled: true } });
    expect(await ensureSuperAdmin(prisma, email, "replacement-admin-password-1")).toBe("promoted");
    expect((await login(email, "replacement-admin-password-1")).status).toBe(200);
  });

  it("refuses a short password", async () => {
    await expect(ensureSuperAdmin(prisma, uniqueEmail("bootshort"), "short")).rejects.toThrow(/12 characters/);
  });
});

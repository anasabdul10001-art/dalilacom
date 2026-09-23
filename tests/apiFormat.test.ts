import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("API: unified error envelope", () => {
  it("wraps validation errors as {error:{code,message,details}}", async () => {
    const res = await request(app).post("/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(res.body.error).toHaveProperty("message");
    expect(res.body.error).toHaveProperty("details");
    expect(res.body.error).not.toHaveProperty("stack");
  });

  it("returns the same envelope shape for an unknown route (404)", async () => {
    const res = await request(app).get("/this-route-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the same envelope shape for a 401", async () => {
    const res = await request(app).get("/orders/mine");
    expect(res.status).toBe(401);
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });

  it("returns the same envelope shape for a domain 404 (unknown product id)", async () => {
    const res = await request(app).get("/products/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });
});

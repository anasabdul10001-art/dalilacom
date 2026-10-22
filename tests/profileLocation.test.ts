import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the place a person sets for nearby offers", () => {
  it("is kept (rounded), read back for the map, and forgotten on request", async () => {
    const email = uniqueEmail("loc");
    await request(app).post("/auth/register").send({ email, password, fullName: "Loc Test" });
    const login = await request(app).post("/auth/login").send({ email, password });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    await request(app).get("/profile/location").expect(401);
    expect((await request(app).get("/profile/location").set(auth)).body.location).toBeNull();
    expect((await request(app).put("/profile/location").set(auth).send({ latitude: 36.20212, longitude: 37.13431 })).status).toBe(200);
    expect((await request(app).get("/profile/location").set(auth)).body.location).toEqual({ latitude: 36.2, longitude: 37.13 });
    expect((await request(app).delete("/profile/location").set(auth)).status).toBe(200);
    expect((await request(app).get("/profile/location").set(auth)).body.location).toBeNull();
  });
});

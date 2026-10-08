import request from "supertest";
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";

const saved = process.env.PUBLIC_BASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = saved;
});
afterAll(() => prisma.$disconnect());

describe("The website has one address", () => {
  it("moves pages and sign-in starts from the old Render address to the public address, but leaves the API alone", async () => {
    process.env.PUBLIC_BASE_URL = "https://dalilacom.com";
    const page = await request(app).get("/app/?merchant=abc").set("Host", "dalilacom-api.onrender.com");
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe("https://dalilacom.com/app/?merchant=abc");

    const start = await request(app).get("/auth/social/facebook/start?platform=app").set("Host", "dalilacom-api.onrender.com");
    expect(start.status).toBe(302);
    expect(start.headers.location).toBe("https://dalilacom.com/auth/social/facebook/start?platform=app");

    const api = await request(app).get("/health").set("Host", "dalilacom-api.onrender.com");
    expect(api.status).toBe(200);
    const post = await request(app).post("/auth/login").set("Host", "dalilacom-api.onrender.com").send({});
    expect(post.status).not.toBe(302);
  });

  it("does nothing on the public address itself, locally, or when the public address is the Render one", async () => {
    process.env.PUBLIC_BASE_URL = "https://dalilacom.com";
    expect((await request(app).get("/app/").set("Host", "dalilacom.com")).status).toBe(200);
    expect((await request(app).get("/app/")).status).toBe(200);
    process.env.PUBLIC_BASE_URL = "https://dalilacom-api.onrender.com";
    expect((await request(app).get("/app/").set("Host", "dalilacom-api.onrender.com")).status).toBe(200);
  });
});

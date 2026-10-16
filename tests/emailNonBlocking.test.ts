import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { emailService } from "../src/services/email.service";

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe("a slow or broken mail provider never keeps a person waiting", () => {
  it("sign-up answers at once even when the mail never leaves", async () => {
    const stuck = vi.spyOn(emailService, "send").mockImplementation(() => new Promise<void>(() => {})); // never finishes
    const started = Date.now();
    const res = await request(app).post("/auth/register").send({ email: uniqueEmail("nb"), password: "correct-horse-battery", fullName: "No Block" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(stuck).toHaveBeenCalled(); // the verification mail was still handed to the provider
  });

  it("sign-up also works when the mail provider throws", async () => {
    vi.spyOn(emailService, "send").mockRejectedValue(new Error("provider down"));
    const res = await request(app).post("/auth/register").send({ email: uniqueEmail("nb2"), password: "correct-horse-battery", fullName: "No Block Two" });
    expect(res.status).toBe(201);
  });
});

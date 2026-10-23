import { describe, it, expect, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { TERMS_VERSION } from "../src/lib/consent";

afterAll(async () => {
  await prisma.$disconnect();
});
afterEach(() => {
  delete process.env.GDPR_STRICT;
});

const password = "correct-horse-battery-staple";
async function signUp(extra: Record<string, unknown> = {}) {
  const email = uniqueEmail("gdpr");
  const res = await request(app).post("/auth/register").send({ email, password, fullName: "Gdpr Person", ...extra });
  return { email, res, auth: { Authorization: `Bearer ${res.body.token}` } };
}

describe("accepting the terms (section 65)", () => {
  it("records when and which version when the person accepts at sign-up", async () => {
    const { email, res } = await signUp({ acceptTerms: true });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.termsVersion).toBe(TERMS_VERSION);
    expect(user.termsAcceptedAt).not.toBeNull();
  });

  it("an older app that sends nothing still signs up while enforcement is off", async () => {
    const { email, res } = await signUp();
    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).termsAcceptedAt).toBeNull();
  });

  it("with enforcement on, sign-up without accepting is refused and nothing is created", async () => {
    process.env.GDPR_STRICT = "on";
    const refused = await signUp();
    expect(refused.res.status).toBe(400);
    expect(refused.res.body.error.code).toBe("TERMS_NOT_ACCEPTED");
    expect(await prisma.user.count({ where: { email: refused.email } })).toBe(0);
    expect((await signUp({ acceptTerms: false })).res.status).toBe(400);
    expect((await signUp({ acceptTerms: true })).res.status).toBe(201);
  });

  it("an existing account accepts the current terms later", async () => {
    const { auth } = await signUp();
    const before = await request(app).get("/profile/consent").set(auth);
    expect(before.body.terms).toMatchObject({ acceptedAt: null, upToDate: false });
    const put = await request(app).put("/profile/consent").set(auth).send({ terms: true });
    expect(put.status).toBe(200);
    expect((await request(app).get("/profile/consent").set(auth)).body.terms).toMatchObject({ version: TERMS_VERSION, upToDate: true });
  });
});

describe("location consent", () => {
  const place = { latitude: 33.5138, longitude: 36.2765 };

  it("with enforcement on, the location is refused until the person consents, and the consent comes with the first save", async () => {
    process.env.GDPR_STRICT = "on";
    const { auth } = await signUp({ acceptTerms: true });
    const refused = await request(app).put("/profile/location").set(auth).send(place);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("LOCATION_CONSENT_REQUIRED");
    expect((await request(app).get("/profile/location").set(auth)).body.location).toBeNull();

    expect((await request(app).put("/profile/location").set(auth).send({ ...place, consent: true })).status).toBe(200);
    expect((await request(app).put("/profile/location").set(auth).send(place)).status).toBe(200); // consent stays
    expect((await request(app).get("/profile/consent").set(auth)).body.location.consentAt).not.toBeNull();
  });

  it("withdrawing the consent erases the stored place; deleting the place withdraws the consent", async () => {
    const { auth } = await signUp();
    await request(app).put("/profile/location").set(auth).send({ ...place, consent: true });
    const withdrawn = await request(app).put("/profile/consent").set(auth).send({ location: false });
    expect(withdrawn.body.location.consentAt).toBeNull();
    expect((await request(app).get("/profile/location").set(auth)).body.location).toBeNull();

    await request(app).put("/profile/consent").set(auth).send({ location: true });
    await request(app).put("/profile/location").set(auth).send(place);
    await request(app).delete("/profile/location").set(auth);
    expect((await request(app).get("/profile/consent").set(auth)).body.location.consentAt).toBeNull();
  });
});

describe("download my data (right of access)", () => {
  it("returns the person's own data as a file, without secrets", async () => {
    const { email, auth } = await signUp({ acceptTerms: true });
    const res = await request(app).get("/profile/export").set(auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.account.email).toBe(email);
    expect(res.body.account.termsVersion).toBe(TERMS_VERSION);
    expect(res.body.securityEvents.some((e: { type: string }) => e.type === "REGISTER")).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|qrSecret/);
  });

  it("needs a signed-in person", async () => {
    expect((await request(app).get("/profile/export")).status).toBe(401);
  });
});

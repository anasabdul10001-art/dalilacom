import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { resetPushTokenCache } from "../src/services/push.service";
import { uniqueEmail } from "./helpers";

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  await prisma.$disconnect();
});

function fakeServiceAccount(projectId = "test-project") {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  return JSON.stringify({ project_id: projectId, client_email: `test@${projectId}.iam.gserviceaccount.com`, private_key: privateKey });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function admin() {
  const email = uniqueEmail("pushadmin");
  const password = "correct-horse-battery-staple";
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: "Push Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: registered.body.user?.id as string | undefined ?? (await prisma.user.findUniqueOrThrow({ where: { email } })).id, auth: { Authorization: `Bearer ${login.body.token}` } };
}

beforeEach(() => {
  fetchStub.mockReset();
  resetPushTokenCache();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

describe("Admin push status and test", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/admin/push-status")).status).toBe(401);
    expect((await request(app).post("/admin/push-test")).status).toBe(401);
  });

  it("says plainly when no key is set, and when the variable is not a usable key", async () => {
    const { auth } = await admin();
    let res = await request(app).get("/admin/push-status").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: false, invalid: false, authenticated: null });

    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "not json";
    res = await request(app).get("/admin/push-status").set(auth);
    expect(res.body).toMatchObject({ configured: false, invalid: true });
  });

  it("proves the key works by signing in to Google, and never returns the key", async () => {
    const { auth } = await admin();
    const key = fakeServiceAccount("proj-ok");
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = key;
    fetchStub.mockResolvedValueOnce(json({ access_token: "access-1", expires_in: 3600 }));
    const res = await request(app).get("/admin/push-status").set(auth);
    expect(res.body).toMatchObject({ configured: true, invalid: false, projectId: "proj-ok", authenticated: true, error: null });
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE KEY");
  });

  it("reports why Google refused the key", async () => {
    const { auth } = await admin();
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fakeServiceAccount("proj-bad");
    fetchStub.mockResolvedValueOnce(json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400));
    const res = await request(app).get("/admin/push-status").set(auth);
    expect(res.body).toMatchObject({ configured: true, authenticated: false });
    expect(res.body.error).toContain("invalid_grant");
    expect(res.body.error).not.toContain("PRIVATE KEY");
  });

  it("test push: 409 with no registered device, delivers to the admin's own phone, and shows Firebase's error when it fails", async () => {
    const { id, auth } = await admin();
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fakeServiceAccount();

    const none = await request(app).post("/admin/push-test").set(auth);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe("NO_DEVICE");

    const token = `fcm-${crypto.randomBytes(24).toString("hex")}`;
    await prisma.deviceToken.create({ data: { userId: id, token, platform: "android" } });

    fetchStub.mockResolvedValueOnce(json({ access_token: "access-2", expires_in: 3600 })).mockResolvedValueOnce(json({ name: "projects/test-project/messages/1" }));
    const sent = await request(app).post("/admin/push-test").set(auth);
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ devices: 1, delivered: 1, errors: [] });
    const message = JSON.parse(fetchStub.mock.calls.find((c) => String(c[0]).includes("fcm.googleapis.com"))![1].body).message;
    expect(message.token).toBe(token);

    fetchStub.mockReset();
    fetchStub.mockResolvedValueOnce(json({ error: { status: "PERMISSION_DENIED", message: "Firebase Cloud Messaging API has not been used" } }, 403));
    const failed = await request(app).post("/admin/push-test").set(auth);
    expect(failed.body.delivered).toBe(0);
    expect(failed.body.errors.join(" ")).toContain("PERMISSION_DENIED");
  });
});

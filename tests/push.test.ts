import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { notify } from "../src/services/notification.service";
import { resetPushTokenCache, sendPushToUser } from "../src/services/push.service";
import { uniqueEmail } from "./helpers";

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  await prisma.$disconnect();
});

// A throwaway RSA key in the shape of a service-account file, so the real JWT signing path runs.
function fakeServiceAccount(projectId = "test-project") {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  return JSON.stringify({ project_id: projectId, client_email: `test@${projectId}.iam.gserviceaccount.com`, private_key: privateKey });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenOk = () => json({ access_token: "access-123", expires_in: 3600 });
const fcmOk = () => json({ name: "projects/test-project/messages/1" });

async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Push Tester" });
  expect(registered.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, auth: { Authorization: `Bearer ${registered.body.token}` } };
}

const newToken = () => `fcm-${crypto.randomBytes(24).toString("hex")}`;
const calls = (matcher: string) => fetchStub.mock.calls.filter((c) => String(c[0]).includes(matcher));

beforeEach(() => {
  fetchStub.mockReset();
  resetPushTokenCache();
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fakeServiceAccount();
});

describe("Registering a phone for push", () => {
  it("stores the FCM token, needs a sign-in, validates it, and only lets you remove your own", async () => {
    const owner = await account("pushowner");
    const token = newToken();
    expect((await request(app).post("/notifications/devices").send({ token })).status).toBe(401);
    expect((await request(app).post("/notifications/devices").set(owner.auth).send({ token: "short" })).status).toBe(400);

    expect((await request(app).post("/notifications/devices").set(owner.auth).send({ token })).status).toBe(201);
    expect((await request(app).post("/notifications/devices").set(owner.auth).send({ token })).status).toBe(201); // idempotent
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(1);

    const stranger = await account("pushstranger");
    expect((await request(app).delete("/notifications/devices").set(stranger.auth).send({ token })).body.removed).toBe(false);
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(1);
    expect((await request(app).delete("/notifications/devices").set(owner.auth).send({ token })).body.removed).toBe(true);
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(0);
  });

  it("re-points a token to whoever signed in on that phone last, so the old owner stops receiving", async () => {
    const first = await account("pushfirst");
    const second = await account("pushsecond");
    const token = newToken();
    await request(app).post("/notifications/devices").set(first.auth).send({ token });
    await request(app).post("/notifications/devices").set(second.auth).send({ token });
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token } })).userId).toBe(second.id);
  });
});

describe("Sending push through Firebase", () => {
  it("signs in to Google once, then sends the notification to each device with the app's channel and string data", async () => {
    const user = await account("pushsend");
    const token = newToken();
    await request(app).post("/notifications/devices").set(user.auth).send({ token });
    fetchStub.mockResolvedValueOnce(tokenOk()).mockResolvedValue(fcmOk());

    const result = await notify({ userId: user.id, type: "ORDER_PLACED", title: "طلبك وصل", body: "رقم الطلب ORD-1", data: { orderId: "abc", count: 2 } });
    expect(result).toMatchObject({ created: true });

    const auth = calls("oauth2.googleapis.com")[0];
    expect(String(auth[1].body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    const send = calls("fcm.googleapis.com")[0];
    expect(String(send[0])).toContain("/projects/test-project/messages:send");
    expect(send[1].headers.Authorization).toBe("Bearer access-123");
    const message = JSON.parse(send[1].body).message;
    expect(message).toMatchObject({
      token,
      notification: { title: "طلبك وصل", body: "رقم الطلب ORD-1" },
      data: { type: "ORDER_PLACED", orderId: "abc", count: "2" }, // every value is a string
      android: { priority: "HIGH", notification: { channel_id: "dalilacom_default" } },
    });

    // the access token is reused for the next notification
    await notify({ userId: user.id, type: "ORDER_STATUS", title: "تم التأكيد" });
    expect(calls("oauth2.googleapis.com")).toHaveLength(1);
    expect(calls("fcm.googleapis.com")).toHaveLength(2);
  });

  it("removes a token Firebase says is gone, and keeps sending to the user's other phones", async () => {
    const user = await account("pushdead");
    const dead = newToken();
    const alive = newToken();
    await prisma.deviceToken.createMany({ data: [{ userId: user.id, token: dead }, { userId: user.id, token: alive }] });
    fetchStub.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (String(url).includes("oauth2")) return tokenOk();
      const sentTo = JSON.parse(String(init?.body)).message.token;
      return sentTo === dead ? json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, 404) : fcmOk();
    });

    expect(await sendPushToUser(user.id, { title: "x" })).toBe(1);
    expect(await prisma.deviceToken.count({ where: { token: dead } })).toBe(0);
    expect(await prisma.deviceToken.count({ where: { token: alive } })).toBe(1);
  });

  it("keeps going when one phone cannot be reached", async () => {
    const user = await account("pushflaky");
    await prisma.deviceToken.createMany({ data: [{ userId: user.id, token: newToken() }, { userId: user.id, token: newToken() }] });
    fetchStub.mockResolvedValueOnce(tokenOk()).mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(fcmOk());
    expect(await sendPushToUser(user.id, { title: "x" })).toBe(1);
  });

  it("respects the notification preference: only FULL pushes", async () => {
    const user = await account("pushpref");
    await request(app).post("/notifications/devices").set(user.auth).send({ token: newToken() });
    fetchStub.mockResolvedValueOnce(tokenOk()).mockResolvedValue(fcmOk());

    await prisma.notificationPreference.create({ data: { userId: user.id, type: "ORDER_STATUS", mode: "IN_APP_ONLY" } });
    await notify({ userId: user.id, type: "ORDER_STATUS", title: "inbox only" });
    expect(fetchStub).not.toHaveBeenCalled();

    await prisma.notificationPreference.create({ data: { userId: user.id, type: "ORDER_PLACED", mode: "OFF" } });
    const off = await notify({ userId: user.id, type: "ORDER_PLACED", title: "off" });
    expect(off.created).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("does nothing, and breaks nothing, when Firebase is not configured or Google refuses the login", async () => {
    const user = await account("pushnone");
    await request(app).post("/notifications/devices").set(user.auth).send({ token: newToken() });

    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const unconfigured = await notify({ userId: user.id, type: "ORDER_PLACED", title: "no firebase" });
    expect(unconfigured.created).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();

    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fakeServiceAccount();
    resetPushTokenCache();
    fetchStub.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
    const refused = await notify({ userId: user.id, type: "ORDER_PLACED", title: "google says no" });
    expect(refused.created).toBe(true); // the inbox row is still there
    expect(calls("fcm.googleapis.com")).toHaveLength(0);

    // a malformed value counts as "not configured"
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{not json";
    fetchStub.mockReset();
    expect((await notify({ userId: user.id, type: "ORDER_PLACED", title: "bad config" })).created).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

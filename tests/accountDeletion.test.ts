import crypto from "crypto";
import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string) {
  const email = uniqueEmail(prefix);
  const registered = await request(app).post("/auth/register").send({ email, password, fullName: `Delete ${prefix}` });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: registered.body.user.id as string, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}

/** What Facebook posts: base64url(signature).base64url(payload), signed with the app secret. */
function signedRequest(payload: object, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest().toString("base64url");
  return `${signature}.${body}`;
}

describe("Deleting my own account", () => {
  it("needs the password, then removes everything personal, keeps the accounting rows, and ends every session", async () => {
    const me = await account("selfdelete");
    await prisma.user.update({ where: { id: me.id }, data: { bio: "نبذة", phone: `+49${Math.floor(Math.random() * 1e9)}`, lastLatitude: 33.5, lastLongitude: 36.3, countryCode: "SY" } });
    await prisma.deviceToken.create({ data: { userId: me.id, token: `fcm-${crypto.randomBytes(12).toString("hex")}` } });
    await prisma.notificationPreference.create({ data: { userId: me.id, type: "SYSTEM", mode: "OFF" } });
    const country = await prisma.country.findFirstOrThrow();
    await prisma.address.create({ data: { userId: me.id, countryId: country.id, street: "شارع سري" } });
    await prisma.wallet.create({ data: { userId: me.id, balance: 5 } });
    await prisma.walletTransaction.create({ data: { userId: me.id, type: "TOPUP", amount: 5, ref: "kept" } });

    expect((await request(app).delete("/profile/me").send({ confirm: true, password })).status).toBe(401); // not signed in
    expect((await request(app).delete("/profile/me").set(me.auth).send({ confirm: true })).status).toBe(403); // no password
    expect((await request(app).delete("/profile/me").set(me.auth).send({ confirm: true, password: "not-the-password" })).status).toBe(403); // and the session survives it
    expect((await request(app).get("/auth/me").set(me.auth)).status).toBe(200);
    expect((await request(app).delete("/profile/me").set(me.auth).send({ password })).status).toBe(400); // must say it means it

    const done = await request(app).delete("/profile/me").set(me.auth).send({ confirm: true, password });
    expect(done.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(row).toMatchObject({ email: `deleted-${me.id}@deleted.invalid`, fullName: "حساب محذوف", phone: null, bio: null, isDisabled: true, lastLatitude: null, countryCode: null });
    expect(await prisma.deviceToken.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.address.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.notificationPreference.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { userId: me.id } })).toBe(1); // the books keep their rows

    expect((await request(app).get("/auth/me").set(me.auth)).status).toBe(401); // the old session is dead
    expect((await request(app).post("/auth/login").send({ email: me.email, password })).status).toBe(401); // and so is the login
    // the address is free again for a new account
    expect((await request(app).post("/auth/register").send({ email: me.email, password, fullName: "Someone new" })).status).toBe(201);
  });

  it("takes a shop off the map and clears the responder's rules, connections and conversations", async () => {
    const owner = await account("shopdelete");
    await prisma.user.update({ where: { id: owner.id }, data: { role: "MERCHANT" } });
    const category = await prisma.category.upsert({ where: { slug: "del-test-cat" }, update: {}, create: { name: "Deletion Test", slug: "del-test-cat" } });
    const shop = await prisma.merchantProfile.create({ data: { userId: owner.id, businessName: "متجر سيُحذف", categoryId: category.id, approvalStatus: "APPROVED", address: "عنوان", phone: "0999", latitude: 1, longitude: 2 } });
    await prisma.responderSubscription.create({ data: { userId: owner.id, status: "TRIAL" } });
    await prisma.responderRule.create({ data: { userId: owner.id, name: "r", keywords: ["x"], replyTemplate: "y" } });

    expect((await request(app).delete("/profile/me").set(owner.auth).send({ confirm: true, password })).status).toBe(200);
    expect(await prisma.merchantProfile.findUniqueOrThrow({ where: { id: shop.id } })).toMatchObject({ approvalStatus: "REJECTED", address: null, phone: null, latitude: null });
    expect(await prisma.responderRule.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.responderSubscription.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("an account that signs in with Facebook repeats nothing — it has no password to repeat", async () => {
    const me = await account("socialdelete");
    await prisma.socialIdentity.create({ data: { userId: me.id, provider: "FACEBOOK", providerUserId: `f-${crypto.randomUUID()}` } });
    expect((await request(app).delete("/profile/me").set(me.auth).send({ confirm: true })).status).toBe(200);
    expect(await prisma.socialIdentity.count({ where: { userId: me.id } })).toBe(0);
  });
});

describe("Facebook's callbacks when someone removes the app or asks for deletion", () => {
  const SECRET = "legal-test-app-secret";

  it("unlinks that Facebook account, answers with a confirmation code and a status page, and refuses anything not signed by Facebook", async () => {
    process.env.FACEBOOK_LOGIN_APP_SECRET = SECRET;
    try {
      const me = await account("fbdelete");
      const facebookId = `fb-${crypto.randomUUID()}`;
      await prisma.socialIdentity.create({ data: { userId: me.id, provider: "FACEBOOK", providerUserId: facebookId } });

      const forged = await request(app).post("/legal/facebook/data-deletion").type("form").send({ signed_request: signedRequest({ user_id: facebookId }, "someone-elses-secret") });
      expect(forged.status).toBe(400);
      expect((await request(app).post("/legal/facebook/data-deletion").type("form").send({})).status).toBe(400);
      expect(await prisma.socialIdentity.count({ where: { providerUserId: facebookId } })).toBe(1);

      const ok = await request(app).post("/legal/facebook/data-deletion").type("form").send({ signed_request: signedRequest({ user_id: facebookId }, SECRET) });
      expect(ok.status).toBe(200);
      expect(ok.body.confirmation_code).toMatch(/^[a-f0-9]{16}$/);
      expect(ok.body.url).toContain(`/data-deletion.html?code=${ok.body.confirmation_code}`);
      expect(await prisma.socialIdentity.count({ where: { providerUserId: facebookId } })).toBe(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).email).toBe(me.email); // the account itself is not touched

      const again = await prisma.socialIdentity.create({ data: { userId: me.id, provider: "FACEBOOK", providerUserId: facebookId } });
      const removed = await request(app).post("/legal/facebook/deauthorize").type("form").send({ signed_request: signedRequest({ user_id: facebookId }, SECRET) });
      expect(removed.status).toBe(200);
      expect(await prisma.socialIdentity.findUnique({ where: { id: again.id } })).toBeNull();
    } finally {
      delete process.env.FACEBOOK_LOGIN_APP_SECRET;
    }
  });

  it("serves the pages Meta asks for: privacy policy, terms and data deletion", async () => {
    for (const page of ["/privacy.html", "/terms.html", "/data-deletion.html"]) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain("dalilacomsy@gmail.com");
    }
    expect((await request(app).get("/privacy.html")).text).toContain("Privacy Policy");
  });
});

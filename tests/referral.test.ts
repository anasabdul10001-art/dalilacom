import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { adjustBalance } from "../src/services/wallet.service";
import { getSettings, saveSettings } from "../src/services/settings.service";

afterAll(async () => {
  await prisma.$disconnect();
});

const password = "correct-horse-battery-staple";
async function account(prefix: string, body: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  const email = uniqueEmail(prefix);
  const res = await request(app).post("/auth/register").send({ email, password, fullName: `Ref ${prefix}`, ...body });
  expect(res.status).toBe(201);
  const user = await prisma.user.update({ where: { email }, data });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { id: user.id, email, auth: { Authorization: `Bearer ${login.body.token}` } };
}
const balance = async (userId: string) => (await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? 0;

describe("marketing: referral links, marketers and a marketing manager", () => {
  it("the admin adds a manager and a marketer under him; only an admin may", async () => {
    const boss = await account("rboss", {}, { role: "ADMIN" });
    const mgrUser = await account("rmgr");
    const mkUser = await account("rmk");
    expect((await request(app).get("/admin/marketers").set(mgrUser.auth)).status).toBe(403);

    const mgr = await request(app).post("/admin/marketers").set(boss.auth).send({ email: mgrUser.email, kind: "MANAGER", teamPercent: 2, teamSignupCredits: 3 });
    expect(mgr.status).toBe(201);
    expect(mgr.body.code).toMatch(/^[A-Z0-9]{6}$/);
    // a marketer needs a manager, not another marketer
    const bad = await request(app).post("/admin/marketers").set(boss.auth).send({ email: mkUser.email, kind: "MARKETER", parentId: "00000000-0000-4000-8000-000000000000" });
    expect(bad.status).toBe(400);
    const mk = await request(app).post("/admin/marketers").set(boss.auth).send({ email: mkUser.email, kind: "MARKETER", parentId: mgr.body.id, percent: 10, signupCredits: 5 });
    expect(mk.status).toBe(201);
    expect((await request(app).post("/admin/marketers").set(boss.auth).send({ email: mkUser.email, kind: "MANAGER" })).status).toBe(409);

    const list = (await request(app).get("/admin/marketers").set(boss.auth)).body.marketers;
    expect(list.find((m: { id: string }) => m.id === mk.body.id)).toMatchObject({ kind: "MARKETER", parentId: mgr.body.id, percent: 10, signupCredits: 5 });
    const me = (await request(app).get("/referral/me").set(mkUser.auth)).body;
    expect(me).toMatchObject({ isMarketer: true, kind: "MARKETER", code: mk.body.code, people: 0, earned: 0 });
    expect(me.link).toContain(`join=${mk.body.code}`);
    expect((await request(app).get("/referral/me").set((await account("rnobody")).auth)).body.isMarketer).toBe(false);
  });

  it("a sign-up with a code is paid to the marketer and to the manager above him; what the person spends earns a percent", async () => {
    const boss = await account("rboss2", {}, { role: "ADMIN" });
    const mgrUser = await account("rmgr2");
    const mkUser = await account("rmk2");
    const mgr = (await request(app).post("/admin/marketers").set(boss.auth).send({ email: mgrUser.email, kind: "MANAGER", teamPercent: 2, teamSignupCredits: 3 })).body;
    const mk = (await request(app).post("/admin/marketers").set(boss.auth).send({ email: mkUser.email, kind: "MARKETER", parentId: mgr.id, percent: 10, signupCredits: 5 })).body;

    // the test server has no mail provider, so a sign-up with a code counts at once
    const person = await account("rperson", { referralCode: mk.code.toLowerCase() });
    expect(await balance(mkUser.id)).toBe(5);
    expect(await balance(mgrUser.id)).toBe(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).referredById).toBe(mk.id);

    // the same person never pays twice
    const { payForSignup } = await import("../src/services/referral.service");
    await payForSignup(person.id);
    expect(await balance(mkUser.id)).toBe(5);

    // 200 credits spent on a plan: 10% to the marketer, 2% to the manager
    await prisma.wallet.upsert({ where: { userId: person.id }, update: { balance: 1000 }, create: { userId: person.id, balance: 1000 } });
    await prisma.$transaction((tx) => adjustBalance(tx, person.id, -200, "SUBSCRIPTION", "plan"));
    expect(await balance(mkUser.id)).toBe(5 + 20);
    expect(await balance(mgrUser.id)).toBe(3 + 4);
    // a top-up is not spending: nobody earns on it
    await prisma.$transaction((tx) => adjustBalance(tx, person.id, 500, "TOPUP", "x"));
    expect(await balance(mkUser.id)).toBe(25);

    const me = (await request(app).get("/referral/me").set(mgrUser.auth)).body;
    expect(me).toMatchObject({ kind: "MANAGER", teamPeople: 1, earned: 7, earnedFromTeam: 7 });
    expect(me.team[0]).toMatchObject({ id: mk.id, people: 1, earned: 25 });
    const tx = await prisma.walletTransaction.findMany({ where: { userId: mkUser.id, type: "COMMISSION" } });
    expect(tx.map((t) => t.amount).sort((a, b) => a - b)).toEqual([5, 20]);
  });

  it("uses the platform defaults when a person has no numbers of his own", async () => {
    const before = (await getSettings()).referral;
    await saveSettings({ referral: { marketerPercent: 5, marketerSignupCredits: 7, managerPercent: 1, managerSignupCredits: 2 } } as never);
    try {
      const boss = await account("rboss3", {}, { role: "ADMIN" });
      const mgrUser = await account("rmgr3");
      const mkUser = await account("rmk3");
      const mgr = (await request(app).post("/admin/marketers").set(boss.auth).send({ email: mgrUser.email, kind: "MANAGER" })).body;
      const mk = (await request(app).post("/admin/marketers").set(boss.auth).send({ email: mkUser.email, kind: "MARKETER", parentId: mgr.id })).body;
      const person = await account("rperson3", { referralCode: mk.code });
      expect(await balance(mkUser.id)).toBe(7);
      expect(await balance(mgrUser.id)).toBe(2);
      await prisma.wallet.upsert({ where: { userId: person.id }, update: { balance: 1000 }, create: { userId: person.id, balance: 1000 } });
      await prisma.$transaction((tx) => adjustBalance(tx, person.id, -100, "AD", "ad"));
      expect(await balance(mkUser.id)).toBe(7 + 5);
      expect(await balance(mgrUser.id)).toBe(2 + 1);
      // a switched-off marketer earns nothing more
      await request(app).patch(`/admin/marketers/${mk.id}`).set(boss.auth).send({ isActive: false });
      await prisma.$transaction((tx) => adjustBalance(tx, person.id, -100, "AD", "ad"));
      expect(await balance(mkUser.id)).toBe(12);
    } finally {
      await saveSettings({ referral: before } as never);
    }
  });

  it("a wrong code never stops a sign-up; /referral/use claims a code once and never your own", async () => {
    const boss = await account("rboss4", {}, { role: "ADMIN" });
    const mkUser = await account("rmk4");
    const mk = (await request(app).post("/admin/marketers").set(boss.auth).send({ email: mkUser.email, kind: "MARKETER", signupCredits: 4 })).body;

    const stray = await account("rstray", { referralCode: "NOPE00" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stray.id } })).referredById).toBeNull();

    const claim = await request(app).post("/referral/use").set(stray.auth).send({ code: mk.code });
    expect(claim.body.ok).toBe(true);
    expect(await balance(mkUser.id)).toBe(4);
    expect((await request(app).post("/referral/use").set(stray.auth).send({ code: mk.code })).body).toMatchObject({ ok: false, reason: "ALREADY" });
    expect((await request(app).post("/referral/use").set(mkUser.auth).send({ code: mk.code })).body.ok).toBe(false);
    expect((await request(app).post("/referral/use").send({ code: mk.code })).status).toBe(401);
  });

  it("a person asks to become an online or field marketer; the admin accepts or refuses", async () => {
    const boss = await account("rboss5", {}, { role: "ADMIN" });
    const online = await account("rask1");
    const field = await account("rask2");
    expect((await request(app).post("/referral/request").send({ channel: "FIELD" })).status).toBe(401);
    expect((await request(app).post("/referral/request").set(online.auth).send({ channel: "OTHER" })).status).toBe(400);

    expect((await request(app).post("/referral/request").set(online.auth).send({ channel: "ELECTRONIC", phone: "+963911111111" })).status).toBe(201);
    expect((await request(app).post("/referral/request").set(online.auth).send({ channel: "FIELD" })).status).toBe(409); // one open request at a time
    expect((await request(app).post("/referral/request").set(field.auth).send({ channel: "FIELD", note: "أعرف محلات كتير" })).status).toBe(201);
    expect((await request(app).get("/referral/me").set(online.auth)).body.request).toEqual({ channel: "ELECTRONIC", status: "PENDING" });

    expect((await request(app).get("/admin/marketer-requests").set(online.auth)).status).toBe(403);
    const pending = (await request(app).get("/admin/marketer-requests").set(boss.auth)).body.requests;
    const first = pending.find((r: { email: string }) => r.email === online.email);
    const second = pending.find((r: { email: string }) => r.email === field.email);
    expect(first).toMatchObject({ channel: "ELECTRONIC", phone: "+963911111111" });
    expect(second).toMatchObject({ channel: "FIELD", note: "أعرف محلات كتير" });

    expect((await request(app).post(`/admin/marketer-requests/${first.id}/approve`).set(boss.auth).send({})).status).toBe(200);
    expect((await request(app).post(`/admin/marketer-requests/${second.id}/reject`).set(boss.auth)).status).toBe(200);
    expect((await request(app).post(`/admin/marketer-requests/${first.id}/approve`).set(boss.auth).send({})).status).toBe(404); // already decided

    const me = (await request(app).get("/referral/me").set(online.auth)).body;
    expect(me).toMatchObject({ isMarketer: true, kind: "MARKETER", channel: "ELECTRONIC" });
    expect((await request(app).get("/referral/me").set(field.auth)).body.request).toEqual({ channel: "FIELD", status: "REJECTED" });
    // a refused person may ask again
    expect((await request(app).post("/referral/request").set(field.auth).send({ channel: "FIELD" })).status).toBe(201);
    expect((await request(app).post("/referral/request").set(online.auth).send({ channel: "FIELD" })).status).toBe(409); // already a marketer
  });
});

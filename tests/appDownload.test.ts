import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";

const password = "correct-horse-battery-staple";

async function admin() {
  const email = uniqueEmail("apk");
  await request(app).post("/auth/register").send({ email, password, fullName: "Apk Admin" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await request(app).post("/auth/login").send({ email, password });
  return { Authorization: `Bearer ${login.body.token}` };
}

// a stand-in for an .apk: a zip header followed by the manifest name (what the server checks)
function fakeApk(size = 4096) {
  const buf = Buffer.alloc(size, 7);
  buf.writeUInt32LE(0x04034b50, 0);
  buf.write("AndroidManifest.xml", 100, "latin1");
  return buf;
}

afterAll(async () => {
  await prisma.appRelease.deleteMany({});
  await prisma.platformSetting.deleteMany({ where: { key: "appDownloadVisible" } });
  await prisma.$disconnect();
});

describe("the Android app as a file on the website", () => {
  it("is offered to nobody until the admin uploads a file and switches the link on", async () => {
    const auth = await admin();
    expect((await request(app).get("/app-download")).body.available).toBe(false);
    expect((await request(app).get("/download/dalilacom.apk")).status).toBe(404);

    await request(app).put("/admin/app-download/file?version=0.1.3").set("Content-Type", "application/octet-stream").send(fakeApk()).expect(401); // not an admin
    const notApk = await request(app).put("/admin/app-download/file?version=0.1.3").set(auth).set("Content-Type", "application/octet-stream").send(Buffer.from("just text, not an app"));
    expect(notApk.status).toBe(400);
    const noVersion = await request(app).put("/admin/app-download/file?version=").set(auth).set("Content-Type", "application/octet-stream").send(fakeApk());
    expect(noVersion.status).toBe(400);
    // the link cannot be switched on before there is a file
    expect((await request(app).put("/admin/app-download/visible").set(auth).send({ visible: true })).status).toBe(400);

    const apk = fakeApk();
    const up = await request(app).put("/admin/app-download/file?version=0.1.3").set(auth).set("Content-Type", "application/octet-stream").send(apk);
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ hasFile: true, version: "0.1.3", sizeBytes: apk.length });

    // uploaded but still switched off: not offered, not downloadable
    expect((await request(app).get("/app-download")).body.available).toBe(false);
    expect((await request(app).get("/download/dalilacom.apk")).status).toBe(404);

    expect((await request(app).put("/admin/app-download/visible").set(auth).send({ visible: true })).status).toBe(200);
    const info = (await request(app).get("/app-download")).body;
    expect(info).toMatchObject({ available: true, version: "0.1.3" });

    const file = await request(app).get("/download/dalilacom.apk").buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/vnd.android.package-archive");
    expect(file.headers["content-disposition"]).toContain("Dalilacom.apk");
    expect(crypto.createHash("sha256").update(file.body as Buffer).digest("hex")).toBe(info.sha256);

    // switched off again: gone from both
    await request(app).put("/admin/app-download/visible").set(auth).send({ visible: false }).expect(200);
    expect((await request(app).get("/download/dalilacom.apk")).status).toBe(404);
  });

  it("keeps only the newest few uploads", async () => {
    const auth = await admin();
    for (const v of ["1.0.0", "1.0.1", "1.0.2", "1.0.3"]) {
      await request(app).put(`/admin/app-download/file?version=${v}`).set(auth).set("Content-Type", "application/octet-stream").send(fakeApk(2048 + v.length)).expect(200);
    }
    expect(await prisma.appRelease.count()).toBe(3);
    expect((await request(app).get("/admin/app-download").set(auth)).body.version).toBe("1.0.3");
  });
});

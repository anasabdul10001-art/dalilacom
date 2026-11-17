import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { company, hire, linkedEmployee } from "./hrHelpers";
import { parseCsv, parseWhen } from "../src/services/hrDevice.service";

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup(prefix: string) {
  const o = await company(prefix);
  const emp = (await hire(o)).body as { id: string };
  expect((await request(app).patch(`/hr/employees/${emp.id}`).set(o.auth).send({ deviceCode: "17" })).body.deviceCode).toBe("17");
  const dev = await request(app).post("/hr/devices").set(o.auth).send({ name: "Front door", kind: "FINGERPRINT" });
  expect(dev.status).toBe(201);
  return { o, emp, key: dev.body.key as string, deviceId: dev.body.id as string };
}
const send = (key: string, punches: object[]) => request(app).post("/hr/device/punches").set("X-Device-Key", key).send({ punches });
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe("HR fingerprint and card readers", () => {
  it("a reader needs its own key; the key is shown once and can be switched off or replaced", async () => {
    const { o, key, deviceId } = await setup("hrdv1");
    expect((await request(app).post("/hr/device/punches").send({ punches: [{ code: "17", at: ago(5) }] })).status).toBe(401);
    expect((await send("hrd_wrong-key-wrong-key-wrong", [{ code: "17", at: ago(5) }])).status).toBe(401);
    expect((await request(app).get("/hr/device/ping").set("X-Device-Key", key)).body.device).toBe("Front door");
    const list = (await request(app).get("/hr/devices").set(o.auth)).body;
    expect(list[0].key).toBeUndefined();
    expect(list[0].lastSeenAt).toBeTruthy();
    const rotated = await request(app).patch(`/hr/devices/${deviceId}`).set(o.auth).send({ rotateKey: true });
    expect(rotated.body.key).toBeTruthy();
    expect((await send(key, [{ code: "17", at: ago(5) }])).status).toBe(401); // the old key is dead
    await request(app).patch(`/hr/devices/${deviceId}`).set(o.auth).send({ active: false });
    expect((await send(rotated.body.key, [{ code: "17", at: ago(5) }])).status).toBe(401); // switched off
  });

  it("punches toggle in and out, repeats and double scans change nothing", async () => {
    const { emp, key, deviceId } = await setup("hrdv2");
    const res = await send(key, [{ code: "17", at: ago(300) }, { code: "17", at: ago(299.5) }, { code: "17", at: ago(120) }, { code: "17", at: ago(120) }, { code: "99", at: ago(60) }]);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(["CHECKED_IN", "DUPLICATE", "CHECKED_OUT", "DUPLICATE", "UNKNOWN_CODE"]);
    const rows = await prisma.hrAttendance.findMany({ where: { employeeId: emp.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "DEVICE", deviceId });
    expect(rows[0].checkOut).not.toBeNull();
  });

  it("an explicit direction is honoured, and a punch out of order is refused", async () => {
    const { key } = await setup("hrdv3");
    const res = await send(key, [{ code: "17", at: ago(100), direction: "OUT" }, { code: "17", at: ago(90), direction: "IN" }, { code: "17", at: ago(80), direction: "IN" }, { code: "17", at: ago(95), direction: "OUT" }]);
    // sorted by time: 100 OUT (nothing open), 95 OUT (nothing open), 90 IN, 80 IN (already in)
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(["NO_OPEN_CHECK_IN", "CHECKED_IN", "ALREADY_IN", "NO_OPEN_CHECK_IN"]);
  });

  it("a far-future time or a bad time is refused; a terminated employee is refused", async () => {
    const { o, emp, key } = await setup("hrdv4");
    const res = await send(key, [{ code: "17", at: new Date(Date.now() + 3600_000).toISOString() }, { code: "17", at: "yesterday-ish-time" }]);
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(["FUTURE", "BAD_TIME"]);
    await request(app).patch(`/hr/employees/${emp.id}`).set(o.auth).send({ employmentStatus: "TERMINATED" });
    expect((await send(key, [{ code: "17", at: ago(10) }])).body.results[0].result).toBe("TERMINATED");
  });

  it("two employees cannot share a reader number, and another company's number is not theirs", async () => {
    const { o, emp } = await setup("hrdv5");
    const other = (await hire(o)).body as { id: string };
    expect((await request(app).patch(`/hr/employees/${other.id}`).set(o.auth).send({ deviceCode: "17" })).status).toBe(409);
    const o2 = await company("hrdv5b");
    const stranger = (await hire(o2)).body as { id: string };
    expect((await request(app).patch(`/hr/employees/${stranger.id}`).set(o2.auth).send({ deviceCode: "17" })).status).toBe(200);
    expect(emp.id).not.toBe(stranger.id);
  });

  it("a file import records the lines, reads times in the company zone and reports what it could not use", async () => {
    const { o, emp } = await setup("hrdv6");
    await request(app).patch("/hr/company").set(o.auth).send({ timezone: "Asia/Damascus" });
    const csv = ["Code,Time,Direction", "17,2026-03-02 08:00:00,IN", "17;2026-03-02 16:30:00;OUT", "55,2026-03-02 09:00:00", "garbage line"].join("\n");
    const res = await request(app).post("/hr/attendance/import").set(o.auth).send({ csv });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lines: 3, skipped: 2, summary: { CHECKED_IN: 1, CHECKED_OUT: 1, UNKNOWN_CODE: 1 } });
    expect(res.body.problems[0]).toMatchObject({ code: "55", result: "UNKNOWN_CODE" });
    const row = await prisma.hrAttendance.findFirstOrThrow({ where: { employeeId: emp.id } });
    expect(row.source).toBe("IMPORT");
    expect(row.checkIn.toISOString()).toBe("2026-03-02T05:00:00.000Z"); // Damascus is UTC+3 all year
    expect((await request(app).post("/hr/attendance/import").set(o.auth).send({ csv: "nothing,useful" })).status).toBe(400);
  });

  it("an employee account cannot manage devices", async () => {
    const o = await company("hrdv7");
    const w = await linkedEmployee(o, "hrdv7w");
    expect((await request(app).post("/hr/devices").set(w.auth).send({ name: "x" })).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).post("/hr/attendance/import").set(w.auth).send({ csv: "1,2026-03-02 08:00:00" })).status).toBeGreaterThanOrEqual(403);
  });

  it("time and file parsing", () => {
    expect(parseWhen("2026-03-02T08:00:00Z", "Asia/Damascus")?.toISOString()).toBe("2026-03-02T08:00:00.000Z");
    expect(parseWhen("2026-03-02 08:00:00+03:00", "UTC")?.toISOString()).toBe("2026-03-02T05:00:00.000Z");
    expect(parseWhen("2026-03-02 08:00", "Europe/Berlin")?.toISOString()).toBe("2026-03-02T07:00:00.000Z"); // winter, UTC+1
    expect(parseWhen("2026-07-02 08:00", "Europe/Berlin")?.toISOString()).toBe("2026-07-02T06:00:00.000Z"); // summer time, UTC+2
    expect(parseWhen("nonsense", "UTC")).toBeNull();
    expect(parseCsv("code,time\n5,2026-03-02 08:00,دخول\n\n6,2026-03-02 17:00,out")).toEqual({
      punches: [{ code: "5", at: "2026-03-02 08:00", direction: "IN" }, { code: "6", at: "2026-03-02 17:00", direction: "OUT" }],
      skipped: 1,
    });
  });
});

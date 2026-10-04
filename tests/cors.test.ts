import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { isOriginAllowed } from "../src/lib/corsConfig";

const prod = { allowedOrigins: [] as string[], isProduction: true };
const host = "dalilacom-api.onrender.com";

describe("CORS origin policy", () => {
  it("always allows requests with no Origin (Android, curl, webhooks)", () => {
    expect(isOriginAllowed({ origin: undefined, host, protocol: "https" }, prod)).toBe(true);
  });

  it("allows the server's own origin in production — the pages it hosts POST to it", () => {
    expect(isOriginAllowed({ origin: `https://${host}`, host, protocol: "https" }, prod)).toBe(true);
  });

  it("rejects other origins in production unless allowlisted", () => {
    expect(isOriginAllowed({ origin: "https://evil.example", host, protocol: "https" }, prod)).toBe(false);
    expect(isOriginAllowed({ origin: "https://app.example", host, protocol: "https" }, { ...prod, allowedOrigins: ["https://app.example"] })).toBe(true);
    // same hostname over a different scheme is a different origin
    expect(isOriginAllowed({ origin: `http://${host}`, host, protocol: "https" }, prod)).toBe(false);
  });

  it("is permissive outside production only while the allowlist is empty", () => {
    expect(isOriginAllowed({ origin: "http://localhost:5173", host, protocol: "http" }, { allowedOrigins: [], isProduction: false })).toBe(true);
    expect(isOriginAllowed({ origin: "http://localhost:5173", host, protocol: "http" }, { allowedOrigins: ["https://x.example"], isProduction: false })).toBe(false);
  });
});

describe("CORS middleware", () => {
  it("lets a same-origin browser POST through (Origin header present)", async () => {
    const agent = request(app);
    const probe = await agent.post("/auth/login").send({ email: "nobody@example.test", password: "x" });
    const origin = new URL(probe.request.url).origin;
    const res = await request(app).post("/auth/login").set("Origin", origin).send({ email: "nobody@example.test", password: "x" });
    expect(res.status).toBe(401); // reached the handler (wrong credentials), not blocked by CORS
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });
});

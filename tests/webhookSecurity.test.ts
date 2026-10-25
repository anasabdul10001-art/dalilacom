import { describe, expect, it } from "vitest";
import { webhookDriver } from "../src/services/channels/webhook.driver";

const validSecret = "a-long-enough-shared-secret";

describe("webhook destination security", () => {
  it.each([
    "http://example.com/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.1/hook",
    "https://[::1]/hook",
    "https://localhost/hook",
    "https://service.localhost/hook",
    "https://user:password@example.com/hook",
    "https://example.com:8443/hook",
  ])("rejects unsafe destination %s", (replyUrl) => {
    expect(webhookDriver.validateCredentials({ secret: validSecret, replyUrl })).toBeTruthy();
  });

  it("accepts an HTTPS destination on the standard secure port", () => {
    expect(webhookDriver.validateCredentials({ secret: validSecret, replyUrl: "https://example.com/hook" })).toBeNull();
  });

  it("rejects a shared secret that is too short", () => {
    expect(webhookDriver.validateCredentials({ secret: "short", replyUrl: "https://example.com/hook" })).toBeTruthy();
  });
});

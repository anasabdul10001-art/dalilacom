import { describe, it, expect, vi, afterEach } from "vitest";
import { ResendEmailService } from "../src/services/email.service";

afterEach(() => vi.restoreAllMocks());

describe("Resend over HTTPS (the free Render plan blocks SMTP)", () => {
  it("posts the mail to Resend's web API with the key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await new ResendEmailService("re_test_key", "Dalilacom <no-reply@dalilacom.com>").send({ to: "a@example.com", subject: "S", text: "T" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer re_test_key" });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ from: "Dalilacom <no-reply@dalilacom.com>", to: ["a@example.com"], subject: "S" });
  });

  it("fails loudly when Resend refuses (so the log shows why)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 }));
    await expect(new ResendEmailService("k", "x@y.z").send({ to: "a@example.com", subject: "S", text: "T" })).rejects.toThrow(/403/);
  });
});

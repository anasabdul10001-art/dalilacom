import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server";

describe("the Impressum (legal notice, section 65 / German DDG)", () => {
  it("names the operator, the address and the email, in three languages", async () => {
    const res = await request(app).get("/impressum.html");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Lamarconnect");
    expect(res.text).toContain("Anas Abdulaziz");
    expect(res.text).toContain("Rosa-Luxemburg-Straße 4");
    expect(res.text).toContain("04720 Döbeln");
    expect(res.text).toContain("mailto:info@dalilacom.com");
    expect(res.text).toContain("Angaben gemäß § 5 DDG");
    expect(res.text).toContain("Legal Notice (Impressum)");
    expect(res.text).toContain("بيانات الجهة المسؤولة");
  });

  it("does not publish the personal numbers: tax numbers, phone", async () => {
    const res = await request(app).get("/impressum.html");
    expect(res.text).not.toMatch(/\d{2,3}\/\d{3}\/\d{5}/); // a Steuernummer
    expect(res.text).not.toMatch(/\b\d{2} \d{3} \d{3} \d{3}\b/); // a Steuer-Identifikationsnummer
    expect(res.text).not.toMatch(/\+49|0176/); // the phone
  });

  it("is linked from the other legal pages and the privacy policy and terms name the operator", async () => {
    for (const page of ["about", "privacy", "terms", "refund", "shipping", "data-deletion"]) {
      const res = await request(app).get(`/${page}.html`);
      expect(res.status).toBe(200);
      expect(res.text).toContain("/impressum.html");
    }
    expect((await request(app).get("/privacy.html")).text).toContain("Lamarconnect");
    expect((await request(app).get("/terms.html")).text).toContain("Lamarconnect");
  });
});

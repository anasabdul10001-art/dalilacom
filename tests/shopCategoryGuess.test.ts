import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { prisma } from "../src/prisma";
import { uniqueEmail } from "./helpers";
import { guessShopCategory } from "../src/services/shopCategoryGuess.service";

afterAll(async () => {
  await prisma.$disconnect();
});

const slugsOf = async (name: string) => {
  const res = await guessShopCategory(name, "ar", false);
  const rows = await prisma.category.findMany({ where: { id: { in: res.items.map((i) => i.id) } }, select: { id: true, slug: true } });
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  return { source: res.source, slugs: res.items.map((i) => slugById.get(i.id)) };
};

describe("the profession a shop's name points to", () => {
  it("finds a barber and a women's salon from the words of the name", async () => {
    const barber = await slugsOf("حلاق الأمير");
    expect(barber.source).toBe("WORDS");
    expect(barber.slugs).toContain("bt-barber");
    expect((await slugsOf("كوافير الورد")).slugs).toContain("bt-salon");
  });

  it("sees the word even with a preposition glued on (للحلاقة) and ignores spelling variants", async () => {
    expect((await slugsOf("صالون الأمير للحلاقة")).slugs).toContain("bt-barber");
    expect((await slugsOf("حلّاق الامير")).slugs).toContain("bt-barber");
  });

  it("says nothing for a plain brand or person's name", async () => {
    const none = await slugsOf("زzxq");
    expect(none.slugs).toEqual([]);
    expect((await slugsOf("qqqq wwww")).slugs).toEqual([]);
  });

  it("is for signed-in people and answers with items and where the answer came from", async () => {
    await request(app).get("/categories/for-name").query({ name: "حلاق" }).expect(401);
    const email = uniqueEmail("guess");
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery-staple", fullName: "Guess" });
    const login = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery-staple" });
    const res = await request(app).get("/categories/for-name").set({ Authorization: `Bearer ${login.body.token}` }).query({ name: "حلاق الامير" });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(["WORDS", "AI"]).toContain(res.body.source);
  });
});

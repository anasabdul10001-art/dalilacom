import { prisma } from "../prisma";

/**
 * Starting from zero for the launch: every account except the super admin goes, and with them everything people made
 * (shops, branches, products, offers, discounts, orders, carts, wallets, ads, banners, reviews, notifications, marketers …).
 * What the platform itself needs stays: the countries and places, the categories, the plans, the tax rates, the platform
 * settings and the list of social channels. The migrations table is never touched.
 *
 * It cannot be undone. The route that calls it is closed unless ALLOW_DATA_RESET=yes is set on the server.
 */
export const KEEP_TABLES = [
  "Country", "GeoUnit",
  "Category", "CategoryTranslation", "ProductCategory",
  "ServicePlan", "PlanFeature", "PlanPrice", "TaxRate",
  "PlatformSetting", "SocialChannel",
  "LandmarkKind", "Landmark", // the places on the map belong to the platform, not to any account
  "_prisma_migrations",
];

export const RESET_PHRASE = "DELETE EVERYTHING";

export const resetEnabled = () => process.env.ALLOW_DATA_RESET === "yes";

/** The account that stays: the admin named in SUPER_ADMIN_EMAIL (when it is set), otherwise every admin. */
async function keptAdmins() {
  const email = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", ...(email ? { email } : {}) },
    select: { id: true, email: true, fullName: true },
  });
  return admins;
}

async function allTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
  return rows.map((r) => r.tablename);
}

export async function previewLaunchReset() {
  const admins = await keptAdmins();
  const wipe = (await allTables()).filter((t) => !KEEP_TABLES.includes(t));
  const counts: { table: string; rows: number }[] = [];
  for (const table of wipe) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "${table}"`);
    if (Number(n) > 0) counts.push({ table, rows: Number(n) });
  }
  const users = await prisma.user.count();
  return { enabled: resetEnabled(), keptAdmins: admins, users, willBeRemoved: counts, kept: KEEP_TABLES.filter((t) => t !== "_prisma_migrations") };
}

export async function runLaunchReset() {
  const admins = await keptAdmins();
  if (!admins.length) throw new Error("No super admin account to keep — nothing was deleted");
  const tables = await allTables();
  const wipe = tables.filter((t) => !KEEP_TABLES.includes(t));
  if (!wipe.includes("User")) throw new Error("The User table was not found");

  await prisma.$transaction(async (tx) => {
    // a table we keep must not point at one we wipe (the truncate would take it too, or fail)
    const refs = await tx.$queryRawUnsafe<{ a: string; b: string }[]>(
      `select c.conrelid::regclass::text as a, c.confrelid::regclass::text as b from pg_constraint c where c.contype = 'f'`,
    );
    const clean = (s: string) => s.replace(/"/g, "").replace(/^public\./, "");
    for (const r of refs) {
      if (KEEP_TABLES.includes(clean(r.a)) && wipe.includes(clean(r.b))) throw new Error(`Table ${clean(r.a)} (kept) points at ${clean(r.b)} (wiped) — stopped`);
    }

    // the admin rows are kept aside, the tables emptied in one statement, and the admin put back
    await tx.$executeRawUnsafe(`create temp table _keep_admins on commit drop as select * from "User" where "id" in (${admins.map((a) => `'${a.id}'`).join(",")})`);
    await tx.$executeRawUnsafe(`update _keep_admins set "referredById" = null`);
    await tx.$executeRawUnsafe(`truncate table ${wipe.map((t) => `"${t}"`).join(", ")} restart identity`);
    await tx.$executeRawUnsafe(`insert into "User" select * from _keep_admins`);
    // the places that owners had taken over go back on the map as landmarks (their shops are gone)
    await tx.$executeRawUnsafe(`update "Landmark" set "status" = 'ACTIVE', "claimedMerchantId" = null where "status" = 'CLAIMED'`);
  }, { timeout: 120000 });

  const left = await prisma.user.count();
  return { keptAdmins: admins, usersLeft: left, wipedTables: wipe.length };
}

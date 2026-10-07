import { PrismaClient } from "@prisma/client";
import { seedCategories } from "./categories.seed";
import { seedGeo } from "./geo.seed";
import { ensureSuperAdmin } from "./admin.seed";

const prisma = new PrismaClient();

async function main() {
  // No hardcoded default admin — credentials must come from the environment (never committed to
  // Git). If they're not set, the seed simply skips admin creation instead of falling back to a
  // known/weak password (section: Admin Credentials).
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const outcome = await ensureSuperAdmin(prisma, adminEmail, adminPassword);
    console.log(`Admin ${adminEmail}: ${outcome} (password not logged)`);
  } else {
    console.warn(
      "SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping admin bootstrap. " +
        "Set both env vars once to create the first admin, then use /auth/forgot-password to manage it afterwards.",
    );
  }

  const planName = "Monthly";
  const existingPlan = await prisma.servicePlan.findFirst({ where: { name: planName, service: "MEMBERSHIP" } });
  if (!existingPlan) {
    await prisma.servicePlan.create({
      data: { name: planName, service: "MEMBERSHIP", durationDays: 30, priceCents: 999, currency: "EUR" },
    });
    console.log("Created Monthly membership plan");
  }

  // Sections, professions and specialties (Arabic + English) — see prisma/categories.data.ts.
  // The admin can add more categories any time; only the slugs defined in that file are refreshed here.
  console.log(`Seeded ${await seedCategories(prisma)} categories`);
  // Governorates, cities and neighbourhoods of Syria to start from; the admin manages them from the panel afterwards.
  console.log(`Geography: ${(await seedGeo(prisma)).created} new places`);
  // Channels the super admin offers by default. Meta ones are listed but can't be connected until a Meta
  // developer app exists and is approved; the admin can add more channels (e.g. generic webhooks) any time.
  const channels = [
    { key: "telegram", name: "Telegram", driver: "TELEGRAM" as const },
    { key: "webhook", name: "Webhook عام (أي منصة)", driver: "GENERIC_WEBHOOK" as const },
    { key: "whatsapp", name: "WhatsApp (بانتظار Meta)", driver: "META_PENDING" as const },
    { key: "facebook", name: "Facebook", driver: "FACEBOOK" as const },
    { key: "instagram", name: "Instagram", driver: "INSTAGRAM" as const },
  ];
  // Facebook/Instagram were catalogued as META_PENDING before their drivers existed — switch those two over.
  for (const key of ["facebook", "instagram"]) {
    const c = channels.find((x) => x.key === key)!;
    await prisma.socialChannel.updateMany({ where: { key, driver: "META_PENDING" }, data: { driver: c.driver, name: c.name } });
  }
  for (const c of channels) {
    await prisma.socialChannel.upsert({ where: { key: c.key }, update: {}, create: c });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

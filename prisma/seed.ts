import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@dalilacom.dev";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash("Admin12345!", 12),
        fullName: "Dalilacom Admin",
        role: Role.ADMIN,
      },
    });
    console.log(`Created admin user: ${adminEmail} / Admin12345!`);
  }

  const planName = "Monthly";
  const existingPlan = await prisma.membershipPlan.findFirst({ where: { name: planName } });
  if (!existingPlan) {
    await prisma.membershipPlan.create({
      data: { name: planName, durationDays: 30, priceCents: 999, currency: "EUR" },
    });
    console.log("Created Monthly membership plan");
  }

  // A starter slice of the category list from section 10/31 — the admin can add more later.
  const topLevelCategories = ["Restaurants", "Cafes", "Clothing", "Electronics", "Beauty", "Health"];
  for (const name of topLevelCategories) {
    const slug = name.toLowerCase();
    const existingCategory = await prisma.category.findUnique({ where: { slug } });
    if (!existingCategory) {
      await prisma.category.create({ data: { name, slug } });
      console.log(`Created category: ${name}`);
    }
  }
  // Channels the super admin offers by default. Meta ones are listed but can't be connected until a Meta
  // developer app exists and is approved; the admin can add more channels (e.g. generic webhooks) any time.
  const channels = [
    { key: "telegram", name: "Telegram", driver: "TELEGRAM" as const },
    { key: "webhook", name: "Webhook عام (أي منصة)", driver: "GENERIC_WEBHOOK" as const },
    { key: "whatsapp", name: "WhatsApp (بانتظار Meta)", driver: "META_PENDING" as const },
    { key: "facebook", name: "Facebook (بانتظار Meta)", driver: "META_PENDING" as const },
    { key: "instagram", name: "Instagram (بانتظار Meta)", driver: "META_PENDING" as const },
  ];
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

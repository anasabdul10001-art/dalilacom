import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

export type AdminBootstrap = "created" | "promoted" | "password-synced" | "unchanged";

/**
 * Makes the account named in SUPER_ADMIN_EMAIL an enabled, verified ADMIN whose password is SUPER_ADMIN_PASSWORD.
 * The two variables are the owner's bootstrap on the host, so they win: an account that already exists (registered
 * as a normal user, or with an older password) is promoted / re-keyed instead of silently skipped, which is what left
 * the owner locked out. Once the owner has chosen their own password, the two variables should be removed.
 */
export async function ensureSuperAdmin(prisma: PrismaClient, email: string, password: string): Promise<AdminBootstrap> {
  if (password.length < 12) throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 12), fullName: "Dalilacom Admin", role: Role.ADMIN, isEmailVerified: true },
    });
    return "created";
  }
  const promote = existing.role !== Role.ADMIN || existing.isDisabled || !existing.isEmailVerified;
  const passwordMatches = await bcrypt.compare(password, existing.passwordHash);
  if (!promote && passwordMatches) return "unchanged";
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      role: Role.ADMIN,
      isDisabled: false,
      isEmailVerified: true,
      ...(passwordMatches ? {} : { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } }),
    },
  });
  return promote ? "promoted" : "password-synced";
}

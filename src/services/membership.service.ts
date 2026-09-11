import { prisma } from "../prisma";

export function isMembershipActive(membership: { status: string; endDate: Date }): boolean {
  return membership.status === "ACTIVE" && membership.endDate.getTime() > Date.now();
}

/** The customer's current membership if they have one and it's still active, else null. */
export async function getActiveMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!membership || !isMembershipActive(membership)) {
    return null;
  }
  return membership;
}

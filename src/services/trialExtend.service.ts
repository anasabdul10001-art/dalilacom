import { ServiceKind } from "@prisma/client";
import { prisma } from "../prisma";
import { activatePlan } from "./planActivation.service";

const DAY = 86_400_000;

/** The services whose free trial an admin can extend. Membership has its own flow. */
export const EXTENDABLE_TRIAL_SERVICES: ServiceKind[] = ["ACCOUNTING", "HR", "MERCHANT_ACCOUNT", "RESPONDER_BASIC"];

/**
 * Adds [days] to the free trials of one service: the ones still running, and (when [endedWithinDays] is above zero) the ones that
 * ended no longer ago than that. The new end is counted from today for a trial that already ended. Nothing is charged and a person
 * who never had a trial gets none. With [dryRun] only the counts come back.
 */
export async function extendTrials(input: { service: ServiceKind; days: number; endedWithinDays: number; dryRun: boolean }) {
  const now = new Date();
  const floor = new Date(now.getTime() - input.endedWithinDays * DAY);
  const newEnd = (end: Date | null) => new Date(Math.max(end ? end.getTime() : 0, now.getTime()) + input.days * DAY);

  if (input.service === "RESPONDER_BASIC") {
    const rows = await prisma.responderEntitlement.findMany({
      where: { source: "TRIAL", status: { in: ["TRIAL", "EXPIRED"] }, plan: { service: input.service }, trialEndsAt: { gte: floor } },
      select: { id: true, trialEndsAt: true },
    });
    const running = rows.filter((r) => r.trialEndsAt && r.trialEndsAt > now).length;
    if (!input.dryRun) {
      await prisma.$transaction(rows.map((r) => prisma.responderEntitlement.update({ where: { id: r.id }, data: { status: "TRIAL", trialEndsAt: newEnd(r.trialEndsAt) } })));
    }
    return { affected: rows.length, running, ended: rows.length - running, extended: !input.dryRun };
  }

  const rows = await prisma.platformSubscription.findMany({
    where: { provider: "TRIAL", plan: { service: input.service }, currentPeriodEnd: { gte: floor } },
    select: { id: true, userId: true, planId: true, currentPeriodEnd: true },
  });
  const running = rows.filter((r) => r.currentPeriodEnd && r.currentPeriodEnd > now).length;
  if (!input.dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const end = newEnd(r.currentPeriodEnd);
        await tx.platformSubscription.update({ where: { id: r.id }, data: { status: "ACTIVE", currentPeriodEnd: end } });
        await activatePlan(tx, r.userId, r.planId, input.service, end);
      }
    });
  }
  return { affected: rows.length, running, ended: rows.length - running, extended: !input.dryRun };
}

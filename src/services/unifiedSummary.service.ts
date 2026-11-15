import { prisma } from "../prisma";
import { hasHrPlan } from "./hrAccess.service";
import { PAYROLL_CATEGORY_DUE } from "./hrPay.service";

const activeAccounting = async (userId: string) =>
  !!(await prisma.platformSubscription.findFirst({ where: { userId, status: "ACTIVE", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }], plan: { service: "ACCOUNTING" } }, select: { id: true } }));

/**
 * One page for an owner who has BOTH accounting and HR: income, expenses (salaries included), the salaries inside them
 * (paid and still due) and the final net, per currency. Null when the owner lacks either service, so nobody sees an
 * empty combined section. Accounting stays the one place where the net is worked out; this only reads it.
 */
export async function unifiedSummary(ownerId: string, from: Date, to: Date) {
  const company = await prisma.hrCompany.findUnique({ where: { ownerId }, select: { id: true } });
  if (!company || !(await hasHrPlan(ownerId)) || !(await activeAccounting(ownerId))) return null;
  const range = { gte: from, lte: to };
  const [totals, payroll, employees] = await Promise.all([
    prisma.accountingEntry.groupBy({ by: ["type", "currency"], where: { userId: ownerId, occurredAt: range }, _sum: { amountCents: true } }),
    prisma.accountingEntry.groupBy({ by: ["currency", "category"], where: { userId: ownerId, source: "PAYROLL", occurredAt: range }, _sum: { amountCents: true } }),
    prisma.hrEmployee.count({ where: { companyId: company.id, employmentStatus: "ACTIVE" } }),
  ]);
  const currencies = [...new Set([...totals.map((x) => x.currency), ...payroll.map((x) => x.currency)])];
  const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
  return {
    from, to, employees,
    totals: currencies.map((currency) => {
      const incomeCents = n(totals.find((x) => x.currency === currency && x.type === "INCOME")?._sum.amountCents);
      const expensesCents = n(totals.find((x) => x.currency === currency && x.type === "EXPENSE")?._sum.amountCents);
      const rows = payroll.filter((x) => x.currency === currency);
      const payrollDueCents = rows.filter((x) => x.category === PAYROLL_CATEGORY_DUE).reduce((s, x) => s + n(x._sum.amountCents), 0);
      const payrollPaidCents = rows.filter((x) => x.category !== PAYROLL_CATEGORY_DUE).reduce((s, x) => s + n(x._sum.amountCents), 0);
      return { currency, incomeCents, expensesCents, payrollPaidCents, payrollDueCents, netCents: incomeCents - expensesCents };
    }),
  };
}

/** The period of a request: ?from=&to= as plain dates (whole days), else the current month so far. */
export function monthRange(q: { from?: unknown; to?: unknown }) {
  const plain = /^\d{4}-\d{2}-\d{2}$/;
  const now = new Date();
  const from = typeof q.from === "string" ? new Date(plain.test(q.from) ? `${q.from}T00:00:00.000Z` : q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = typeof q.to === "string" ? new Date(plain.test(q.to) ? `${q.to}T23:59:59.999Z` : q.to) : now;
  return Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to ? null : { from, to };
}

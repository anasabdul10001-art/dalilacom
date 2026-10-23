import { Prisma, PaymentMethod, PaymentStatus } from "@prisma/client";

/**
 * Payment providers (sections 24 / 54 / 59.4). Each method answers one question: what state does a payment start in?
 * COD starts pending and is settled by hand when the merchant confirms the cash arrived. ONLINE has no provider connected yet,
 * so it is refused at checkout instead of pretending to charge anybody; a real gateway plugs in here without touching the routes.
 */
export interface PaymentProvider {
  readonly method: PaymentMethod;
  readonly available: boolean;
}

const providers: Record<PaymentMethod, PaymentProvider> = {
  COD: { method: "COD", available: true },
  ONLINE: { method: "ONLINE", available: false },
};

export const availablePaymentMethods = (): PaymentMethod[] => Object.values(providers).filter((p) => p.available).map((p) => p.method);
export const isMethodAvailable = (method: PaymentMethod) => providers[method].available;

export async function createOrderPayment(tx: Prisma.TransactionClient, orderId: string, method: PaymentMethod, amountCents: number) {
  return tx.payment.create({ data: { orderId, method, amountCents, status: "PENDING" } });
}

/** A cancelled order never collects: an unpaid payment fails, a settled one is marked refunded (the money goes back outside the app for cash). */
export async function settleOnCancel(tx: Prisma.TransactionClient, orderId: string) {
  const payment = await tx.payment.findUnique({ where: { orderId } });
  if (!payment) return;
  const next: PaymentStatus | null = payment.status === "PENDING" ? "FAILED" : payment.status === "PAID_CASH" || payment.status === "PAID_ONLINE" ? "REFUNDED" : null;
  if (next) await tx.payment.update({ where: { id: payment.id }, data: { status: next } });
}

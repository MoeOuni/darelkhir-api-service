import { OrderStatus } from '@libs/enums';
import type { OrderRepository } from '@/repositories/OrderRepository';
import type { ClientRepository } from '@/repositories/ClientRepository';
import type { PaymentRepository } from '@/repositories/PaymentRepository';
import type { OrderEntity } from '@/entities/OrderEntity';

/**
 * The client is the ledger, not the order.
 *
 * An order adds to what a client owes. A payment takes away from it. Nobody
 * picks which order a payment settles — there is one number per client. This is
 * how the business already works on paper.
 */

/**
 * Statuses that count as money owed.
 *
 * The debt starts the moment the invoice number is taken, which is at
 * confirmation. A draft has no invoice, so it owes nothing. A cancelled order
 * is undone by its credit note.
 */
const COUNTED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CLOSED,
]);

export function orderCountsAsDebt(order: {
  status: OrderStatus;
  creditNoteNumber?: number;
}): boolean {
  // A credit note cancels the invoice, so the order stops counting.
  if (order.creditNoteNumber) return false;
  return COUNTED_STATUSES.has(order.status);
}

export type ClientBalance = {
  /** Sales made through the system. Never includes the notebook debt. */
  totalInvoiced: number;
  totalPaid: number;
  /** What he already owed on the day the shop started using the system. */
  openingBalance: number;
  balance: number;
  lastActivityAt?: string;
};

/** Rounds to two decimals so repeated addition cannot drift. */
function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

export function computeBalance(
  orders: Array<{ status: OrderStatus; creditNoteNumber?: number; total: number; createdAt: string }>,
  payments: Array<{ amount: number; paidAt: string }>,
  /**
   * A debt carried over from the shop's notebook, with no order behind it.
   *
   * It is added to what the client owes but kept out of `totalInvoiced`: those
   * goods were sold before the system existed and have no purchase price, so
   * counting them as sales would put a profit in the books that was never made.
   */
  openingBalance = 0
): ClientBalance {
  const counted = orders.filter(orderCountsAsDebt);

  const totalInvoiced = round2(counted.reduce((sum, o) => sum + (o.total ?? 0), 0));
  // Reversals are stored as negative amounts, so a plain sum is correct.
  const totalPaid = round2(payments.reduce((sum, p) => sum + (p.amount ?? 0), 0));

  const dates = [
    ...counted.map((o) => o.createdAt),
    ...payments.map((p) => p.paidAt),
  ].filter(Boolean).sort();

  const opening = round2(openingBalance || 0);

  return {
    totalInvoiced,
    totalPaid,
    openingBalance: opening,
    balance: round2(opening + totalInvoiced - totalPaid),
    lastActivityAt: dates.length ? dates[dates.length - 1] : undefined,
  };
}

/**
 * Recomputes a client balance from the source records and stores it.
 *
 * The stored values exist so the money-owed page can sort and filter. They are
 * always derived, never edited by hand, and never computed in the browser: two
 * staff can record a payment at the same moment.
 */
export async function recalculateClientBalance(
  clientId: string,
  orderRepository: OrderRepository,
  clientRepository: ClientRepository,
  paymentRepository?: PaymentRepository
): Promise<ClientBalance> {
  const client = await clientRepository.findByUuid(clientId);
  if (!client) {
    throw new Error(`Client not found while recalculating balance: ${clientId}`);
  }

  const orders = await orderRepository.listAllByCustomer(clientId);
  const payments = paymentRepository ? await paymentRepository.listByClient(clientId) : [];

  const balance = computeBalance(
    orders.map((o: OrderEntity) => ({
      status: o.status,
      creditNoteNumber: o.creditNoteNumber,
      total: o.total,
      createdAt: o.createdAt,
    })),
    payments.map((p) => ({ amount: p.amount, paidAt: p.paidAt })),
    client.openingBalance ?? 0
  );

  // The opening balance is the shop's own entry, not something derived — it is
  // read here and never written back.
  const { openingBalance: _carried, ...derived } = balance;
  client.set(derived);
  await clientRepository.update(client);

  return balance;
}

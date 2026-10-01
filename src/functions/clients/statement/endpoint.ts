import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ClientIdParamSchema } from '@/schemas/client.schema';
import { ClientRepository } from '@/repositories/ClientRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { NotFoundError } from '@libs/errors';
import { orderCountsAsDebt, computeBalance } from '@libs/balance';

type StatementLine = {
  date: string;
  type: 'order' | 'payment' | 'opening';
  reference: string;
  /** Added to what the client owes. */
  debit: number;
  /** Taken away from what the client owes. */
  credit: number;
  /** What the client owes after this line. */
  balance: number;
  meta?: Record<string, unknown>;
};

/**
 * The client account, one line per event, in date order.
 *
 * This is the detail behind the single balance number: an order adds, a payment
 * takes away, and the running total on the right is what the client owes at
 * that point in time.
 */
const getClientStatementHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };

  const clientRepository = new ClientRepository();
  const client = await clientRepository.findByUuid(id);
  if (!client) {
    throw new NotFoundError('Client not found');
  }

  const [orders, payments] = await Promise.all([
    new OrderRepository().listAllByCustomer(id),
    new PaymentRepository().listByClient(id),
  ]);

  const countedOrders = orders.filter((o) =>
    orderCountsAsDebt({ status: o.status, creditNoteNumber: o.creditNoteNumber })
  );

  const opening = client.openingBalance ?? 0;

  const lines: Omit<StatementLine, 'balance'>[] = [
    // What he already owed when the shop started using the system. It leads the
    // account because everything after it is measured from there, and it is
    // dated to the day the notebook says — or to the client record itself when
    // the notebook gave no date.
    ...(opening > 0
      ? [
          {
            date: client.openingBalanceAt || client.createdAt,
            type: 'opening' as const,
            reference: 'opening',
            debit: opening,
            credit: 0,
            meta: { note: client.openingBalanceNote },
          },
        ]
      : []),
    ...countedOrders.map((o) => ({
      date: o.invoiceIssuedAt ?? o.createdAt,
      type: 'order' as const,
      reference: o.invoiceNumber
        ? String(o.invoiceNumber).padStart(3, '0')
        : `#${String(o.orderNumber).padStart(3, '0')}`,
      debit: o.total ?? 0,
      credit: 0,
      meta: {
        orderId: (o.sk ?? '').split('#')[1],
        itemCount: o.items?.length ?? 0,
        status: o.status,
        orderNumber: o.orderNumber,
        invoiceNumber: o.invoiceNumber,
      },
    })),
    ...payments.map((p) => ({
      date: p.paidAt,
      type: 'payment' as const,
      reference: p.checkNumber ? `${p.method} ${p.checkNumber}` : p.method,
      debit: p.amount < 0 ? -p.amount : 0,
      credit: p.amount > 0 ? p.amount : 0,
      meta: {
        paymentId: (p.sk ?? '').split('#')[1],
        checkStatus: p.checkStatus,
        isReversal: !!p.reversesPaymentId,
        notes: p.notes,
      },
    })),
  ].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  let running = 0;
  const statement: StatementLine[] = lines.map((line) => {
    running = parseFloat((running + line.debit - line.credit).toFixed(2));
    return { ...line, balance: running };
  });

  const totals = computeBalance(
    orders.map((o) => ({
      status: o.status,
      creditNoteNumber: o.creditNoteNumber,
      total: o.total,
      createdAt: o.createdAt,
    })),
    payments.map((p) => ({ amount: p.amount, paidAt: p.paidAt })),
    opening
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Statement retrieved successfully',
      data: {
        client: {
          id,
          fullName: client.fullName,
          phone: client.phone,
          // Warns the reader that a paper debt is not in the system yet, so a
          // zero balance is never mistaken for "owes nothing".
          hasPaperBalance: client.hasPaperBalance ?? false,
          paymentNote: client.paymentNote,
          openingBalance: opening,
          openingBalanceAt: client.openingBalanceAt,
          openingBalanceNote: client.openingBalanceNote,
        },
        ...totals,
        lines: statement,
      },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'payments.view',
  cors: true,
  validation: { pathParameters: ClientIdParamSchema },
})(getClientStatementHandler);

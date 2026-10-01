import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { PaymentIdParamSchema, ReversePaymentSchema } from '@/schemas/payment.schema';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { PaymentEntity } from '@/entities/PaymentEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, CheckStatus, PaymentType } from '@libs/enums';
import { NotFoundError, ValidationError } from '@libs/errors';
import { recalculateClientBalance } from '@libs/balance';

/**
 * Reverses a payment, for a check that came back unpaid.
 *
 * The original record is never erased. The client handed over that check, and
 * the statement has to show the whole story: the invoice, the check, and the
 * reversal. A second record with a negative amount does that, and the balance
 * goes back up on its own.
 */
const reversePaymentHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const { reason } = event.body as { reason: string };
  const now = new Date().toISOString();

  const paymentRepository = new PaymentRepository();
  const original = await paymentRepository.findByUuid(id);

  if (!original) {
    throw new NotFoundError('Payment not found');
  }
  if (original.reversesPaymentId) {
    throw new ValidationError('A reversal cannot itself be reversed.');
  }
  if (original.amount < 0) {
    throw new ValidationError('This record is already a reversal.');
  }

  // Mark the original so the statement shows why the money went back.
  original.set({
    notes: [original.notes, reason].filter(Boolean).join(' — '),
    ...(original.method === PaymentType.CHECK ? { checkStatus: CheckStatus.RETURNED } : {}),
  });
  await paymentRepository.update(original);

  const uuid = IdGenerator.generate();
  const reversal = new PaymentEntity({
    id: DataType.PAYMENT,
    sk: `${DataType.PAYMENT}#${uuid}`,
    dataType: DataType.PAYMENT,
    clientId: original.clientId,
    amount: -original.amount,
    method: original.method,
    paidAt: now,
    reference: original.reference,
    orderId: original.orderId,
    notes: reason,
    checkNumber: original.checkNumber,
    bankName: original.bankName,
    checkStatus: original.method === PaymentType.CHECK ? CheckStatus.RETURNED : undefined,
    reversesPaymentId: id,
    recordedBy: event.user?.sub,
    createdAt: now,
    updatedAt: now,
  });

  await paymentRepository.create(reversal);

  const balance = await recalculateClientBalance(
    original.clientId,
    new OrderRepository(),
    new ClientRepository(),
    paymentRepository
  );

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Payment reversed successfully',
      data: { ...reversal.toPublicDTO(), id: uuid, clientBalance: balance },
    }),
  };
};

export const handler = middleware({
  audit: { action: 'payment.reverse', entityType: 'payment' },
  auth: true,
  cors: true,
  validation: { pathParameters: PaymentIdParamSchema, body: ReversePaymentSchema },
})(reversePaymentHandler);

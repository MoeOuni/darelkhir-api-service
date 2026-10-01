import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import {
  UpdateCheckStatusSchema,
  PaymentIdParamSchema,
} from '@/schemas/payment.schema';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import { CheckStatus, PaymentType } from '@libs/enums';

/**
 * Marks a cheque cashed or returned.
 *
 * A returned cheque is NOT handled here: the money has to come back off the
 * balance, which is what the reverse endpoint does. This only records that the
 * paper cleared the bank.
 */
const updateCheckStatusHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const { checkStatus } = event.body as { checkStatus: CheckStatus };

  const repository = new PaymentRepository();
  const payment = await repository.findByUuid(id);
  if (!payment) throw new NotFoundError('Payment not found');

  if (payment.method !== PaymentType.CHECK) {
    throw new ValidationError('That payment is not a cheque');
  }

  if (checkStatus === CheckStatus.RETURNED) {
    throw new ValidationError(
      'A returned cheque has to be reversed, so the money comes back off the balance. Use the reverse action.',
    );
  }

  payment.set({ checkStatus });
  await repository.update(payment);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Cheque updated',
      data: { ...payment.toPublicDTO(), id },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'payments.create',
  audit: { action: 'payment.check_status', entityType: 'payment' },
  cors: true,
  validation: { body: UpdateCheckStatusSchema, pathParameters: PaymentIdParamSchema },
})(updateCheckStatusHandler);

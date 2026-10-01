import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreatePaymentSchema, type CreatePaymentInput } from '@/schemas/payment.schema';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { PaymentEntity } from '@/entities/PaymentEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, PaymentType, CheckStatus } from '@libs/enums';
import { NotFoundError } from '@libs/errors';
import { recalculateClientBalance } from '@libs/balance';

/**
 * Records money received from a client.
 *
 * The payment reduces the client balance, not one order. A check reduces the
 * balance too, but is marked `held` until it clears, so reports can separate
 * money received from money promised.
 */
const createPaymentHandler = async (event: ExtendedEvent, _context: Context) => {
  const input = event.body as CreatePaymentInput;
  const now = new Date().toISOString();

  const clientRepository = new ClientRepository();
  const client = await clientRepository.findByUuid(input.clientId);
  if (!client) {
    throw new NotFoundError(`Client not found: ${input.clientId}`);
  }

  const uuid = IdGenerator.generate();
  const paymentRepository = new PaymentRepository();

  const entity = new PaymentEntity({
    id: DataType.PAYMENT,
    sk: `${DataType.PAYMENT}#${uuid}`,
    dataType: DataType.PAYMENT,
    clientId: input.clientId,
    amount: input.amount,
    method: input.method,
    paidAt: input.paidAt ?? now,
    reference: input.reference,
    orderId: input.orderId,
    notes: input.notes,
    checkNumber: input.checkNumber,
    bankName: input.bankName,
    dueDate: input.dueDate,
    checkStatus: input.method === PaymentType.CHECK ? CheckStatus.HELD : undefined,
    recordedBy: event.user?.sub,
    createdAt: now,
    updatedAt: now,
  });

  await paymentRepository.create(entity);

  const balance = await recalculateClientBalance(
    input.clientId,
    new OrderRepository(),
    clientRepository,
    paymentRepository
  );

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Payment recorded successfully',
      data: { ...entity.toPublicDTO(), id: uuid, clientBalance: balance },
    }),
  };
};

export const handler = middleware({
  audit: { action: 'payment.create', entityType: 'payment' },
  auth: true,
  cors: true,
  validation: { body: CreatePaymentSchema },
})(createPaymentHandler);

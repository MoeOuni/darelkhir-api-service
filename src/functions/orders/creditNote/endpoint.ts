import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { OrderIdParamSchema, CreateCreditNoteSchema } from '@/schemas/order.schema';
import { CreateCreditNoteUseCase } from './useCase';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientRepository } from '@/repositories/ClientRepository';

const createCreditNoteHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new CreateCreditNoteUseCase(
    new OrderRepository(),
    new ProductRepository(),
    new ClientRepository(),
  );
  const result = await useCase.execute(id, event.body ?? {}, event.user);

  return {
    statusCode: 201,
    body: JSON.stringify({ message: result.message, data: result.data }),
  };
};

export const handler = middleware({
  // Cancelling an invoiced sale is the most consequential thing anyone does to
  // an order, and it was the one change the action journal never saw.
  audit: { action: 'order.credit_note', entityType: 'order' },
  auth: true,
  cors: true,
  validation: { pathParameters: OrderIdParamSchema, body: CreateCreditNoteSchema },
})(createCreditNoteHandler);

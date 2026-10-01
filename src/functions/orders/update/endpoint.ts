import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateOrderSchema, OrderIdParamSchema } from '@/schemas/order.schema';
import { UpdateOrderUseCase } from './useCase';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import { ClientRepository } from '@/repositories/ClientRepository';

const updateOrderHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new UpdateOrderUseCase(
    new OrderRepository(),
    new ProductRepository(),
    new TransporterRepository(),
    new ClientRepository(),
  );
  const result = await useCase.execute(id, event.body, event.user!.sub, event.user);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: true,
  audit: { action: 'order.update', entityType: 'order' },
  cors: true,
  validation: {
    body: UpdateOrderSchema,
    pathParameters: OrderIdParamSchema,
  },
})(updateOrderHandler);

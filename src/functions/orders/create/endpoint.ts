import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateOrderSchema } from '@/schemas/order.schema';
import { CreateOrderUseCase } from './useCase';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';

const createOrderHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new CreateOrderUseCase(
    new OrderRepository(),
    new ProductRepository(),
    new ClientRepository(),
    new TransporterRepository(),
  );
  const result = await useCase.execute(event.body, event.user!.sub, !!event.user?.isStaff, event.user);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 201, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  anyAuth: true,
  audit: { action: 'order.create', entityType: 'order' },  // admin (dashboard) OR client (checkout) can create orders
  cors: true,
  validation: { body: CreateOrderSchema },
})(createOrderHandler);

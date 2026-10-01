import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { OrderIdParamSchema } from '@/schemas/order.schema';
import { GetOrderUseCase } from './useCase';
import { OrderRepository } from '@/repositories/OrderRepository';

const getOrderHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new GetOrderUseCase(new OrderRepository());
  const result = await useCase.execute(id, event.user?.sub ?? 'public', !!event.user);

  if (!result.success) {
    return { statusCode: 404, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  optionalAuth: true,
  cors: true,
  validation: { pathParameters: OrderIdParamSchema },
})(getOrderHandler);

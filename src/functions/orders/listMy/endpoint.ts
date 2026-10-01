import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ListMyOrdersQuerySchema } from '@/schemas/order.schema';
import { ListMyOrdersUseCase } from './useCase';
import { OrderRepository } from '@/repositories/OrderRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

const listMyOrdersHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as any;
  const useCase = new ListMyOrdersUseCase(new OrderRepository());
  const result = await useCase.execute({
    customerId: event.user!.sub,
    cursor: query.cursor,
    limit: query.limit ? Number(query.limit) : DEFAULT_PAGE_SIZE,
  });

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  clientAuth: true,
  cors: true,
  validation: { queryStringParameters: ListMyOrdersQuerySchema },
})(listMyOrdersHandler);

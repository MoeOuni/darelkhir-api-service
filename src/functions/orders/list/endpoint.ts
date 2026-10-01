import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ListOrdersQuerySchema } from '@/schemas/order.schema';
import { ListOrdersUseCase } from './useCase';
import { OrderRepository } from '@/repositories/OrderRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

const listOrdersHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as any;
  const useCase = new ListOrdersUseCase(new OrderRepository());
  const result = await useCase.execute({
    cursor: query.cursor,
    limit: query.limit ? Number(query.limit) : DEFAULT_PAGE_SIZE,
    status: query.status,
    search: query.search,
    sort: query.sort,
  });

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: true,   // admin-only — clients use GET /orders/my
  cors: true,
  validation: { queryStringParameters: ListOrdersQuerySchema },
})(listOrdersHandler);

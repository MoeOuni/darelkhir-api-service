import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ListProductsQuerySchema } from '@/schemas/product.schema';
import { ListProductsUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

const listProductsHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as any;
  const useCase = new ListProductsUseCase(new ProductRepository());
  const result = await useCase.execute({
    cursor: query.cursor,
    limit: query.limit ? Number(query.limit) : DEFAULT_PAGE_SIZE,
    categoryId: query.categoryId,
    status: query.status,
    search: query.search,
    sort: query.sort,
    includeCost: !!event.user,
    flagged: query.flagged === 'true',
  });

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

// optionalAuth, not auth: the storefront calls this anonymously. A resolved
// staff user unlocks purchasePrice; everyone else gets the customer view.
export const handler = middleware({
  optionalAuth: true,
  cors: true,
  validation: { queryStringParameters: ListProductsQuerySchema },
})(listProductsHandler);

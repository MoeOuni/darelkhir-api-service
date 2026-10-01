import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ListCategoriesQuerySchema } from '@/schemas/category.schema';
import { ListCategoriesUseCase } from './useCase';
import { CategoryRepository } from '@/repositories/CategoryRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

const listCategoriesHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as any;
  const useCase = new ListCategoriesUseCase(new CategoryRepository());
  const result = await useCase.execute({
    cursor: query.cursor,
    limit: query.limit ? Number(query.limit) : DEFAULT_PAGE_SIZE,
    parentId: query.parentId,
  });

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: false,
  cors: true,
  validation: { queryStringParameters: ListCategoriesQuerySchema },
})(listCategoriesHandler);

import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CategoryIdParamSchema } from '@/schemas/category.schema';
import { GetCategoryUseCase } from './useCase';
import { CategoryRepository } from '@/repositories/CategoryRepository';

const getCategoryHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new GetCategoryUseCase(new CategoryRepository());
  const result = await useCase.execute(id);

  if (!result.success) {
    return { statusCode: 404, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: false,
  cors: true,
  validation: { pathParameters: CategoryIdParamSchema },
})(getCategoryHandler);

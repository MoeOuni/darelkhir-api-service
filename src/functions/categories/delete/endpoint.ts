import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CategoryIdParamSchema } from '@/schemas/category.schema';
import { DeleteCategoryUseCase } from './useCase';
import { CategoryRepository } from '@/repositories/CategoryRepository';

const deleteCategoryHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new DeleteCategoryUseCase(new CategoryRepository());
  const result = await useCase.execute(id, event.user!.sub);

  return { statusCode: 200, body: JSON.stringify({ message: result.message }) };
};

export const handler = middleware({
  audit: { action: 'category.delete', entityType: 'category' },
  auth: true,
  cors: true,
  validation: { pathParameters: CategoryIdParamSchema },
})(deleteCategoryHandler);

import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateCategorySchema, CategoryIdParamSchema } from '@/schemas/category.schema';
import { UpdateCategoryUseCase } from './useCase';
import { CategoryRepository } from '@/repositories/CategoryRepository';

const updateCategoryHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new UpdateCategoryUseCase(new CategoryRepository());
  const result = await useCase.execute(id, event.body, event.user!.sub);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'category.update', entityType: 'category' },
  auth: true,
  cors: true,
  validation: {
    body: UpdateCategorySchema,
    pathParameters: CategoryIdParamSchema,
  },
})(updateCategoryHandler);

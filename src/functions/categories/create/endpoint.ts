import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateCategorySchema } from '@/schemas/category.schema';
import { CreateCategoryUseCase } from './useCase';
import { CategoryRepository } from '@/repositories/CategoryRepository';

const createCategoryHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new CreateCategoryUseCase(new CategoryRepository());
  const result = await useCase.execute(event.body, event.user!.sub);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 201, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'category.create', entityType: 'category' },
  auth: true,
  cors: true,
  validation: { body: CreateCategorySchema },
})(createCategoryHandler);

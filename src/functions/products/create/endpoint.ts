import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateProductSchema } from '@/schemas/product.schema';
import { CreateProductUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';

const createProductHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new CreateProductUseCase(new ProductRepository());
  const result = await useCase.execute(event.body, event.user!.sub, event.user);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 201, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'product.create', entityType: 'product' },
  auth: true,
  cors: true,
  validation: { body: CreateProductSchema },
})(createProductHandler);

import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateProductSchema, ProductIdParamSchema } from '@/schemas/product.schema';
import { UpdateProductUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';

const updateProductHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new UpdateProductUseCase(new ProductRepository());
  const result = await useCase.execute(id, event.body, event.user!.sub, event.user);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'product.update', entityType: 'product' },
  auth: true,
  cors: true,
  validation: {
    body: UpdateProductSchema,
    pathParameters: ProductIdParamSchema,
  },
})(updateProductHandler);

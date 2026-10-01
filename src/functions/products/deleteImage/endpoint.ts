import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ProductIdParamSchema } from '@/schemas/product.schema';
import { DeleteProductImageUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';

const deleteProductImageHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new DeleteProductImageUseCase(new ProductRepository());
  await useCase.execute(id);

  return { statusCode: 200, body: JSON.stringify({ message: 'Image deleted' }) };
};

export const handler = middleware({
  audit: { action: 'product.image_delete', entityType: 'product' },
  auth: true,
  cors: true,
  validation: { pathParameters: ProductIdParamSchema },
})(deleteProductImageHandler);

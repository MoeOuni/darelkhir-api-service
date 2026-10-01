import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ProductIdParamSchema } from '@/schemas/product.schema';
import { DeleteProductUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';

const deleteProductHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new DeleteProductUseCase(new ProductRepository());
  const result = await useCase.execute(id, event.user!.sub);

  return { statusCode: 200, body: JSON.stringify({ message: result.message }) };
};

export const handler = middleware({
  audit: { action: 'product.delete', entityType: 'product' },
  auth: true,
  cors: true,
  validation: { pathParameters: ProductIdParamSchema },
})(deleteProductHandler);

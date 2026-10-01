import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ProductIdParamSchema } from '@/schemas/product.schema';
import { GetProductUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';

const getProductHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new GetProductUseCase(new ProductRepository());
  const result = await useCase.execute(id, !!event.user);

  if (!result.success) {
    return { statusCode: 404, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

// optionalAuth, not auth: the storefront calls this anonymously. A resolved
// staff user unlocks purchasePrice; everyone else gets the customer view.
export const handler = middleware({
  optionalAuth: true,
  cors: true,
  validation: { pathParameters: ProductIdParamSchema },
})(getProductHandler);

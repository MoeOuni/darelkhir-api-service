import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ProductIdParamSchema } from '@/schemas/product.schema';
import { GetImageUploadUrlUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';

const imageUploadUrlHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new GetImageUploadUrlUseCase(new ProductRepository());
  const data = await useCase.execute(id);

  return { statusCode: 200, body: JSON.stringify({ data }) };
};

export const handler = middleware({
  auth: true,
  cors: true,
  validation: { pathParameters: ProductIdParamSchema },
})(imageUploadUrlHandler);

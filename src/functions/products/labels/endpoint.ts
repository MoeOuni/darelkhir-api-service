import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ProductLabelsSchema } from '@/schemas/labels.schema';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ProductLabelsUseCase } from './useCase';

const labelsHandler = async (event: ExtendedEvent, _context: Context) => {
  const result = await new ProductLabelsUseCase(new ProductRepository()).execute(event.body);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Tickets ready', data: result }),
  };
};

// A ticket shows selling prices only, which anyone who may see the catalogue
// already sees — so the catalogue permission is the right gate.
export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'products.view',
  validation: { body: ProductLabelsSchema },
})(labelsHandler);

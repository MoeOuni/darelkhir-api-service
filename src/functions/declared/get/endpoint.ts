import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { DeclaredNumberParamSchema } from '@/schemas/declared.schema';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';

const getHandler = async (event: ExtendedEvent, _context: Context) => {
  const { number } = event.pathParameters as { number: string };
  const found = await new DeclaredInvoiceRepository().findByNumber(decodeURIComponent(number));

  if (!found) return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };
  return { statusCode: 200, body: JSON.stringify({ message: 'Found', data: found.toPublicDTO() }) };
};

export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'declared.view',
  validation: { pathParameters: DeclaredNumberParamSchema },
})(getHandler);

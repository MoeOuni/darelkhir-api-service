import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CheckNumberQuerySchema } from '@/schemas/declared.schema';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';

/**
 * Whether a number is still free.
 *
 * For the person filling the form, so the answer comes before the work rather
 * than after it. It is not what guarantees uniqueness — the number is part of
 * the key and the write itself refuses a duplicate, which is what covers the
 * gap between this answer and the create that follows it.
 */
const availableHandler = async (event: ExtendedEvent, _context: Context) => {
  const { number } = event.queryStringParameters as { number: string };
  const free = await new DeclaredInvoiceRepository().isFree(number);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: free ? 'Free' : 'Taken', data: { number, free } }),
  };
};

export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'declared.create',
  validation: { queryStringParameters: CheckNumberQuerySchema },
})(availableHandler);

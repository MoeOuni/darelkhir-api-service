import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { DeclaredNumberParamSchema } from '@/schemas/declared.schema';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';

/**
 * Removes a declared invoice.
 *
 * The number does not come back into use by accident — it does, because the key
 * is gone — so this is the one place worth being deliberate about. It is how a
 * finalised mistake is corrected, and the journal keeps both the deletion and
 * whatever is raised in its place.
 */
const removeHandler = async (event: ExtendedEvent, _context: Context) => {
  const { number } = event.pathParameters as { number: string };
  const repository = new DeclaredInvoiceRepository();
  const found = await repository.findByNumber(decodeURIComponent(number));

  if (!found) return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };

  await repository.deleteByNumber(found.number);
  return { statusCode: 200, body: JSON.stringify({ message: 'Deleted' }) };
};

export const handler = middleware({
  audit: { action: 'declared.delete', entityType: 'declared_invoice' },
  auth: true,
  cors: true,
  requires: 'declared.delete',
  validation: { pathParameters: DeclaredNumberParamSchema },
})(removeHandler);

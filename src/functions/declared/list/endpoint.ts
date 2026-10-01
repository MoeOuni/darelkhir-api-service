import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';

const listHandler = async (event: ExtendedEvent, _context: Context) => {
  const q = event.queryStringParameters ?? {};
  const limit = Math.min(parseInt(String(q.limit ?? '20'), 10) || 20, 100);
  const page = await new DeclaredInvoiceRepository().listAll(q.cursor as string | undefined, limit);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Declared invoices retrieved',
      data: {
        items: page.items.map((e) => e.toPublicDTO()),
        cursor: page.cursor,
        count: page.count,
      },
    }),
  };
};

export const handler = middleware({ auth: true, cors: true, requires: 'declared.view' })(listHandler);

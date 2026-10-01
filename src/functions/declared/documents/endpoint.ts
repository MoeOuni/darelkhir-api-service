import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { StoredDocumentRepository } from '@/repositories/StoredDocumentRepository';
import { getDocumentDownloadUrl } from '@libs/s3-invoice';

/**
 * The register of rendered files.
 *
 * Scoped to one invoice when a number is given, and the whole register
 * otherwise — which is the document management screen. Links are signed here
 * rather than stored, because a stored URL is a URL that has already expired
 * by the time anyone needs it.
 */
const documentsHandler = async (event: ExtendedEvent, _context: Context) => {
  const q = event.queryStringParameters ?? {};
  const repository = new StoredDocumentRepository();

  const page = q.number
    ? { items: await repository.listForInvoice(String(q.number)), cursor: undefined, count: 0 }
    : await repository.listAll(
        q.cursor as string | undefined,
        Math.min(parseInt(String(q.limit ?? '20'), 10) || 20, 100),
      );

  const items = await Promise.all(
    page.items.map(async (doc) => ({
      ...doc.toPublicDTO(),
      url: await getDocumentDownloadUrl(doc.s3Key),
    })),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Documents retrieved',
      data: { items, cursor: page.cursor, count: items.length },
    }),
  };
};

export const handler = middleware({ auth: true, cors: true, requires: 'declared.view' })(
  documentsHandler,
);

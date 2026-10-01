/**
 * Invoice, proforma and credit note downloads.
 *
 * This handler lives in the invoice folder on purpose. esbuild inlines pdfkit
 * into the handler file, and pdfkit resolves its standard fonts from
 * `__dirname/data`. A handler in its own folder looks for the fonts beside
 * itself and fails with ENOENT on Helvetica.afm.
 */
import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { OrderIdParamSchema } from '@/schemas/order.schema';
import { GetOrderDocumentUseCase } from '../document/useCase';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import { ValidationError } from '@libs/errors';
import type { DocumentKind } from '@libs/invoice';

const VALID_KINDS: DocumentKind[] = [
  'invoice',
  'proforma',
  'credit_note',
  'stop',
  'delivery_note',
  'bundle',
];

const getOrderDocumentHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const kind = (event.queryStringParameters?.kind ?? 'invoice') as DocumentKind;

  if (!VALID_KINDS.includes(kind)) {
    throw new ValidationError(`Unknown document kind: ${kind}`);
  }

  // Which drop on the round, counted from 1 the way the paper reads: 004-1.
  const rawStop = event.queryStringParameters?.stop;
  const stopIndex = rawStop === undefined ? undefined : Number(rawStop);

  if (kind === 'stop' && stopIndex === undefined) {
    throw new ValidationError('A stop paper needs which stop to print.');
  }

  // `stop` is optional on a delivery note — without it the note covers the
  // whole load — but a value that is not a drop number is a mistake either way.
  if (stopIndex !== undefined && (!Number.isInteger(stopIndex) || stopIndex < 1)) {
    throw new ValidationError(`Not a stop number: ${event.queryStringParameters?.stop}`);
  }

  const useCase = new GetOrderDocumentUseCase(
    new OrderRepository(),
    new ClientRepository(),
    new TransporterRepository(),
  );
  const url = await useCase.execute(id, kind, stopIndex);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, kind, stop: stopIndex }),
  };
};

export const handler = middleware({
  auth: true,
  cors: true,
  validation: { pathParameters: OrderIdParamSchema },
})(getOrderDocumentHandler);

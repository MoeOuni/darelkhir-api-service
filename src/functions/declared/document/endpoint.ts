import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { DeclaredNumberParamSchema } from '@/schemas/declared.schema';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';
import { StoredDocumentRepository } from '@/repositories/StoredDocumentRepository';
import { GetDeclaredDocumentUseCase } from './useCase';

const documentHandler = async (event: ExtendedEvent, _context: Context) => {
  const { number } = event.pathParameters as { number: string };

  const useCase = new GetDeclaredDocumentUseCase(
    new DeclaredInvoiceRepository(),
    new StoredDocumentRepository(),
  );
  const result = await useCase.execute(decodeURIComponent(number), event.user?.sub);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Document ready', data: result }),
  };
};

export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'declared.view',
  validation: { pathParameters: DeclaredNumberParamSchema },
})(documentHandler);

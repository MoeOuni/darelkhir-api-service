import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateDeclaredInvoiceSchema } from '@/schemas/declared.schema';
import { CreateDeclaredInvoiceUseCase } from './useCase';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';

const createHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new CreateDeclaredInvoiceUseCase(new DeclaredInvoiceRepository());
  const result = await useCase.execute(event.body, event.user?.sub);

  if (!result.success) {
    return { statusCode: 409, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 201, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'declared.create', entityType: 'declared_invoice' },
  auth: true,
  cors: true,
  requires: 'declared.create',
  validation: { body: CreateDeclaredInvoiceSchema },
})(createHandler);

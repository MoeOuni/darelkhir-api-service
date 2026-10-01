import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateTransporterSchema } from '@/schemas/transporter.schema';
import { CreateTransporterUseCase } from './useCase';
import { TransporterRepository } from '@/repositories/TransporterRepository';

const createTransporterHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new CreateTransporterUseCase(new TransporterRepository());
  const result = await useCase.execute(event.body, event.user!.sub);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 201, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'transporter.create', entityType: 'transporter' },
  auth: true,
  cors: true,
  validation: { body: CreateTransporterSchema },
})(createTransporterHandler);

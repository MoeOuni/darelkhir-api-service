import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateTransporterSchema, TransporterIdParamSchema } from '@/schemas/transporter.schema';
import { UpdateTransporterUseCase } from './useCase';
import { TransporterRepository } from '@/repositories/TransporterRepository';

const updateTransporterHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new UpdateTransporterUseCase(new TransporterRepository());
  const result = await useCase.execute(id, event.body, event.user!.sub);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'transporter.update', entityType: 'transporter' },
  auth: true,
  cors: true,
  validation: {
    body: UpdateTransporterSchema,
    pathParameters: TransporterIdParamSchema,
  },
})(updateTransporterHandler);

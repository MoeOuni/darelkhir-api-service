import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { TransporterIdParamSchema } from '@/schemas/transporter.schema';
import { DeleteTransporterUseCase } from './useCase';
import { TransporterRepository } from '@/repositories/TransporterRepository';

const deleteTransporterHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new DeleteTransporterUseCase(new TransporterRepository());
  const result = await useCase.execute(id, event.user!.sub);

  return { statusCode: 200, body: JSON.stringify({ message: result.message }) };
};

export const handler = middleware({
  audit: { action: 'transporter.delete', entityType: 'transporter' },
  auth: true,
  cors: true,
  validation: { pathParameters: TransporterIdParamSchema },
})(deleteTransporterHandler);

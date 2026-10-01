import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { TransporterIdParamSchema } from '@/schemas/transporter.schema';
import { GetTransporterUseCase } from './useCase';
import { TransporterRepository } from '@/repositories/TransporterRepository';

const getTransporterHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new GetTransporterUseCase(new TransporterRepository());
  const result = await useCase.execute(id);

  if (!result.success) {
    return { statusCode: 404, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: true,
  cors: true,
  validation: { pathParameters: TransporterIdParamSchema },
})(getTransporterHandler);

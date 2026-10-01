import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ClientIdParamSchema } from '@/schemas/client.schema';
import { GetClientUseCase } from './useCase';
import { ClientRepository } from '@/repositories/ClientRepository';

const getClientHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new GetClientUseCase(new ClientRepository());
  const result = await useCase.execute(id);

  if (!result.success) {
    return { statusCode: 404, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: true,
  requires: 'clients.view',
  cors: true,
  validation: { pathParameters: ClientIdParamSchema },
})(getClientHandler);

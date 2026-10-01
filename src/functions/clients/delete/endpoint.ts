import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ClientIdParamSchema } from '@/schemas/client.schema';
import { DeleteClientUseCase } from './useCase';
import { ClientRepository } from '@/repositories/ClientRepository';

const deleteClientHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const useCase = new DeleteClientUseCase(new ClientRepository());
  const result = await useCase.execute(id);

  // The journal reads the response, so the name has to be in it.
  return {
    statusCode: 200,
    body: JSON.stringify({ message: result.message, data: result.data }),
  };
};

export const handler = middleware({
  audit: { action: 'client.delete', entityType: 'client' },
  auth: true,
  requires: 'clients.delete',
  cors: true,
  validation: { pathParameters: ClientIdParamSchema },
})(deleteClientHandler);

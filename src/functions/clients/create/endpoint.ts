import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateClientSchema } from '@/schemas/client.schema';
import { CreateClientUseCase } from './useCase';
import { ClientRepository } from '@/repositories/ClientRepository';

const createClientHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new CreateClientUseCase(new ClientRepository());
  const result = await useCase.execute(event.body);

  if (!result.success) {
    return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 201, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'client.create', entityType: 'client' },
  auth: true,
  requires: 'clients.create',
  cors: true,
  validation: { body: CreateClientSchema },
})(createClientHandler);

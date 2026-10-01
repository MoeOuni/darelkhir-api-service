import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateClientSchema } from '@/schemas/client.schema';
import { UpdateClientUseCase } from '../update/useCase';
import { ClientRepository } from '@/repositories/ClientRepository';

const updateMyClientHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new UpdateClientUseCase(new ClientRepository());
  const result = await useCase.execute(event.user!.sub, event.body);

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  clientAuth: true,
  cors: true,
  validation: { body: UpdateClientSchema },
})(updateMyClientHandler);

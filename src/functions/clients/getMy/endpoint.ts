import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { GetClientUseCase } from '../get/useCase';
import { ClientRepository } from '@/repositories/ClientRepository';

const getMyClientHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new GetClientUseCase(new ClientRepository());
  const result = await useCase.execute(event.user!.sub);

  if (!result.success) {
    return { statusCode: 404, body: JSON.stringify({ message: result.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  clientAuth: true,
  cors: true,
})(getMyClientHandler);

import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ListTransportersQuerySchema } from '@/schemas/transporter.schema';
import { ListTransportersUseCase } from './useCase';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

const listTransportersHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as any;
  const useCase = new ListTransportersUseCase(new TransporterRepository());
  const result = await useCase.execute({
    cursor: query.cursor,
    limit: query.limit ? Number(query.limit) : DEFAULT_PAGE_SIZE,
    search: query.search,
  });

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: true,
  cors: true,
  validation: { queryStringParameters: ListTransportersQuerySchema },
})(listTransportersHandler);

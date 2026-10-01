import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ListClientsQuerySchema } from '@/schemas/client.schema';
import { ListClientsUseCase } from './useCase';
import { ClientRepository } from '@/repositories/ClientRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';
import { resolveGrant } from '@libs/auth/authorize';

const listClientsHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as any;

  // Taking an order needs the client list. Seeing what every client owes is a
  // different question, so the balance is cut out unless it was granted.
  const grant = event.user ? await resolveGrant(event.user).catch(() => null) : null;
  const canSeeDebt = !!grant && (grant.isOwner || grant.permissions.includes('payments.view'));

  const useCase = new ListClientsUseCase(new ClientRepository());
  const result = await useCase.execute(
    {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : DEFAULT_PAGE_SIZE,
      search: query.search,
      sort: query.sort,
    },
    canSeeDebt,
  );

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  auth: true,
  requires: 'clients.view',
  cors: true,
  validation: { queryStringParameters: ListClientsQuerySchema },
})(listClientsHandler);

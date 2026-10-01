import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { requirePermission } from '@libs/auth/authorize';
import { ClientIdParamSchema, UpdateClientSchema } from '@/schemas/client.schema';
import { UpdateClientUseCase } from './useCase';
import { ClientRepository } from '@/repositories/ClientRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { PaymentRepository } from '@/repositories/PaymentRepository';

const updateClientHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const body = event.body as Record<string, unknown>;

  // Editing a name is not the same act as declaring that someone owes money.
  // The opening balance is a debt with no order behind it, so it asks for the
  // permission that covers money rather than the one that covers contact
  // details.
  if (body && 'openingBalance' in body) {
    await requirePermission(event.user, 'payments.create');
  }

  const useCase = new UpdateClientUseCase(
    new ClientRepository(),
    new OrderRepository(),
    new PaymentRepository(),
  );
  const result = await useCase.execute(id, event.body);

  return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
};

export const handler = middleware({
  audit: { action: 'client.update', entityType: 'client' },
  auth: true,
  requires: 'clients.edit',
  cors: true,
  validation: { pathParameters: ClientIdParamSchema, body: UpdateClientSchema },
})(updateClientHandler);

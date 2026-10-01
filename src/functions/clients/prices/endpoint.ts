import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { requirePermission } from '@libs/auth/authorize';
import { ValidationError } from '@libs/errors';
import {
  ClientPriceParamsSchema,
  ClientPriceListParamsSchema,
  SetClientPriceSchema,
} from '@/schemas/client-price.schema';
import { ClientPricesUseCase } from './useCase';
import { ClientPriceRepository } from '@/repositories/ClientPriceRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { ProductRepository } from '@/repositories/ProductRepository';

/**
 * Reading, setting and clearing the prices agreed with a client.
 *
 * The three live in one Lambda on purpose. Each deployed function costs about
 * six CloudFormation resources, and this stack sits close to the 500 that
 * CloudFormation allows — three functions here would be eighteen of them for
 * what is one small piece of behaviour.
 *
 * Because the routes share a function they cannot use the middleware's
 * `requires`, so the permission is checked per method below: reading a price
 * list is `clients.view`, changing one is `clients.edit`.
 */
const useCase = () =>
  new ClientPricesUseCase(
    new ClientPriceRepository(),
    new ClientRepository(),
    new ProductRepository(),
  );

const ok = (result: { message: string; data: unknown }) => ({
  statusCode: 200,
  body: JSON.stringify({ message: result.message, data: result.data }),
});

const clientPricesHandler = async (event: ExtendedEvent, _context: Context) => {
  const method = (event.requestContext as any)?.http?.method ?? event.httpMethod;
  const { id, productId } = (event.pathParameters ?? {}) as {
    id?: string;
    productId?: string;
  };

  if (method === 'GET') {
    await requirePermission(event.user, 'clients.view');
    const { id: clientId } = ClientPriceListParamsSchema.parse({ id });
    return ok(await useCase().list(clientId));
  }

  await requirePermission(event.user, 'clients.edit');
  const params = ClientPriceParamsSchema.parse({ id, productId });

  if (method === 'PUT') {
    const body = SetClientPriceSchema.parse(event.body);
    return ok(await useCase().set(params.id, params.productId, body));
  }

  if (method === 'DELETE') {
    return ok(await useCase().remove(params.id, params.productId));
  }

  throw new ValidationError(`Unsupported method: ${method}`);
};

export const handler = middleware({
  auth: true,
  cors: true,
  audit: { action: 'client.price', entityType: 'client' },
})(clientPricesHandler);

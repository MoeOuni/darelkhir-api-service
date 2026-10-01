import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { RequestRepository } from '@/repositories/RequestRepository';
import { RequestEntity } from '@/entities/RequestEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, RequestStatus } from '@libs/enums';
import { NotFoundError } from '@libs/errors';
import {
  CreateRequestSchema,
  UpdateRequestSchema,
  type CreateRequestInput,
  type UpdateRequestInput,
} from '@/schemas/catalog.schema';

const repository = () => new RequestRepository();

/** What customers asked for that the shop did not have. */
const listHandler = async (event: ExtendedEvent, _c: Context) => {
  const q = (event.queryStringParameters || {}) as Record<string, string>;
  const result = await repository().listAll(q.cursor, q.limit ? Number(q.limit) : 100);

  let items = result.items;
  if (q.status) items = items.filter((r) => r.status === q.status);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Requests retrieved successfully',
      data: {
        items: items.map((e) => {
          const dto = e.toPublicDTO();
          return { ...dto, id: (dto.sk as string).split('#')[1] };
        }),
        cursor: result.cursor,
      },
    }),
  };
};

const createHandler = async (event: ExtendedEvent, _c: Context) => {
  const input = event.body as CreateRequestInput;
  const uuid = IdGenerator.generate();
  const now = new Date().toISOString();

  const entity = new RequestEntity({
    id: DataType.REQUEST,
    sk: `${DataType.REQUEST}#${uuid}`,
    dataType: DataType.REQUEST,
    ...input,
    status: RequestStatus.OPEN,
    recordedBy: event.user?.sub,
    recordedByName: event.user?.name,
    createdAt: now,
    updatedAt: now,
  });
  await repository().create(entity);

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Request recorded',
      data: { ...entity.toPublicDTO(), id: uuid },
    }),
  };
};

const updateHandler = async (event: ExtendedEvent, _c: Context) => {
  const { id } = event.pathParameters as { id: string };
  const data = event.body as UpdateRequestInput;

  const repo = repository();
  const entity = await repo.findByUuid(id);
  if (!entity) throw new NotFoundError('Request not found');

  entity.set(data);
  // Stamp the moment the customer was told, so nobody calls them twice.
  if (data.status === RequestStatus.NOTIFIED && !entity.notifiedAt) {
    entity.set({ notifiedAt: new Date().toISOString() });
  }
  await repo.update(entity);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Request updated',
      data: { ...entity.toPublicDTO(), id },
    }),
  };
};

const deleteHandler = async (event: ExtendedEvent, _c: Context) => {
  const { id } = event.pathParameters as { id: string };
  await repository().deleteByUuid(id);
  return { statusCode: 200, body: JSON.stringify({ message: 'Request deleted', data: { id } }) };
};

export const list = middleware({ auth: true, cors: true })(listHandler);

export const create = middleware({
  auth: true,
  audit: { action: 'request.create', entityType: 'request' },
  cors: true,
  validation: { body: CreateRequestSchema },
})(createHandler);

export const update = middleware({
  auth: true,
  audit: { action: 'request.update', entityType: 'request' },
  cors: true,
  validation: { body: UpdateRequestSchema },
})(updateHandler);

export const remove = middleware({
  auth: true,
  audit: { action: 'request.delete', entityType: 'request' },
  cors: true,
})(deleteHandler);

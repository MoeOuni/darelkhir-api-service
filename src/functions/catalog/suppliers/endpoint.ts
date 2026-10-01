import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { SupplierRepository } from '@/repositories/SupplierRepository';
import { SupplierEntity } from '@/entities/SupplierEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType } from '@libs/enums';
import { NotFoundError } from '@libs/errors';
import {
  CreateSupplierSchema,
  UpdateSupplierSchema,
  type CreateSupplierInput,
} from '@/schemas/catalog.schema';

const repository = () => new SupplierRepository();

const listHandler = async (event: ExtendedEvent, _c: Context) => {
  const q = (event.queryStringParameters || {}) as Record<string, string>;
  const result = await repository().listAll(q.cursor, q.limit ? Number(q.limit) : 100);
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Suppliers retrieved successfully',
      data: {
        items: result.items.map((e) => {
          const dto = e.toPublicDTO();
          return { ...dto, id: (dto.sk as string).split('#')[1] };
        }),
        cursor: result.cursor,
      },
    }),
  };
};

const createHandler = async (event: ExtendedEvent, _c: Context) => {
  const input = event.body as CreateSupplierInput;
  const uuid = IdGenerator.generate();
  const now = new Date().toISOString();

  const entity = new SupplierEntity({
    id: DataType.SUPPLIER,
    sk: `${DataType.SUPPLIER}#${uuid}`,
    dataType: DataType.SUPPLIER,
    ...input,
    email: input.email || undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository().create(entity);

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Supplier created',
      data: { ...entity.toPublicDTO(), id: uuid },
    }),
  };
};

const updateHandler = async (event: ExtendedEvent, _c: Context) => {
  const { id } = event.pathParameters as { id: string };
  const repo = repository();
  const entity = await repo.findByUuid(id);
  if (!entity) throw new NotFoundError('Supplier not found');

  entity.set(event.body as Record<string, unknown>);
  await repo.update(entity);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Supplier updated',
      data: { ...entity.toPublicDTO(), id },
    }),
  };
};

const deleteHandler = async (event: ExtendedEvent, _c: Context) => {
  const { id } = event.pathParameters as { id: string };
  await repository().deleteByUuid(id);
  return { statusCode: 200, body: JSON.stringify({ message: 'Supplier deleted', data: { id } }) };
};

export const list = middleware({ auth: true, cors: true })(listHandler);

export const create = middleware({
  auth: true,
  audit: { action: 'supplier.create', entityType: 'supplier' },
  cors: true,
  validation: { body: CreateSupplierSchema },
})(createHandler);

export const update = middleware({
  auth: true,
  audit: { action: 'supplier.update', entityType: 'supplier' },
  cors: true,
  validation: { body: UpdateSupplierSchema },
})(updateHandler);

export const remove = middleware({
  auth: true,
  audit: { action: 'supplier.delete', entityType: 'supplier' },
  cors: true,
})(deleteHandler);

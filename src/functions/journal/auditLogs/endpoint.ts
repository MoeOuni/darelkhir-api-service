import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';

/** Who did what. Whole journal, or everything touching one record. */
const listAuditLogsHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as Record<string, string>;
  const limit = query.limit ? Math.min(Number(query.limit), 100) : 50;
  const repository = new AuditLogRepository();

  const result = query.entityId
    ? await repository.listByEntity(query.entityId, query.cursor, limit)
    : await repository.listAll(query.cursor, limit);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Audit logs retrieved successfully',
      data: {
        items: result.items.map((e) => {
          const dto = e.toPublicDTO();
          return { ...dto, id: (dto.sk as string).split('#')[1] };
        }),
        cursor: result.cursor,
        count: result.count,
      },
    }),
  };
};

export const handler = middleware({
  auth: true,
  cors: true,
})(listAuditLogsHandler);

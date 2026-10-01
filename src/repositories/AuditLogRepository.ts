import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_PARENT_RESOURCE, GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { AuditLogEntity } from '@/entities/AuditLogEntity';
import { PaginatedResult } from './builder/types';

export class AuditLogRepository extends Repository<AuditLogEntity> {
  protected dataType = DataType.AUDIT_LOG;
  protected tableName = getConfig().journalTableName;

  protected getEntity(attr: Record<string, any>): AuditLogEntity {
    return new AuditLogEntity(attr);
  }

  /** Newest first. */
  async listAll(cursor?: string, limit = 50): Promise<PaginatedResult<AuditLogEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.AUDIT_LOG)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  /** Everything that ever happened to one record, newest first. */
  async listByEntity(
    entityId: string,
    cursor?: string,
    limit = 50
  ): Promise<PaginatedResult<AuditLogEntity>> {
    const q = this.builder().query().setIndex(GSI_PARENT_RESOURCE)
      .query('fk', '=', entityId)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

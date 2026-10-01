import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { RequestEntity } from '@/entities/RequestEntity';
import { PaginatedResult } from './builder/types';

export class RequestRepository extends Repository<RequestEntity> {
  protected dataType = DataType.REQUEST;
  protected tableName = getConfig().catalogTableName;

  protected getEntity(attr: Record<string, any>): RequestEntity {
    return new RequestEntity(attr);
  }

  async findByUuid(uuid: string): Promise<RequestEntity | null> {
    return this.findById(DataType.REQUEST, `${DataType.REQUEST}#${uuid}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.delete(DataType.REQUEST, `${DataType.REQUEST}#${uuid}`);
  }

  /** Newest first. */
  async listAll(cursor?: string, limit = 100): Promise<PaginatedResult<RequestEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.REQUEST)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

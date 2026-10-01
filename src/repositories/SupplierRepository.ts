import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { SupplierEntity } from '@/entities/SupplierEntity';
import { PaginatedResult } from './builder/types';

export class SupplierRepository extends Repository<SupplierEntity> {
  protected dataType = DataType.SUPPLIER;
  protected tableName = getConfig().catalogTableName;

  protected getEntity(attr: Record<string, any>): SupplierEntity {
    return new SupplierEntity(attr);
  }

  async findByUuid(uuid: string): Promise<SupplierEntity | null> {
    return this.findById(DataType.SUPPLIER, `${DataType.SUPPLIER}#${uuid}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.delete(DataType.SUPPLIER, `${DataType.SUPPLIER}#${uuid}`);
  }

  /** Newest first. */
  async listAll(cursor?: string, limit = 100): Promise<PaginatedResult<SupplierEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.SUPPLIER)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

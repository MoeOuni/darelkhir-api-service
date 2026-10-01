import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { StaffEntity } from '@/entities/StaffEntity';
import { PaginatedResult } from './builder/types';

export class StaffRepository extends Repository<StaffEntity> {
  protected dataType = DataType.STAFF;
  protected tableName = getConfig().staffTableName;

  protected getEntity(attr: Record<string, any>): StaffEntity {
    return new StaffEntity(attr);
  }

  async findBySub(sub: string): Promise<StaffEntity | null> {
    return this.findById(DataType.STAFF, `${DataType.STAFF}#${sub}`);
  }

  async deleteBySub(sub: string): Promise<void> {
    return this.delete(DataType.STAFF, `${DataType.STAFF}#${sub}`);
  }

  async listAll(cursor?: string, limit = 100): Promise<PaginatedResult<StaffEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.STAFF)
      .setCursor(cursor).setLimit(limit);
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  /** True when no staff record exists at all. Used for first-run bootstrap. */
  async isEmpty(): Promise<boolean> {
    const result = await this.listAll(undefined, 1);
    return result.items.length === 0;
  }
}

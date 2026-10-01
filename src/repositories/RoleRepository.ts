import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { RoleEntity } from '@/entities/RoleEntity';
import { PaginatedResult } from './builder/types';

export class RoleRepository extends Repository<RoleEntity> {
  protected dataType = DataType.ROLE;
  protected tableName = getConfig().staffTableName;

  protected getEntity(attr: Record<string, any>): RoleEntity {
    return new RoleEntity(attr);
  }

  async findByRoleId(roleId: string): Promise<RoleEntity | null> {
    return this.findById(DataType.ROLE, `${DataType.ROLE}#${roleId}`);
  }

  async deleteByRoleId(roleId: string): Promise<void> {
    return this.delete(DataType.ROLE, `${DataType.ROLE}#${roleId}`);
  }

  async listAll(cursor?: string, limit = 100): Promise<PaginatedResult<RoleEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.ROLE)
      .setCursor(cursor).setLimit(limit);
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

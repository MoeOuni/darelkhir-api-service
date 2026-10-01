import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_PARENT_RESOURCE } from '@libs/constants';
import { Repository } from './Repository';
import { CategoryEntity } from '@/entities/CategoryEntity';
import { PaginatedResult } from './builder/types';

export class CategoryRepository extends Repository<CategoryEntity> {
  protected dataType = DataType.CATEGORY;
  protected tableName = getConfig().categoriesTableName;

  protected getEntity(attr: Record<string, any>): CategoryEntity {
    return new CategoryEntity(attr);
  }

  async findByUuid(uuid: string): Promise<CategoryEntity | null> {
    return this.findById(DataType.CATEGORY, `${DataType.CATEGORY}#${uuid}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.delete(DataType.CATEGORY, `${DataType.CATEGORY}#${uuid}`);
  }

  async listAll(
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResult<CategoryEntity>> {
    const result = await this.builder()
      .query()
      .query('id', '=', DataType.CATEGORY)
      .setCursor(cursor)
      .setLimit(limit)
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  async listByParent(
    parentCategoryId: string,
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResult<CategoryEntity>> {
    const result = await this.builder()
      .query()
      .setIndex(GSI_PARENT_RESOURCE)
      .query('fk', '=', parentCategoryId)
      .setCursor(cursor)
      .setLimit(limit)
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

import { DataType, ProductStatus } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_PARENT_RESOURCE, GSI_RESOURCE_CREATED, GSI_STATUS_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { ProductEntity } from '@/entities/ProductEntity';
import { PaginatedResult } from './builder/types';

export class ProductRepository extends Repository<ProductEntity> {
  protected dataType = DataType.PRODUCT;
  protected tableName = getConfig().productsTableName;

  protected getEntity(attr: Record<string, any>): ProductEntity {
    return new ProductEntity(attr);
  }

  async findByUuid(uuid: string): Promise<ProductEntity | null> {
    return this.findById(DataType.PRODUCT, `${DataType.PRODUCT}#${uuid}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.delete(DataType.PRODUCT, `${DataType.PRODUCT}#${uuid}`);
  }

  /**
   * Atomically adjusts stockAvailable.
   * Pass negative deltas to decrement.
   */
  async updateStock(
    uuid: string,
    availableDelta: number
  ): Promise<void> {
    const key = { id: DataType.PRODUCT, sk: `${DataType.PRODUCT}#${uuid}` };
    const now = new Date().toISOString();
    await this.builder()
      .update(key)
      .increment('stockAvailable', availableDelta)
      .set('updatedAt', now)
      .execute();
  }

  async listAll(
    cursor?: string,
    limit = 20,
    status?: ProductStatus,
    search?: string,
    sort?: 'date_asc' | 'date_desc'
  ): Promise<PaginatedResult<ProductEntity>> {
    const asc = sort === 'date_asc';

    // Text search: use main table (FilterExpression can't use any index).
    // Combines searchKey (lowercase, for new/updated products) OR original fields
    // (original case, for existing products without searchKey) — no data migration needed.
    if (search) {
      const q = this.builder().query().query('id', '=', DataType.PRODUCT).setCursor(cursor).setLimit(limit);
      if (!asc) q.orderReverse();
      if (status) q.filter('status', '=', status);
      q.filterContainsOrGroups([
        { attrs: ['searchKey'], value: search.toLowerCase() },
        { attrs: ['name.fr', 'name.ar', 'code'], value: search },
      ]);
      const result = await q.execute();
      return { ...result, items: result.items.map((i) => this.getEntity(i)) };
    }

    // Status filter: use gsi-status-created (sehk = "status#createdAt")
    if (status) {
      const q = this.builder().query().setIndex(GSI_STATUS_CREATED)
        .query('dataType', '=', DataType.PRODUCT)
        .query('sehk', 'begins_with', `${status}#`)
        .setCursor(cursor).setLimit(limit);
      if (!asc) q.orderReverse();
      const result = await q.execute();
      return { ...result, items: result.items.map((i) => this.getEntity(i)) };
    }

    // No filters: use gsi-resource-created for true chronological order
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.PRODUCT)
      .setCursor(cursor).setLimit(limit);
    if (!asc) q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  async listByCategory(
    categoryId: string,
    cursor?: string,
    limit = 20,
    status?: ProductStatus,
    search?: string,
    sort?: 'date_asc' | 'date_desc'
  ): Promise<PaginatedResult<ProductEntity>> {
    // gsi-parent-resource has no sort key — date sort not available here
    const q = this.builder().query().setIndex(GSI_PARENT_RESOURCE)
      .query('fk', '=', categoryId).setCursor(cursor).setLimit(limit);
    if (status) q.filter('status', '=', status);
    if (search) {
      q.filterContainsOrGroups([
        { attrs: ['searchKey'], value: search.toLowerCase() },
        { attrs: ['name.fr', 'name.ar', 'code'], value: search },
      ]);
    }
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  async listByCreatedDate(
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResult<ProductEntity>> {
    const result = await this.builder()
      .query()
      .setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.PRODUCT)
      .setCursor(cursor)
      .setLimit(limit)
      .orderReverse()
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  async updateImageUrls(uuid: string, imageUrl: string, imageUrlWebp: string): Promise<void> {
    const key = { id: DataType.PRODUCT, sk: `${DataType.PRODUCT}#${uuid}` };
    const now = new Date().toISOString();
    await this.builder()
      .update(key)
      .set('imageUrl', imageUrl)
      .set('imageUrlWebp', imageUrlWebp)
      .set('updatedAt', now)
      .execute();
  }

  /**
   * Every product, all pages.
   *
   * The settings warnings have to be counted across the whole catalogue, not
   * across the twenty rows that happen to be on screen — a product with no
   * purchase price hides just as well on page five. Fine at this scale; the
   * shop has a dozen articles and the client search already reads its whole
   * partition for the same reason.
   */
  async listEveryProduct(): Promise<ProductEntity[]> {
    const items: ProductEntity[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.listAll(cursor, 100);
      items.push(...page.items);
      cursor = page.cursor;
    } while (cursor);

    return items;
  }

  async clearImage(uuid: string): Promise<void> {
    const key = { id: DataType.PRODUCT, sk: `${DataType.PRODUCT}#${uuid}` };
    const now = new Date().toISOString();
    await this.builder()
      .update(key)
      .remove('imageUrl')
      .remove('imageUrlWebp')
      .set('updatedAt', now)
      .execute();
  }
}

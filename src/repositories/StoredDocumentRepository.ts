import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { Repository } from './Repository';
import { StoredDocumentEntity, storedPrefix } from '@/entities/StoredDocumentEntity';
import { PaginatedResult } from './builder/types';

/**
 * The register of files that have been produced.
 *
 * It shares the declared table because it is part of the same story: a
 * declared invoice and the papers rendered from it are looked at together, and
 * splitting them across two tables would buy nothing but a second thing to
 * keep in step.
 */
export class StoredDocumentRepository extends Repository<StoredDocumentEntity> {
  protected dataType = DataType.STORED_DOCUMENT;
  protected tableName = getConfig().declaredTableName;

  protected getEntity(attr: Record<string, any>): StoredDocumentEntity {
    return new StoredDocumentEntity(attr);
  }

  /**
   * Files one rendering, whether or not the row is already there.
   *
   * `update` writes only what an entity reports as dirty, and an entity built
   * from scratch reports nothing — the row would land holding its key and
   * nothing else. Marking every field through `set` is what makes this an
   * upsert rather than a stub, which matters because a reprint writes to the
   * row it already has.
   */
  async record(entity: StoredDocumentEntity): Promise<void> {
    const { id, sk, ...rest } = entity.valueOf() as Record<string, any>;
    entity.set(rest);
    await this.update(entity);
  }

  /** Every file kept for one declared invoice, newest first. */
  async listForInvoice(declaredNumber: string, limit = 50): Promise<StoredDocumentEntity[]> {
    const result = await this.builder()
      .query()
      .query('id', '=', DataType.STORED_DOCUMENT)
      .query('sk', 'begins_with', storedPrefix(declaredNumber))
      .setLimit(limit)
      .orderReverse()
      .execute();

    return result.items.map((i) => this.getEntity(i));
  }

  /** The whole register, newest first — the document management screen. */
  async listAll(cursor?: string, limit = 20): Promise<PaginatedResult<StoredDocumentEntity>> {
    const result = await this.builder()
      .query()
      .setIndex('gsi-resource-created')
      .query('id', '=', DataType.STORED_DOCUMENT)
      .setCursor(cursor)
      .setLimit(limit)
      .orderReverse()
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

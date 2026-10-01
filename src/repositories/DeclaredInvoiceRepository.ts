import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { Repository } from './Repository';
import { DeclaredInvoiceEntity, declaredKey } from '@/entities/DeclaredInvoiceEntity';
import { PaginatedResult } from './builder/types';

/**
 * Declared invoices, keyed by the number the shop typed.
 *
 * There is no counter here and no generated id. The number IS the identity,
 * which is what makes it unique for all time: `create` writes with
 * `attribute_not_exists(sk)`, so a second 2026/014 is refused by the database
 * rather than by a check another writer can slip past.
 */
export class DeclaredInvoiceRepository extends Repository<DeclaredInvoiceEntity> {
  protected dataType = DataType.DECLARED_INVOICE;
  protected tableName = getConfig().declaredTableName;

  protected getEntity(attr: Record<string, any>): DeclaredInvoiceEntity {
    return new DeclaredInvoiceEntity(attr);
  }

  async findByNumber(number: string): Promise<DeclaredInvoiceEntity | null> {
    return this.findById(DataType.DECLARED_INVOICE, declaredKey(number));
  }

  async deleteByNumber(number: string): Promise<void> {
    return this.delete(DataType.DECLARED_INVOICE, declaredKey(number));
  }

  /** Whether that number is still free to use. */
  async isFree(number: string): Promise<boolean> {
    return (await this.findByNumber(number)) === null;
  }

  async listAll(cursor?: string, limit = 20): Promise<PaginatedResult<DeclaredInvoiceEntity>> {
    const result = await this.builder()
      .query()
      .setIndex('gsi-resource-created')
      .query('id', '=', DataType.DECLARED_INVOICE)
      .setCursor(cursor)
      .setLimit(limit)
      .orderReverse()
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

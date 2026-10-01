import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_PARENT_RESOURCE, GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { PaymentEntity } from '@/entities/PaymentEntity';
import { PaginatedResult } from './builder/types';

export class PaymentRepository extends Repository<PaymentEntity> {
  protected dataType = DataType.PAYMENT;
  protected tableName = getConfig().paymentsTableName;

  protected getEntity(attr: Record<string, any>): PaymentEntity {
    return new PaymentEntity(attr);
  }

  async findByUuid(uuid: string): Promise<PaymentEntity | null> {
    return this.findById(DataType.PAYMENT, `${DataType.PAYMENT}#${uuid}`);
  }

  /**
   * Every payment of one client, oldest first.
   *
   * The balance is recomputed from these records, so this must return all of
   * them rather than one page.
   */
  async listByClient(clientId: string): Promise<PaymentEntity[]> {
    const items: PaymentEntity[] = [];
    let cursor: string | undefined;

    do {
      const page: PaginatedResult<Record<string, any>> = await this.builder()
        .query()
        .setIndex(GSI_PARENT_RESOURCE)
        .query('fk', '=', clientId)
        .setCursor(cursor)
        .setLimit(100)
        .execute();

      items.push(...page.items.map((i) => this.getEntity(i)));
      cursor = page.cursor;
    } while (cursor);

    return items.sort((a, b) => (a.paidAt ?? '').localeCompare(b.paidAt ?? ''));
  }

  /**
   * Newest first, for the payments and cheques screens.
   *
   * This table's gsi-resource-created is keyed by `id`, not by `dataType` —
   * unlike the products, orders and journal tables. Querying the wrong one
   * fails with "Query condition missed key schema element".
   */
  async listAll(cursor?: string, limit = 100): Promise<PaginatedResult<PaymentEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('id', '=', DataType.PAYMENT)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

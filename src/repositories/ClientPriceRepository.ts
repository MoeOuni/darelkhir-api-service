import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { Repository } from './Repository';
import { ClientPriceEntity } from '@/entities/ClientPriceEntity';

/**
 * Agreed prices live beside the clients they belong to.
 *
 * The sort key carries the client then the product, so one client's whole
 * price list is a single query and one product's price is a direct read.
 */
export class ClientPriceRepository extends Repository<ClientPriceEntity> {
  protected dataType = DataType.CLIENT_PRICE;
  protected tableName = getConfig().clientsTableName;

  protected getEntity(attr: Record<string, any>): ClientPriceEntity {
    return new ClientPriceEntity(attr);
  }

  static key(clientId: string, productId: string): string {
    return `${DataType.CLIENT_PRICE}#${clientId}#${productId}`;
  }

  async findOne(clientId: string, productId: string): Promise<ClientPriceEntity | null> {
    return this.findById(DataType.CLIENT_PRICE, ClientPriceRepository.key(clientId, productId));
  }

  /** Every price agreed with one client. */
  async listForClient(clientId: string): Promise<ClientPriceEntity[]> {
    const result = await this.builder()
      .query()
      .query('id', '=', DataType.CLIENT_PRICE)
      .query('sk', 'begins_with', `${DataType.CLIENT_PRICE}#${clientId}#`)
      .setLimit(500)
      .execute();

    return result.items.map((item) => this.getEntity(item));
  }

  /**
   * The prices that apply to a set of products, as a lookup.
   *
   * Reads the client's whole list once rather than one read per line: an order
   * of twenty lines would otherwise be twenty round trips.
   */
  async priceMapFor(clientId: string, productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const wanted = new Set(productIds);
    const rows = await this.listForClient(clientId);

    const map = new Map<string, number>();
    for (const row of rows) {
      if (wanted.has(row.productId) && Number.isFinite(row.price)) {
        map.set(row.productId, row.price);
      }
    }
    return map;
  }

  async removeOne(clientId: string, productId: string): Promise<void> {
    return this.delete(DataType.CLIENT_PRICE, ClientPriceRepository.key(clientId, productId));
  }
}

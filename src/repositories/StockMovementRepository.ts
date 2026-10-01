import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_PARENT_RESOURCE, GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { StockMovementEntity } from '@/entities/StockMovementEntity';
import { PaginatedResult } from './builder/types';

export class StockMovementRepository extends Repository<StockMovementEntity> {
  protected dataType = DataType.STOCK_MOVEMENT;
  protected tableName = getConfig().journalTableName;

  protected getEntity(attr: Record<string, any>): StockMovementEntity {
    return new StockMovementEntity(attr);
  }

  /** Newest first across the whole shop. */
  async listAll(cursor?: string, limit = 50): Promise<PaginatedResult<StockMovementEntity>> {
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.STOCK_MOVEMENT)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  /** The full history of one product, newest first. */
  async listByProduct(
    productId: string,
    cursor?: string,
    limit = 50
  ): Promise<PaginatedResult<StockMovementEntity>> {
    const q = this.builder().query().setIndex(GSI_PARENT_RESOURCE)
      .query('fk', '=', productId)
      .setCursor(cursor).setLimit(limit);
    q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}

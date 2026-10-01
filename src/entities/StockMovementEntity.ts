import { Entity } from './Entity';
import { IStockMovement } from '@libs/interfaces';
import { DataType, StockMovementType } from '@libs/enums';

/**
 * One line in the stock history of a product.
 *
 * `stockAvailable` on its own is a single number: when it is wrong, nothing
 * explains why. Every change writes a row here, so a monthly count against the
 * record finds where the difference came from.
 *
 * A movement is never edited or erased. A mistake is corrected by writing an
 * opposite movement.
 */
export class StockMovementEntity extends Entity<IStockMovement> implements IStockMovement {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  productId: string;
  productCode: string;
  productName: string;
  type: StockMovementType;
  /** Signed change to stockAvailable. Negative takes goods out. */
  availableDelta: number;
  /** stockAvailable after this movement, for reading the history back. */
  availableAfter?: number;
  orderId?: string;
  orderNumber?: number;
  reason?: string;
  performedBy?: string;
  performedByName?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IStockMovement>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.STOCK_MOVEMENT;
    this.sk = attr.sk as string;
    this.dataType = DataType.STOCK_MOVEMENT;
    this.productId = attr.productId as string;
    this.productCode = attr.productCode ?? '';
    this.productName = attr.productName ?? '';
    this.type = attr.type as StockMovementType;
    this.availableDelta = attr.availableDelta ?? 0;
    this.availableAfter = attr.availableAfter;
    this.orderId = attr.orderId;
    this.orderNumber = attr.orderNumber;
    this.reason = attr.reason;
    this.performedBy = attr.performedBy;
    this.performedByName = attr.performedByName;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // All movements of one product, newest last.
      fk: ['productId'],
      // Every movement in date order, for the whole-shop view.
      sihk: ['createdAt'],
    };
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, ...rest } = this.valueOf() as any;
    return rest;
  }
}

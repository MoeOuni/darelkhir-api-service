import { Entity } from './Entity';
import { IClientPrice } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * One agreed price, for one client, on one product.
 *
 * The shop does not sell to everyone at the same price. A regular who takes a
 * lorry-load every week is quoted less than a stranger, and that quote has to
 * hold next time without anyone remembering the number.
 */
export class ClientPriceEntity extends Entity<IClientPrice> implements IClientPrice {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  clientId: string;
  productId: string;
  price: number;
  listPrice?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;

  constructor(attr: Partial<IClientPrice>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.CLIENT_PRICE;
    this.sk = attr.sk as string;
    this.dataType = DataType.CLIENT_PRICE;
    this.clientId = attr.clientId as string;
    this.productId = attr.productId as string;
    this.price = attr.price as number;
    this.listPrice = attr.listPrice;
    this.note = attr.note;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
  }

  protected getIndexMap(): Record<string, string> {
    return {};
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }
}

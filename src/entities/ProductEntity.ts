import { Entity } from './Entity';
import { IProduct } from '@libs/interfaces';
import { DataType, ProductStatus } from '@libs/enums';
import { productAlerts } from '@libs/product-alerts';

export class ProductEntity extends Entity<IProduct> implements IProduct {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  name: { fr: string; ar: string };
  description?: { fr?: string; ar?: string };
  purchasePrice: number;
  priceHT: number;
  taxRate: number;
  priceTTC: number;
  code: string;
  aliases: string[];
  discountedPrice?: number;
  discountPercentage?: number;
  stockAvailable: number;
  categoryId: string;
  status: ProductStatus;
  imageUrl?: string;
  imageUrlWebp?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IProduct>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.PRODUCT;
    this.sk = attr.sk as string;
    this.dataType = DataType.PRODUCT;
    this.name = attr.name as { fr: string; ar: string };
    this.description = attr.description;
    this.purchasePrice = attr.purchasePrice ?? 0;
    this.priceHT = attr.priceHT as number;
    this.taxRate = attr.taxRate ?? 19;
    this.priceTTC = attr.priceTTC as number;
    this.code = attr.code as string;
    this.aliases = attr.aliases ?? [];
    this.discountedPrice = attr.discountedPrice;
    this.discountPercentage = attr.discountPercentage;
    this.stockAvailable = attr.stockAvailable ?? 0;
    this.categoryId = attr.categoryId as string;
    this.status = attr.status ?? ProductStatus.ACTIVE;
    this.imageUrl = attr.imageUrl;
    this.imageUrlWebp = attr.imageUrlWebp;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-type-resource: query by dataType, range over status
      tk: ['status'],
      // gsi-parent-resource: query all products in a category
      fk: ['categoryId'],
      // gsi-resource-created: query by dataType, range over createdAt for time-sorted listing
      sihk: ['createdAt'],
      // gsi-status-created: query by dataType + filter by status, sorted by createdAt
      sehk: ['status', 'createdAt'],
    };
  }

  private buildSearchKey(): string {
    const fr = this.name?.fr ?? '';
    const ar = this.name?.ar ?? '';
    const code = this.code ?? '';
    const aliases = (this.aliases ?? []).join(' ');
    return `${fr} ${ar} ${code} ${aliases}`.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  valueOf(): Partial<IProduct> {
    const base = super.valueOf() as Record<string, any>;
    return { ...base, searchKey: this.buildSearchKey() } as Partial<IProduct>;
  }

  getDirty(): Partial<IProduct> {
    const base = super.getDirty() as Record<string, any>;
    if ('name' in base || 'code' in base || 'aliases' in base) {
      base.searchKey = this.buildSearchKey();
    }
    return base as Partial<IProduct>;
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    // Worked out on the way out rather than stored, so a product that is put
    // right stops being flagged the moment it is saved, with nothing to
    // recompute and no stale flag left behind on the record.
    return { ...rest, alerts: productAlerts(this) };
  }

  /**
   * Like toPublicDTO() but strips the supplier cost.
   *
   * Use this for every unauthenticated response. purchasePrice is what the
   * business pays its suppliers, and the storefront endpoints are open.
   *
   * The alerts go with it: they are read off the cost, so "sold below
   * purchase" tells a stranger what the shop pays as surely as the number
   * would, and none of it is any of a customer's business.
   */
  toCustomerDTO(): Record<string, any> {
    const { purchasePrice: _purchasePrice, alerts: _alerts, ...rest } = this.toPublicDTO();
    return rest;
  }
}

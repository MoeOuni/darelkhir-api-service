import { Entity } from './Entity';
import { ISupplier } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * A supplier the shop buys from.
 *
 * `purchasePrice` sits on the product with no record of who sold it at that
 * price. This is the other half: who they are and how to reach them.
 */
export class SupplierEntity extends Entity<ISupplier> implements ISupplier {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  name: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<ISupplier>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.SUPPLIER;
    this.sk = attr.sk as string;
    this.dataType = DataType.SUPPLIER;
    this.name = attr.name ?? '';
    this.phone = attr.phone ?? '';
    this.secondaryPhone = attr.secondaryPhone;
    this.email = attr.email;
    this.address = attr.address;
    this.taxId = attr.taxId;
    this.notes = attr.notes;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return { sihk: ['createdAt'] };
  }

  private buildSearchKey(): string {
    return [this.name, this.phone, this.email].filter(Boolean).join(' ').toLowerCase();
  }

  valueOf(): Partial<ISupplier> {
    const base = super.valueOf() as Record<string, any>;
    return { ...base, searchKey: this.buildSearchKey() } as Partial<ISupplier>;
  }

  getDirty(): Partial<ISupplier> {
    const base = super.getDirty() as Record<string, any>;
    if (['name', 'phone', 'email'].some((f) => f in base)) {
      base.searchKey = this.buildSearchKey();
    }
    return base as Partial<ISupplier>;
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }
}

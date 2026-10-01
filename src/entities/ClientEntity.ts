import { Entity } from './Entity';
import { IClient, IAddress } from '@libs/interfaces';
import { DataType } from '@libs/enums';
import { buildClientSearchKey } from '@libs/search-key';

export class ClientEntity extends Entity<IClient> implements IClient {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  fullName: string;
  email?: string;
  phone?: string;
  addresses: IAddress[];
  totalInvoiced?: number;
  totalPaid?: number;
  openingBalance?: number;
  openingBalanceAt?: string;
  openingBalanceNote?: string;
  balance?: number;
  lastActivityAt?: string;
  hasPaperBalance?: boolean;
  cin?: string;
  taxId?: string;
  paymentNote?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IClient>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.CLIENT;
    this.sk = attr.sk as string;
    this.dataType = DataType.CLIENT;
    this.fullName = attr.fullName as string;
    this.email = attr.email;
    this.phone = attr.phone;
    this.addresses = attr.addresses ?? [];
    this.totalInvoiced = attr.totalInvoiced ?? 0;
    this.totalPaid = attr.totalPaid ?? 0;
    this.openingBalance = attr.openingBalance ?? 0;
    this.openingBalanceAt = attr.openingBalanceAt;
    this.openingBalanceNote = attr.openingBalanceNote;
    this.balance = attr.balance ?? 0;
    this.lastActivityAt = attr.lastActivityAt;
    this.hasPaperBalance = attr.hasPaperBalance ?? false;
    this.cin = attr.cin;
    this.taxId = attr.taxId;
    this.paymentNote = attr.paymentNote;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-type-resource: query by dataType, range over createdAt
      tk: ['createdAt'],
      // gsi-resource-created: list clients sorted by creation date
      sihk: ['createdAt'],
    };
  }

  private buildSearchKey(): string {
    return buildClientSearchKey(this);
  }

  valueOf(): Partial<IClient> {
    const base = super.valueOf() as Record<string, any>;
    return { ...base, searchKey: this.buildSearchKey() } as Partial<IClient>;
  }

  getDirty(): Partial<IClient> {
    const base = super.getDirty() as Record<string, any>;
    // Recompute searchKey whenever any component field changes
    const components = ['fullName', 'email', 'phone', 'cin', 'taxId', 'addresses'];
    if (components.some((f) => f in base)) {
      base.searchKey = this.buildSearchKey();
    }
    return base as Partial<IClient>;
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }

  /**
   * The same record without what the client owes.
   *
   * A worker who may take orders does not automatically get to see every
   * client's debt — that is `payments.view`.
   */
  toDebtFreeDTO(): Record<string, any> {
    const { balance, hasPaperBalance, paperBalanceNote, ...rest } = this.toPublicDTO();
    return rest;
  }
}

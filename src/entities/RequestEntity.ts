import { Entity } from './Entity';
import { IRequest } from '@libs/interfaces';
import { DataType, RequestStatus } from '@libs/enums';

/**
 * Something a customer asked for that the shop did not have.
 *
 * Nothing recorded this before, so it lived in somebody's memory. Once the
 * goods arrive the list says who to call.
 */
export class RequestEntity extends Entity<IRequest> implements IRequest {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  clientId?: string;
  clientName: string;
  clientPhone: string;
  description: string;
  productId?: string;
  quantity?: number;
  status: RequestStatus;
  notes?: string;
  notifiedAt?: string;
  recordedBy?: string;
  recordedByName?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IRequest>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.REQUEST;
    this.sk = attr.sk as string;
    this.dataType = DataType.REQUEST;
    this.clientId = attr.clientId;
    this.clientName = attr.clientName ?? '';
    this.clientPhone = attr.clientPhone ?? '';
    this.description = attr.description ?? '';
    this.productId = attr.productId;
    this.quantity = attr.quantity;
    this.status = attr.status ?? RequestStatus.OPEN;
    this.notes = attr.notes;
    this.notifiedAt = attr.notifiedAt;
    this.recordedBy = attr.recordedBy;
    this.recordedByName = attr.recordedByName;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return { sihk: ['createdAt'] };
  }

  private buildSearchKey(): string {
    return [this.clientName, this.clientPhone, this.description]
      .filter(Boolean).join(' ').toLowerCase();
  }

  valueOf(): Partial<IRequest> {
    const base = super.valueOf() as Record<string, any>;
    return { ...base, searchKey: this.buildSearchKey() } as Partial<IRequest>;
  }

  getDirty(): Partial<IRequest> {
    const base = super.getDirty() as Record<string, any>;
    if (['clientName', 'clientPhone', 'description'].some((f) => f in base)) {
      base.searchKey = this.buildSearchKey();
    }
    return base as Partial<IRequest>;
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }
}

import { Entity } from './Entity';
import { IAuditLog } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * Who did what, and when.
 *
 * Written for every request that changes data. Nothing recorded that an order
 * total moved at 19:00, or which worker cancelled an invoice, until now.
 *
 * An audit row is never edited or erased. That is the whole point of it.
 */
export class AuditLogEntity extends Entity<IAuditLog> implements IAuditLog {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  /** Short action key, for example `order.confirm` or `payment.create`. */
  action: string;
  /** What was touched: `order`, `product`, `client`, `payment`, `settings`. */
  entityType: string;
  entityId?: string;
  /** One line a human can read without opening anything else. */
  summary: string;
  actorId?: string;
  actorName?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  /** Request body with passwords and tokens removed. */
  details?: Record<string, any>;
  /** Readable facts: order number, client name, amount, and so on. */
  meta?: Record<string, any>;
  /** Lowercase haystack of the action and the meta, for searching. */
  searchKey?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IAuditLog>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.AUDIT_LOG;
    this.sk = attr.sk as string;
    this.dataType = DataType.AUDIT_LOG;
    this.action = attr.action as string;
    this.entityType = attr.entityType ?? '';
    this.entityId = attr.entityId;
    this.summary = attr.summary ?? '';
    this.actorId = attr.actorId;
    this.actorName = attr.actorName;
    this.method = attr.method;
    this.path = attr.path;
    this.statusCode = attr.statusCode;
    this.details = attr.details;
    this.meta = attr.meta;
    this.searchKey = attr.searchKey;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // Everything one record ever went through.
      fk: ['entityId'],
      // The whole journal in date order.
      sihk: ['createdAt'],
    };
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }
}

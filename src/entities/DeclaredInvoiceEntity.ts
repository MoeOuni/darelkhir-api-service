import { Entity } from './Entity';
import { IDeclaredInvoice, IDeclaredLine } from '@libs/interfaces';
import { DataType, PaymentType } from '@libs/enums';

/**
 * A declared invoice: the paper the government sees.
 *
 * Its number lives in the sort key, which is the whole point — a second write
 * of 2026/014 is refused by the database rather than by a lookup another
 * writer can slip past between the check and the write.
 */
export class DeclaredInvoiceEntity
  extends Entity<IDeclaredInvoice>
  implements IDeclaredInvoice
{
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  number: string;
  status: 'draft' | 'final';
  issuedAt: string;
  fiscalName: string;
  fiscalAddress?: string;
  taxId?: string;
  cin?: string;
  phone?: string;
  paymentMethod?: PaymentType;
  lines: IDeclaredLine[];
  subtotal: number;
  tax: number;
  timber: number;
  total: number;
  notes?: string;
  sourceOrderId?: string;
  finalisedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IDeclaredInvoice>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.DECLARED_INVOICE;
    this.sk = attr.sk as string;
    this.dataType = DataType.DECLARED_INVOICE;
    this.number = attr.number as string;
    this.status = attr.status ?? 'draft';
    this.issuedAt = attr.issuedAt as string;
    this.fiscalName = attr.fiscalName as string;
    this.fiscalAddress = attr.fiscalAddress;
    this.taxId = attr.taxId;
    this.cin = attr.cin;
    this.phone = attr.phone;
    this.paymentMethod = attr.paymentMethod;
    this.lines = attr.lines ?? [];
    this.subtotal = attr.subtotal ?? 0;
    this.tax = attr.tax ?? 0;
    this.timber = attr.timber ?? 0;
    this.total = attr.total ?? 0;
    this.notes = attr.notes;
    this.sourceOrderId = attr.sourceOrderId;
    this.finalisedAt = attr.finalisedAt;
    this.createdBy = attr.createdBy;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-resource-created: the list reads newest first, like every other.
      sihk: ['createdAt'],
    };
  }

  /** Nothing may change once it is final; the paper is already elsewhere. */
  get isFinal(): boolean {
    return this.status === 'final';
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }
}

/**
 * The sort key a number belongs under.
 *
 * Trimmed and upper-cased so "2026/014" and " 2026/014 " are the same paper.
 * Without this the key stops guaranteeing anything: two spellings of one number
 * are two rows, and the shop has issued the same number twice believing the
 * system prevented it.
 */
export function declaredKey(number: string): string {
  return `${DataType.DECLARED_INVOICE}#${number.trim().toUpperCase()}`;
}

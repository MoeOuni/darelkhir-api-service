import { Entity } from './Entity';
import { IPayment } from '@libs/interfaces';
import { DataType, PaymentType, CheckStatus } from '@libs/enums';

/**
 * Money received from a client.
 *
 * A payment belongs to a client, not to an order. `orderId` is a note that
 * prints on the receipt when the client says "this is for the equipment"; it
 * never affects any total.
 *
 * A reversal is a second record with a negative amount, never a deletion. The
 * client handed over that check, and the book has to show it.
 */
export class PaymentEntity extends Entity<IPayment> implements IPayment {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  clientId: string;
  amount: number;
  method: PaymentType;
  paidAt: string;
  reference?: string;
  orderId?: string;
  recordedBy?: string;
  notes?: string;
  checkNumber?: string;
  bankName?: string;
  dueDate?: string;
  checkStatus?: CheckStatus;
  reversesPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IPayment>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.PAYMENT;
    this.sk = attr.sk as string;
    this.dataType = DataType.PAYMENT;
    this.clientId = attr.clientId as string;
    this.amount = attr.amount ?? 0;
    this.method = attr.method ?? PaymentType.CASH;
    this.paidAt = attr.paidAt as string;
    this.reference = attr.reference;
    this.orderId = attr.orderId;
    this.recordedBy = attr.recordedBy;
    this.notes = attr.notes;
    this.checkNumber = attr.checkNumber;
    this.bankName = attr.bankName;
    this.dueDate = attr.dueDate;
    this.checkStatus = attr.checkStatus;
    this.reversesPaymentId = attr.reversesPaymentId;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-parent-resource: every payment of one client
      fk: ['clientId'],
      // gsi-resource-created: payments in date order
      sihk: ['paidAt'],
    };
  }

  /** A held check is a promise, not cash in the bank. */
  get isCashInHand(): boolean {
    if (this.method !== PaymentType.CHECK) return true;
    return this.checkStatus === CheckStatus.CASHED;
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, ...rest } = this.valueOf() as any;
    return rest;
  }
}

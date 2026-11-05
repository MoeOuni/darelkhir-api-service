import { Entity } from './Entity';
import { ICharge } from '@libs/interfaces';
import { ChargeCategory, DataType, PaymentType } from '@libs/enums';

export class ChargeEntity extends Entity<ICharge> implements ICharge {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  date: string;
  amount: number;
  category: ChargeCategory;
  beneficiary?: string;
  description?: string;
  method: PaymentType;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;

  constructor(attr: Partial<ICharge>) {
    super(attr);
    this.id = DataType.CHARGE;
    this.sk = attr.sk as string;
    this.dataType = DataType.CHARGE;
    this.date = attr.date as string;
    this.amount = attr.amount ?? 0;
    this.category = attr.category ?? ChargeCategory.OTHER;
    this.beneficiary = attr.beneficiary;
    this.description = attr.description;
    this.method = attr.method ?? PaymentType.CASH;
    this.createdBy = attr.createdBy;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
  }

  protected getIndexMap() {
    return {};
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return { ...rest, id: (this.sk as string).split('#')[1] };
  }
}

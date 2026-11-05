import { Entity } from './Entity';
import { ISupplierDebt, ISupplierDebtPayment } from '@libs/interfaces';
import { DataType } from '@libs/enums';

export class SupplierDebtEntity extends Entity<ISupplierDebt> implements ISupplierDebt {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  supplierName: string;
  reference?: string;
  date: string;
  total: number;
  paid: number;
  payments: ISupplierDebtPayment[];
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;

  constructor(attr: Partial<ISupplierDebt>) {
    super(attr);
    this.id = DataType.SUPPLIER_DEBT;
    this.sk = attr.sk as string;
    this.dataType = DataType.SUPPLIER_DEBT;
    this.supplierName = attr.supplierName ?? '';
    this.reference = attr.reference;
    this.date = attr.date as string;
    this.total = attr.total ?? 0;
    this.paid = attr.paid ?? 0;
    this.payments = attr.payments ?? [];
    this.notes = attr.notes;
    this.createdBy = attr.createdBy;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
  }

  protected getIndexMap() {
    return {};
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return {
      ...rest,
      id: (this.sk as string).split('#')[1],
      remaining: Math.round((this.total - this.paid) * 1000) / 1000,
    };
  }
}

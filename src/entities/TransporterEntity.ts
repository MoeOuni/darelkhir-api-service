import { Entity } from './Entity';
import { ITransporter } from '@libs/interfaces';
import { DataType } from '@libs/enums';

export class TransporterEntity extends Entity<ITransporter> implements ITransporter {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  name: string;
  /** A driver often has no number to give, so this may be absent. */
  phone?: string;
  secondaryPhone?: string;
  vehiclePlateNumber?: string;
  cin?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<ITransporter>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.TRANSPORTER;
    this.sk = attr.sk as string;
    this.dataType = DataType.TRANSPORTER;
    this.name = attr.name as string;
    this.phone = attr.phone;
    this.secondaryPhone = attr.secondaryPhone;
    this.vehiclePlateNumber = attr.vehiclePlateNumber;
    this.cin = attr.cin;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-resource-created: list transporters sorted by creation date
      sihk: ['createdAt'],
    };
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sehk, ...rest } = this.valueOf() as any;
    return rest;
  }
}

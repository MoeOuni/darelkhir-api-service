import { Entity } from './Entity';
import { IStaff } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * A staff member.
 *
 * Cognito holds the credentials. This record holds who they are inside the
 * business and which role they carry. The two are joined by the Cognito `sub`,
 * which is the `sk` of this record.
 */
export class StaffEntity extends Entity<IStaff> implements IStaff {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  /** Cognito sub. Same value as the sk suffix. */
  sub: string;
  name: string;
  phone: string;
  email?: string;
  roleId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IStaff>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.STAFF;
    this.sk = attr.sk as string;
    this.dataType = DataType.STAFF;
    this.sub = attr.sub as string;
    this.name = attr.name ?? '';
    this.phone = attr.phone ?? '';
    this.email = attr.email;
    this.roleId = attr.roleId as string;
    this.active = attr.active ?? true;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return { sihk: ['createdAt'] };
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, ...rest } = this.valueOf() as any;
    return rest;
  }
}

import { Entity } from './Entity';
import { IRole } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * A role the owner writes themselves: a name and a set of ticked permissions.
 *
 * There are no fixed roles in the code. The owner creates as many as the shop
 * needs.
 */
export class RoleEntity extends Entity<IRole> implements IRole {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  roleId: string;
  name: string;
  description?: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IRole>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.ROLE;
    this.sk = attr.sk as string;
    this.dataType = DataType.ROLE;
    this.roleId = attr.roleId as string;
    this.name = attr.name ?? '';
    this.description = attr.description;
    this.permissions = attr.permissions ?? [];
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

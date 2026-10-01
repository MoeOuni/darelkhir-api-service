import { Entity } from './Entity';
import { ICategory } from '@libs/interfaces';
import { DataType, CategoryStatus } from '@libs/enums';

export class CategoryEntity extends Entity<ICategory> implements ICategory {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  name: { fr: string; ar: string };
  description?: { fr?: string; ar?: string };
  parentCategoryId?: string;
  status: CategoryStatus;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<ICategory>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.CATEGORY;
    this.sk = attr.sk as string;
    this.dataType = DataType.CATEGORY;
    this.name = attr.name as { fr: string; ar: string };
    this.description = attr.description;
    this.parentCategoryId = attr.parentCategoryId;
    this.status = attr.status ?? CategoryStatus.ACTIVE;
    this.imageUrl = attr.imageUrl;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-type-resource: query by dataType, range by status
      tk: ['status'],
      // gsi-parent-resource: get subcategories of a parent
      fk: ['parentCategoryId'],
      // gsi-resource-created: list categories sorted by creation date
      sihk: ['createdAt'],
    };
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, ...rest } = this.valueOf() as any;
    return rest;
  }
}

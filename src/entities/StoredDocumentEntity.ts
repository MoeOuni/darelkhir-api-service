import { Entity } from './Entity';
import { IStoredDocument } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * A file that was produced once and kept.
 *
 * The row is not the file — the file is in S3 and this says where. Keeping the
 * record separately is what makes the bucket searchable: S3 can list a prefix
 * but it cannot answer "every paper raised for 2026/014, newest first", and a
 * shop asked for a document a year later has only the number to go on.
 */
export class StoredDocumentEntity extends Entity<IStoredDocument> implements IStoredDocument {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  declaredNumber: string;
  s3Key: string;
  filename: string;
  bytes: number;
  contentType: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IStoredDocument>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.STORED_DOCUMENT;
    this.sk = attr.sk as string;
    this.dataType = DataType.STORED_DOCUMENT;
    this.declaredNumber = attr.declaredNumber as string;
    this.s3Key = attr.s3Key as string;
    this.filename = attr.filename as string;
    this.bytes = attr.bytes ?? 0;
    this.contentType = attr.contentType ?? 'application/pdf';
    this.createdBy = attr.createdBy;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return { sihk: ['createdAt'] };
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }
}

/**
 * Where one rendering is filed.
 *
 * The invoice number comes first so every paper raised for 2026/014 sits
 * together under one prefix, and the timestamp second so a reprint is a new
 * row rather than one that overwrites the copy already sent to the accountant.
 */
export function storedKey(declaredNumber: string, at: string): string {
  return `${DataType.STORED_DOCUMENT}#${declaredNumber.trim().toUpperCase()}#${at}`;
}

/** The prefix covering every file kept for one declared invoice. */
export function storedPrefix(declaredNumber: string): string {
  return `${DataType.STORED_DOCUMENT}#${declaredNumber.trim().toUpperCase()}#`;
}

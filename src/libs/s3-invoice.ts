import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from './config';

const s3 = new S3Client({});

/** How long a generated invoice link stays valid, in seconds. */
export const INVOICE_URL_TTL_SECONDS = 15 * 60;

export function buildInvoiceKey(orderNumber: number): string {
  return `invoices/facture-${String(orderNumber).padStart(3, '0')}.pdf`;
}

import type { DocumentKind } from './invoice';

/**
 * Each kind gets its own prefix so a proforma can never overwrite an invoice.
 *
 * Invoice numbers are bare and padded to three digits (001, 999, 1203). Credit
 * notes carry AV- so the two papers are never confused on a desk.
 */
export function buildDocumentKey(
  kind: DocumentKind,
  number: number,
  /** Which drop on the round, for a stop paper. Counted from 1. */
  stopIndex?: number,
): string {
  // A declared invoice is numbered by hand and in the shop's own fiscal
  // sequence, so it has no place in a builder that pads a counter to three
  // digits. Silently filing 2026/014 under `invoices/facture-NaN.pdf` is worse
  // than refusing: use buildDeclaredKey.
  if (kind === 'declared') {
    throw new Error('Declared invoices are keyed by buildDeclaredKey, not by number');
  }

  const padded = String(number).padStart(3, '0');
  if (kind === 'proforma') return `proformas/devis-${padded}.pdf`;
  if (kind === 'credit_note') return `credit-notes/AV-${padded}.pdf`;
  // Each drop gets its own object, so reprinting stop 2 never overwrites the
  // paper the driver already left at stop 1.
  if (kind === 'stop') return `stops/facture-${padded}-${stopIndex}.pdf`;
  // A delivery note is filed under the invoice it belongs to, one object per
  // drop so reprinting one never overwrites another.
  if (kind === 'delivery_note') {
    return stopIndex === undefined
      ? `delivery-notes/BL-${padded}.pdf`
      : `delivery-notes/BL-${padded}-${stopIndex}.pdf`;
  }
  // The whole dossier — invoice and every delivery note — as one file.
  if (kind === 'bundle') return `bundles/dossier-${padded}.pdf`;
  return `invoices/facture-${padded}.pdf`;
}

/**
 * Whether the copy already in the bucket is still good.
 *
 * Rendering a PDF costs far more than asking S3 when it last wrote one. If the
 * object is newer than the last change to the order, nothing about it can have
 * moved, so the stored file is handed back instead of building it again.
 *
 * Any doubt answers false: a missing object, a clock oddity or an S3 hiccup
 * all fall through to a fresh render, which is always correct.
 */
export async function documentIsCurrent(key: string, changedAt?: string): Promise<boolean> {
  if (!changedAt) return false;

  const changed = new Date(changedAt).getTime();
  if (Number.isNaN(changed)) return false;

  try {
    const { s3BucketName } = getConfig();
    const head = await s3.send(new HeadObjectCommand({ Bucket: s3BucketName, Key: key }));
    const written = head.LastModified?.getTime();
    return written !== undefined && written >= changed;
  } catch {
    return false;
  }
}

export async function uploadDocumentToS3(
  pdfBuffer: Buffer,
  kind: DocumentKind,
  number: number,
  stopIndex?: number,
): Promise<string> {
  const { s3BucketName } = getConfig();
  const key = buildDocumentKey(kind, number, stopIndex);

  await s3.send(
    new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: { 'document-kind': kind, number: String(number) },
    })
  );

  return key;
}


/** Stores a rendered PDF at a key the caller chose, and returns that key. */
export async function uploadPdfToS3(
  pdfBuffer: Buffer,
  key: string,
  metadata?: Record<string, string>,
): Promise<string> {
  const { s3BucketName } = getConfig();

  await s3.send(
    new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: metadata,
    })
  );

  return key;
}

/**
 * Uploads the rendered invoice and returns the S3 object key.
 *
 * The key is what gets persisted on the order — not a URL. Invoices are no
 * longer public, so every download goes through a presigned URL generated per
 * request. A stored URL would expire and go stale on the order.
 */
export async function uploadInvoiceToS3(pdfBuffer: Buffer, orderNumber: number): Promise<string> {
  const { s3BucketName } = getConfig();
  const key = buildInvoiceKey(orderNumber);

  await s3.send(
    new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      CacheControl: 'no-store, no-cache, must-revalidate',
      Metadata: {
        'order-number': String(orderNumber),
      },
    })
  );

  return key;
}

/** Builds a short-lived download link for a document already stored in S3. */
export async function getInvoiceDownloadUrl(key: string): Promise<string> {
  const { s3BucketName } = getConfig();

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: s3BucketName, Key: key }),
    { expiresIn: INVOICE_URL_TTL_SECONDS }
  );
}

/** Same short-lived link, for any of the order documents. */
export const getDocumentDownloadUrl = getInvoiceDownloadUrl;

import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';
import { StoredDocumentRepository } from '@/repositories/StoredDocumentRepository';
import { StoredDocumentEntity, storedKey } from '@/entities/StoredDocumentEntity';
import { NotFoundError } from '@libs/errors';
import { DataType } from '@libs/enums';
import { renderDeclaredPdf, buildDeclaredKey, declaredFilename } from '@libs/declared-document';
import { uploadPdfToS3, getDocumentDownloadUrl, documentIsCurrent } from '@libs/s3-invoice';

/**
 * Renders a declared invoice and files the result.
 *
 * Both the S3 key and the register row are keyed on when the invoice last
 * changed, which makes reprinting free and honest at once: asking twice for an
 * unchanged paper hands back the same file rather than building a second one,
 * and an edit produces a new file beside the old rather than quietly replacing
 * what somebody has already sent to their accountant.
 */
export class GetDeclaredDocumentUseCase {
  constructor(
    private repository: DeclaredInvoiceRepository,
    private documents: StoredDocumentRepository,
  ) {}

  async execute(number: string, actorId?: string): Promise<{ url: string; filename: string }> {
    const invoice = await this.repository.findByNumber(number);
    if (!invoice) throw new NotFoundError('Declared invoice not found');

    const version = invoice.updatedAt;
    const key = buildDeclaredKey(invoice.number, version);
    const filename = declaredFilename(invoice.number);

    if (await documentIsCurrent(key, version)) {
      return { url: await getDocumentDownloadUrl(key), filename };
    }

    const pdf = await renderDeclaredPdf(invoice);
    await uploadPdfToS3(pdf, key, {
      'declared-number': invoice.number,
      status: invoice.status,
    });

    const now = new Date().toISOString();
    // Same sort key for the same version, so a reprint updates the row it
    // already has instead of adding a duplicate to the register.
    await this.documents.record(
      new StoredDocumentEntity({
        id: DataType.STORED_DOCUMENT,
        sk: storedKey(invoice.number, version),
        dataType: DataType.STORED_DOCUMENT,
        declaredNumber: invoice.number,
        s3Key: key,
        filename,
        bytes: pdf.length,
        contentType: 'application/pdf',
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      }),
    );

    return { url: await getDocumentDownloadUrl(key), filename };
  }
}

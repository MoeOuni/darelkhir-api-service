import { OrderRepository } from '@/repositories/OrderRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import { renderOrderInvoicePdf, type DocumentKind } from '@libs/invoice';
import {
  uploadDocumentToS3,
  getDocumentDownloadUrl,
  buildDocumentKey,
  documentIsCurrent,
} from '@libs/s3-invoice';

/**
 * Produces one of the order documents and returns a short-lived download link.
 *
 * The kinds behave differently on purpose:
 *
 * - `proforma` needs no invoice and takes no number. It is the paper a client
 *   reads before agreeing, so last-minute changes cost nothing.
 * - `invoice` requires that a fiscal number was already issued at confirmation.
 * - `credit_note` requires an invoice to cancel.
 * - `stop`, `delivery_note` and `bundle` are all numbered from the invoice, so
 *   they require one to exist.
 */
export class GetOrderDocumentUseCase {
  constructor(
    private repository: OrderRepository,
    private clientRepository: ClientRepository,
    private transporterRepository: TransporterRepository,
  ) {}

  async execute(uuid: string, kind: DocumentKind, stopIndex?: number): Promise<string> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Order not found');
    }

    if (kind === 'invoice' && !entity.isInvoiced) {
      throw new ValidationError(
        'This order has no invoice yet. Confirm it first, or print a proforma.'
      );
    }

    if (kind === 'credit_note' && !entity.creditNoteNumber) {
      throw new ValidationError('This order has no credit note.');
    }

    // Stop papers, delivery notes and the bundle all hang off the invoice:
    // they are numbered from it, so it has to exist before any of them print.
    if (kind === 'stop' || kind === 'delivery_note' || kind === 'bundle') {
      if (!entity.isInvoiced) {
        throw new ValidationError(
          'This order has no invoice yet. Confirm it before printing the delivery papers.',
        );
      }
    }

    // A stop paper is always for one drop. A delivery note is for one drop
    // only when asked for one; otherwise it covers the whole load.
    if (kind === 'stop' || (kind === 'delivery_note' && stopIndex !== undefined)) {
      const stops = entity.stops ?? [];
      if (!stopIndex || stopIndex < 1 || stopIndex > stops.length) {
        throw new ValidationError(`Stop ${stopIndex ?? ''} does not exist on this order.`);
      }
    }

    // Everything numbered from the invoice is filed under the invoice number,
    // so the object key reads the same as the reference printed on the paper.
    const number =
      kind === 'credit_note'
        ? entity.creditNoteNumber!
        : kind === 'proforma'
          ? entity.orderNumber
          : entity.invoiceNumber!;

    const key = buildDocumentKey(kind, number, stopIndex);

    // Nothing has changed since this was last written, so hand back the file
    // that is already there rather than building the same PDF again.
    if (await documentIsCurrent(key, entity.updatedAt)) {
      return getDocumentDownloadUrl(key);
    }

    // The order record is written first, so the object that follows is always
    // stamped later than the change it was rendered from.
    if (kind === 'invoice' && entity.invoicePdfKey !== key) {
      entity.set({ invoicePdfKey: key, updatedAt: new Date().toISOString() });
      await this.repository.update(entity);
    }

    const order = entity.toPublicDTO();
    const client = await this.clientRepository.findByUuid(entity.clientId);
    const transporter = entity.transporterId
      ? await this.transporterRepository.findByUuid(entity.transporterId)
      : null;

    const pdfBuffer = await renderOrderInvoicePdf(order as any, {
      kind,
      stopIndex,
      clientPhone: client?.phone,
      clientCin: client?.cin,
      clientTaxId: client?.taxId,
      transporter: transporter
        ? {
          name: transporter.name,
          phone: transporter.phone,
          cin: transporter.cin,
          vehiclePlateNumber: transporter.vehiclePlateNumber,
        }
        : undefined,
    });

    await uploadDocumentToS3(pdfBuffer, kind, number, stopIndex);

    return getDocumentDownloadUrl(key);
  }
}

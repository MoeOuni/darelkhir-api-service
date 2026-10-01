import { IDeclaredInvoice, IOrder, IOrderItem } from './interfaces';
import { DataType, OrderStatus, PaymentMethod, PaymentType } from './enums';
import { renderOrderInvoicePdf } from './invoice';

/**
 * A number as it can safely appear in a filename and an S3 key.
 *
 * Fiscal numbers here are written "2026/014", and a slash in an S3 key makes a
 * folder — the file would land under a directory named for the year and be
 * lost to anyone looking for it under the invoice. Every separator becomes a
 * dash, which is the same transformation the APK naming does and for the same
 * reason: file managers and people both cope badly with clever names.
 */
export function safeNumber(number: string): string {
  return number.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Where one rendering of a declared invoice is stored. */
export function buildDeclaredKey(number: string, at: string): string {
  return `declared/${safeNumber(number)}/${at.replace(/[:.]/g, '-')}.pdf`;
}

/** What the file is called when someone downloads it. */
export function declaredFilename(number: string): string {
  return `FACTURE-${safeNumber(number)}.pdf`;
}

/**
 * Dresses a declared invoice as an order, so it can go through the one
 * renderer.
 *
 * There is exactly one invoice template in this codebase and it has been
 * corrected many times — the Arabic runs, the address that overlapped the
 * second line, the stamp that was charged three times on a three-drop round. A
 * second template drawn for this document would start with none of those
 * fixes, and the two papers would drift apart in ways nobody notices until an
 * inspector has both on the desk.
 *
 * So the shape is borrowed and the fields it does not have are left empty:
 * there is no client id here, no lorry, no counter number. The renderer is
 * told `kind: 'declared'` and takes the number from the context.
 */
export function declaredAsOrder(invoice: IDeclaredInvoice): IOrder {
  const items: IOrderItem[] = invoice.lines.map((line) => ({
    productId: '',
    code: line.code,
    name: line.name,
    // The shop's own cost has no business on a document the government reads,
    // and nothing on the page prints it.
    purchasePrice: 0,
    priceHT: line.priceHT,
    priceTTC: parseFloat((line.priceHT * (1 + line.taxRate / 100)).toFixed(3)),
    taxRate: line.taxRate,
    quantity: line.quantity,
  }));

  return {
    id: DataType.DECLARED_INVOICE,
    sk: invoice.sk,
    dataType: DataType.DECLARED_INVOICE,
    // No counter was consulted and none is printed: the reference on the page
    // comes from `context.declaredNumber`, which is the typed one.
    orderNumber: 0,
    clientId: '',
    customerId: '',
    clientName: invoice.fiscalName,
    status: OrderStatus.CONFIRMED,
    items,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    timber: invoice.timber,
    transport: 0,
    total: invoice.total,
    shippingAddress: { street: invoice.fiscalAddress ?? '' } as IOrder['shippingAddress'],
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    notes: invoice.notes,
    documentDate: invoice.issuedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  } as IOrder;
}

/**
 * How the settlement reads on the paper.
 *
 * French, because the document is French — the shop's own screens show it in
 * whichever language the worker chose, but what goes to the government reads
 * one way.
 */
const PAYMENT_LABELS: Record<PaymentType, string> = {
  [PaymentType.CASH]: 'Espèce',
  [PaymentType.BANK_TRANSFER]: 'Virement bancaire',
  [PaymentType.CHECK]: 'Chèque',
};

export function paymentLabel(method?: PaymentType): string | undefined {
  return method ? PAYMENT_LABELS[method] : undefined;
}

export async function renderDeclaredPdf(invoice: IDeclaredInvoice): Promise<Buffer> {
  return renderOrderInvoicePdf(declaredAsOrder(invoice), {
    kind: 'declared',
    declaredNumber: invoice.number,
    declaredPayment: paymentLabel(invoice.paymentMethod),
    clientTaxId: invoice.taxId,
    clientCin: invoice.cin,
    clientPhone: invoice.phone,
  });
}

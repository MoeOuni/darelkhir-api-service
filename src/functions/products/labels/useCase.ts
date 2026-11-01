import { ProductRepository } from '@/repositories/ProductRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import { renderLabelsPdf, ticketPrice } from '@libs/labels';
import { uploadPdfToS3, getDocumentDownloadUrl } from '@libs/s3-invoice';
import { IdGenerator } from '@/utils/IdGenerator';
import type { ProductLabelsInput } from '@/schemas/labels.schema';

/**
 * Prints price tickets for the products asked for, as many of each as asked.
 *
 * The file is not kept: tickets are printed once and stuck on, so it goes
 * under labels/, which the bucket empties after a day.
 */
export class ProductLabelsUseCase {
  constructor(private products: ProductRepository) {}

  async execute(input: ProductLabelsInput) {
    // The same product picked twice is one line with both counts, in the
    // place it was first picked.
    const copies = new Map<string, number>();
    for (const item of input.items) {
      copies.set(item.productId, (copies.get(item.productId) ?? 0) + item.copies);
    }

    const ids = [...copies.keys()];
    const found = await Promise.all(ids.map((id) => this.products.findByUuid(id)));

    const missing = ids.filter((_, i) => !found[i]);
    if (missing.length) {
      throw new NotFoundError(`Produit introuvable : ${missing.join(', ')}`);
    }

    // Refused rather than printed at 0.000: a ticket with no price on a fridge
    // is worse than no ticket, and the shop has just imported products that
    // are waiting for theirs.
    const unpriced = found.filter((p) => !ticketPrice(p!)).map((p) => p!.code);
    if (unpriced.length) {
      throw new ValidationError(`Sans prix de vente, impossible d'imprimer : ${unpriced.join(', ')}`);
    }

    const { pdf, tickets, pages } = await renderLabelsPdf(
      found.map((p, i) => ({
        product: {
          code: p!.code,
          name: p!.name,
          priceTTC: p!.priceTTC,
          discountedPrice: p!.discountedPrice,
          discountPercentage: p!.discountPercentage,
        },
        copies: copies.get(ids[i])!,
      })),
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `labels/etiquettes-${stamp}-${IdGenerator.generate().slice(0, 8)}.pdf`;
    await uploadPdfToS3(pdf, key, { tickets: String(tickets) });

    return { url: await getDocumentDownloadUrl(key), tickets, pages };
  }
}

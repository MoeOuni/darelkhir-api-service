import { ClientPriceRepository } from '@/repositories/ClientPriceRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientPriceEntity } from '@/entities/ClientPriceEntity';
import { NotFoundError } from '@libs/errors';
import { DataType } from '@libs/enums';
import type { SetClientPriceInput } from '@/schemas/client-price.schema';

/**
 * The prices agreed with one client.
 *
 * These are the shop's memory of "I do it for you at 95". They outlive the
 * order they were agreed on, which is the whole point: next time the number is
 * already there.
 */
export class ClientPricesUseCase {
  constructor(
    private prices: ClientPriceRepository,
    private clients: ClientRepository,
    private products: ProductRepository,
  ) {}

  async list(clientId: string) {
    const rows = await this.prices.listForClient(clientId);

    // The screen shows what the product is called and what it normally costs,
    // so the agreed price can be judged against something.
    const withProduct = await Promise.all(
      rows.map(async (row) => {
        const product = await this.products.findByUuid(row.productId);
        return {
          ...row.toPublicDTO(),
          productName: product ? product.name.fr || product.name.ar : undefined,
          productCode: product?.code,
          listPrice: product ? (product.discountedPrice ?? product.priceTTC) : row.listPrice,
        };
      }),
    );

    return { success: true, message: 'Client prices retrieved', data: { items: withProduct } };
  }

  async set(clientId: string, productId: string, input: SetClientPriceInput) {
    const [client, product] = await Promise.all([
      this.clients.findByUuid(clientId),
      this.products.findByUuid(productId),
    ]);

    if (!client) throw new NotFoundError('Client not found');
    if (!product) throw new NotFoundError('Product not found');

    const now = new Date().toISOString();
    const existing = await this.prices.findOne(clientId, productId);

    const entity = new ClientPriceEntity({
      id: DataType.CLIENT_PRICE,
      sk: ClientPriceRepository.key(clientId, productId),
      dataType: DataType.CLIENT_PRICE,
      clientId,
      productId,
      price: input.price,
      // Kept so a later reader can see what the deal was measured against.
      listPrice: product.discountedPrice ?? product.priceTTC,
      note: input.note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    if (existing) await this.prices.update(entity);
    else await this.prices.create(entity);

    return {
      success: true,
      message: 'Client price saved',
      data: {
        ...entity.toPublicDTO(),
        clientName: client.fullName,
        productName: product.name.fr || product.name.ar,
        productCode: product.code,
      },
    };
  }

  async remove(clientId: string, productId: string) {
    // Read before removing, so the journal entry can name what was dropped
    // rather than recording an anonymous deletion.
    const [client, product] = await Promise.all([
      this.clients.findByUuid(clientId),
      this.products.findByUuid(productId),
    ]);

    await this.prices.removeOne(clientId, productId);

    return {
      success: true,
      message: 'Client price removed',
      data: {
        clientId,
        productId,
        cleared: true,
        clientName: client?.fullName,
        productName: product ? product.name.fr || product.name.ar : undefined,
        productCode: product?.code,
      },
    };
  }
}

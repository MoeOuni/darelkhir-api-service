import { ProductEntity } from '@/entities/ProductEntity';
import { OrderEntity } from '@/entities/OrderEntity';
import { DataType, OrderStatus, ProductStatus } from '@libs/enums';

/**
 * purchasePrice is what the business pays its suppliers. Several endpoints are
 * reachable without a token (storefront product browsing, order tracking), so
 * the cost must never appear in a response built for an anonymous caller.
 */

function makeProduct() {
  return new ProductEntity({
    id: DataType.PRODUCT,
    sk: `${DataType.PRODUCT}#p-1`,
    name: { fr: 'Huile', ar: 'زيت' },
    code: 'HU-01',
    purchasePrice: 12.5,
    priceHT: 20,
    taxRate: 19,
    priceTTC: 23.8,
    stockAvailable: 10,
    categoryId: 'c-1',
    status: ProductStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

function makeOrder() {
  return new OrderEntity({
    id: DataType.ORDER,
    sk: `${DataType.ORDER}#o-1`,
    orderNumber: 41,
    clientId: 'cl-1',
    clientName: 'Slim Ben Ali',
    customerId: 'cl-1',
    status: OrderStatus.CONFIRMED,
    items: [
      {
        productId: 'p-1',
        code: 'HU-01',
        name: 'Huile',
        purchasePrice: 12.5,
        priceHT: 20,
        priceTTC: 23.8,
        taxRate: 19,
        quantity: 2,
      },
    ] as any,
    subtotal: 40,
    tax: 7.6,
    timber: 1,
    transport: 0,
    total: 48.6,
    shippingAddress: { street: 'x', city: 'y', state: 'y', country: 'TN', postalCode: '1220' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('supplier cost is not exposed to anonymous callers', () => {
  it('ProductEntity.toCustomerDTO() removes purchasePrice', () => {
    const dto = makeProduct().toCustomerDTO();

    expect(dto).not.toHaveProperty('purchasePrice');
    // The rest of the product must still be there.
    expect(dto.priceHT).toBe(20);
    expect(dto.code).toBe('HU-01');
  });

  it('ProductEntity.toPublicDTO() keeps purchasePrice for staff', () => {
    expect(makeProduct().toPublicDTO().purchasePrice).toBe(12.5);
  });

  it('OrderEntity.toCustomerDTO() removes purchasePrice from every line', () => {
    const dto = makeOrder().toCustomerDTO();

    for (const item of dto.items as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty('purchasePrice');
    }
    expect((dto.items as any[])[0].priceHT).toBe(20);
    expect(dto.total).toBe(48.6);
  });

  it('OrderEntity.toPublicDTO() keeps purchasePrice for staff', () => {
    expect((makeOrder().toPublicDTO().items as any[])[0].purchasePrice).toBe(12.5);
  });

  it('no DTO leaks internal index keys', () => {
    for (const dto of [makeProduct().toCustomerDTO(), makeOrder().toCustomerDTO()]) {
      for (const key of ['tk', 'fk', 'sihk', 'sehk', 'searchKey']) {
        expect(dto).not.toHaveProperty(key);
      }
    }
  });
});

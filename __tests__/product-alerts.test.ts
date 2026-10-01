import { productAlerts, sellingPriceHT, needsAttention } from '@libs/product-alerts';
import { ProductEntity } from '@/entities/ProductEntity';
import { DataType, ProductStatus } from '@libs/enums';

/**
 * Settings on a product that cannot be right.
 *
 * The purchase price defaults to zero, so a product added in a hurry carries
 * no cost at all — and every one of the twelve articles the shop imported came
 * in that way. Nothing said so, and the margin in the morning report counted
 * the whole sale price as profit.
 */

const product = (over: Record<string, any> = {}) => ({
  purchasePrice: 60,
  priceHT: 84.034,
  taxRate: 19,
  priceTTC: 100,
  ...over,
});

describe('what the shop charges before tax', () => {
  it('is the catalogue price when nothing is reduced', () => {
    expect(sellingPriceHT(product())).toBeCloseTo(84.034, 3);
  });

  it('takes the tax back out of a reduced price, which is written tax-included', () => {
    // 95 TTC at 19% is 79.83 HT — above a 60 cost, so this is a healthy sale.
    expect(sellingPriceHT(product({ discountedPrice: 95 }))).toBeCloseTo(79.832, 3);
  });

  it('has no answer for a product with no price at all', () => {
    expect(sellingPriceHT(product({ priceHT: 0 }))).toBeUndefined();
  });
});

describe('a product with nothing wrong with it', () => {
  it('raises no alert', () => {
    expect(productAlerts(product())).toEqual([]);
    expect(needsAttention(product())).toBe(false);
  });
});

describe('a purchase price nobody filled in', () => {
  it.each([[0], [undefined]])('is flagged when it is %p', (purchasePrice) => {
    expect(productAlerts(product({ purchasePrice }))).toEqual(['missing_purchase_price']);
  });

  it('is the state every imported product was in', () => {
    // Exactly the shape the shop's own backup held: a real selling price and
    // no cost behind it.
    expect(needsAttention({ purchasePrice: 0, priceHT: 67.227, taxRate: 19, priceTTC: 80 })).toBe(
      true,
    );
  });
});

describe('a product sold for less than it cost', () => {
  it('is flagged when the catalogue price is under the cost', () => {
    expect(productAlerts(product({ purchasePrice: 90 }))).toContain('sold_below_purchase');
  });

  it('is flagged when a reduced price drops under the cost', () => {
    // 65 TTC is 54.62 HT, below the 60 the shop paid.
    expect(productAlerts(product({ discountedPrice: 65 }))).toContain('sold_below_purchase');
  });

  it('is not flagged when the reduced price only looks low next to the cost', () => {
    // 85 TTC is 71.43 HT. Comparing the 85 against a 60 cost would be fine,
    // but comparing a tax-included price against an HT cost is what turns a
    // healthy margin into a false alarm in the other direction.
    expect(productAlerts(product({ purchasePrice: 71, discountedPrice: 85 }))).toEqual([]);
  });

  it('is not claimed on a product that has no cost to compare against', () => {
    // Saying both would be telling the shop the same thing twice.
    expect(productAlerts(product({ purchasePrice: 0, priceHT: 1 }))).toEqual([
      'missing_purchase_price',
    ]);
  });

  it('comes first, because it is the one that loses money', () => {
    const alerts = productAlerts(product({ purchasePrice: 200, discountedPrice: 120 }));

    expect(alerts[0]).toBe('sold_below_purchase');
    expect(alerts).toContain('discount_above_list');
  });
});

describe('a reduction that is not one', () => {
  it('is flagged when it sits above the catalogue price', () => {
    expect(productAlerts(product({ discountedPrice: 120 }))).toEqual(['discount_above_list']);
  });

  it('is flagged when it equals the catalogue price, which reduces nothing', () => {
    expect(productAlerts(product({ discountedPrice: 100 }))).toEqual(['discount_above_list']);
  });

  it('is left alone when it really is lower', () => {
    expect(productAlerts(product({ discountedPrice: 95 }))).toEqual([]);
  });
});

describe('what a shop customer is allowed to see', () => {
  const entity = new ProductEntity({
    id: DataType.PRODUCT,
    sk: `${DataType.PRODUCT}#7d1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15`,
    dataType: DataType.PRODUCT,
    name: { fr: 'Ciment gris', ar: 'إسمنت رمادي' },
    code: 'CGST1',
    purchasePrice: 0,
    priceHT: 155.462,
    taxRate: 19,
    priceTTC: 185,
    stockAvailable: 40,
    categoryId: '9f3a1c22-8d4e-4b17-a5c6-2e8f0b3d7a41',
    status: ProductStatus.ACTIVE,
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T10:00:00.000Z',
  });

  it('tells the shop what is wrong with its own product', () => {
    expect(entity.toPublicDTO().alerts).toEqual(['missing_purchase_price']);
  });

  it('tells a stranger nothing, because the alerts are read off the cost', () => {
    const dto = entity.toCustomerDTO();

    expect(dto).not.toHaveProperty('alerts');
    expect(dto).not.toHaveProperty('purchasePrice');
  });

  it('never stores the alerts on the record — they are worked out on the way out', () => {
    expect(entity.valueOf()).not.toHaveProperty('alerts');
  });
});

import { productAlerts, sellingPriceHT, needsAttention, productMargin } from '@libs/product-alerts';
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

/**
 * A product with no selling price.
 *
 * A supplier import brings goods in with a cost and leaves the price for the
 * shop to set, and until it does, the product goes into an order at 0.000.
 * The loss check could not see it — with no selling price there was nothing
 * to compare with the cost — so the product that loses the most raised
 * nothing at all.
 */
describe('a product nobody has priced yet', () => {
  it('is flagged, and flagged as serious', () => {
    expect(productAlerts(product({ priceHT: 0, priceTTC: 0 }))).toEqual(['missing_selling_price']);
    expect(needsAttention(product({ priceHT: 0, priceTTC: 0 }))).toBe(true);
  });

  it('is flagged when the price was never written at all', () => {
    expect(productAlerts(product({ priceHT: undefined, priceTTC: undefined }))).toContain(
      'missing_selling_price',
    );
  });

  it('comes first when the cost is missing too', () => {
    expect(productAlerts(product({ priceHT: 0, priceTTC: 0, purchasePrice: 0 }))).toEqual([
      'missing_selling_price',
      'missing_purchase_price',
    ]);
  });

  it('is not flagged when a reduced price is the price it sells at', () => {
    // An agreed or promotional price is still a price.
    expect(productAlerts(product({ priceHT: 0, priceTTC: 0, discountedPrice: 95 }))).not.toContain(
      'missing_selling_price',
    );
  });

  it('is not also reported as sold at a loss — it is one problem, said once', () => {
    expect(productAlerts(product({ priceHT: 0, priceTTC: 0 }))).not.toContain('sold_below_purchase');
  });

  it('reaches the product as the screens receive it', () => {
    const entity = new ProductEntity({
      id: DataType.PRODUCT,
      sk: `${DataType.PRODUCT}#p1`,
      dataType: DataType.PRODUCT,
      name: { fr: 'Machine à laver Condor 7 kg 1000 trs noire', ar: 'غسالة ملابس كوندور 7 كغ' },
      code: 'CON-F710LB',
      purchasePrice: 783.1,
      priceHT: 0,
      priceTTC: 0,
      taxRate: 19,
      stockAvailable: 3,
      categoryId: 'c1',
      status: ProductStatus.ACTIVE,
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    } as any);

    expect(entity.toPublicDTO().alerts).toEqual(['missing_selling_price']);
  });
});


/**
 * What the shop keeps on one unit.
 *
 * Selling price minus purchase price, both HT: the VAT is collected for the
 * State and claimed back from the supplier, so it is nobody's margin.
 */
describe('the margin', () => {
  it('is selling price HT minus purchase price HT, as a share of the cost', () => {
    // CON-F710LB: bought 783.100 HT, sold 980.000 HT.
    expect(productMargin({ purchasePrice: 783.1, priceHT: 980, taxRate: 19 })).toEqual({
      amountHT: 196.9,
      percentOfCost: 25.1,
    });
  });

  it('is measured against the reduced price when there is one, tax taken out', () => {
    // 1 071 TTC at 19 % is 900 HT, against a 750 cost.
    expect(
      productMargin({ purchasePrice: 750, priceHT: 1000, taxRate: 19, discountedPrice: 1071 }),
    ).toEqual({ amountHT: 150, percentOfCost: 20 });
  });

  it('is negative when the product sells below cost — said plainly, not hidden', () => {
    expect(productMargin({ purchasePrice: 100, priceHT: 90, taxRate: 19 })?.amountHT).toBe(-10);
  });

  it('has no answer until both prices exist', () => {
    expect(productMargin({ purchasePrice: 783.1, priceHT: 0, taxRate: 19 })).toBeNull();
    expect(productMargin({ purchasePrice: 0, priceHT: 980, taxRate: 19 })).toBeNull();
  });
});

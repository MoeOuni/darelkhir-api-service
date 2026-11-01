/**
 * Settings on a product that cannot be right.
 *
 * A product is sold from whatever numbers were typed into it, and nothing ever
 * refused a number for being nonsense. A purchase price left at zero is the
 * common one: the field defaults to zero, so a product added in a hurry has no
 * cost against it, and every report then counts the whole sale as profit. The
 * shop reads that figure each morning and believes it.
 *
 * These are warnings, never refusals. A merchant sometimes has a reason, and
 * being stopped at the counter over a price he has not filled in yet would be
 * worse than the wrong figure in a report he is not reading at that moment.
 */

export type ProductAlert =
  /**
   * No price to sell it at. It goes into an order at 0.000 and leaves the shop
   * for nothing — the case a supplier import creates on purpose, since the
   * goods arrive with a cost and the shop prices them afterwards.
   */
  | 'missing_selling_price'
  /** No cost against it, so its margin is the whole sale price. */
  | 'missing_purchase_price'
  /** It is sold for less than it was bought for. Every sale loses money. */
  | 'sold_below_purchase'
  /** The "reduced" price is not below the catalogue price it replaces. */
  | 'discount_above_list';

/** How serious it is, for deciding what the screens colour red. */
export const ALERT_SEVERITY: Record<ProductAlert, 'danger' | 'warning'> = {
  // Worse than selling at a loss: the whole article is given away.
  missing_selling_price: 'danger',
  sold_below_purchase: 'danger',
  missing_purchase_price: 'warning',
  discount_above_list: 'warning',
};

/** Only the fields the checks read, so an order line can be judged too. */
export type PricedProduct = {
  purchasePrice?: number;
  priceHT?: number;
  priceTTC?: number;
  taxRate?: number;
  discountedPrice?: number;
};

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * What the shop actually charges for one unit, before tax.
 *
 * An agreed or reduced price is written tax-included, because that is the
 * number said out loud at the counter, so it has to have the tax taken back
 * out before it can be set against a purchase price — those are always HT.
 * Comparing the two as they are stored would call a healthy margin a loss.
 */
export function sellingPriceHT(product: PricedProduct): number | undefined {
  const taxRate = positive(product.taxRate) ? product.taxRate : 0;

  if (positive(product.discountedPrice)) {
    return product.discountedPrice / (1 + taxRate / 100);
  }

  return positive(product.priceHT) ? product.priceHT : undefined;
}

/** Everything wrong with one product's settings, worst first. */
export function productAlerts(product: PricedProduct): ProductAlert[] {
  const alerts: ProductAlert[] = [];
  const selling = sellingPriceHT(product);

  // Nothing to charge. Checked first and on its own: with no selling price the
  // loss check below has nothing to compare, so it used to stay silent about
  // the one product that loses the most.
  if (selling === undefined) alerts.push('missing_selling_price');

  if (!positive(product.purchasePrice)) {
    alerts.push('missing_purchase_price');
  } else if (selling !== undefined && selling < product.purchasePrice) {
    // Only meaningful once there is a cost to measure against, so this is the
    // other half of the check above rather than a second one alongside it.
    alerts.push('sold_below_purchase');
  }

  if (positive(product.discountedPrice) && positive(product.priceTTC)) {
    if (product.discountedPrice >= product.priceTTC) {
      alerts.push('discount_above_list');
    }
  }

  return alerts.sort(
    (a, b) =>
      Number(ALERT_SEVERITY[b] === 'danger') - Number(ALERT_SEVERITY[a] === 'danger'),
  );
}

/** True when anything at all is wrong with it. */
export function needsAttention(product: PricedProduct): boolean {
  return productAlerts(product).length > 0;
}

/**
 * What the shop keeps on one unit: selling price minus purchase price, both
 * before tax.
 *
 * HT on both sides because the VAT is not the shop's — it is collected for the
 * State and the VAT paid to the supplier is claimed back. Measuring against a
 * TTC price would count the State's share as profit.
 *
 * The percentage is of the purchase price — "bought at 100, sold at 120, 20 %"
 * — which is how the counter reckons it. Null until both prices exist: a
 * margin against a missing number is not a small margin, it is no answer.
 */
export function productMargin(
  product: PricedProduct,
): { amountHT: number; percentOfCost: number } | null {
  const selling = sellingPriceHT(product);
  if (selling === undefined || !positive(product.purchasePrice)) return null;

  const amount = selling - product.purchasePrice;
  return {
    amountHT: Math.round(amount * 1000) / 1000,
    percentOfCost: Math.round((amount / product.purchasePrice) * 1000) / 10,
  };
}

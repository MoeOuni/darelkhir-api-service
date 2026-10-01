/**
 * Working out what moves when the lines of an order change.
 *
 * The goods left the shelf when the order was created. If the client then asks
 * for three more of the same thing, only three more may leave — not the whole
 * new quantity again. This is that difference, and nothing else.
 */

export type QuantityLine = { productId: string; quantity: number };

export type StockDelta = {
  productId: string;
  /** Positive: more goods leave the shelf. Negative: goods come back. */
  delta: number;
};

/** Sums the quantities per product, in case one product appears twice. */
function totalsByProduct(lines: QuantityLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * The change per product between the lines an order holds now and the lines it
 * is being given. Products whose quantity does not change are left out.
 */
export function computeStockDeltas(
  previous: QuantityLine[],
  next: QuantityLine[],
): StockDelta[] {
  const before = totalsByProduct(previous);
  const after = totalsByProduct(next);

  const deltas: StockDelta[] = [];
  for (const productId of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(productId) ?? 0) - (before.get(productId) ?? 0);
    if (delta !== 0) deltas.push({ productId, delta });
  }
  return deltas;
}

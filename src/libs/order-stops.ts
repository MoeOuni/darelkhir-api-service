import type { IOrderItem, IOrderStop } from '@libs/interfaces';

/**
 * Checking that a delivery round accounts for the whole order.
 *
 * The lorry leaves with everything on the order and must come back empty, so
 * what is dropped across the stops has to equal what was sold — not less,
 * because goods would be unaccounted for, and not more, because they do not
 * exist.
 */

export type StopProblem =
  | { kind: 'unknown_product'; productId: string }
  | { kind: 'short'; productId: string; ordered: number; assigned: number }
  | { kind: 'over'; productId: string; ordered: number; assigned: number };

/** Quantities per product across every stop. */
export function assignedQuantities(stops: IOrderStop[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const stop of stops) {
    for (const line of stop.items) {
      const quantity = Number(line.quantity) || 0;
      if (quantity <= 0) continue;
      totals.set(line.productId, (totals.get(line.productId) ?? 0) + quantity);
    }
  }
  return totals;
}

/** Quantities per product on the order itself. */
export function orderedQuantities(items: IOrderItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + (Number(item.quantity) || 0));
  }
  return totals;
}

/**
 * Everything wrong with a split, rather than the first thing wrong with it.
 *
 * A worker dividing twenty lines wants to be told about all of them at once,
 * not to fix one and be sent back for the next.
 */
export function findStopProblems(items: IOrderItem[], stops: IOrderStop[]): StopProblem[] {
  const ordered = orderedQuantities(items);
  const assigned = assignedQuantities(stops);
  const problems: StopProblem[] = [];

  for (const [productId, quantity] of assigned) {
    if (!ordered.has(productId)) {
      problems.push({ kind: 'unknown_product', productId });
    }
  }

  for (const [productId, want] of ordered) {
    const got = assigned.get(productId) ?? 0;
    if (got < want) problems.push({ kind: 'short', productId, ordered: want, assigned: got });
    else if (got > want) problems.push({ kind: 'over', productId, ordered: want, assigned: got });
  }

  return problems;
}

/** The stop's share of the goods, as order lines with their prices kept. */
export function itemsForStop(items: IOrderItem[], stop: IOrderStop): IOrderItem[] {
  const wanted = new Map<string, number>();
  for (const line of stop.items) {
    const quantity = Number(line.quantity) || 0;
    if (quantity > 0) wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + quantity);
  }

  return items
    .filter((item) => wanted.has(item.productId))
    .map((item) => ({ ...item, quantity: wanted.get(item.productId)! }));
}

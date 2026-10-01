import { findStopProblems, itemsForStop, assignedQuantities } from '../src/libs/order-stops';
import type { IOrderItem, IOrderStop } from '../src/libs/interfaces';

/** The order from the yard: 70 of X, 40 of Y, on one lorry. */
const items = [
  { productId: 'x', code: 'X', name: 'Article X', purchasePrice: 5, priceHT: 10, priceTTC: 11.9, taxRate: 19, quantity: 70 },
  { productId: 'y', code: 'Y', name: 'Article Y', purchasePrice: 2, priceHT: 4, priceTTC: 4.76, taxRate: 19, quantity: 40 },
] as IOrderItem[];

const address = { street: 'R', city: 'F', state: 'K', country: 'TN', postalCode: '1220' };

const stop = (id: string, lines: Record<string, number>): IOrderStop => ({
  id,
  address,
  items: Object.entries(lines).map(([productId, quantity]) => ({ productId, quantity })),
});

describe('order stops', () => {
  it('accepts a round that empties the lorry', () => {
    const stops = [stop('1', { x: 40, y: 20 }), stop('2', { x: 30 }), stop('3', { y: 20 })];
    expect(findStopProblems(items, stops)).toEqual([]);
  });

  it('reports what is still on the lorry', () => {
    const stops = [stop('1', { x: 40, y: 20 }), stop('2', { x: 30 })];
    expect(findStopProblems(items, stops)).toEqual([
      { kind: 'short', productId: 'y', ordered: 40, assigned: 20 },
    ]);
  });

  it('refuses to drop more than was sold', () => {
    const stops = [stop('1', { x: 40 }), stop('2', { x: 40 }), stop('3', { y: 40 })];
    expect(findStopProblems(items, stops)).toContainEqual({
      kind: 'over',
      productId: 'x',
      ordered: 70,
      assigned: 80,
    });
  });

  it('refuses an article that is not on the order', () => {
    const stops = [stop('1', { x: 70, y: 40, z: 5 })];
    expect(findStopProblems(items, stops)).toContainEqual({ kind: 'unknown_product', productId: 'z' });
  });

  it('reports every problem at once, not just the first', () => {
    const stops = [stop('1', { x: 80 })];
    const problems = findStopProblems(items, stops);
    expect(problems).toHaveLength(2);
  });

  it('treats no stops at all as the whole order undelivered', () => {
    expect(findStopProblems(items, [])).toHaveLength(2);
  });

  it('adds a product that appears at several stops', () => {
    const totals = assignedQuantities([stop('1', { x: 40 }), stop('2', { x: 30 })]);
    expect(totals.get('x')).toBe(70);
  });

  it('builds one stop lines, keeping the prices from the order', () => {
    const lines = itemsForStop(items, stop('1', { x: 40, y: 20 }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ productId: 'x', quantity: 40, priceHT: 10 });
    expect(lines[1]).toMatchObject({ productId: 'y', quantity: 20, priceHT: 4 });
  });

  it('leaves out an article that this stop does not receive', () => {
    const lines = itemsForStop(items, stop('2', { x: 30 }));
    expect(lines.map((l) => l.productId)).toEqual(['x']);
  });
});

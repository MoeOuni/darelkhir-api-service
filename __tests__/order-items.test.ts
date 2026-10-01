import { computeStockDeltas } from '../src/libs/order-items';

/**
 * The case the shop actually hits: a client asks for ten of one thing, then
 * changes to three of another before the invoice is issued.
 */
describe('computeStockDeltas', () => {
  it('returns nothing when the lines do not change', () => {
    const lines = [{ productId: 'a', quantity: 10 }];
    expect(computeStockDeltas(lines, lines)).toEqual([]);
  });

  it('takes only the extra units when a quantity grows', () => {
    const deltas = computeStockDeltas(
      [{ productId: 'a', quantity: 10 }],
      [{ productId: 'a', quantity: 13 }],
    );
    expect(deltas).toEqual([{ productId: 'a', delta: 3 }]);
  });

  it('gives units back when a quantity shrinks', () => {
    const deltas = computeStockDeltas(
      [{ productId: 'a', quantity: 10 }],
      [{ productId: 'a', quantity: 3 }],
    );
    expect(deltas).toEqual([{ productId: 'a', delta: -7 }]);
  });

  it('returns a removed product in full and takes the new one out', () => {
    const deltas = computeStockDeltas(
      [{ productId: 'a', quantity: 10 }],
      [{ productId: 'b', quantity: 3 }],
    );
    expect(deltas).toHaveLength(2);
    expect(deltas).toContainEqual({ productId: 'a', delta: -10 });
    expect(deltas).toContainEqual({ productId: 'b', delta: 3 });
  });

  it('adds up a product that appears on two lines', () => {
    const deltas = computeStockDeltas(
      [{ productId: 'a', quantity: 2 }],
      [
        { productId: 'a', quantity: 2 },
        { productId: 'a', quantity: 3 },
      ],
    );
    expect(deltas).toEqual([{ productId: 'a', delta: 3 }]);
  });

  it('takes the whole order out when it had no lines before', () => {
    expect(computeStockDeltas([], [{ productId: 'a', quantity: 4 }])).toEqual([
      { productId: 'a', delta: 4 },
    ]);
  });
});

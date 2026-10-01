import { shopBorneCharges, clientBorneCharges, totalCharges } from '../src/libs/order-charges';
import { ChargePayer } from '../src/libs/enums';

const clientPaid = { label: 'Chargement', amount: 20, paidBy: ChargePayer.CLIENT };
const shopPaid = { label: 'Chargement', amount: 15, paidBy: ChargePayer.SHOP };

/**
 * Neither kind of charge ever reaches the invoice — the loader is settled at
 * the yard. The split matters for the shop's own books: only what the shop
 * paid out is its cost.
 */
describe('order charges', () => {
  it('counts what the shop paid out', () => {
    expect(shopBorneCharges([clientPaid, shopPaid])).toBe(15);
  });

  it('counts what the client settled directly', () => {
    expect(clientBorneCharges([clientPaid, shopPaid])).toBe(20);
  });

  it('adds up to everything the job cost in extras', () => {
    expect(totalCharges([clientPaid, shopPaid])).toBe(35);
  });

  it('treats no charges as nothing', () => {
    expect(shopBorneCharges()).toBe(0);
    expect(clientBorneCharges(undefined)).toBe(0);
    expect(totalCharges([])).toBe(0);
  });

  it('adds several of the same kind', () => {
    expect(shopBorneCharges([shopPaid, { ...shopPaid, amount: 5 }])).toBe(20);
  });

  it('ignores an amount that is not a number', () => {
    expect(shopBorneCharges([{ ...shopPaid, amount: NaN }])).toBe(0);
  });

  it('rounds to the millime, not beyond', () => {
    expect(shopBorneCharges([{ ...shopPaid, amount: 0.1 }, { ...shopPaid, amount: 0.2 }])).toBe(0.3);
  });
});

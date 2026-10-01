import { ChargePayer } from '@libs/enums';
import type { IOrderCharge } from '@libs/interfaces';

/**
 * Extras that are not the goods: loading, a crane, a porter.
 *
 * None of this reaches the client's invoice. The loader is hired at the yard
 * and settled there, between whoever is standing in front of him — so the
 * paper the client signs never mentions it, and the order total does not move.
 *
 * It is written down anyway, because sometimes the shop is the one who pays,
 * and money that leaves the till has to be accounted for somewhere.
 */

/** What the shop paid out. A real cost, so it comes off the margin. */
export function shopBorneCharges(charges?: IOrderCharge[]): number {
  return sum(charges, ChargePayer.SHOP);
}

/**
 * What the client settled directly with the loader.
 *
 * Never the shop's money. Recorded only so the yard's costs can be seen whole.
 */
export function clientBorneCharges(charges?: IOrderCharge[]): number {
  return sum(charges, ChargePayer.CLIENT);
}

/** Everything the job cost in extras, whoever handed over the notes. */
export function totalCharges(charges?: IOrderCharge[]): number {
  return round2(shopBorneCharges(charges) + clientBorneCharges(charges));
}

function sum(charges: IOrderCharge[] | undefined, payer: ChargePayer): number {
  return round2(
    (charges ?? [])
      .filter((c) => c.paidBy === payer)
      .reduce((acc, c) => acc + (Number(c.amount) || 0), 0),
  );
}

function round2(n: number): number {
  return parseFloat((Number.isFinite(n) ? n : 0).toFixed(2));
}

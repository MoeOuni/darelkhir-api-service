import { IDeclaredLine } from '@libs/interfaces';

const round2 = (n: number) => parseFloat(n.toFixed(2));

/**
 * A line as it can honestly be printed.
 *
 * Prices reach here divided — a TTC price turned back into an HT one — and
 * division leaves 8.373949579831933 where the paper has room for 8.374. Left
 * alone that number is stored, printed truncated, and adds up to a total that
 * does not match the figures beside it. Three decimals is the millime, which
 * is as fine as money goes here.
 *
 * Done on the way in rather than at each screen, because the screens are not
 * the only thing that writes a declared invoice.
 */
export function roundLines(lines: IDeclaredLine[]): IDeclaredLine[] {
  return lines.map((line) => ({
    ...line,
    priceHT: parseFloat(line.priceHT.toFixed(3)),
    quantity: parseFloat(line.quantity.toFixed(3)),
  }));
}

/**
 * What a declared invoice comes to.
 *
 * Worked out here rather than trusted from the caller: a total that arrives
 * over the wire is a total nobody checked, and this document is read by the
 * tax authority. Stamp duty is added the same way the counter invoice adds it,
 * so the two papers agree on what a dinar is.
 */
export function totalDeclared(lines: IDeclaredLine[], timber: number) {
  let subtotal = 0;
  let tax = 0;

  for (const line of lines) {
    const net = line.priceHT * line.quantity;
    subtotal += net;
    tax += net * (line.taxRate / 100);
  }

  return {
    subtotal: round2(subtotal),
    tax: round2(tax),
    timber: round2(timber),
    total: round2(subtotal + tax + timber),
  };
}

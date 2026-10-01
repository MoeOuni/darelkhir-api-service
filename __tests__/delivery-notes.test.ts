import { documentSections, stopAddressLine } from '@libs/invoice';
import { buildDocumentKey } from '@libs/s3-invoice';

const order = (stops: number, invoiced = true) =>
  ({
    orderNumber: 12,
    invoiceNumber: invoiced ? 4 : undefined,
    stops: Array.from({ length: stops }, (_, i) => ({ id: `s${i}`, items: [] })),
  }) as any;

describe('stopAddressLine', () => {
  it('prints the line that was typed for the drop', () => {
    expect(stopAddressLine({ address: { street: 'Chantier route de Gafsa' } })).toBe(
      'Chantier route de Gafsa',
    );
  });

  /**
   * The app used to copy the client's town and postcode onto every new stop,
   * so those are sitting on rounds already saved. They were never typed for
   * the drop and must not reach its paper.
   */
  it('leaves out a town and postcode inherited from the client', () => {
    const legacy = {
      address: {
        street: 'Chantier route de Gafsa',
        city: 'Foussana',
        state: 'Kasserine',
        country: 'TN',
        postalCode: '1220',
      },
    };

    expect(stopAddressLine(legacy)).toBe('Chantier route de Gafsa');
  });

  it('is empty when nothing was typed, so the paper can print a dash', () => {
    expect(stopAddressLine({ address: { street: '  ' } })).toBe('');
    expect(stopAddressLine({})).toBe('');
  });
});

describe('documentSections', () => {
  it('is one page for anything that is not a bundle', () => {
    expect(documentSections(order(3), 'invoice')).toEqual([
      { kind: 'invoice', stopIndex: undefined },
    ]);
    expect(documentSections(order(3), 'stop', 2)).toEqual([{ kind: 'stop', stopIndex: 2 }]);
  });

  /**
   * The dossier is the round in the order it is handed over: the fiscal
   * invoice, then each drop's own pair kept together — its invoice (004-1) and
   * the note the client signs for it.
   */
  it('puts the invoice first, then each drop with its own invoice and note', () => {
    expect(documentSections(order(3), 'bundle')).toEqual([
      { kind: 'invoice' },
      { kind: 'stop', stopIndex: 1 },
      { kind: 'delivery_note', stopIndex: 1 },
      { kind: 'stop', stopIndex: 2 },
      { kind: 'delivery_note', stopIndex: 2 },
      { kind: 'stop', stopIndex: 3 },
      { kind: 'delivery_note', stopIndex: 3 },
    ]);
  });

  it('gives an order with no stops one note for the whole load', () => {
    expect(documentSections(order(0), 'bundle')).toEqual([
      { kind: 'invoice' },
      { kind: 'delivery_note' },
    ]);
  });

  it('opens with a proforma when there is no invoice to open with', () => {
    expect(documentSections(order(1, false), 'bundle')[0]).toEqual({ kind: 'proforma' });
  });
});

describe('buildDocumentKey', () => {
  it('files a delivery note under the invoice it belongs to', () => {
    expect(buildDocumentKey('delivery_note', 4)).toBe('delivery-notes/BL-004.pdf');
  });

  it('gives each drop its own note, so reprinting one keeps the others', () => {
    expect(buildDocumentKey('delivery_note', 4, 1)).toBe('delivery-notes/BL-004-1.pdf');
    expect(buildDocumentKey('delivery_note', 4, 2)).toBe('delivery-notes/BL-004-2.pdf');
  });

  it('keeps the bundle apart from the papers it is made of', () => {
    const keys = [
      buildDocumentKey('bundle', 4),
      buildDocumentKey('invoice', 4),
      buildDocumentKey('delivery_note', 4),
      buildDocumentKey('stop', 4, 1),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

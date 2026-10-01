/**
 * Renders a sample of each document to PDF, for looking at.
 *
 *   npx tsx scripts/render-sample-invoice.ts ./out
 *
 * Nothing is read from AWS: the settings call falls back to its defaults, so
 * this works offline and changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderOrderInvoicePdf, type DocumentKind } from '../src/libs/invoice';

const order: any = {
  orderNumber: 87,
  invoiceNumber: 87,
  creditNoteNumber: 4,
  creditNoteReason: 'Refus à la livraison',
  invoiceIssuedAt: '2026-08-21T10:00:00.000Z',
  createdAt: '2026-08-21T10:00:00.000Z',
  clientName: 'Mohamed Trabelsi',
  clientId: 'sample',
  status: 'confirmed',
  shippingAddress: {
    street: 'Rue El Intilaka',
    city: 'Foussana',
    state: 'Kasserine',
    postalCode: '1220',
    country: 'TN',
  },
  items: [
    {
      productId: '1',
      code: 'CGDT20',
      name: 'Cloture Grillage Double Torsion 2x20m en Rouleau',
      purchasePrice: 60,
      priceHT: 84.034,
      priceTTC: 100,
      taxRate: 19,
      quantity: 13,
    },
  ],
  subtotal: 1092.442,
  tax: 207.563,
  timber: 1,
  transport: 0,
  total: 1301.005,
  transporterName: 'Rachid Transport',
  charges: [
    { label: 'Chargement', amount: 20, paidBy: 'client' },
    { label: 'Manutention (à notre charge)', amount: 15, paidBy: 'shop' },
  ],
};

const outDir = process.argv[2] ?? '.';

/** Totals derived from the lines, so a sample never contradicts itself. */
function withTotals(o: any, transport = 0) {
  const subtotal = o.items.reduce((sum: number, i: any) => sum + i.priceHT * i.quantity, 0);
  const tax = o.items.reduce(
    (sum: number, i: any) => sum + i.priceHT * (i.taxRate / 100) * i.quantity,
    0,
  );
  const timber = 1;
  return {
    ...o,
    transport,
    subtotal: +subtotal.toFixed(3),
    tax: +tax.toFixed(3),
    timber,
    total: +(subtotal + tax + timber + transport).toFixed(3),
  };
}

/** A fuller order, to see how the table behaves with several lines. */
const busy = withTotals({
  ...order,
  items: [
    order.items[0],
    { productId: '2', code: 'FG27', name: 'Fil galvanisé (épaisseur 2.7 mm) en kg',
      purchasePrice: 3, priceHT: 4.034, priceTTC: 4.8, taxRate: 19, quantity: 250 },
    { productId: '3', code: 'TP10', name: 'Clous de charpente / TP 10 en KG',
      purchasePrice: 2, priceHT: 2.941, priceTTC: 3.5, taxRate: 19, quantity: 40 },
    { productId: '4', code: 'CGST2', name: 'Clôture grillage simple torsion (20m x 2m, maille 5x5 cm)',
      purchasePrice: 150, priceHT: 197.479, priceTTC: 235, taxRate: 19, quantity: 6 },
  ],
}, 50);

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  for (const kind of ['invoice', 'proforma', 'credit_note'] as DocumentKind[]) {
    const buf = await renderOrderInvoicePdf(order, {
      kind,
      clientPhone: '+216 99 111 999',
      clientCin: '12345678',
      transporter: {
        name: 'Rachid Transport',
        cin: '09876543',
        vehiclePlateNumber: '123 TUN 456',
        phone: '+216 98 123 456',
      },
    });
    const file = path.join(outDir, `${kind}.pdf`);
    fs.writeFileSync(file, buf);
    console.log(file, buf.length, 'bytes');
  }

  // Several lines, transport charged, and a driver who gave no number.
  const many = await renderOrderInvoicePdf(busy, {
    clientPhone: '+216 99 111 999',
    clientCin: '12345678',
    transporter: { name: 'Rachid Transport', vehiclePlateNumber: '123 TUN 456' },
  });
  const manyFile = path.join(outDir, 'invoice-multiline.pdf');
  fs.writeFileSync(manyFile, many);
  console.log(manyFile, many.length, 'bytes');
})();

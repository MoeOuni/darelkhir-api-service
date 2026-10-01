/**
 * The scenario from the yard: one order, one lorry, three drops.
 *
 *   npx tsx scripts/render-stops-sample.ts ./out
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderOrderInvoicePdf } from '../src/libs/invoice';

const addr = (street: string, city: string) => ({
  street, city, state: 'Kasserine', country: 'TN', postalCode: '1220',
});

const items = [
  { productId: 'x', code: 'CGDT20', name: 'Cloture Grillage Double Torsion 2x20m',
    purchasePrice: 60, priceHT: 84.034, priceTTC: 100, taxRate: 19, quantity: 70 },
  { productId: 'y', code: 'FG27', name: 'Fil galvanisé (épaisseur 2.7 mm) en kg',
    purchasePrice: 3, priceHT: 4.034, priceTTC: 4.8, taxRate: 19, quantity: 40 },
];

const subtotal = items.reduce((s, i) => s + i.priceHT * i.quantity, 0);
const tax = items.reduce((s, i) => s + i.priceHT * (i.taxRate / 100) * i.quantity, 0);

const order: any = {
  orderNumber: 4, invoiceNumber: 4,
  invoiceIssuedAt: '2026-08-22T09:00:00.000Z', createdAt: '2026-08-22T09:00:00.000Z',
  clientName: 'Mohamed Trabelsi', clientId: 'c', status: 'confirmed',
  shippingAddress: addr('Rue El Intilaka', 'Foussana'),
  items,
  subtotal: +subtotal.toFixed(3), tax: +tax.toFixed(3), timber: 1, transport: 50,
  total: +(subtotal + tax + 1 + 50).toFixed(3),
  transporterName: 'Rachid Transport',
  stops: [
    { id: 's1', label: 'Chantier Foussana', address: addr('Cité Ennour', 'Foussana'),
      items: [{ productId: 'x', quantity: 40 }, { productId: 'y', quantity: 20 }] },
    { id: 's2', label: 'Dépôt Kasserine', address: addr('Zone industrielle', 'Kasserine'),
      items: [{ productId: 'x', quantity: 30 }] },
    { id: 's3', label: 'Chantier Sbeitla', address: addr('Route de Sbeitla', 'Sbeitla'),
      items: [{ productId: 'y', quantity: 20 }] },
  ],
};

const outDir = process.argv[2] ?? '.';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const invoice = await renderOrderInvoicePdf(order, { clientPhone: '+216 99 111 999' });
  fs.writeFileSync(path.join(outDir, 'facture-004.pdf'), invoice);
  console.log('facture-004.pdf', invoice.length);

  for (let i = 1; i <= order.stops.length; i += 1) {
    const buf = await renderOrderInvoicePdf(order, {
      kind: 'stop', stopIndex: i, clientPhone: '+216 99 111 999',
    });
    fs.writeFileSync(path.join(outDir, `facture-004-${i}.pdf`), buf);
    console.log(`facture-004-${i}.pdf`, buf.length);
  }

  const bl = await renderOrderInvoicePdf(order, {
    kind: 'delivery_note', clientPhone: '+216 99 111 999',
  });
  fs.writeFileSync(path.join(outDir, 'BL-004.pdf'), bl);
  console.log('BL-004.pdf', bl.length);

  for (let i = 1; i <= order.stops.length; i += 1) {
    const buf = await renderOrderInvoicePdf(order, {
      kind: 'delivery_note', stopIndex: i, clientPhone: '+216 99 111 999',
    });
    fs.writeFileSync(path.join(outDir, `BL-004-${i}.pdf`), buf);
    console.log(`BL-004-${i}.pdf`, buf.length);
  }

  // The whole dossier in one file: the invoice, then a note per drop.
  const bundle = await renderOrderInvoicePdf(order, {
    kind: 'bundle', clientPhone: '+216 99 111 999',
  });
  fs.writeFileSync(path.join(outDir, 'dossier-004.pdf'), bundle);
  console.log('dossier-004.pdf', bundle.length);
})();

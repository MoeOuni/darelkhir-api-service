/**
 * Adds the products on a supplier invoice to the catalogue, with their stock.
 *
 *   npx tsx scripts/import-products.ts --file invoice.json --stage dev            # dry run
 *   npx tsx scripts/import-products.ts --file invoice.json --stage dev --confirm  # writes
 *
 * The file holds the invoice as printed — unit price HT and discount per line —
 * and the purchase price is worked out here, net of the discount, to the
 * millime. It also carries the invoice's own totals, and nothing is written
 * unless the lines add back up to them. A digit misread off a photograph is
 * the likeliest mistake in this whole job, and the printed total is the one
 * thing that catches it.
 *
 * Each product is created through the API's own use case, so it is shaped
 * exactly like one made from the dashboard. Its stock then arrives as a
 * purchase movement naming the invoice, rather than as an anonymous opening
 * balance, so the stock history says where every unit came from.
 *
 * No selling price is set unless the file gives one: the shop prices them
 * itself. A product already in the catalogue under the same code is left
 * alone and reported, so running a file twice does not double the stock.
 *
 * The invoice file is commercial data — keep it out of the repository.
 *
 * {
 *   "reason": "Facture Condor Electronics du 02/10/2026",
 *   "categoryId": "<uuid>",
 *   "taxRate": 19,
 *   "expected": { "units": 28, "grossHT": 27530, "netHT": 22574.6 },
 *   "products": [
 *     { "code": "WT10T1", "fr": "…", "ar": "…", "quantity": 2,
 *       "unitPriceHT": 445, "discountPct": 18, "priceHT": 0 }
 *   ]
 * }
 */
import fs from 'node:fs';
import { DynamoDBClient, DescribeTableCommand, ScanCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const STAGE = arg('stage') ?? 'dev';
const FILE = arg('file');

// Hard-coded rather than read from anywhere. Every shop on the platform lives
// in the same AWS account, and this must never write into another one's tables.
const SERVICE = 'darelkhir-api-service';
const table = (name: string) => `${SERVICE}-${name}-${STAGE}-table`;
const TABLES = {
  PRODUCTS_TABLE_NAME: table('products'),
  CATEGORIES_TABLE_NAME: table('categories'),
  JOURNAL_TABLE_NAME: table('journal'),
};
// Before anything from src/ loads: repositories read these when constructed.
Object.assign(process.env, TABLES, { STAGE, AWS_REGION: process.env.AWS_REGION || 'us-east-1' });

type Line = {
  code: string;
  fr: string;
  ar: string;
  quantity: number;
  unitPriceHT: number;
  discountPct?: number;
  priceHT?: number;
  supplierLabel?: string;
};

type InvoiceFile = {
  reason: string;
  categoryId: string;
  taxRate?: number;
  expected: { units: number; grossHT: number; netHT: number };
  products: Line[];
};

/** To the millime, which is as fine as money goes here. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const money = (n: number) => n.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Net of the line discount — the price the shop actually paid for one unit. */
export const netUnitHT = (line: Pick<Line, 'unitPriceHT' | 'discountPct'>) =>
  r3(line.unitPriceHT * (1 - (line.discountPct ?? 0) / 100));

async function main() {
  if (!FILE) {
    console.error('Missing --file. See the comment at the top of this script.');
    process.exit(1);
  }

  const invoice: InvoiceFile = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const taxRate = invoice.taxRate ?? 19;
  const ddb = new DynamoDBClient({});

  console.log(`\nService: ${SERVICE}`);
  console.log(`Stage:   ${STAGE}`);
  console.log(`Invoice: ${invoice.reason}`);
  console.log(CONFIRM ? 'Mode:    WRITING\n' : 'Mode:    dry run (nothing is written)\n');

  // ── The file has to be sound before anything else is looked at ──────────
  const problems: string[] = [];
  const codes = new Set<string>();
  for (const p of invoice.products) {
    if (!p.code?.trim()) problems.push('a line has no code');
    if (codes.has(p.code)) problems.push(`${p.code} appears twice`);
    codes.add(p.code);
    if (!p.fr?.trim() || !p.ar?.trim()) problems.push(`${p.code}: needs both a French and an Arabic name`);
    if (!(p.quantity > 0) || !Number.isInteger(p.quantity)) problems.push(`${p.code}: quantity must be a whole number above 0`);
    if (!(p.unitPriceHT > 0)) problems.push(`${p.code}: unit price must be above 0`);
  }

  // The invoice's own totals. Gross is quantity × unit price; net is after the
  // line discounts. Both are checked, because a wrong quantity and a wrong
  // price can cancel out in one of them but not in both.
  const units = invoice.products.reduce((n, p) => n + p.quantity, 0);
  const gross = r3(invoice.products.reduce((n, p) => n + p.quantity * p.unitPriceHT, 0));
  const net = r3(invoice.products.reduce((n, p) => n + p.quantity * netUnitHT(p), 0));
  const totalsOk =
    units === invoice.expected.units &&
    Math.abs(gross - invoice.expected.grossHT) < 0.0005 &&
    Math.abs(net - invoice.expected.netHT) < 0.0005;

  console.log('  Code            Qté   P.U. HT    Remise   Achat HT net   Montant HT');
  for (const p of invoice.products) {
    console.log(
      `  ${p.code.padEnd(14)} ${String(p.quantity).padStart(4)}  ${money(p.unitPriceHT).padStart(9)}  ` +
        `${String(p.discountPct ?? 0).padStart(5)} %  ${money(netUnitHT(p)).padStart(12)}  ` +
        `${money(p.quantity * netUnitHT(p)).padStart(11)}    ${p.fr}`,
    );
  }
  console.log('');
  console.log(`  Units     ${units}   (invoice: ${invoice.expected.units})`);
  console.log(`  Gross HT  ${money(gross)}   (invoice: ${money(invoice.expected.grossHT)})`);
  console.log(`  Net HT    ${money(net)}   (invoice: ${money(invoice.expected.netHT)})`);
  console.log(totalsOk ? '  ✓ the lines add up to the invoice\n' : '  ✗ the lines do NOT add up to the invoice\n');

  if (!totalsOk) problems.push('the lines do not add up to the totals printed on the invoice');
  if (problems.length) {
    console.error('Nothing written:\n  - ' + problems.join('\n  - ') + '\n');
    process.exit(1);
  }

  // ── The stack and the category have to exist ───────────────────────────
  for (const name of Object.values(TABLES)) {
    await ddb.send(new DescribeTableCommand({ TableName: name })).catch(() => {
      console.error(`Table ${name} does not exist — is the stage right?`);
      process.exit(1);
    });
  }
  const category = await ddb.send(
    new GetItemCommand({
      TableName: TABLES.CATEGORIES_TABLE_NAME,
      Key: { id: { S: 'CATEGORY' }, sk: { S: `CATEGORY#${invoice.categoryId}` } },
    }),
  );
  if (!category.Item) {
    console.error(`Category ${invoice.categoryId} does not exist.`);
    process.exit(1);
  }
  console.log(`  Category: ${category.Item.name?.M?.fr?.S ?? invoice.categoryId}`);

  // Codes already in the catalogue are left alone: the file may be run twice,
  // or the product may have been added by hand, and stock must not double.
  const existing = new Set<string>();
  let start: Record<string, any> | undefined;
  do {
    const page = await ddb.send(
      new ScanCommand({ TableName: TABLES.PRODUCTS_TABLE_NAME, ProjectionExpression: 'code', ExclusiveStartKey: start }),
    );
    for (const item of page.Items ?? []) if (item.code?.S) existing.add(item.code.S);
    start = page.LastEvaluatedKey;
  } while (start);

  const toCreate = invoice.products.filter((p) => !existing.has(p.code));
  const skipped = invoice.products.filter((p) => existing.has(p.code));
  if (skipped.length) console.log(`  Already in the catalogue, left alone: ${skipped.map((p) => p.code).join(', ')}`);
  console.log(`  To create: ${toCreate.length} products, ${toCreate.reduce((n, p) => n + p.quantity, 0)} units\n`);

  if (!CONFIRM) {
    console.log('Re-run with --confirm to write it.\n');
    return;
  }

  const { ProductRepository } = await import('../src/repositories/ProductRepository');
  const { CreateProductUseCase } = await import('../src/functions/products/create/useCase');
  const { recordStockMovement } = await import('../src/libs/journal');
  const { StockMovementType } = await import('../src/libs/enums');

  const repository = new ProductRepository();
  const create = new CreateProductUseCase(repository);
  const actor = { sub: 'import', name: 'Import facture fournisseur' } as any;

  for (const p of toCreate) {
    const purchasePrice = netUnitHT(p);

    // Created empty, then stocked, so the arrival is recorded as a purchase
    // with the invoice named — not as an opening balance from nowhere.
    const made = await create.execute(
      {
        name: { fr: p.fr.trim(), ar: p.ar.trim() },
        code: p.code.trim(),
        purchasePrice,
        priceHT: p.priceHT ?? 0,
        taxRate,
        stockAvailable: 0,
        categoryId: invoice.categoryId,
      } as any,
      actor.sub,
      actor,
    );
    const uuid = made.data!.id as string;

    await repository.updateStock(uuid, p.quantity);
    await recordStockMovement({
      productId: uuid,
      productCode: p.code,
      productName: p.fr,
      type: StockMovementType.PURCHASE,
      availableDelta: p.quantity,
      availableAfter: p.quantity,
      reason: invoice.reason,
      actor,
    });

    console.log(`  ✓ ${p.code.padEnd(14)} ${String(p.quantity).padStart(3)} × ${money(purchasePrice)} HT  ${p.fr}`);
  }

  console.log('\nDone.\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Fills Dar El Khir's tables with demo data to test against.
 *
 *   npx tsx scripts/seed-demo.ts --stage dev             # dry run: lists what it would write
 *   npx tsx scripts/seed-demo.ts --stage dev --confirm   # writes it
 *
 * Every row goes through the API's own use cases, so it is shaped exactly like
 * one made from the dashboard — same keys, same search index, same opening
 * stock movement — and the dashboard, the app and Yahya cannot tell the
 * difference.
 *
 * The clients have no email address on purpose. A client with one gets a
 * Cognito account and an invitation emailed to that address, and a demo
 * seeder has no business mailing strangers.
 *
 * Remove all of it afterwards with:
 *   node scripts/purge-all.js --stage dev --confirm
 */
import {
  DynamoDBClient,
  DescribeTableCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const stageAt = args.indexOf('--stage');
const STAGE = stageAt >= 0 ? args[stageAt + 1] : 'dev';

// Hard-coded rather than read from anywhere. Every shop on the platform lives
// in the same AWS account, and this must never write into another one's tables.
const SERVICE = 'darelkhir-api-service';
const table = (name: string) => `${SERVICE}-${name}-${STAGE}-table`;

const TABLES = {
  PRODUCTS_TABLE_NAME: table('products'),
  CATEGORIES_TABLE_NAME: table('categories'),
  CLIENTS_TABLE_NAME: table('clients'),
  TRANSPORTERS_TABLE_NAME: table('transporters'),
  JOURNAL_TABLE_NAME: table('journal'),
};

// Set before anything from src/ is loaded: the repositories read their table
// names from the environment when they are constructed.
Object.assign(process.env, TABLES, { STAGE, AWS_REGION: process.env.AWS_REGION || 'us-east-1' });

/* ── The demo catalogue ─────────────────────────────────────────────────── */

type Seed = {
  code: string;
  fr: string;
  ar: string;
  priceHT: number;
  purchasePrice: number;
  stock: number;
  aliases: string[];
};

const CATEGORIES: { key: string; fr: string; ar: string; products: Seed[] }[] = [
  {
    key: 'clim',
    fr: 'Climatiseurs',
    ar: 'مكيفات الهواء',
    products: [
      { code: 'CLIM-C09', fr: 'Climatiseur Condor 9000 BTU Inverter', ar: 'مكيف كوندور 9000 BTU إنفرتر', priceHT: 1050, purchasePrice: 880, stock: 14, aliases: ['clim 9', 'condor 9000', 'كليماتيزور 9', 'كليما 9'] },
      { code: 'CLIM-C12', fr: 'Climatiseur Condor 12000 BTU Inverter', ar: 'مكيف كوندور 12000 BTU إنفرتر', priceHT: 1260, purchasePrice: 1050, stock: 22, aliases: ['clim 12', 'condor 12000', 'كليماتيزور 12', 'كليما 12'] },
      { code: 'CLIM-C18', fr: 'Climatiseur Condor 18000 BTU Inverter', ar: 'مكيف كوندور 18000 BTU إنفرتر', priceHT: 1930, purchasePrice: 1620, stock: 9, aliases: ['clim 18', 'condor 18000', 'كليماتيزور 18'] },
      { code: 'CLIM-C24', fr: 'Climatiseur Condor 24000 BTU Inverter', ar: 'مكيف كوندور 24000 BTU إنفرتر', priceHT: 2440, purchasePrice: 2050, stock: 4, aliases: ['clim 24', 'condor 24000', 'كليماتيزور 24'] },
      { code: 'CLIM-S12', fr: 'Climatiseur Samsung WindFree 12000 BTU', ar: 'مكيف سامسونج 12000 BTU', priceHT: 1590, purchasePrice: 1330, stock: 6, aliases: ['samsung 12', 'clim samsung'] },
    ],
  },
  {
    key: 'frigo',
    fr: 'Réfrigérateurs',
    ar: 'ثلاجات',
    products: [
      { code: 'FRIG-C350', fr: 'Réfrigérateur Condor 350 L No Frost', ar: 'ثلاجة كوندور 350 لتر', priceHT: 1430, purchasePrice: 1190, stock: 11, aliases: ['frigo condor', 'فريجيدار 350', 'ثلاجة 350'] },
      { code: 'FRIG-S400', fr: 'Réfrigérateur Samsung 400 L No Frost Inox', ar: 'ثلاجة سامسونج 400 لتر', priceHT: 2180, purchasePrice: 1820, stock: 5, aliases: ['frigo samsung', 'فريجيدار سامسونج'] },
      { code: 'FRIG-B270', fr: 'Réfrigérateur Biolux 270 L', ar: 'ثلاجة بيولوكس 270 لتر', priceHT: 880, purchasePrice: 735, stock: 16, aliases: ['frigo biolux', 'ثلاجة صغيرة'] },
      { code: 'FRIG-L520', fr: 'Réfrigérateur LG Side by Side 520 L', ar: 'ثلاجة إل جي 520 لتر بابين', priceHT: 3950, purchasePrice: 3300, stock: 2, aliases: ['side by side', 'frigo lg'] },
    ],
  },
  {
    key: 'lv',
    fr: 'Lave-vaisselle',
    ar: 'غسالات الأواني',
    products: [
      { code: 'LV-C12', fr: 'Lave-vaisselle Condor 12 couverts', ar: 'غسالة أواني كوندور 12 طقم', priceHT: 1130, purchasePrice: 945, stock: 8, aliases: ['lave vaisselle condor', 'ماكينة ماعون', 'ماكينة الماعون 12'] },
      { code: 'LV-B13', fr: 'Lave-vaisselle Beko 13 couverts Inox', ar: 'غسالة أواني بيكو 13 طقم', priceHT: 1390, purchasePrice: 1160, stock: 5, aliases: ['lave vaisselle beko', 'ماكينة ماعون بيكو'] },
      { code: 'LV-BR12', fr: 'Lave-vaisselle Brandt 12 couverts', ar: 'غسالة أواني براندت 12 طقم', priceHT: 1260, purchasePrice: 1050, stock: 3, aliases: ['lave vaisselle brandt'] },
    ],
  },
  {
    key: 'ml',
    fr: 'Machines à laver',
    ar: 'غسالات الملابس',
    products: [
      { code: 'ML-C8', fr: 'Machine à laver Condor 8 kg frontale', ar: 'غسالة ملابس كوندور 8 كغ', priceHT: 1050, purchasePrice: 875, stock: 13, aliases: ['machine condor 8', 'ماكينة صابون 8', 'ماشينة 8'] },
      { code: 'ML-S9', fr: 'Machine à laver Samsung 9 kg EcoBubble', ar: 'غسالة ملابس سامسونج 9 كغ', priceHT: 1550, purchasePrice: 1295, stock: 7, aliases: ['machine samsung 9', 'ماكينة صابون سامسونج'] },
      { code: 'ML-L7', fr: 'Machine à laver LG 7 kg Inverter', ar: 'غسالة ملابس إل جي 7 كغ', priceHT: 1180, purchasePrice: 985, stock: 9, aliases: ['machine lg 7', 'ماكينة صابون 7'] },
      // Out of stock on purpose, to see how every screen treats an empty shelf.
      { code: 'ML-O12', fr: 'Machine à laver Orient semi-automatique 12 kg', ar: 'غسالة ملابس أوريون نصف آلية 12 كغ', priceHT: 520, purchasePrice: 430, stock: 0, aliases: ['machine orient', 'ماكينة صابون عادية'] },
    ],
  },
];

/**
 * Made-up people, covering the cases the screens have to handle: a name in
 * Latin and one in Arabic script (the search has to find both), a company with
 * a tax number, and a walk-in with no phone at all.
 */
const CLIENTS = [
  { fullName: 'Mohamed Ben Salah', phone: '+21620100001', cin: '08123451', addresses: [{ street: 'Rue de Marseille 14, Tunis' }] },
  { fullName: 'Sami Trabelsi', phone: '+21620100002', cin: '08123452', addresses: [{ street: 'Avenue Habib Bourguiba 52, Sousse' }] },
  { fullName: 'Hédi Gharbi', phone: '+21620100003', cin: '08123453', addresses: [{ street: 'Route de Gremda km 4, Sfax' }] },
  { fullName: 'Nadia Jlassi', phone: '+21620100004', cin: '08123454', addresses: [{ street: 'Cité Ennasr, Kairouan' }] },
  { fullName: 'Karim Ayari', phone: '+21620100005', cin: '08123455', addresses: [{ street: 'Avenue de la République, Kasserine' }] },
  { fullName: 'Ali Mejri', addresses: [{ street: 'Bab Souika, Tunis' }] },
  { fullName: 'Société Froid Plus SARL', phone: '+21620100007', taxId: '1234567/A/M/000', addresses: [{ street: 'Zone industrielle, Ben Arous' }] },
  { fullName: 'محمد الهادي الصالحي', phone: '+21620100008', cin: '08123458', addresses: [{ street: 'حي السرور، قفصة' }] },
  { fullName: 'Électro Confort Sfax', phone: '+21620100009', taxId: '7654321/B/M/000', addresses: [{ street: 'Avenue Majida Boulila, Sfax' }] },
];

const TRANSPORTERS = [
  { name: 'Rachid Transport', phone: '+21620200001', vehiclePlateNumber: '123 TU 4567', cin: '09876541' },
  { name: 'Mourad Hammami', phone: '+21620200002', vehiclePlateNumber: '201 TU 8899', cin: '09876542' },
];

/* ── Run ────────────────────────────────────────────────────────────────── */

const ACTOR = { sub: 'seed-demo', name: 'Données de démo' } as any;

async function main() {
  const ddb = new DynamoDBClient({});

  console.log(`\nService: ${SERVICE}`);
  console.log(`Stage:   ${STAGE}`);
  console.log(CONFIRM ? 'Mode:    WRITING\n' : 'Mode:    dry run (nothing is written)\n');

  // The stack has to exist. Writing into a table name that resolves to nothing
  // fails one row at a time and leaves half a catalogue behind.
  for (const name of Object.values(TABLES)) {
    await ddb.send(new DescribeTableCommand({ TableName: name })).catch(() => {
      console.error(`Table ${name} does not exist — deploy the stack first.`);
      process.exit(1);
    });
  }

  // Run twice, this would double the catalogue. The products table is checked
  // rather than trusted to be empty.
  const existing = await ddb.send(
    new ScanCommand({ TableName: TABLES.PRODUCTS_TABLE_NAME, Select: 'COUNT' }),
  );
  if ((existing.Count ?? 0) > 0) {
    console.error(
      `${TABLES.PRODUCTS_TABLE_NAME} already holds ${existing.Count} rows. ` +
        'Purge first (node scripts/purge-all.js --stage ' + STAGE + ' --confirm) rather than seed on top.',
    );
    process.exit(1);
  }

  const productCount = CATEGORIES.reduce((n, c) => n + c.products.length, 0);
  console.log(`  ${CATEGORIES.length} categories, ${productCount} products, ` +
    `${CLIENTS.length} clients, ${TRANSPORTERS.length} transporters\n`);

  if (!CONFIRM) {
    for (const c of CATEGORIES) {
      console.log(`  ${c.fr}`);
      for (const p of c.products) console.log(`    ${p.code.padEnd(10)} ${p.fr}  (${p.stock} en stock)`);
    }
    console.log(`\n  Clients: ${CLIENTS.map((c) => c.fullName).join(', ')}`);
    console.log(`  Transporteurs: ${TRANSPORTERS.map((t) => t.name).join(', ')}`);
    console.log('\nRe-run with --confirm to write it.\n');
    return;
  }

  // Loaded only now, after the environment above is in place.
  const { CategoryRepository } = await import('../src/repositories/CategoryRepository');
  const { ProductRepository } = await import('../src/repositories/ProductRepository');
  const { ClientRepository } = await import('../src/repositories/ClientRepository');
  const { TransporterRepository } = await import('../src/repositories/TransporterRepository');
  const { CreateCategoryUseCase } = await import('../src/functions/categories/create/useCase');
  const { CreateProductUseCase } = await import('../src/functions/products/create/useCase');
  const { CreateClientUseCase } = await import('../src/functions/clients/create/useCase');
  const { CreateTransporterUseCase } = await import('../src/functions/transporters/create/useCase');

  const categories = new CreateCategoryUseCase(new CategoryRepository());
  const products = new CreateProductUseCase(new ProductRepository());
  const clients = new CreateClientUseCase(new ClientRepository());
  const transporters = new CreateTransporterUseCase(new TransporterRepository());

  for (const c of CATEGORIES) {
    const made = await categories.execute({ name: { fr: c.fr, ar: c.ar } } as any, ACTOR.sub);
    const categoryId = made.data!.id as string;
    console.log(`  ✓ ${c.fr}`);

    for (const p of c.products) {
      await products.execute(
        {
          name: { fr: p.fr, ar: p.ar },
          code: p.code,
          priceHT: p.priceHT,
          purchasePrice: p.purchasePrice,
          taxRate: 19,
          stockAvailable: p.stock,
          aliases: p.aliases,
          categoryId,
        } as any,
        ACTOR.sub,
        ACTOR,
      );
      console.log(`      ✓ ${p.code}`);
    }
  }

  for (const c of CLIENTS) {
    await clients.execute(c as any);
    console.log(`  ✓ client ${c.fullName}`);
  }

  for (const t of TRANSPORTERS) {
    await transporters.execute(t as any, ACTOR.sub);
    console.log(`  ✓ transporteur ${t.name}`);
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

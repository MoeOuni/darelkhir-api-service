import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { declaredKey } from '../src/entities/DeclaredInvoiceEntity';
import { StoredDocumentEntity, storedKey, storedPrefix } from '../src/entities/StoredDocumentEntity';
import { roundLines, totalDeclared } from '../src/libs/declared-total';
import {
  safeNumber,
  buildDeclaredKey,
  declaredFilename,
  declaredAsOrder,
} from '../src/libs/declared-document';
import { buildDocumentKey } from '../src/libs/s3-invoice';
import { paymentLabel } from '../src/libs/declared-document';
import { CreateDeclaredInvoiceSchema } from '../src/schemas/declared.schema';
import { PaymentType } from '../src/libs/enums';
import type { IDeclaredInvoice } from '../src/libs/interfaces';

const ROOT = path.join(__dirname, '..');

const invoice = (over: Partial<IDeclaredInvoice> = {}): IDeclaredInvoice =>
  ({
    id: 'declared_invoice',
    sk: declaredKey('2026/014'),
    dataType: 'declared_invoice',
    number: '2026/014',
    status: 'draft',
    issuedAt: '2026-09-01',
    fiscalName: 'SOCIETE BEN SALAH SARL',
    fiscalAddress: 'Zone industrielle, Kasserine',
    taxId: '1234567/A/M/000',
    lines: [
      { code: 'CIM50', name: 'Ciment 50kg', quantity: 100, priceHT: 12.5, taxRate: 19 },
    ],
    subtotal: 1250,
    tax: 237.5,
    timber: 1,
    total: 1488.5,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  }) as IDeclaredInvoice;

describe('the number is the identity', () => {
  /**
   * Uniqueness rests entirely on the sort key, so two spellings of one number
   * must land on one key. If they do not, the shop issues 2026/014 twice while
   * believing the system made that impossible.
   */
  it('treats spacing and case as the same paper', () => {
    expect(declaredKey(' 2026/014 ')).toBe(declaredKey('2026/014'));
    expect(declaredKey('a-12')).toBe(declaredKey('A-12'));
  });

  it('keeps different numbers apart', () => {
    expect(declaredKey('2026/014')).not.toBe(declaredKey('2026/0140'));
  });
});

describe('what it comes to', () => {
  it('adds tax per line and stamp duty once', () => {
    const money = totalDeclared(
      [
        { code: 'A', name: 'a', quantity: 10, priceHT: 100, taxRate: 19 },
        { code: 'B', name: 'b', quantity: 2, priceHT: 50, taxRate: 7 },
      ],
      1,
    );

    expect(money.subtotal).toBe(1100);
    expect(money.tax).toBe(197);
    expect(money.timber).toBe(1);
    expect(money.total).toBe(1298);
  });
});

describe('prices a paper can carry', () => {
  /**
   * A line raised from an order arrives divided: a TTC price turned back into
   * an HT one, which is 8.373949579831933 rather than 8.374. That number was
   * stored as it came, shown truncated in the form, and printed on a fiscal
   * document beside a total worked out from its full precision — figures that
   * do not add up on the page.
   */
  it('keeps a divided price to the millime', () => {
    const [line] = roundLines([
      { code: 'A', name: 'a', quantity: 72, priceHT: 9.965 / 1.19, taxRate: 19 },
    ]);

    expect(line.priceHT).toBe(8.374);
  });

  it('leaves a price that was already clean alone', () => {
    const [line] = roundLines([
      { code: 'A', name: 'a', quantity: 10, priceHT: 12.5, taxRate: 19 },
    ]);

    expect(line.priceHT).toBe(12.5);
  });

  it('rounds the quantity too, since half a bag is as fine as it gets', () => {
    const [line] = roundLines([
      { code: 'A', name: 'a', quantity: 1 / 3, priceHT: 10, taxRate: 19 },
    ]);

    expect(line.quantity).toBe(0.333);
  });
});

describe('where the file goes', () => {
  /**
   * "2026/014" carries a slash, and a slash in an S3 key is a folder. Left
   * alone the file lands in a directory named for the year and nobody looking
   * for the invoice finds it.
   */
  it('never lets a fiscal number make a folder', () => {
    const key = buildDeclaredKey('2026/014', '2026-09-01T08:00:00.000Z');
    expect(key.startsWith('declared/2026-014/')).toBe(true);
    expect(key.split('/').length).toBe(3);
  });

  it('names the download after the invoice', () => {
    expect(declaredFilename('2026/014')).toBe('FACTURE-2026-014.pdf');
    expect(safeNumber(' 2026 / 014 ')).toBe('2026-014');
  });

  /**
   * The key is versioned on the invoice's own updatedAt, which is what makes a
   * reprint free and an edit a new file rather than a silent replacement of
   * one already in an accountant's inbox.
   */
  it('gives an edited invoice a new file', () => {
    const before = buildDeclaredKey('2026/014', '2026-09-01T08:00:00.000Z');
    const after = buildDeclaredKey('2026/014', '2026-09-02T09:30:00.000Z');
    expect(before).not.toBe(after);
  });

  it('refuses to key a declared invoice off a counter number', () => {
    expect(() => buildDocumentKey('declared', 14)).toThrow();
  });
});

describe('the register', () => {
  it('files every paper for one invoice under one prefix', () => {
    const key = storedKey('2026/014', '2026-09-01T08:00:00.000Z');
    expect(key.startsWith(storedPrefix('2026/014'))).toBe(true);
    expect(key.startsWith(storedPrefix(' 2026/014 '))).toBe(true);
  });

  it('does not sweep a neighbouring number into that prefix', () => {
    expect(storedKey('2026/0141', 'x').startsWith(storedPrefix('2026/014'))).toBe(false);
  });
});

describe('what the register actually writes', () => {
  /**
   * `update` sends only the fields an entity reports as dirty, and one built
   * from scratch reports none of them. Filing a rendering with a plain update
   * therefore writes a row holding its key and nothing else — no filename, no
   * size, no S3 path — and the register looks full while being empty. This
   * pins the fields that have to survive the write.
   */
  it('marks every field, so the row is not a stub', () => {
    const entity = new StoredDocumentEntity({
      id: 'stored_document',
      sk: storedKey('2026/014', '2026-09-01T08:00:00.000Z'),
      declaredNumber: '2026/014',
      s3Key: 'declared/2026-014/2026-09-01T08-00-00-000Z.pdf',
      filename: 'FACTURE-2026-014.pdf',
      bytes: 21934,
      contentType: 'application/pdf',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
    } as any);

    expect(Object.keys(entity.getDirty())).toHaveLength(0);

    // What the repository's record() does before writing.
    const { id, sk, ...rest } = entity.valueOf() as Record<string, any>;
    entity.set(rest);
    const written = entity.getDirty() as Record<string, any>;

    expect(written.s3Key).toBe('declared/2026-014/2026-09-01T08-00-00-000Z.pdf');
    expect(written.filename).toBe('FACTURE-2026-014.pdf');
    expect(written.bytes).toBe(21934);
    expect(written.declaredNumber).toBe('2026/014');
    // The global register reads newest-first off this key.
    expect(written.sihk).toBe('2026-09-01T08:00:00.000Z');
  });
});

describe('the paper itself', () => {
  /**
   * A declared invoice records a sale, not a journey. The same goods often
   * travel under a second paper in someone else's name, so naming a driver
   * here would put two documents in contradiction.
   */
  it('carries no lorry and no driver', () => {
    const order = declaredAsOrder(invoice());
    expect(order.transporterId).toBeUndefined();
    expect(order.transporterName).toBeUndefined();
    expect(order.transport).toBe(0);
  });

  it('shows the buyer as the government knows him, not as the counter does', () => {
    const order = declaredAsOrder(invoice());
    expect(order.clientName).toBe('SOCIETE BEN SALAH SARL');
    expect(order.clientId).toBe('');
  });

  it('takes no counter number', () => {
    const order = declaredAsOrder(invoice());
    expect(order.invoiceNumber).toBeUndefined();
    expect(order.orderNumber).toBe(0);
  });

  it('keeps the shop’s own cost off a document the government reads', () => {
    const order = declaredAsOrder(invoice());
    expect(order.items.every((i) => i.purchasePrice === 0)).toBe(true);
  });

  it('prints the date the shop put on it', () => {
    const order = declaredAsOrder(invoice({ issuedAt: '2026-08-31' }));
    expect(order.documentDate).toBe('2026-08-31');
  });

  it('carries the frozen line prices, tax included', () => {
    const [line] = declaredAsOrder(invoice()).items;
    expect(line.priceHT).toBe(12.5);
    expect(line.priceTTC).toBeCloseTo(14.875, 3);
    expect(line.quantity).toBe(100);
  });
});

describe('how it was settled', () => {
  const valid = {
    number: '2026/015',
    issuedAt: '2026-09-16',
    fiscalName: 'SOCIETE BEN SALAH SARL',
    paymentMethod: PaymentType.CHECK,
    lines: [{ code: 'CIM50', name: 'Ciment 50kg', quantity: 10, priceHT: 12.5, taxRate: 19 }],
  };

  /**
   * The government's copy is expected to say how the money moved. An invoice
   * raised without it is incomplete on their side, not merely on ours — so it
   * is refused at the door rather than saved and quietly printed blank.
   */
  it('refuses an invoice that does not say', () => {
    const { paymentMethod, ...without } = valid;
    expect(CreateDeclaredInvoiceSchema.safeParse(without).success).toBe(false);
  });

  it('accepts each way the shop actually takes money', () => {
    for (const method of [PaymentType.CASH, PaymentType.BANK_TRANSFER, PaymentType.CHECK]) {
      expect(CreateDeclaredInvoiceSchema.safeParse({ ...valid, paymentMethod: method }).success).toBe(
        true,
      );
    }
  });

  it('refuses a method the shop does not use', () => {
    expect(
      CreateDeclaredInvoiceSchema.safeParse({ ...valid, paymentMethod: 'bitcoin' }).success,
    ).toBe(false);
  });

  it('prints it in French, whatever language the screen was in', () => {
    expect(paymentLabel(PaymentType.CHECK)).toBe('Chèque');
    expect(paymentLabel(PaymentType.BANK_TRANSFER)).toBe('Virement bancaire');
    // Singular on the paper: the shop's own wording, not the dictionary's.
    expect(paymentLabel(PaymentType.CASH)).toBe('Espèce');
  });

  /**
   * The invoices already in the table were written before this field existed.
   * They still have to open and still have to print — with the line left off,
   * not with the word "undefined" on a fiscal document.
   */
  it('leaves the line off an invoice raised before the field existed', () => {
    expect(paymentLabel(undefined)).toBeUndefined();
  });
});

describe('IAM for declared invoices', () => {
  const raw = fs
    .readFileSync(path.join(ROOT, 'src/functions/declared/serverless.yml'), 'utf8')
    .replace(/\$\{self:custom\.(\w+)\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, 'X')
    .replace(/!Ref\s+\S+/g, 'X');
  const functions = yaml.load(raw) as Record<string, any>;

  const actions = (name: string): string[] =>
    (functions[name]?.iamRoleStatements ?? []).flatMap((s: any) =>
      Array.isArray(s.Action) ? s.Action : [s.Action],
    );

  /**
   * This document must move nothing. A policy that lets it near the products,
   * orders or balances tables is the one way a mistake here could cost stock
   * or money rather than a wasted sheet of paper.
   */
  it('can reach no table but its own and the settings', () => {
    const resources = Object.values(functions).flatMap((fn: any) =>
      (fn.iamRoleStatements ?? []).flatMap((s: any) =>
        (Array.isArray(s.Resource) ? s.Resource : [s.Resource]).map(String),
      ),
    );

    const tables = resources.filter((r) => r.includes(':dynamodb:'));
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table).toMatch(/declaredTableName|settingsTableName/);
    }
  });

  it('reads settings but never writes them', () => {
    for (const fn of Object.values(functions) as any[]) {
      for (const statement of fn.iamRoleStatements ?? []) {
        const resources = (
          Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource]
        ).map(String);
        if (!resources.some((r: string) => r.includes('settingsTableName'))) continue;

        const acts = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        expect(acts.every((a: string) => a.startsWith('dynamodb:Get') || a.startsWith('dynamodb:Query'))).toBe(true);
      }
    }
  });

  it('writes only under the declared prefix in the bucket', () => {
    const buckets = Object.values(functions).flatMap((fn: any) =>
      (fn.iamRoleStatements ?? []).flatMap((s: any) =>
        (Array.isArray(s.Resource) ? s.Resource : [s.Resource])
          .map(String)
          .filter((r: string) => r.includes(':s3:')),
      ),
    );

    expect(buckets.length).toBeGreaterThan(0);
    for (const bucket of buckets) expect(bucket).toContain('/declared/*');
  });

  it('gives the renderer room and time to build a PDF', () => {
    expect(functions.getDeclaredDocument.timeout).toBeLessThanOrEqual(29);
    expect(functions.getDeclaredDocument.memorySize).toBeGreaterThanOrEqual(1024);
  });

  it('lets only the delete permission free a number', () => {
    expect(actions('deleteDeclaredInvoice')).toContain('dynamodb:DeleteItem');
    for (const name of ['createDeclaredInvoice', 'updateDeclaredInvoice', 'listDeclaredInvoices']) {
      expect(actions(name)).not.toContain('dynamodb:DeleteItem');
    }
  });
});

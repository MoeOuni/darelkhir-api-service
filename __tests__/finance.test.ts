import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { computeInvestorReport, type ReportSource } from '@libs/investor-report/compute';
import { renderInvestorReportPdf } from '@libs/investor-report/pdf';
import { byRoute } from '@libs/route';
import { CreateChargeSchema, CreateSupplierDebtSchema } from '@/schemas/finance.schema';
import { ChargeEntity } from '@/entities/ChargeEntity';
import { SupplierDebtEntity } from '@/entities/SupplierDebtEntity';

/**
 * Money going out.
 *
 * The shop bought 8 680 of goods and paid the supplier 5 000, so 3 680 is still
 * in hand and still owed. It then paid Yahya 400 and bought supports for 150.
 * None of it sold yet, to keep the arithmetic readable.
 */
const base = (over: Partial<ReportSource> = {}): ReportSource => ({
  generatedAt: '2026-11-05T10:00:00',
  investment: 10000,
  categories: [{ sk: 'CATEGORY#tv', name: { fr: 'Téléviseur' } }],
  products: [{ code: 'TV', name: { fr: 'TV' }, categoryId: 'tv', purchasePrice: 868, priceTTC: 1000, stockAvailable: 10 }],
  movements: [{ createdAt: '2026-11-01T10:00:00Z', type: 'initial', productCode: 'TV', availableDelta: 10 }],
  orders: [], payments: [], clients: [], agreedPrices: 0, charges: [], supplierDebts: [],
  ...over,
});
const debt = { supplierName: 'Condor', date: '2026-11-01', total: 8680, paid: 5000, payments: [] };
const yahya = { date: '2026-11-03', category: 'pay', beneficiary: 'Yahya', amount: 400, method: 'cash' };
const supports = { date: '2026-11-04', category: 'supplies', description: 'Supports TV', amount: 150, method: 'cash' };

describe('a purchase only partly paid', () => {
  /** The whole point: without the debt, the system believes all 8 680 has left. */
  it('treats a purchase as paid in full until a debt says otherwise', () => {
    const t = computeInvestorReport(base()).totals;
    expect(t.paidToSuppliers).toBe(8680);
    expect(t.supplierDebt).toBe(0);
    expect(t.cashEstimate).toBe(10000 - 8680);
  });

  it('keeps what was not paid in hand, and shows it as owed', () => {
    const t = computeInvestorReport(base({ supplierDebts: [debt] })).totals;
    expect(t.spent).toBe(8680);
    expect(t.paidToSuppliers).toBe(5000);
    expect(t.supplierDebt).toBe(3680);
    expect(t.cashEstimate).toBe(10000 - 5000);
  });

  /** Money in hand that is owed is not the shop's to count as gain. */
  it('does not count the unpaid money as a gain', () => {
    const t = computeInvestorReport(base({ supplierDebts: [debt] })).totals;
    expect(t.gain).toBe(0);
    expect(t.netValue).toBe(10000);
  });

  it('flags a debt larger than everything in stock', () => {
    const rep = computeInvestorReport(base({ supplierDebts: [{ ...debt, total: 20000, paid: 0 }] }));
    expect(rep.checks.map((c) => c.title)).toContain('Dettes fournisseurs supérieures aux achats');
  });
});

describe('charges', () => {
  const charged = computeInvestorReport(base({ charges: [yahya, supports] }));

  it('come off the money in hand and off the result', () => {
    expect(charged.totals.charges).toBe(550);
    expect(charged.totals.cashEstimate).toBe(10000 - 8680 - 550);
    expect(charged.totals.gain).toBe(-550);
  });

  it('are grouped by what they were for, largest first', () => {
    expect(charged.chargesByCategory.map((c) => [c.category, c.total])).toEqual([['pay', 400], ['supplies', 150]]);
  });

  /**
   * Orders can carry charges too. What the shop paid out is real money; what
   * the client handed the loader never was the shop's. A cancelled order is
   * left out, as it is in the sales reports, so the two screens agree.
   */
  it('include what the shop paid on its orders, and only that', () => {
    const sold = (over: Record<string, unknown>) => ({ sk: 'ORDER#a', orderNumber: 1, status: 'delivered', invoiceNumber: 1, createdAt: '2026-11-02T10:00:00Z',
      clientName: 'Sami', timber: 1, total: 1001, items: [{ code: 'TV', quantity: 1, priceTTC: 1000 }], ...over });
    const t = computeInvestorReport(base({ orders: [
      sold({ charges: [{ label: 'Chargement', amount: 20, paidBy: 'shop' }, { label: 'Grue', amount: 50, paidBy: 'client' }] }),
      sold({ sk: 'ORDER#b', orderNumber: 2, status: 'cancelled', charges: [{ label: 'Annulée', amount: 999, paidBy: 'shop' }] }),
    ], movements: [{ createdAt: '2026-11-01T10:00:00Z', type: 'initial', productCode: 'TV', availableDelta: 11 },
                   { createdAt: '2026-11-02T10:00:00Z', type: 'sale', productCode: 'TV', availableDelta: -1, orderNumber: 1 }] })).totals;
    expect(t.charges).toBe(20);
  });
});

describe('everything together', () => {
  /**
   * The check the investors' whole picture rests on: what the shop owns less
   * what it owes equals what went in, plus what it earned, less what it spent.
   */
  it('adds back up to the investment plus the result', () => {
    const t = computeInvestorReport(base({ supplierDebts: [debt], charges: [yahya, supports] })).totals;
    expect(t.netValue).toBe(t.investment + t.gain);
    expect(t.stockCost + t.cashEstimate + t.receivable - t.supplierDebt - t.stamps).toBe(t.netValue);
    expect(t.cashEstimate).toBe(10000 - 5000 - 550);
  });

  it('prints the charges and the debts in the PDF', async () => {
    const rep = computeInvestorReport(base({ supplierDebts: [debt], charges: [yahya, supports] }));
    const pdf = await renderInvestorReportPdf(rep, { businessName: 'Dar El Khir' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(rep.debts[0].remaining).toBe(3680);
    expect(rep.chargeRows).toHaveLength(2);
  });
});

describe('what may be recorded', () => {
  const ok = { date: '2026-11-05', amount: 400, category: 'pay' };

  it('needs a real date and an amount above zero', () => {
    expect(CreateChargeSchema.safeParse(ok).success).toBe(true);
    expect(CreateChargeSchema.safeParse({ ...ok, date: '05/11/2026' }).success).toBe(false);
    expect(CreateChargeSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
  });

  it('refuses a debt paid beyond its total', () => {
    const debtInput = { supplierName: 'Condor', date: '2026-11-05', total: 100 };
    expect(CreateSupplierDebtSchema.safeParse({ ...debtInput, paidNow: 100 }).success).toBe(true);
    expect(CreateSupplierDebtSchema.safeParse({ ...debtInput, paidNow: 100.5 }).success).toBe(false);
  });
});

describe('the staff view of a row', () => {
  it('carries its own id, not the shared partition', () => {
    expect(new ChargeEntity({ sk: 'CHARGE#abc', date: '2026-11-05', amount: 1 } as any).toPublicDTO().id).toBe('abc');
  });

  it('says what is left to pay', () => {
    expect(new SupplierDebtEntity({ sk: 'SUPPLIER_DEBT#d', date: '2026-11-05', total: 8680, paid: 5000 } as any).toPublicDTO().remaining).toBe(3680);
  });
});

/**
 * Several routes in one function.
 *
 * A route in the deployment config that no handler answers deploys cleanly and
 * then returns 404 to whoever clicks the button. So the two lists are pinned to
 * each other, for every function that shares a Lambda.
 */
describe('routes in the config and in the code', () => {
  const ROOT = path.join(__dirname, '..');
  const groups: [string, string, string][] = [
    ['src/functions/finance/serverless.yml', 'finance', 'src/functions/finance/endpoint.ts'],
    ['src/functions/catalog/serverless.yml', 'suppliers', 'src/functions/catalog/suppliers/endpoint.ts'],
    ['src/functions/catalog/serverless.yml', 'requests', 'src/functions/catalog/requests/endpoint.ts'],
  ];

  it.each(groups)('%s: %s answers exactly what it is deployed for', (file, fn, source) => {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\$\{[^}]*\}/g, 'X');
    const config = yaml.load(raw) as Record<string, any>;
    const deployed = config[fn].events.map((e: any) => `${e.httpApi.method} ${e.httpApi.path}`).sort();
    const code = fs.readFileSync(path.join(ROOT, source), 'utf8');
    const answered = [...code.matchAll(/'((?:GET|POST|PATCH|DELETE) \/[^']*)':/g)].map((m) => m[1]).sort();
    expect(answered).toEqual(deployed);
    expect(deployed.length).toBeGreaterThan(0);
  });

  it('answers an unknown route with a 404 rather than running the wrong handler', async () => {
    const hit = jest.fn();
    const route = byRoute({ 'GET /a': hit });
    expect((await route({ routeKey: 'GET /b' }, {} as any)).statusCode).toBe(404);
    expect(hit).not.toHaveBeenCalled();
  });

  /** Every other function in the merged groups was reachable; these must stay so. */
  it('still gives the merged groups access to their table and its index', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'src/functions/catalog/serverless.yml'), 'utf8').replace(/\$\{self:custom\.(\w+)\}/g, '$1').replace(/\$\{[^}]*\}/g, 'X');
    const config = yaml.load(raw) as Record<string, any>;
    for (const fn of ['suppliers', 'requests']) {
      const [statement] = config[fn].iamRoleStatements;
      expect(statement.Action).toEqual(expect.arrayContaining(['dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:DeleteItem']));
      expect(statement.Resource.some((r: string) => r.endsWith('/index/*'))).toBe(true);
    }
  });
});

/** The stand-in used by the route tests cannot prove the database is asked to refuse. */
describe('saving a payment', () => {
  it('asks the database to refuse it if the debt changed since it was read', async () => {
    const { SupplierDebtRepository } = jest.requireActual('@/repositories/FinanceRepositories');
    const repository = new SupplierDebtRepository();
    const send = jest.spyOn(repository.client, 'send').mockResolvedValue({ Attributes: { sk: 'SUPPLIER_DEBT#d' } } as never);
    await repository.savePayments(new SupplierDebtEntity({ id: 'SUPPLIER_DEBT', sk: 'SUPPLIER_DEBT#d', total: 100, paid: 40 } as any), [], 60);
    const { input } = send.mock.calls[0][0] as any;
    expect(input.ConditionExpression).toBe('#paid = :previous');
    expect(input.ExpressionAttributeValues[':previous']).toBe(40);
    expect(input.ExpressionAttributeValues[':paid']).toBe(60);
  });
});

/** The journal builds its sentence from these, and falls back to the bare action if one is missing. */
describe('what the journal keeps', () => {
  const { describeAudit } = jest.requireActual('@libs/audit-describe');

  it('names who a charge went to and how much', () => {
    expect(describeAudit('charge.create', { amount: 400, beneficiary: 'Yahya', method: 'cash' }, {}).meta).toEqual({ amount: 400, name: 'Yahya', method: 'cash' });
    expect(describeAudit('charge.delete', { id: 'x', amount: 400, beneficiary: 'Yahya' }, undefined).meta).toMatchObject({ amount: 400, name: 'Yahya' });
  });

  it('keeps the amount of a supplier payment, not the total of the debt', () => {
    const { meta } = describeAudit('supplier_debt.payment', { supplierName: 'Condor', total: 8680, paid: 6000 }, { amount: 1000, method: 'cash' });
    expect(meta).toEqual({ name: 'Condor', total: 8680, amount: 1000, method: 'cash' });
  });
});

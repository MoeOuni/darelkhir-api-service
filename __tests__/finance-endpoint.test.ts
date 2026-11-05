import type { Context } from 'aws-lambda';

/**
 * The money rules on the routes themselves: a debt can never be overpaid, and
 * every write is held to a permission. The database is an in-memory stand-in;
 * the middleware is reduced to validating the body and remembering what it was
 * asked to require.
 */
const asked: Record<string, any>[] = [];
jest.mock('@libs/middleware', () => ({
  middleware: (opts: any) => {
    asked.push(opts);
    return (h: any) => async (event: any, ctx: any) => {
      const body = opts.validation?.body ? opts.validation.body.parse(event.body) : event.body;
      return h({ ...event, body, user: { name: 'Yahya' } }, ctx);
    };
  },
}));

const rows = new Map<string, any>();
let beforeWrite: () => void = () => {};
jest.mock('@/repositories/FinanceRepositories', () => {
  const make = (Entity: () => any, prefix: string) => class {
    findByUuid = async (id: string) => (rows.has(`${prefix}#${id}`) ? new (Entity())(rows.get(`${prefix}#${id}`)) : null);
    deleteByUuid = async (id: string) => { rows.delete(`${prefix}#${id}`); };
    create = async (e: any) => { rows.set(e.sk, e.valueOf()); };
    update = async (e: any) => { rows.set(e.sk, e.valueOf()); };
    listEvery = async () => [...rows.values()].filter((r) => r.sk.startsWith(prefix)).map((r) => new (Entity())(r));
    savePayments = async (e: any, payments: any[], paid: number) => {
      beforeWrite();
      if (rows.get(e.sk).paid !== e.paid) throw Object.assign(new Error('changed'), { name: 'ConditionalCheckFailedException' });
      rows.set(e.sk, { ...rows.get(e.sk), payments, paid });
      return new (Entity())(rows.get(e.sk));
    };
  };
  return {
    ChargeRepository: make(() => require('@/entities/ChargeEntity').ChargeEntity, 'CHARGE'),
    SupplierDebtRepository: make(() => require('@/entities/SupplierDebtEntity').SupplierDebtEntity, 'SUPPLIER_DEBT'),
  };
});
jest.mock('@libs/investor-report/load', () => ({
  tunisNow: () => '2026-11-05T10:00:00',
  loadReportSource: jest.fn(async (investment: number, generatedAt: string) => ({
    generatedAt, investment, categories: [], products: [], movements: [], orders: [], payments: [], clients: [], agreedPrices: 0,
    charges: [{ date: '2026-11-03', category: 'pay', amount: 400, method: 'cash' }], supplierDebts: [],
  })),
}));
jest.mock('@libs/settings', () => ({ getSettings: jest.fn(async () => ({ investorCapital: 70000 })) }));

import { handler } from '@/functions/finance/endpoint';

const call = async (routeKey: string, over: Record<string, any> = {}) => {
  const res = await handler({ routeKey, ...over }, {} as Context);
  return { status: res.statusCode, ...JSON.parse(res.body) };
};
const newDebt = (over = {}) => call('POST /supplier-debts', { body: { supplierName: 'Condor', date: '2026-11-01', total: 8680, paidNow: 5000, ...over } });

beforeEach(() => {
  rows.clear();
  beforeWrite = () => {};
});

describe('a supplier debt', () => {
  it('records "bought 8 680, paid 5 000" as 3 680 owed, with the first payment in its history', async () => {
    const { status, data } = await newDebt();
    expect(status).toBe(201);
    expect(data.remaining).toBe(3680);
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0]).toMatchObject({ amount: 5000, date: '2026-11-01', method: 'cash' });
  });

  it('starts with no payment when nothing was paid', async () => {
    const { data } = await newDebt({ paidNow: 0 });
    expect(data.payments).toEqual([]);
    expect(data.remaining).toBe(8680);
  });

  it('comes down with each payment until it is settled', async () => {
    const { data: debt } = await newDebt();
    const pay = (amount: number) => call('POST /supplier-debts/{id}/payments', { pathParameters: { id: debt.id }, body: { date: '2026-11-05', amount } });
    expect((await pay(1000)).data.remaining).toBe(2680);
    expect((await pay(2680)).data.remaining).toBe(0);
  });

  it('refuses a payment larger than what is left', async () => {
    const { data: debt } = await newDebt();
    await expect(call('POST /supplier-debts/{id}/payments', { pathParameters: { id: debt.id }, body: { date: '2026-11-05', amount: 3680.5 } }))
      .rejects.toThrow('dépasse ce qui reste dû');
  });

  /**
   * Two people, one debt, the same minute. The other person's payment lands
   * between this one's read and its write, so this one must be refused rather
   * than written over it.
   */
  it('turns a payment raced by another into a 409, not an overpayment', async () => {
    const { data: debt } = await newDebt();
    const key = `SUPPLIER_DEBT#${debt.id}`;
    beforeWrite = () => rows.set(key, { ...rows.get(key), paid: 8000 });

    const { status } = await call('POST /supplier-debts/{id}/payments', { pathParameters: { id: debt.id }, body: { date: '2026-11-05', amount: 3000 } });

    expect(status).toBe(409);
    expect(rows.get(key).paid).toBe(8000);
  });

  it('gives the money back to the debt when a payment is removed', async () => {
    const { data: debt } = await newDebt();
    const { data } = await call('DELETE /supplier-debts/{id}/payments/{paymentId}', { pathParameters: { id: debt.id, paymentId: debt.payments[0].id } });
    expect(data.remaining).toBe(8680);
    expect(data.payments).toEqual([]);
  });

  it('cannot have its total brought below what is already paid', async () => {
    const { data: debt } = await newDebt();
    await expect(call('PATCH /supplier-debts/{id}', { pathParameters: { id: debt.id }, body: { total: 4000 } })).rejects.toThrow('déjà payé');
  });
});

describe('a charge', () => {
  it('can be recorded, corrected and deleted', async () => {
    const { status, data } = await call('POST /charges', { body: { date: '2026-11-03', amount: 400, category: 'pay', beneficiary: 'Yahya' } });
    expect(status).toBe(201);
    expect(data).toMatchObject({ amount: 400, beneficiary: 'Yahya', method: 'cash', createdBy: 'Yahya' });

    const updated = await call('PATCH /charges/{id}', { pathParameters: { id: data.id }, body: { amount: 450 } });
    expect(updated.data.amount).toBe(450);
    expect((await call('GET /charges')).data.items).toHaveLength(1);

    await call('DELETE /charges/{id}', { pathParameters: { id: data.id } });
    expect((await call('GET /charges')).data.items).toHaveLength(0);
  });
});

describe('the money in hand', () => {
  it('comes from the same calculation as the investor report', async () => {
    const { data } = await call('GET /finance/summary');
    expect(data).toMatchObject({ investment: 70000, charges: 400, cash: 69600, supplierDebt: 0 });
  });
});

describe('who may do what', () => {
  /** Eleven routes built at import, each with its own wrapper. */
  it('holds every route to a permission, and audits every change', () => {
    expect(asked).toHaveLength(11);
    for (const opts of asked) {
      expect(opts.auth).toBe(true);
      expect(typeof opts.requires).toBe('string');
    }
    expect(asked.filter((o) => o.audit)).toHaveLength(8);
  });

  it('keeps purchase figures behind the margins permission', () => {
    expect(asked.filter((o) => o.requires === 'reports.view_margin')).toHaveLength(1);
  });
});
